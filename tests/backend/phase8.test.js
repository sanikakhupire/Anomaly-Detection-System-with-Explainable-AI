const request = require('supertest');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const app = require('../../backend/src/app');
const User = require('../../backend/src/models/User');
const Dataset = require('../../backend/src/models/Dataset');
const AnomalyRecord = require('../../backend/src/models/AnomalyRecord');
const Explanation = require('../../backend/src/models/Explanation');
const ExplanationMetric = require('../../backend/src/models/ExplanationMetric');
const ProcessingJob = require('../../backend/src/models/ProcessingJob');
const AuditLog = require('../../backend/src/models/AuditLog');
const { connectDB } = require('../../backend/src/config/db');

// Mock ML service explainability calls
jest.mock('../../backend/src/services/ml.service', () => ({
  requestProfiling: jest.fn().mockResolvedValue({}),
  inferSchemaMapping: jest.fn().mockResolvedValue({}),
  runFeatureEngineering: jest.fn().mockResolvedValue({ features: [] }),
  buildPeerGroups: jest.fn().mockResolvedValue({ groups: [] }),
  analyzeDataset: jest.fn().mockResolvedValue({ summary: {}, records: [] }),
  analyzeForensics: jest.fn().mockResolvedValue({ results_by_column: {} }),
  explainAnomaly: jest.fn().mockResolvedValue({
    record_index: 0,
    top_features: [
      {
        feature: 'wage',
        actual_value: 850,
        expected_value: 120,
        direction: 'ANOMALOUS_ELEVATION',
        shap_value: 0.65,
        diffi_score: 0.58,
        perturbation_score: 0.72,
        contribution_pct: 65.0,
      },
    ],
    shap_values: { wage: 0.65, workdays: 0.05 },
    diffi_scores: { wage: 0.58, workdays: 0.12 },
    perturbation_scores: { wage: 0.72, workdays: 0.10 },
    plain_language_summary:
      "Statistically unusual pattern driven primarily by 'wage' (+3.8 MAD above peer baseline). Requires human review.",
    counterfactuals: [
      {
        feature: 'wage',
        original_value: 850,
        counterfactual_value: 160,
        delta: -690,
        peer_median: 120,
        peer_iqr: [100, 160],
        direction: 'DECREASE',
        plausibility: true,
      },
    ],
    faithfulness: {
      deletion_auc: 0.28,
      insertion_auc: 0.82,
      comprehensiveness: 0.55,
      sufficiency: 0.12,
      deletion_curve: [0.95, 0.40, 0.15],
      insertion_curve: [0.10, 0.85, 0.95],
    },
    stability: {
      jaccard_stability: 0.88,
      kendall_tau: 0.82,
      top_k_features: ['wage'],
      explanation_coverage: 1.0,
    },
    stability_score: 0.85,
  }),
  explainBatchAnomalies: jest.fn().mockResolvedValue({
    explanations: [
      {
        record_index: 0,
        top_features: [{ feature: 'wage', shap_value: 0.65, contribution_pct: 65 }],
        shap_values: { wage: 0.65 },
        diffi_scores: { wage: 0.58 },
        perturbation_scores: { wage: 0.72 },
        plain_language_summary: 'Batch explanation summary.',
        counterfactuals: [],
        faithfulness: { deletion_auc: 0.28, insertion_auc: 0.82, comprehensiveness: 0.55, sufficiency: 0.12 },
        stability: { jaccard_stability: 0.88, kendall_tau: 0.82 },
        stability_score: 0.85,
      },
    ],
    metrics: {
      mean_deletion_auc: 0.28,
      mean_insertion_auc: 0.82,
      mean_jaccard_stability: 0.88,
      mean_kendall_tau: 0.82,
      total_explained: 1,
      explanation_coverage: 1.0,
    },
  }),
}));

