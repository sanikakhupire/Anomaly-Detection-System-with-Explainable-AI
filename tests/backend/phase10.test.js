const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../backend/src/app');
const User = require('../../backend/src/models/User');
const Dataset = require('../../backend/src/models/Dataset');
const AnomalyRecord = require('../../backend/src/models/AnomalyRecord');
const DetectorWeightConfig = require('../../backend/src/models/DetectorWeightConfig');
const ValidationReport = require('../../backend/src/models/ValidationReport');
const AuditLog = require('../../backend/src/models/AuditLog');
const { connectDB } = require('../../backend/src/config/db');

// Mock ML service adaptive weight and validation calls
jest.mock('../../backend/src/services/ml.service', () => ({
  requestProfiling: jest.fn().mockResolvedValue({}),
  inferSchemaMapping: jest.fn().mockResolvedValue({}),
  runFeatureEngineering: jest.fn().mockResolvedValue({ features: [] }),
  buildPeerGroups: jest.fn().mockResolvedValue({ groups: [] }),
  analyzeDataset: jest.fn().mockResolvedValue({ summary: {}, records: [] }),
  analyzeForensics: jest.fn().mockResolvedValue({ results_by_column: {} }),
  explainAnomaly: jest.fn().mockResolvedValue({}),
  explainBatchAnomalies: jest.fn().mockResolvedValue({}),
  validateAnomaly: jest.fn().mockResolvedValue({
    record_index: 0,
    domain_type: 'MGNREGA',
    evidence_bundle: {},
    agent_assessments: [],
    claims: [],
    claim_verification_ratio: 1.0,
    verdict: 'CONFIRMED_ANOMALY',
    confidence: 0.90,
    recommended_action: 'ESCALATE_FOR_AUDIT',
    summary: 'Statistically unusual pattern verified by multi-agent analysis.',
    rule_engine_type: 'DETERMINISTIC_MULTI_AGENT',
    is_llm_augmented: false,
  }),
  validateBatchAnomalies: jest.fn().mockResolvedValue([]),
  updateDetectorWeights: jest.fn().mockImplementation((payload) => {
    const weights = payload.current_weights || {
      robust_z: 0.40,
      isolation_forest: 0.35,
      z_score: 0.15,
      temporal: 0.10,
    };
    // Simulate updating weights
    return Promise.resolve({
      updated_weights: {
        robust_z: 0.42,
        isolation_forest: 0.38,
        z_score: 0.12,
        temporal: 0.08,
      },
      normalized_weights: {
        robust_z: 0.42,
        isolation_forest: 0.38,
        z_score: 0.12,
        temporal: 0.08,
      },
      previous_weights: weights,
      loss_by_detector: {
        robust_z: 0.15,
        isolation_forest: 0.10,
        z_score: 0.45,
        temporal: 0.50,
      },
      precision_by_detector: {
        robust_z: 0.85,
        isolation_forest: 0.90,
        z_score: 0.50,
        temporal: 0.40,
      },
      alignment_by_detector: {
        robust_z: 0.85,
        isolation_forest: 0.90,
        z_score: 0.55,
        temporal: 0.50,
      },
      weight_drift_l1: 0.10,
      total_feedback_count: 1,
      learning_rate: payload.learning_rate || 0.1,
      smoothing_factor: payload.smoothing_factor || 0.05,
    });
  }),
}));

