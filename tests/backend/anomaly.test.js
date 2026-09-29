const request = require('supertest');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const app = require('../../backend/src/app');
const User = require('../../backend/src/models/User');
const Dataset = require('../../backend/src/models/Dataset');
const AnomalyRecord = require('../../backend/src/models/AnomalyRecord');
const ProcessingJob = require('../../backend/src/models/ProcessingJob');
const AuditLog = require('../../backend/src/models/AuditLog');
const { connectDB } = require('../../backend/src/config/db');

// Mock ML service for deterministic backend test execution
jest.mock('../../backend/src/services/ml.service', () => ({
  requestProfiling: jest.fn().mockResolvedValue({
    rowCount: 20,
    columnCount: 3,
    columns: [],
    duplicateRowCount: 0,
    duplicateRowPercentage: 0,
    overallQualityScore: 95,
    issues: [],
    transformationLog: [],
  }),
  inferSchemaMapping: jest.fn().mockResolvedValue({}),
  runFeatureEngineering: jest.fn().mockResolvedValue({ features: [] }),
  buildPeerGroups: jest.fn().mockResolvedValue({ groups: [] }),
  analyzeDataset: jest.fn().mockResolvedValue({
    summary: {
      total_records: 10,
      total_anomalies: 2,
      anomaly_rate: 0.2,
      detector_counts: {
        robust_z: 2,
        isolation_forest: 1,
        z_score: 2,
      },
      active_detectors: ['robust_z', 'isolation_forest', 'z_score'],
      feature_cols_analyzed: ['wage', 'workdays'],
    },
    records: [
      {
        record_index: 0,
        record_data: { district: 'Dist_A', wage: 100, workdays: 20 },
        detector_scores: { robust_z: 0.5, isolation_forest: 0.1, z_score: 0.4 },
        detector_flags: { robust_z: false, isolation_forest: false, z_score: false },
        ensemble_score: 0.25,
        is_anomaly: false,
        flags: [],
        peer_group: 'Dist_A',
      },
      {
        record_index: 1,
        record_data: { district: 'Dist_A', wage: 950, workdays: 100 },
        detector_scores: { robust_z: 4.8, isolation_forest: 0.85, z_score: 4.2 },
        detector_flags: { robust_z: true, isolation_forest: true, z_score: true },
        ensemble_score: 0.88,
        is_anomaly: true,
        flags: ['PEER_GROUP_DEVIATION', 'IFOREST_OUTLIER', 'GLOBAL_ROBUST_Z_OUTLIER'],
        peer_group: 'Dist_A',
      },
      {
        record_index: 2,
        record_data: { district: 'Dist_B', wage: 550, workdays: 30 },
        detector_scores: { robust_z: 3.6, isolation_forest: 0.4, z_score: 3.2 },
        detector_flags: { robust_z: true, isolation_forest: false, z_score: true },
        ensemble_score: 0.65,
        is_anomaly: true,
        flags: ['PEER_GROUP_DEVIATION'],
        peer_group: 'Dist_B',
      },
    ],
  }),
}));