describe('Phase 8: Explainability & Faithfulness (Contribution C4)', () => {
  let adminToken;
  let analystToken;
  let reviewerToken;
  let testDataset;
  let testAnomaly;
  let tempFilePath;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test_secret_phase8_jwt';
    await connectDB();

    await User.deleteMany({});
    await Dataset.deleteMany({});
    await AnomalyRecord.deleteMany({});
    await Explanation.deleteMany({});
    await ExplanationMetric.deleteMany({});
    await ProcessingJob.deleteMany({});
    await AuditLog.deleteMany({});

    // Register users
    const adminRes = await request(app).post('/api/auth/register').send({
      name: 'P8 Admin',
      email: 'admin_p8@test.com',
      password: 'Password123!',
      role: 'ADMIN',
    });
    adminToken = adminRes.body.data.token;

    const analystRes = await request(app).post('/api/auth/register').send({
      name: 'P8 Analyst',
      email: 'analyst_p8@test.com',
      password: 'Password123!',
      role: 'ANALYST',
    });
    analystToken = analystRes.body.data.token;

    const reviewerRes = await request(app).post('/api/auth/register').send({
      name: 'P8 Reviewer',
      email: 'reviewer_p8@test.com',
      password: 'Password123!',
      role: 'REVIEWER',
    });
    reviewerToken = reviewerRes.body.data.token;

    // Create temporary dataset CSV file
    tempFilePath = path.join(__dirname, 'test_phase8_dataset.csv');
    fs.writeFileSync(tempFilePath, 'district,wage,workdays\nDist1,850,30\nDist1,120,28\n');

    testDataset = await Dataset.create({
      name: 'Phase 8 Explainability Dataset',
      category: 'MGNREGA',
      dataType: 'SYNTHETIC/DEMO',
      fileName: 'test_phase8_dataset.csv',
      originalFileName: 'test_phase8_dataset.csv',
      filePath: tempFilePath,
      fileSize: 1024,
      fileType: 'csv',
      mimeType: 'text/csv',
      dataHash: 'hash_phase8_data',
      status: 'Ready',
      rowCount: 2,
      columnCount: 3,
      uploadedBy: analystRes.body.data.user._id,
      isSchemaConfirmed: true,
    });

    testAnomaly = await AnomalyRecord.create({
      dataset: testDataset._id,
      recordIndex: 0,
      recordData: { district: 'Dist1', wage: 850, workdays: 30 },
      detectorScores: { robust_z: 4.5, isolation_forest: 0.8 },
      detectorFlags: { robust_z: true, isolation_forest: true },
      combinedP: 0.001,
      qValue: 0.003,
      atpi: 82.0,
      atpiBreakdown: { statisticalConfidence: 0.99, effectSizeScore: 0.8 },
      triagePriority: 'HIGH',
      isAnomaly: true,
      detectionMethods: ['robust_z', 'isolation_forest'],
    });
  });

  afterAll(async () => {
    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    await Explanation.deleteMany({});
    await ExplanationMetric.deleteMany({});
    await AnomalyRecord.deleteMany({});
    await Dataset.deleteMany({});
    await User.deleteMany({});
    await mongoose.connection.close();
  });

  it('should reject unauthenticated request for explanation', async () => {
    const res = await request(app).get(`/api/explanations/${testAnomaly._id}`);
    expect(res.status).toBe(401);
  });

  it('should lazily compute, cache and return explanation with SHAP and counterfactuals', async () => {
    const res = await request(app)
      .get(`/api/explanations/${testAnomaly._id}`)
      .set('Authorization', `Bearer ${reviewerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.explanation).toBeDefined();

    const exp = res.body.data.explanation;
    expect(exp.topFeatures.length).toBeGreaterThanOrEqual(1);
    expect(exp.topFeatures[0].feature).toBe('wage');
    expect(exp.topFeatures[0].direction).toBe('ANOMALOUS_ELEVATION');
    expect(exp.shapValues.wage).toBe(0.65);
    expect(exp.diffiScores.wage).toBe(0.58);
    expect(exp.counterfactuals.length).toBeGreaterThanOrEqual(1);
    expect(exp.counterfactuals[0].counterfactualValue).toBe(160);
    expect(exp.faithfulness.deletionAuc).toBe(0.28);
    expect(exp.stability.jaccardStability).toBe(0.88);

    // Verify explanation was saved in MongoDB
    const storedExp = await Explanation.findOne({ anomalyRecord: testAnomaly._id });
    expect(storedExp).toBeDefined();
    expect(storedExp.recordIndex).toBe(0);

    // Verify ATPI score was refined in AnomalyRecord
    const updatedAnomaly = await AnomalyRecord.findById(testAnomaly._id);
    const stab =
      updatedAnomaly.atpiBreakdown instanceof Map
        ? updatedAnomaly.atpiBreakdown.get('explanationStability')
        : updatedAnomaly.atpiBreakdown?.explanationStability;
    expect(stab).toBe(0.85);
  });

  it('should return cached explanation on subsequent request without recomputation', async () => {
    const res = await request(app)
      .get(`/api/explanations/${testAnomaly._id}`)
      .set('Authorization', `Bearer ${analystToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('Cached explanation');
  });

  it('should reject REVIEWER from triggering batch explanation generation', async () => {
    const res = await request(app)
      .post('/api/explanations/batch')
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ datasetId: testDataset._id });

    expect(res.status).toBe(403);
  });

  it('should generate batch explanations and aggregate faithfulness metrics', async () => {
    const res = await request(app)
      .post('/api/explanations/batch')
      .set('Authorization', `Bearer ${analystToken}`)
      .send({ datasetId: testDataset._id, topK: 5 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.metrics).toBeDefined();
    expect(res.body.data.metrics.meanDeletionAuc).toBe(0.28);
    expect(res.body.data.metrics.meanJaccardStability).toBe(0.88);

    // Verify ExplanationMetric document in MongoDB
    const storedMetric = await ExplanationMetric.findOne({ dataset: testDataset._id });
    expect(storedMetric).toBeDefined();
    expect(storedMetric.totalExplained).toBeGreaterThanOrEqual(1);
  });

  it('should retrieve dataset explanation metrics', async () => {
    const res = await request(app)
      .get(`/api/explanations/metrics/${testDataset._id}`)
      .set('Authorization', `Bearer ${reviewerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.metrics).toBeDefined();
    expect(res.body.data.metrics.meanDeletionAuc).toBeDefined();
  });
});