describe('Phase 10 Backend Tests: Adaptive Detector Weighting (Contribution C6)', () => {
  let adminToken;
  let reviewerToken;
  let adminUser;
  let reviewerUser;
  let testDataset;
  let testAnomaly;

  beforeAll(async () => {
    process.env.MONGODB_URI =
      process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/anomaly_detection_test_p10';
    await connectDB();

    await User.deleteMany({});
    await Dataset.deleteMany({});
    await AnomalyRecord.deleteMany({});
    await DetectorWeightConfig.deleteMany({});
    await ValidationReport.deleteMany({});
    await AuditLog.deleteMany({});

    // Register Admin User
    const adminRes = await request(app).post('/api/auth/register').send({
      name: 'Weight Admin',
      email: 'wadmin@example.com',
      password: 'Password123!',
      role: 'ADMIN',
    });
    adminToken = adminRes.body.data.token;
    adminUser = adminRes.body.data.user;

    // Register Reviewer User
    const reviewerRes = await request(app).post('/api/auth/register').send({
      name: 'Weight Reviewer',
      email: 'wreviewer@example.com',
      password: 'Password123!',
      role: 'REVIEWER',
    });
    reviewerToken = reviewerRes.body.data.token;
    reviewerUser = reviewerRes.body.data.user;

    // Create test dataset
    testDataset = await Dataset.create({
      name: 'Phase 10 Adaptive Weights Dataset',
      category: 'MGNREGA',
      dataType: 'SYNTHETIC/DEMO',
      description: 'Dataset for testing adaptive detector weights',
      fileName: 'test_p10.csv',
      originalFileName: 'test_p10.csv',
      filePath: '/mock/path/test_p10.csv',
      fileSize: 2048,
      fileType: 'csv',
      dataHash: 'hash_phase10_sha256',
      status: 'Ready',
      rowCount: 20,
      columnCount: 4,
      columns: [{ name: 'workdays', inferredType: 'number' }],
      uploadedBy: adminUser._id,
      isSchemaConfirmed: true,
    });

    // Create test anomaly record
    testAnomaly = await AnomalyRecord.create({
      dataset: testDataset._id,
      recordIndex: 0,
      recordData: { workdays: 90 },
      detectorScores: {
        robust_z: 0.85,
        isolation_forest: 0.90,
        z_score: 0.30,
        temporal: 0.20,
      },
      detectorFlags: {
        robust_z: true,
        isolation_forest: true,
        z_score: false,
        temporal: false,
      },
      combinedP: 0.001,
      qValue: 0.003,
      ensembleScore: 0.65,
      atpi: 70.0,
      atpiBreakdown: {
        statistical_confidence: 0.99,
        effect_size_score: 0.65,
        population_impact_score: 0.5,
      },
      isAnomaly: true,
      triagePriority: 'HIGH',
      status: 'NEW',
      reviewStatus: 'PENDING',
    });
  });

  afterAll(async () => {
    await User.deleteMany({});
    await Dataset.deleteMany({});
    await AnomalyRecord.deleteMany({});
    await DetectorWeightConfig.deleteMany({});
    await ValidationReport.deleteMany({});
    await AuditLog.deleteMany({});
    await mongoose.connection.close();
  });

  it('1. GET /api/models/weights - retrieves active detector weight configuration', async () => {
    const res = await request(app)
      .get(`/api/models/weights/${testDataset._id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.weights).toBeDefined();
    expect(res.body.data.weights.robust_z).toBeDefined();
    expect(res.body.data.learningRate).toBe(0.10);
    expect(res.body.data.smoothingFactor).toBe(0.05);
  });

  it('2. POST /api/models/weights/tune - manually tunes detector weights with validation', async () => {
    // Valid tuning payload: sum = 1.0
    const tunePayload = {
      weights: {
        robust_z: 0.45,
        isolation_forest: 0.35,
        z_score: 0.10,
        temporal: 0.10,
      },
      learningRate: 0.15,
      smoothingFactor: 0.08,
    };

    const res = await request(app)
      .post(`/api/models/weights/${testDataset._id}/tune`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(tunePayload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.weights.robust_z).toBe(0.45);
    expect(res.body.data.learningRate).toBe(0.15);
    expect(res.body.data.smoothingFactor).toBe(0.08);
    expect(res.body.data.history.length).toBeGreaterThanOrEqual(1);

    // Invalid tuning: sum != 1.0
    const invalidRes = await request(app)
      .post(`/api/models/weights/${testDataset._id}/tune`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ weights: { robust_z: 0.8, isolation_forest: 0.8 } });

    expect(invalidRes.status).toBe(400);
    expect(invalidRes.body.message).toContain('must sum to 1.0');
  });

  it('3. POST /api/models/weights/recalculate - recalculates dataset anomaly ensemble scores with active weights', async () => {
    const res = await request(app)
      .post(`/api/models/weights/${testDataset._id}/recalculate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.updatedCount).toBe(1);

    // Verify record was updated with new weights: 0.85*0.45 + 0.90*0.35 + 0.30*0.10 + 0.20*0.10 = 0.7475
    const updated = await AnomalyRecord.findById(testAnomaly._id);
    expect(updated.ensembleScore).toBeCloseTo(0.7475, 2);
  });

  it('4. POST /api/validations/:anomalyId/review - triggers adaptive weight update loop on human feedback', async () => {
    const reviewRes = await request(app)
      .post(`/api/validations/${testAnomaly._id}/review`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({
        reviewStatus: 'VALIDATED',
        status: 'RESOLVED',
        note: 'Reviewer confirmed anomaly; detector weights should reward isolation forest and robust z.',
      });

    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.success).toBe(true);

    // Check DetectorWeightConfig was updated via processFeedbackUpdate
    const config = await DetectorWeightConfig.findOne({ dataset: testDataset._id });
    expect(config).toBeDefined();
    expect(config.totalFeedbackCount).toBeGreaterThanOrEqual(1);
    expect(config.history.some((h) => h.reason === 'HUMAN_FEEDBACK_UPDATE')).toBe(true);
  });

  it('5. POST /api/models/weights/reset - resets detector weights to defaults', async () => {
    const res = await request(app)
      .post(`/api/models/weights/${testDataset._id}/reset`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.weights.robust_z).toBe(0.40);
    expect(res.body.data.weights.isolation_forest).toBe(0.35);
  });

  it('6. Role & Auth checks - denies unauthorized access to weight tuning', async () => {
    // Unauthenticated
    const unauth = await request(app).post(`/api/models/weights/${testDataset._id}/tune`).send({});
    expect(unauth.status).toBe(401);

    // Reviewer role attempting Admin/Analyst tuning
    const forbidden = await request(app)
      .post(`/api/models/weights/${testDataset._id}/tune`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ weights: { robust_z: 0.25, isolation_forest: 0.25, z_score: 0.25, temporal: 0.25 } });

    expect(forbidden.status).toBe(403);
  });
});