describe('Phase 4: Anomaly Detection API & Storage', () => {
  let adminToken;
  let analystToken;
  let reviewerToken;
  let adminUser;
  let analystUser;
  let reviewerUser;
  let testDataset;
  let tempFilePath;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test_secret_anomaly_phase4';
    await connectDB();

    await User.deleteMany({});
    await Dataset.deleteMany({});
    await AnomalyRecord.deleteMany({});
    await ProcessingJob.deleteMany({});
    await AuditLog.deleteMany({});

    // Create users via auth registration endpoint
    const adminRes = await request(app).post('/api/auth/register').send({
      name: 'Admin User',
      email: 'admin_phase4@test.com',
      password: 'Password123!',
      role: 'ADMIN',
    });
    adminToken = adminRes.body.data.token;
    adminUser = adminRes.body.data.user;

    const analystRes = await request(app).post('/api/auth/register').send({
      name: 'Analyst User',
      email: 'analyst_phase4@test.com',
      password: 'Password123!',
      role: 'ANALYST',
    });
    analystToken = analystRes.body.data.token;
    analystUser = analystRes.body.data.user;

    const reviewerRes = await request(app).post('/api/auth/register').send({
      name: 'Reviewer User',
      email: 'reviewer_phase4@test.com',
      password: 'Password123!',
      role: 'REVIEWER',
    });
    reviewerToken = reviewerRes.body.data.token;
    reviewerUser = reviewerRes.body.data.user;

    // Create real temporary file
    tempFilePath = path.join(__dirname, 'test_anomalies_temp.csv');
    fs.writeFileSync(tempFilePath, 'district,wage,workdays\nDist_A,100,20\nDist_A,950,100\nDist_B,550,30\n');

    testDataset = await Dataset.create({
      name: 'Phase 4 Detection Test Dataset',
      category: 'MGNREGA',
      dataType: 'REAL',
      originalFileName: 'test_anomalies_temp.csv',
      fileName: 'test_anomalies_temp.csv',
      filePath: tempFilePath,
      fileSize: 1024,
      fileType: 'csv',
      mimeType: 'text/csv',
      dataHash: 'mock_hash_phase4',
      status: 'Ready',
      rowCount: 3,
      columnCount: 3,
      uploadedBy: analystUser._id,
      isSchemaConfirmed: true,
    });
  });

  afterAll(async () => {
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
    await AnomalyRecord.deleteMany({});
    await Dataset.deleteMany({});
    await User.deleteMany({});
    await ProcessingJob.deleteMany({});
    await mongoose.connection.close();
  });

  describe('POST /api/anomalies/detect', () => {
    it('should reject unauthorized / reviewer requests with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/anomalies/detect')
        .set('Authorization', `Bearer ${reviewerToken}`)
        .send({ datasetId: testDataset._id });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should reject invalid dataset ID with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/anomalies/detect')
        .set('Authorization', `Bearer ${analystToken}`)
        .send({ datasetId: 'invalid_id' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should execute anomaly detection and store records for ANALYST', async () => {
      const res = await request(app)
        .post('/api/anomalies/detect')
        .set('Authorization', `Bearer ${analystToken}`)
        .send({
          datasetId: testDataset._id,
          detectors: ['robust_z', 'isolation_forest', 'z_score'],
          contamination: 0.05,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary.total_anomalies).toBe(2);

      // Verify records are saved in MongoDB
      const count = await AnomalyRecord.countDocuments({ dataset: testDataset._id });
      expect(count).toBe(3);

      const flaggedCount = await AnomalyRecord.countDocuments({
        dataset: testDataset._id,
        isAnomaly: true,
      });
      expect(flaggedCount).toBe(2);

      // Verify audit log
      const audit = await AuditLog.findOne({ action: 'DETECT_ANOMALIES' });
      expect(audit).not.toBeNull();
    });
  });

  describe('GET /api/anomalies (Server-side Filtering & Pagination)', () => {
    it('should allow REVIEWER to fetch anomalies', async () => {
      const res = await request(app)
        .get(`/api/anomalies?datasetId=${testDataset._id}`)
        .set('Authorization', `Bearer ${reviewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.anomalies.length).toBe(2); // default onlyAnomalies=true
      expect(res.body.data.pagination.total).toBe(2);
    });

    it('should filter by specific detector', async () => {
      const res = await request(app)
        .get(`/api/anomalies?datasetId=${testDataset._id}&detector=isolation_forest`)
        .set('Authorization', `Bearer ${analystToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.anomalies.length).toBe(1);
      expect(res.body.data.anomalies[0].recordIndex).toBe(1);
    });

    it('should filter by specific anomaly flag', async () => {
      const res = await request(app)
        .get(`/api/anomalies?datasetId=${testDataset._id}&flag=GLOBAL_ROBUST_Z_OUTLIER`)
        .set('Authorization', `Bearer ${analystToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.anomalies.length).toBe(1);
      expect(res.body.data.anomalies[0].recordIndex).toBe(1);
    });

    it('should filter by score range', async () => {
      const res = await request(app)
        .get(`/api/anomalies?datasetId=${testDataset._id}&minScore=0.80`)
        .set('Authorization', `Bearer ${analystToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.anomalies.length).toBe(1);
      expect(res.body.data.anomalies[0].ensembleScore).toBeGreaterThanOrEqual(0.8);
    });

    it('should return all records when onlyAnomalies is false', async () => {
      const res = await request(app)
        .get(`/api/anomalies?datasetId=${testDataset._id}&onlyAnomalies=false`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.anomalies.length).toBe(3);
    });
  });

  describe('GET /api/anomalies/:id', () => {
    it('should retrieve a single anomaly record with full details', async () => {
      const record = await AnomalyRecord.findOne({ dataset: testDataset._id, recordIndex: 1 });
      const res = await request(app)
        .get(`/api/anomalies/${record._id}`)
        .set('Authorization', `Bearer ${reviewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.recordIndex).toBe(1);
      expect(res.body.data.detectorScores.robust_z).toBe(4.8);
    });
  });

  describe('PATCH /api/anomalies/:id/status', () => {
    it('should allow reviewer to update investigation status, review verdict, and add note', async () => {
      const record = await AnomalyRecord.findOne({ dataset: testDataset._id, recordIndex: 1 });

      const res = await request(app)
        .patch(`/api/anomalies/${record._id}/status`)
        .set('Authorization', `Bearer ${reviewerToken}`)
        .send({
          status: 'INVESTIGATING',
          reviewStatus: 'VALIDATED',
          note: 'Record verified: unusual wage spike observed across block level.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('INVESTIGATING');
      expect(res.body.data.reviewStatus).toBe('VALIDATED');
      expect(res.body.data.notes.length).toBe(1);
      expect(res.body.data.notes[0].text).toContain('wage spike');
    });
  });
});
