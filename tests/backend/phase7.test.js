const request = require('supertest');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const app = require('../../backend/src/app');
const User = require('../../backend/src/models/User');
const Dataset = require('../../backend/src/models/Dataset');
const ForensicReport = require('../../backend/src/models/ForensicReport');
const DataFusion = require('../../backend/src/models/DataFusion');
const ProcessingJob = require('../../backend/src/models/ProcessingJob');
const AuditLog = require('../../backend/src/models/AuditLog');
const { connectDB } = require('../../backend/src/config/db');

// Mock ML service analyzeForensics returning Phase 7 forensic battery results
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
  analyzeDataset: jest.fn().mockResolvedValue({ summary: {}, records: [] }),
  analyzeForensics: jest.fn().mockResolvedValue({
    total_records: 100,
    analyzed_columns: ['turnout_pct', 'registered_voters'],
    results_by_column: {
      registered_voters: {
        column: 'registered_voters',
        total_records: 100,
        overall_conformity: 'SUSPICIOUS_DEVIATION',
        non_conformity_count: 2,
        record_pvalues: [0.01, 0.45, 0.88],
        tests: {
          benford_first_digit: {
            test_name: 'benford_first_digit',
            display_name: "Benford's Law (First Leading Digit)",
            statistic: 18.42,
            p_value: 0.018,
            effect_size: 0.016,
            conformity_level: 'NON_CONFORMING',
            observed_frequencies: { '1': 0.15, '2': 0.12, '3': 0.25 },
            expected_frequencies: { '1': 0.301, '2': 0.176, '3': 0.125 },
            digit_labels: ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
            note: 'Statistically significant departure from expected logarithmic distribution.',
            flagged_count: 25,
            metadata: { nigrini_mad: 0.0162 },
          },
          digit_heaping: {
            test_name: 'digit_heaping',
            display_name: 'Digit Heaping & Rounding Index (Whipple / Myers)',
            statistic: 142.5,
            p_value: 0.002,
            effect_size: 142.5,
            conformity_level: 'SUSPICIOUS_DEVIATION',
            observed_frequencies: { '0': 0.20, '5': 0.15 },
            expected_frequencies: { '0': 0.10, '5': 0.10 },
            digit_labels: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
            note: 'Whipple index indicates rough data with substantial preference for terminal digits 0 and 5.',
            flagged_count: 35,
            metadata: { whipple_index: 142.5, myers_blended_index: 18.2 },
          },
        },
      },
    },
  }),
}));

