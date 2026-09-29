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

// Mock ML service analyzeDataset returning Phase 6 conformal p-values, q-values, and ATPI
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
      significant_fdr_count: 2,
      anomaly_rate: 0.2,
      target_fdr: 0.05,
      fusion_method: 'ACAT',
      fdr_method: 'BH',
      atpi_formula: 'ATPI = 100 * [ w_q * (1 - q) + ... ]',
      detector_counts: { robust_z: 2, isolation_forest: 1 },
      active_detectors: ['robust_z', 'isolation_forest'],
      feature_cols_analyzed: ['wage', 'workdays'],
      p_value_distribution: [{ bin: '0.0-0.1', count: 2 }, { bin: '0.1-0.2', count: 0 }],
    },
    records: [
      {
        record_index: 0,
        record_data: { district: 'Dist_A', wage: 100, workdays: 20 },
        detector_scores: { robust_z: 0.5, isolation_forest: 0.1 },
        detector_pvalues: { robust_z: 0.85, isolation_forest: 0.90 },
        detector_flags: { robust_z: false, isolation_forest: false },
        combined_p: 0.88,
        q_value: 0.88,
        combined_score: 0.15,
        ensemble_score: 0.15,
        atpi: 18.5,
        atpi_breakdown: { statistical_confidence: 0.12, effect_size_score: 0.1 },
        triage_priority: 'LOW',
        is_anomaly: false,
        flags: [],
        peer_group: 'Dist_A',
        peer_context_flag: false,
        detection_methods: [],
      },
      {
        record_index: 1,
        record_data: { district: 'Dist_A', wage: 950, workdays: 100 },
        detector_scores: { robust_z: 5.2, isolation_forest: 0.88 },
        detector_pvalues: { robust_z: 0.0005, isolation_forest: 0.001 },
        detector_flags: { robust_z: true, isolation_forest: true },
        combined_p: 0.0003,
        q_value: 0.0015,
        combined_score: 0.92,
        ensemble_score: 0.92,
        atpi: 88.4,
        atpi_breakdown: { statistical_confidence: 0.99, effect_size_score: 1.0 },
        triage_priority: 'CRITICAL',
        is_anomaly: true,
        flags: ['PEER_GROUP_DEVIATION', 'IFOREST_OUTLIER'],
        peer_group: 'Dist_A',
        peer_context_flag: true,
        detection_methods: ['robust_z', 'isolation_forest'],
      },
      {
        record_index: 2,
        record_data: { district: 'Dist_B', wage: 600, workdays: 40 },
        detector_scores: { robust_z: 3.8, isolation_forest: 0.3 },
        detector_pvalues: { robust_z: 0.012, isolation_forest: 0.25 },
        detector_flags: { robust_z: true, isolation_forest: false },
        combined_p: 0.015,
        q_value: 0.030,
        combined_score: 0.65,
        ensemble_score: 0.65,
        atpi: 68.2,
        atpi_breakdown: { statistical_confidence: 0.97, effect_size_score: 0.8 },
        triage_priority: 'HIGH',
        is_anomaly: true,
        flags: ['PEER_GROUP_DEVIATION'],
        peer_group: 'Dist_B',
        peer_context_flag: true,
        detection_methods: ['robust_z'],
      },
    ],
  }),
}));

