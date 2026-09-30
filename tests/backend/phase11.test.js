const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../backend/src/app');
const User = require('../../backend/src/models/User');
const Dataset = require('../../backend/src/models/Dataset');
const AnomalyRecord = require('../../backend/src/models/AnomalyRecord');
const ValidationReport = require('../../backend/src/models/ValidationReport');
const ForensicReport = require('../../backend/src/models/ForensicReport');
const AuditLog = require('../../backend/src/models/AuditLog');
const { connectDB } = require('../../backend/src/config/db');

describe('Phase 11 Backend Tests: Hash-Chained Audit Log & Reports (Contribution C8)', () => {
  let adminToken;
  let adminUser;
  let testDataset;
  let testAnomaly;

  beforeAll(async () => {
    process.env.MONGODB_URI =
      process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/anomaly_detection_test_p11';
    await connectDB();

    await User.deleteMany({});
    await Dataset.deleteMany({});
    await AnomalyRecord.deleteMany({});
    await ValidationReport.deleteMany({});
    await ForensicReport.deleteMany({});
    await AuditLog.deleteMany({});

    // Register Admin User
    const adminRes = await request(app).post('/api/auth/register').send({
      name: 'Audit Admin',
      email: 'audit_admin@example.com',
      password: 'Password123!',
      role: 'ADMIN',
    });
    adminToken = adminRes.body.data.token;
    adminUser = adminRes.body.data.user;

    // Create test dataset
    testDataset = await Dataset.create({
      name: 'Phase 11 Audit Dataset',
      category: 'MGNREGA',
      dataType: 'REAL',
      description: 'Dataset for verifying tamper-evident audit ledger',
      fileName: 'test_p11.csv',
      originalFileName: 'test_p11.csv',
      filePath: '/mock/path/test_p11.csv',
      fileSize: 4096,
      fileType: 'csv',
      dataHash: 'hash_phase11_sha256_mock_data',
      status: 'Ready',
      rowCount: 50,
      columnCount: 5,
      columns: [{ name: 'expenditure', inferredType: 'number' }],
      uploadedBy: adminUser._id,
    });

    // Create test anomaly with ATPI
    testAnomaly = await AnomalyRecord.create({
      dataset: testDataset._id,
      recordIndex: 0,
      isAnomaly: true,
      ensembleScore: 0.88,
      combinedP: 0.002,
      qValue: 0.015,
      atpi: 84.5,
      triagePriority: 'CRITICAL',
      peerGroup: 'District_Alpha',
      validationVerdict: 'CONFIRMED_ANOMALY',
      claimVerificationRatio: 1.0,
      reviewStatus: 'VALIDATED',
      status: 'INVESTIGATING',
      features: { expenditure: 95000 },
    });

    // Create a forensic report for the dataset
    await ForensicReport.create({
      dataset: testDataset._id,
      column: 'expenditure',
      analyzedRecords: 50,
      overallConformity: 'SUSPICIOUS_DEVIATION',
      tests: {
        benford: { p_value: 0.01, is_suspicious: true, conformity: 'Non-Conforming' },
        lastDigit: { p_value: 0.04, is_suspicious: true },
        digitHeaping: { suspicious_heaping: false },
      },
    });
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('1. Hash Chaining and Audit Block Creation', () => {
    it('creates genesis block and subsequent blocks with linked SHA-256 hashes', async () => {
      // Clear audit log to test from genesis
      await AuditLog.deleteMany({});

      const block0 = await AuditLog.create({
        user: adminUser._id,
        userRole: adminUser.role,
        userEmail: adminUser.email,
        action: 'DATASET_UPLOAD',
        entity: 'Dataset',
        entityId: testDataset._id.toString(),
        metadata: { fileName: 'test_p11.csv' },
      });

      expect(block0.sequenceNumber).toBe(0);
      expect(block0.isGenesis).toBe(true);
      expect(block0.previousHash).toBe('0'.repeat(64));
      expect(block0.currentHash).toBeDefined();
      expect(block0.currentHash.length).toBe(64);

      const block1 = await AuditLog.create({
        user: adminUser._id,
        userRole: adminUser.role,
        userEmail: adminUser.email,
        action: 'RUN_DETECTION',
        entity: 'Dataset',
        entityId: testDataset._id.toString(),
        metadata: { detectorCount: 4 },
      });

      expect(block1.sequenceNumber).toBe(1);
      expect(block1.isGenesis).toBe(false);
      expect(block1.previousHash).toBe(block0.currentHash);
      expect(block1.currentHash).toBeDefined();
      expect(block1.currentHash).not.toBe(block0.currentHash);

      const block2 = await AuditLog.create({
        user: adminUser._id,
        userRole: adminUser.role,
        userEmail: adminUser.email,
        action: 'VALIDATION_VERDICT_APPLIED',
        entity: 'AnomalyRecord',
        entityId: testAnomaly._id.toString(),
        metadata: { verdict: 'CONFIRMED_ANOMALY', atpi: 84.5 },
      });

      expect(block2.sequenceNumber).toBe(2);
      expect(block2.previousHash).toBe(block1.currentHash);
    });

    it('retrieves paginated audit blocks via GET /api/reports/audit/chain', async () => {
      const res = await request(app)
        .get('/api/reports/audit/chain?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.blocks).toBeDefined();
      expect(res.body.data.blocks.length).toBeGreaterThanOrEqual(3);
      expect(res.body.data.pagination.total).toBeGreaterThanOrEqual(3);
      expect(res.body.data.blocks[0].currentHash).toBeDefined();
    });
  });

  describe('2. Cryptographic Hash Chain Verification (Contribution C8)', () => {
    it('verifies 100% integrity when chain is pristine', async () => {
      const res = await request(app)
        .get('/api/reports/audit/verify')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isChainValid).toBe(true);
      expect(res.body.data.totalBlocks).toBeGreaterThanOrEqual(3);
      expect(res.body.data.tamperedBlocks.length).toBe(0);
      expect(res.body.data.genesisHash).toBeDefined();
      expect(res.body.data.headHash).toBeDefined();
    });

    it('detects tampering immediately if block payload is modified directly in MongoDB', async () => {
      // Find block 1 and directly alter its action without updating currentHash
      const block1 = await AuditLog.findOne({ sequenceNumber: 1 });
      expect(block1).toBeDefined();

      await AuditLog.collection.updateOne(
        { _id: block1._id },
        { $set: { action: 'UNAUTHORIZED_MUTATION' } }
      );

      const res = await request(app)
        .get('/api/reports/audit/verify')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isChainValid).toBe(false);
      expect(res.body.data.tamperedBlocks.length).toBeGreaterThan(0);
      const tampered = res.body.data.tamperedBlocks.find((b) => b.sequenceNumber === 1);
      expect(tampered).toBeDefined();
      expect(tampered.reason).toContain('Tampered block payload');

      // Revert the mutation so subsequent tests work cleanly
      await AuditLog.collection.updateOne(
        { _id: block1._id },
        { $set: { action: block1.action } }
      );

      // Verify chain is pristine again
      const restoredRes = await request(app)
        .get('/api/reports/audit/verify')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(restoredRes.body.data.isChainValid).toBe(true);
    });
  });

  describe('3. Decision-Support Compliance Certificate & Exports', () => {
    it('generates comprehensive audit certificate for a dataset', async () => {
      const res = await request(app)
        .get(`/api/reports/dataset/${testDataset._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const cert = res.body.data;
      expect(cert.dataset.id).toBe(testDataset._id.toString());
      expect(cert.dataset.name).toBe('Phase 11 Audit Dataset');
      expect(cert.dataset.dataType).toBe('REAL');
      expect(cert.dataset.dataHash).toBe('hash_phase11_sha256_mock_data');
      expect(cert.calibrationAndTriage.atpiDistribution.critical).toBe(1);
      expect(cert.forensicConformance.hasForensicReport).toBe(true);
      expect(cert.cryptographicAuditChain.isChainValid).toBe(true);
      expect(cert.certificateId).toBeDefined();
    });

    it('exports audit certificate as JSON file attachment', async () => {
      const res = await request(app)
        .get(`/api/reports/dataset/${testDataset._id}/export/json`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/json');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.body.certificateId).toBeDefined();
      expect(res.body.dataset.name).toBe('Phase 11 Audit Dataset');
    });

    it('exports detected anomalies as CSV with ATPI and forensic/validation columns', async () => {
      const res = await request(app)
        .get(`/api/reports/dataset/${testDataset._id}/export/csv`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.text).toContain('RecordIndex,DatasetName,DataType,ATPI,Priority');
      expect(res.text).toContain('CRITICAL');
      expect(res.text).toContain('84.5');
      expect(res.text).toContain('CONFIRMED_ANOMALY');
    });
  });
});
