const request = require('supertest');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const app = require('../../backend/src/app');
const User = require('../../backend/src/models/User');
const Dataset = require('../../backend/src/models/Dataset');
const AnomalyRecord = require('../../backend/src/models/AnomalyRecord');
const ValidationReport = require('../../backend/src/models/ValidationReport');
const AuditLog = require('../../backend/src/models/AuditLog');
const { connectDB } = require('../../backend/src/config/db');

// Mock ML service validation calls
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
    evidence_bundle: {
      record_index: 0,
      domain_type: 'MGNREGA',
      record_values: { workdays_per_household: 95.0, wage_rate: 220.0 },
      peer_group: 'District_Alpha',
      peer_group_size: 150,
      peer_medians: { workdays_per_household: 35.0, wage_rate: 200.0 },
      q_value: 0.002,
      ensemble_score: 0.89,
    },
    agent_assessments: [
      {
        agent_name: 'StatisticalDistributionAgent',
        perspective: 'Statistical significance and peer shrinkage',
        supports_anomaly: true,
        confidence: 0.88,
        findings: ['Well-powered peer group (N=150)', 'Significant FDR q=0.002'],
        flags: [],
        recommended_verdict: 'CONFIRMED_ANOMALY',
      },
      {
        agent_name: 'ForensicsAndDigitAgent',
        perspective: 'Digit distributions and Benford tests',
        supports_anomaly: false,
        confidence: 0.60,
        findings: ['Nominal digit distribution'],
        flags: [],
        recommended_verdict: 'INSUFFICIENT_EVIDENCE',
      },
      {
        agent_name: 'DomainPlausibilityAgent',
        perspective: 'Domain constraints and statutory limits',
        supports_anomaly: true,
        confidence: 0.85,
        findings: ['Physical calendar bounds satisfied', 'Workdays within [0, 365]'],
        flags: [],
        recommended_verdict: 'CONFIRMED_ANOMALY',
      },
    ],
    claims: [
      {
        claim_id: 'CLM-001',
        claim_text: "Feature 'workdays_per_household' value of 95.00 exceeds peer baseline median of 35.00 by 60.00 units.",
        feature: 'workdays_per_household',
        status: 'VERIFIED',
        ground_fact: "record_values['workdays_per_household']=95.0, peer_medians['workdays_per_household']=35.0",
        citation_source: 'peer_group_statistics',
        numerical_deviation: 60.0,
      },
      {
        claim_id: 'CLM-002',
        claim_text: 'FDR q-value (0.0020) satisfies the 5% false discovery rate significance threshold.',
        feature: 'q_value',
        status: 'VERIFIED',
        ground_fact: 'q_value=0.002',
        citation_source: 'conformal_p_values',
        numerical_deviation: 0.002,
      },
    ],
    claim_verification_ratio: 1.0,
    verdict: 'CONFIRMED_ANOMALY',
    confidence: 0.88,
    recommended_action: 'ESCALATE_FOR_AUDIT',
    summary:
      'Multi-agent validation confirmed a statistically unusual pattern in Record #0 with 88% consensus confidence. Domain physical invariants are satisfied. Recommended action: Escalate for human domain review.',
    rule_engine_type: 'DETERMINISTIC_MULTI_AGENT',
    is_llm_augmented: false,
  }),
  validateBatchAnomalies: jest.fn().mockResolvedValue([]),
  updateDetectorWeights: jest.fn().mockResolvedValue({
    updated_weights: { robust_z: 0.40, isolation_forest: 0.35, z_score: 0.15, temporal: 0.10 },
  }),
}));