describe('Phase 6: Conformal Calibration, ACAT Fusion, and ATPI Triage', () => {
  let adminToken;
  let analystToken;
  let reviewerToken;
  let testDataset;
  let tempFilePath;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test_secret_phase6_jwt';
    await connectDB();

    await User.deleteMany({});
    await Dataset.deleteMany({});
    await AnomalyRecord.deleteMany({});
    await ProcessingJob.deleteMany({});
    await AuditLog.deleteMany({});

    // Register users
    const adminRes = await request(app).post('/api/auth/register').send({
      name: 'P6 Admin',
      email: 'admin_p6@test.com',
      password: 'Password123!',
      role: 'ADMIN',
    });
    adminToken = adminRes.body.data.token;

    const analystRes = await request(app).post('/api/auth/register').send({
      name: 'P6 Analyst',
      email: 'analyst_p6@test.com',
      password: 'Password123!',
      role: 'ANALYST',
    });
    analystToken = analystRes.body.data.token;

    const reviewerRes = await request(app).post('/api/auth/register').send({
      name: 'P6 Reviewer',
      email: 'reviewer_p6@test.com',
      password: 'Password123!',
      role: 'REVIEWER',
    });
    reviewerToken = reviewerRes.body.data.token;

    // Create temporary dataset file
    tempFilePath = path.join(__dirname, 'test_phase6_temp.csv');
    fs.writeFileSync(tempFilePath, 'district,wage,workdays\nDist_A,100,20\nDist_A,950,100\nDist_B,600,40\n');

    testDataset = await Dataset.create({
      name: 'Phase 6 Calibration Test Dataset',
      category: 'MGNREGA',
      dataType: 'SYNTHETIC/DEMO',
      fileName: 'test_phase6_temp.csv',
      originalFileName: 'test_phase6_temp.csv',
      filePath: tempFilePath,
      fileSize: 1024,
      fileType: 'csv',
      mimeType: 'text/csv',
      dataHash: 'hash_phase6_test',
      status: 'Ready',
      rowCount: 3,
      columnCount: 3,
      uploadedBy: analystRes.body.data.user._id,
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

  it('should run detection with ACAT fusion and save p/q-values and ATPI', async () => {
    const res = await request(app)
      .post('/api/anomalies/detect')
      .set('Authorization', `Bearer ${analystToken}`)
      .send({
        datasetId: testDataset._id,
        detectors: ['robust_z', 'isolation_forest'],
        fusionMethod: 'acat',
        fdrMethod: 'bh',
        targetFdr: 0.05,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify stored records in MongoDB
    const records = await AnomalyRecord.find({ dataset: testDataset._id }).sort({ recordIndex: 1 });
    expect(records.length).toBe(3);

    // Record #1: Critical anomaly
    const rec1 = records[1];
    expect(rec1.qValue).toBeLessThanOrEqual(0.05);
    expect(rec1.atpi).toBeGreaterThanOrEqual(75.0);
    expect(rec1.triagePriority).toBe('CRITICAL');
    expect(rec1.peerContextFlag).toBe(true);
    expect(rec1.combinedP).toBeLessThan(0.01);
  });

  it('should filter anomalies by target FDR q-value threshold', async () => {
    const res = await request(app)
      .get(`/api/anomalies?datasetId=${testDataset._id}&maxQValue=0.05`)
      .set('Authorization', `Bearer ${reviewerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Records #1 (q=0.0015) and #2 (q=0.030) satisfy q <= 0.05
    expect(res.body.data.anomalies.length).toBe(2);
    expect(res.body.data.summary.significantFdrCount).toBe(2);
  });

  it('should filter anomalies by minimum ATPI priority score', async () => {
    const res = await request(app)
      .get(`/api/anomalies?datasetId=${testDataset._id}&minAtpi=80`)
      .set('Authorization', `Bearer ${analystToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.anomalies.length).toBe(1);
    expect(res.body.data.anomalies[0].recordIndex).toBe(1);
    expect(res.body.data.anomalies[0].atpi).toBeGreaterThanOrEqual(80);
  });

  it('should sort anomalies by ATPI descending', async () => {
    const res = await request(app)
      .get(`/api/anomalies?datasetId=${testDataset._id}&onlyAnomalies=false&sortBy=atpi&sortOrder=desc`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const anomalies = res.body.data.anomalies;
    expect(anomalies[0].atpi).toBeGreaterThanOrEqual(anomalies[1].atpi);
    expect(anomalies[1].atpi).toBeGreaterThanOrEqual(anomalies[2].atpi);
  });
});
