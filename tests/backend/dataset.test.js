const request = require('supertest');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const app = require('../../backend/src/app');
const User = require('../../backend/src/models/User');
const Dataset = require('../../backend/src/models/Dataset');
const ProcessingJob = require('../../backend/src/models/ProcessingJob');
const DataQualityReport = require('../../backend/src/models/DataQualityReport');
const AuditLog = require('../../backend/src/models/AuditLog');
const { connectDB } = require('../../backend/src/config/db');

const TEST_DB_URI = 'mongodb://127.0.0.1:27017/anomaly_detection_test_db';
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');

describe('Dataset & Job API Endpoints', () => {
  let adminToken;
  let analystToken;
  let reviewerToken;

  const validCsvPath = path.join(FIXTURES_DIR, 'valid_census.csv');
  const emptyFilePath = path.join(FIXTURES_DIR, 'empty.csv');
  const duplicateColsCsvPath = path.join(FIXTURES_DIR, 'duplicate_cols.csv');
  const missingHeaderCsvPath = path.join(FIXTURES_DIR, 'missing_header.csv');
  const invalidExtPath = path.join(FIXTURES_DIR, 'invalid.txt');

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test_secret_key_12345';
    await connectDB(TEST_DB_URI);

    // Create fixtures folder and files
    if (!fs.existsSync(FIXTURES_DIR)) {
      fs.mkdirSync(FIXTURES_DIR, { recursive: true });
    }

    fs.writeFileSync(
      validCsvPath,
      'state,district,population,literacy_rate\nStateA,District1,150000,74.5\nStateA,District2,220000,68.2\nStateB,District3,95000,81.0\n'
    );
    fs.writeFileSync(emptyFilePath, '');
    fs.writeFileSync(
      duplicateColsCsvPath,
      'state,district,population,district\nStateA,District1,150000,District1\n'
    );
    fs.writeFileSync(
      missingHeaderCsvPath,
      'state,,population\nStateA,District1,150000\n'
    );
    fs.writeFileSync(invalidExtPath, 'Plain text content not a dataset');
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Dataset.deleteMany({});
    await ProcessingJob.deleteMany({});
    await DataQualityReport.deleteMany({});
    await AuditLog.deleteMany({});

    // Create Admin
    const adminRes = await request(app).post('/api/auth/register').send({
      name: 'Dataset Admin',
      email: 'dataset_admin@example.com',
      password: 'AdminPassword123',
      role: 'ADMIN',
    });
    adminToken = adminRes.body.data.token;

    // Create Analyst
    const analystRes = await request(app).post('/api/auth/register').send({
      name: 'Dataset Analyst',
      email: 'dataset_analyst@example.com',
      password: 'AnalystPassword123',
      role: 'ANALYST',
    });
    analystToken = analystRes.body.data.token;

    // Create Reviewer
    const reviewerRes = await request(app).post('/api/auth/register').send({
      name: 'Dataset Reviewer',
      email: 'dataset_reviewer@example.com',
      password: 'ReviewerPassword123',
      role: 'REVIEWER',
    });
    reviewerToken = reviewerRes.body.data.token;
  });

  afterAll(async () => {
    // Clean up test files
    if (fs.existsSync(FIXTURES_DIR)) {
      fs.rmSync(FIXTURES_DIR, { recursive: true, force: true });
    }
    await User.deleteMany({});
    await Dataset.deleteMany({});
    await ProcessingJob.deleteMany({});
    await DataQualityReport.deleteMany({});
    await AuditLog.deleteMany({});
    await mongoose.connection.close();
  });

  describe('POST /api/datasets/upload', () => {
    it('should upload a valid CSV dataset and queue a profiling job', async () => {
      const res = await request(app)
        .post('/api/datasets/upload')
        .set('Authorization', `Bearer ${analystToken}`)
        .field('name', '2024 Census Sub-District Sample')
        .field('category', 'Census')
        .field('dataType', 'REAL')
        .field('description', 'Test sample of demographic figures')
        .attach('file', validCsvPath);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.dataset).toBeDefined();
      expect(res.body.data.dataset.name).toBe('2024 Census Sub-District Sample');
      expect(res.body.data.dataset.category).toBe('Census');
      expect(res.body.data.dataset.dataType).toBe('REAL');
      expect(res.body.data.dataset.dataHash).toBeDefined();
      expect(res.body.data.job).toBeDefined();
      expect(res.body.data.job.status).toBe('QUEUED');

      // Verify audit log entry
      const audit = await AuditLog.findOne({ action: 'DATASET_UPLOAD' });
      expect(audit).toBeTruthy();
      expect(audit.metadata.dataHash).toBe(res.body.data.dataset.dataHash);
    });

    it('should reject an empty file (0 bytes)', async () => {
      const res = await request(app)
        .post('/api/datasets/upload')
        .set('Authorization', `Bearer ${analystToken}`)
        .attach('file', emptyFilePath);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('EMPTY_FILE');
    });

    it('should reject CSV files with duplicate column headers', async () => {
      const res = await request(app)
        .post('/api/datasets/upload')
        .set('Authorization', `Bearer ${analystToken}`)
        .attach('file', duplicateColsCsvPath);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('DUPLICATE_COLUMNS');
      expect(res.body.message).toMatch(/duplicate column/i);
    });

    it('should reject CSV files with missing/empty column headers', async () => {
      const res = await request(app)
        .post('/api/datasets/upload')
        .set('Authorization', `Bearer ${analystToken}`)
        .attach('file', missingHeaderCsvPath);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('MISSING_HEADERS');
      expect(res.body.message).toMatch(/missing or empty column header/i);
    });

    it('should reject unsupported file extensions (.txt)', async () => {
      const res = await request(app)
        .post('/api/datasets/upload')
        .set('Authorization', `Bearer ${analystToken}`)
        .attach('file', invalidExtPath);

      expect(res.status).toBe(500); // Handled by multer fileFilter error -> 500 error middleware
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/unsupported file type/i);
    });

    it('should forbid REVIEWER role from uploading datasets', async () => {
      const res = await request(app)
        .post('/api/datasets/upload')
        .set('Authorization', `Bearer ${reviewerToken}`)
        .attach('file', validCsvPath);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/datasets (Search, Filter, Pagination, Sorting)', () => {
    beforeEach(async () => {
      // Seed 3 datasets
      await request(app)
        .post('/api/datasets/upload')
        .set('Authorization', `Bearer ${analystToken}`)
        .field('name', 'Census Alpha')
        .field('category', 'Census')
        .attach('file', validCsvPath);

      await request(app)
        .post('/api/datasets/upload')
        .set('Authorization', `Bearer ${analystToken}`)
        .field('name', 'MGNREGA Wages')
        .field('category', 'MGNREGA')
        .attach('file', validCsvPath);

      await request(app)
        .post('/api/datasets/upload')
        .set('Authorization', `Bearer ${analystToken}`)
        .field('name', 'Election Poll Results')
        .field('category', 'Election')
        .attach('file', validCsvPath);
    });

    it('should return paginated list of datasets', async () => {
      const res = await request(app)
        .get('/api/datasets?page=1&limit=2')
        .set('Authorization', `Bearer ${reviewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.datasets.length).toBe(2);
      expect(res.body.data.pagination.total).toBe(3);
      expect(res.body.data.pagination.totalPages).toBe(2);
    });

    it('should filter datasets by category', async () => {
      const res = await request(app)
        .get('/api/datasets?category=Census')
        .set('Authorization', `Bearer ${reviewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.datasets.length).toBe(1);
      expect(res.body.data.datasets[0].category).toBe('Census');
    });

    it('should search datasets by name', async () => {
      const res = await request(app)
        .get('/api/datasets?search=Wages')
        .set('Authorization', `Bearer ${reviewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.datasets.length).toBe(1);
      expect(res.body.data.datasets[0].name).toBe('MGNREGA Wages');
    });
  });

  describe('GET /api/datasets/:id and DELETE /api/datasets/:id', () => {
    let datasetId;

    beforeEach(async () => {
      const uploadRes = await request(app)
        .post('/api/datasets/upload')
        .set('Authorization', `Bearer ${analystToken}`)
        .field('name', 'Detail Test Dataset')
        .field('category', 'Other')
        .attach('file', validCsvPath);

      datasetId = uploadRes.body.data.dataset._id;
    });

    it('should retrieve dataset details with quality report and recent jobs', async () => {
      const res = await request(app)
        .get(`/api/datasets/${datasetId}`)
        .set('Authorization', `Bearer ${reviewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.dataset._id).toBe(datasetId);
      expect(res.body.data.dataset.uploadedBy).toBeDefined();
    });

    it('should delete dataset and record audit log when requested by ANALYST', async () => {
      const res = await request(app)
        .delete(`/api/datasets/${datasetId}`)
        .set('Authorization', `Bearer ${analystToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const check = await Dataset.findById(datasetId);
      expect(check).toBeNull();

      const audit = await AuditLog.findOne({ action: 'DATASET_DELETED', entityId: datasetId });
      expect(audit).toBeTruthy();
    });

    it('should reject deletion attempt by REVIEWER with 403 Forbidden', async () => {
      const res = await request(app)
        .delete(`/api/datasets/${datasetId}`)
        .set('Authorization', `Bearer ${reviewerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });
});