describe('Phase 7: Statistical Forensics (C3) and Data Fusion', () => {
  let adminToken;
  let analystToken;
  let reviewerToken;
  let testDatasetA;
  let testDatasetB;
  let tempFilePathA;
  let tempFilePathB;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test_secret_phase7_jwt';
    await connectDB();

    await User.deleteMany({});
    await Dataset.deleteMany({});
    await ForensicReport.deleteMany({});
    await DataFusion.deleteMany({});
    await ProcessingJob.deleteMany({});
    await AuditLog.deleteMany({});

    // Register test users
    const adminRes = await request(app).post('/api/auth/register').send({
      name: 'P7 Admin',
      email: 'admin_p7@test.com',
      password: 'Password123!',
      role: 'ADMIN',
    });
    adminToken = adminRes.body.data.token;

    const analystRes = await request(app).post('/api/auth/register').send({
      name: 'P7 Analyst',
      email: 'analyst_p7@test.com',
      password: 'Password123!',
      role: 'ANALYST',
    });
    analystToken = analystRes.body.data.token;

    const reviewerRes = await request(app).post('/api/auth/register').send({
      name: 'P7 Reviewer',
      email: 'reviewer_p7@test.com',
      password: 'Password123!',
      role: 'REVIEWER',
    });
    reviewerToken = reviewerRes.body.data.token;

    // Create temporary dataset CSV files for Source A and Source B
    tempFilePathA = path.join(__dirname, 'test_phase7_source_a.csv');
    fs.writeFileSync(
      tempFilePathA,
      'district,block,population,registered_voters\nDist1,BlockA,50000,32000\nDist1,BlockB,42000,28000\n'
    );

    tempFilePathB = path.join(__dirname, 'test_phase7_source_b.csv');
    fs.writeFileSync(
      tempFilePathB,
      'district,block,population,registered_voters\nDist1,BlockA,54500,32000\nDist1,BlockB,42100,28000\n'
    );

    testDatasetA = await Dataset.create({
      name: 'Phase 7 Census Official Survey A',
      category: 'Census',
      dataType: 'SYNTHETIC/DEMO',
      fileName: 'test_phase7_source_a.csv',
      originalFileName: 'test_phase7_source_a.csv',
      filePath: tempFilePathA,
      fileSize: 1024,
      fileType: 'csv',
      mimeType: 'text/csv',
      dataHash: 'hash_phase7_source_a',
      status: 'Ready',
      rowCount: 2,
      columnCount: 4,
      uploadedBy: analystRes.body.data.user._id,
      isSchemaConfirmed: true,
    });

    testDatasetB = await Dataset.create({
      name: 'Phase 7 Verification Audit B',
      category: 'Census',
      dataType: 'SYNTHETIC/DEMO',
      fileName: 'test_phase7_source_b.csv',
      originalFileName: 'test_phase7_source_b.csv',
      filePath: tempFilePathB,
      fileSize: 1024,
      fileType: 'csv',
      mimeType: 'text/csv',
      dataHash: 'hash_phase7_source_b',
      status: 'Ready',
      rowCount: 2,
      columnCount: 4,
      uploadedBy: analystRes.body.data.user._id,
      isSchemaConfirmed: true,
    });
  });

  afterAll(async () => {
    if (fs.existsSync(tempFilePathA)) fs.unlinkSync(tempFilePathA);
    if (fs.existsSync(tempFilePathB)) fs.unlinkSync(tempFilePathB);

    await ForensicReport.deleteMany({});
    await DataFusion.deleteMany({});
    await Dataset.deleteMany({});
    await User.deleteMany({});
    await ProcessingJob.deleteMany({});
    await mongoose.connection.close();
  });

  describe('Forensic Test Battery (Contribution C3)', () => {
    let createdReportId;

    it('should reject unauthenticated request to run forensics', async () => {
      const res = await request(app)
        .post('/api/forensics/run')
        .send({ datasetId: testDatasetA._id });

      expect(res.status).toBe(401);
    });

    it('should reject REVIEWER role from running forensics', async () => {
      const res = await request(app)
        .post('/api/forensics/run')
        .set('Authorization', `Bearer ${reviewerToken}`)
        .send({ datasetId: testDatasetA._id });

      expect(res.status).toBe(403);
    });

    it('should execute forensic battery and save report in MongoDB', async () => {
      const res = await request(app)
        .post('/api/forensics/run')
        .set('Authorization', `Bearer ${analystToken}`)
        .send({ datasetId: testDatasetA._id });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.reports).toBeDefined();
      expect(res.body.data.reports.length).toBeGreaterThanOrEqual(1);

      const report = res.body.data.reports[0];
      createdReportId = report._id;
      expect(report.column).toBe('registered_voters');
      expect(report.overallConformity).toBe('SUSPICIOUS_DEVIATION');
      expect(report.tests.benford_first_digit.statistic).toBe(18.42);
      expect(report.tests.digit_heaping.metadata.whipple_index).toBe(142.5);
    });

    it('should fetch forensic reports by dataset ID', async () => {
      const res = await request(app)
        .get(`/api/forensics/${testDatasetA._id}`)
        .set('Authorization', `Bearer ${reviewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.reports.length).toBeGreaterThanOrEqual(1);
    });

    it('should fetch single forensic report by report ID', async () => {
      const res = await request(app)
        .get(`/api/forensics/report/${createdReportId}`)
        .set('Authorization', `Bearer ${reviewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.report._id.toString()).toBe(createdReportId.toString());
      expect(res.body.data.report.tests.benford_first_digit).toBeDefined();
    });
  });

  describe('Data Fusion & Provenance Conflict Resolution', () => {
    let createdFusionId;

    it('should reject unauthenticated request to run fusion', async () => {
      const res = await request(app)
        .post('/api/fusion/run')
        .send({
          datasetAId: testDatasetA._id,
          datasetBId: testDatasetB._id,
        });

      expect(res.status).toBe(401);
    });

    it('should reject fusion with identical dataset', async () => {
      const res = await request(app)
        .post('/api/fusion/run')
        .set('Authorization', `Bearer ${analystToken}`)
        .send({
          datasetAId: testDatasetA._id,
          datasetBId: testDatasetA._id,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_DATASETS');
    });

    it('should run data fusion, compute Source Trust Scores, and identify conflicts', async () => {
      const res = await request(app)
        .post('/api/fusion/run')
        .set('Authorization', `Bearer ${analystToken}`)
        .send({
          datasetAId: testDatasetA._id,
          datasetBId: testDatasetB._id,
          keyColumns: ['district', 'block'],
          compareColumns: ['population'],
          discrepancyThresholdPct: 5,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.fusionId).toBeDefined();
      createdFusionId = res.body.data.fusionId;

      // Check Source Trust Scores
      expect(res.body.data.sourceTrustA.score).toBeGreaterThan(0);
      expect(res.body.data.sourceTrustB.score).toBeGreaterThan(0);

      // Check detected conflict: Dist1-BlockA has population 50,000 vs 54,500 (9.0% discrepancy > 5%)
      expect(res.body.data.conflictsCount).toBeGreaterThanOrEqual(1);

      // Verify stored record in MongoDB
      const storedFusion = await DataFusion.findById(createdFusionId);
      expect(storedFusion).toBeDefined();
      expect(storedFusion.conflicts.length).toBeGreaterThanOrEqual(1);
      expect(storedFusion.conflicts[0].column).toBe('population');
      expect(storedFusion.conflicts[0].sourceA.value).toBe(50000);
      expect(storedFusion.conflicts[0].sourceB.value).toBe(54500);
      expect(storedFusion.conflicts[0].resolution.status).toBe('PENDING');
    });

    it('should list fusions with pagination', async () => {
      const res = await request(app)
        .get('/api/fusion?page=1&limit=10')
        .set('Authorization', `Bearer ${reviewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.fusions.length).toBeGreaterThanOrEqual(1);
    });

    it('should fetch specific fusion by ID with complete details', async () => {
      const res = await request(app)
        .get(`/api/fusion/${createdFusionId}`)
        .set('Authorization', `Bearer ${reviewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.fusion._id.toString()).toBe(createdFusionId.toString());
      expect(res.body.data.fusion.conflicts.length).toBeGreaterThanOrEqual(1);
    });

    it('should resolve a conflict with TRUST_WEIGHTED_MEAN and record provenance audit log', async () => {
      const res = await request(app)
        .patch(`/api/fusion/${createdFusionId}/resolve`)
        .set('Authorization', `Bearer ${analystToken}`)
        .send({
          conflictIndex: 0,
          method: 'TRUST_WEIGHTED_MEAN',
          notes: 'Resolved using weighted average of Census official and validation audit surveys.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const conflict = res.body.data.conflict;
      expect(conflict.resolution.status).toBe('RESOLVED');
      expect(conflict.resolution.method).toBe('TRUST_WEIGHTED_MEAN');
      expect(conflict.resolution.resolvedValue).toBeGreaterThanOrEqual(50000);
      expect(conflict.resolution.resolvedValue).toBeLessThanOrEqual(54500);
      // Source values must NEVER be wiped or overwritten
      expect(conflict.sourceA.value).toBe(50000);
      expect(conflict.sourceB.value).toBe(54500);

      // Verify audit log entry in DataFusion model
      const updated = await DataFusion.findById(createdFusionId);
      expect(updated.resolvedCount).toBe(1);
      expect(updated.auditLog.length).toBeGreaterThanOrEqual(2);
      const resolveEntry = updated.auditLog.find((entry) => entry.action === 'RESOLVE_CONFLICT');
      expect(resolveEntry).toBeDefined();
      expect(resolveEntry.details.method).toBe('TRUST_WEIGHTED_MEAN');
    });

    it('should support KEEP_BOTH_FLAGGED resolution method preserving dual provenance', async () => {
      const res = await request(app)
        .patch(`/api/fusion/${createdFusionId}/resolve`)
        .set('Authorization', `Bearer ${reviewerToken}`)
        .send({
          conflictIndex: 0,
          method: 'KEEP_BOTH_FLAGGED',
          notes: 'Retaining dual provenance for independent statistical investigation.',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.conflict.resolution.method).toBe('KEEP_BOTH_FLAGGED');
      expect(res.body.data.conflict.resolution.status).toBe('RESOLVED');
    });
  });
});