describe('Phase 9 Backend Tests: Multi-Agent Validation & Review Queue (Contribution C5)', () => {
  let adminToken;
  let reviewerToken;
  let adminUser;
  let reviewerUser;
  let testDataset;
  let testAnomaly;

  beforeAll(async () => {
    process.env.MONGODB_URI =
      process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/anomaly_detection_test_p9';
    await connectDB();

    await User.deleteMany({});
    await Dataset.deleteMany({});
    await AnomalyRecord.deleteMany({});
    await ValidationReport.deleteMany({});
    await AuditLog.deleteMany({});

    // Register users
    const adminRes = await request(app).post('/api/auth/register').send({
      name: 'Validation Admin',
      email: 'valadmin@example.com',
      password: 'Password123!',
      role: 'ADMIN',
    });
    adminToken = adminRes.body.data.token;
    adminUser = adminRes.body.data.user;

    const reviewerRes = await request(app).post('/api/auth/register').send({
      name: 'Human Reviewer',
      email: 'reviewer@example.com',
      password: 'Password123!',
      role: 'REVIEWER',
    });
    reviewerToken = reviewerRes.body.data.token;
    reviewerUser = reviewerRes.body.data.user;

    // Create test dataset
    testDataset = await Dataset.create({
      name: 'Validation MGNREGA Dataset',
      category: 'MGNREGA',
      dataType: 'SYNTHETIC/DEMO',
      description: 'Dataset for validating multi-agent verification',
      fileName: 'test_phase9_mgnrega.csv',
      originalFileName: 'test_phase9_mgnrega.csv',
      filePath: '/mock/path/test_phase9_mgnrega.csv',
      fileSize: 4096,
      fileType: 'csv',
      dataHash: 'hash_phase9_data_sha256',
      status: 'Ready',
      rowCount: 50,
      columnCount: 5,
      columns: [
        { name: 'district', inferredType: 'string' },
        { name: 'workdays_per_household', inferredType: 'number' },
        { name: 'wage_rate', inferredType: 'number' },
      ],
      uploadedBy: adminUser._id,
      isSchemaConfirmed: true,
    });

    // Create test anomaly record
    testAnomaly = await AnomalyRecord.create({
      dataset: testDataset._id,
      recordIndex: 0,
      recordData: {
        district: 'District_Alpha',
        workdays_per_household: 95.0,
        wage_rate: 220.0,
      },
      detectorScores: { robust_z: 4.8, isolation_forest: 0.65 },
      detectorPValues: { robust_z: 0.0005, isolation_forest: 0.002 },
      detectorFlags: { robust_z: true, isolation_forest: true },
      combinedP: 0.0003,
      qValue: 0.002,
      ensembleScore: 0.89,
      atpi: 84.5,
      atpiBreakdown: {
        statistical_confidence: 0.99,
        effect_size_score: 0.89,
        population_impact_score: 0.75,
      },
      peerGroup: 'District_Alpha',
      isAnomaly: true,
      triagePriority: 'CRITICAL',
      status: 'NEW',
      reviewStatus: 'PENDING',
    });
  });

  afterAll(async () => {
    await User.deleteMany({});
    await Dataset.deleteMany({});
    await AnomalyRecord.deleteMany({});
    await ValidationReport.deleteMany({});
    await AuditLog.deleteMany({});
    await mongoose.connection.close();
  });

  it('1. POST /api/validations/:anomalyId - executes multi-agent validation and updates AnomalyRecord', async () => {
    const res = await request(app)
      .post(`/api/validations/${testAnomaly._id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.verdict).toBe('CONFIRMED_ANOMALY');
    expect(res.body.data.recommendedAction).toBe('ESCALATE_FOR_AUDIT');
    expect(res.body.data.confidence).toBe(0.88);
    expect(res.body.data.claimVerificationRatio).toBe(1.0);
    expect(res.body.data.agentAssessments.length).toBe(3);
    expect(res.body.data.claims.length).toBe(2);

    // Verify AnomalyRecord was updated with validation summary
    const updatedAnomaly = await AnomalyRecord.findById(testAnomaly._id);
    expect(updatedAnomaly.validationVerdict).toBe('CONFIRMED_ANOMALY');
    expect(updatedAnomaly.validationConfidence).toBe(0.88);
    expect(updatedAnomaly.claimVerificationRatio).toBe(1.0);
    expect(updatedAnomaly.validationReport).toBeDefined();
  });

  it('2. GET /api/validations/:anomalyId - retrieves existing validation report', async () => {
    const res = await request(app)
      .get(`/api/validations/${testAnomaly._id}`)
      .set('Authorization', `Bearer ${reviewerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.anomaly.toString()).toBe(testAnomaly._id.toString());
    expect(res.body.data.verdict).toBe('CONFIRMED_ANOMALY');
    expect(res.body.data.summary).toContain('Multi-agent validation confirmed');
  });

  it('3. POST /api/validations/:anomalyId/review - records human reviewer verdict and updates audit log', async () => {
    const reviewPayload = {
      reviewStatus: 'VALIDATED',
      status: 'RESOLVED',
      note: 'Human reviewer confirmed statistical anomaly matches field audit findings.',
    };

    const res = await request(app)
      .post(`/api/validations/${testAnomaly._id}/review`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send(reviewPayload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.anomaly.reviewStatus).toBe('VALIDATED');
    expect(res.body.data.anomaly.status).toBe('RESOLVED');
    expect(res.body.data.anomaly.notes.length).toBe(1);
    expect(res.body.data.anomaly.notes[0].text).toContain('confirmed statistical anomaly');

    // Check ValidationReport was updated with humanReview metadata
    const report = await ValidationReport.findOne({ anomaly: testAnomaly._id });
    expect(report.humanReview).toBeDefined();
    expect(report.humanReview.humanVerdict).toBe('VALIDATED');
    expect(report.humanReview.notes).toContain('field audit findings');

    // Check AuditLog was created
    const audit = await AuditLog.findOne({
      entityId: testAnomaly._id.toString(),
      action: 'HUMAN_REVIEW_SUBMITTED',
    });
    expect(audit).toBeDefined();
    expect(audit.user.toString()).toBe(reviewerUser._id.toString());
  });

  it('4. GET /api/validations/queue - returns prioritized review queue with ATPI and filters', async () => {
    const res = await request(app)
      .get('/api/validations/queue')
      .query({
        datasetId: testDataset._id.toString(),
        priority: 'CRITICAL',
        reviewStatus: 'VALIDATED',
      })
      .set('Authorization', `Bearer ${reviewerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.anomalies).toBeDefined();
    expect(res.body.data.anomalies.length).toBe(1);
    expect(res.body.data.anomalies[0].recordIndex).toBe(0);
    expect(res.body.data.pagination.total).toBe(1);
  });

  it('5. POST /api/validations/batch - executes batch validation for unreviewed anomalies', async () => {
    // Create another anomaly record that has not been validated
    const secondAnomaly = await AnomalyRecord.create({
      dataset: testDataset._id,
      recordIndex: 1,
      recordData: { workdays_per_household: 88.0 },
      detectorScores: { robust_z: 3.9 },
      combinedP: 0.001,
      qValue: 0.004,
      ensembleScore: 0.75,
      atpi: 65.0,
      isAnomaly: true,
      triagePriority: 'HIGH',
      status: 'NEW',
      reviewStatus: 'PENDING',
    });

    const res = await request(app)
      .post('/api/validations/batch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ datasetId: testDataset._id.toString(), topK: 5 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.successCount).toBeGreaterThanOrEqual(1);

    const verifiedRecord = await AnomalyRecord.findById(secondAnomaly._id);
    expect(verifiedRecord.validationVerdict).toBe('CONFIRMED_ANOMALY');
  });

  it('6. Role & Auth checks - denies unauthorized access to validation endpoints', async () => {
    // Missing token
    const unauthRes = await request(app).get(`/api/validations/${testAnomaly._id}`);
    expect(unauthRes.status).toBe(401);

    // Reviewer role attempting Admin/Analyst batch validation
    const forbiddenRes = await request(app)
      .post('/api/validations/batch')
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ datasetId: testDataset._id.toString() });
    expect(forbiddenRes.status).toBe(403);
  });
});
