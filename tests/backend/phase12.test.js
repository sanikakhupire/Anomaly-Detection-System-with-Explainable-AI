const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../backend/src/app');
const User = require('../../backend/src/models/User');
const Dataset = require('../../backend/src/models/Dataset');
const ExperimentRun = require('../../backend/src/models/ExperimentRun');
const AuditLog = require('../../backend/src/models/AuditLog');
const { connectDB } = require('../../backend/src/config/db');

// Mock ML service benchmark and latex export calls
jest.mock('../../backend/src/services/ml.service', () => ({
  requestProfiling: jest.fn().mockResolvedValue({}),
  inferSchemaMapping: jest.fn().mockResolvedValue({}),
  runFeatureEngineering: jest.fn().mockResolvedValue({ features: [] }),
  buildPeerGroups: jest.fn().mockResolvedValue({ groups: [] }),
  analyzeDataset: jest.fn().mockResolvedValue({ summary: {}, records: [] }),
  analyzeForensics: jest.fn().mockResolvedValue({ results_by_column: {} }),
  explainAnomaly: jest.fn().mockResolvedValue({}),
  explainBatchAnomalies: jest.fn().mockResolvedValue({}),
  validateAnomaly: jest.fn().mockResolvedValue({}),
  validateBatchAnomalies: jest.fn().mockResolvedValue([]),
  updateDetectorWeights: jest.fn().mockResolvedValue({}),
  runBenchmark: jest.fn().mockResolvedValue({
    success: true,
    data: {
      dataset_name: 'MGNREGA Synthetic Benchmark',
      total_records: 100,
      ground_truth_anomalies: 8,
      feature_columns: ['registered_workers', 'active_workers', 'workdays_generated'],
      reproducibility: {
        seed: 42,
        n_repetitions: 3,
        repetition_seeds: [42, 43, 44],
        data_hash: 'mock_data_hash_sha256',
        config_hash: 'mock_config_hash_sha256',
        model_version: '1.0.0-C9-experiment-lab',
      },
      baseline_summary: {
        'Proposed Calibrated Framework (Ours)': {
          pr_auc: 0.912,
          roc_auc: 0.955,
          'precision@10': 0.900,
          'recall@10': 0.875,
          f1: 0.880,
          brier_score: 0.038,
        },
        'Isolation Forest': {
          pr_auc: 0.735,
          roc_auc: 0.820,
          'precision@10': 0.600,
          'recall@10': 0.625,
          f1: 0.640,
          brier_score: 0.115,
        },
      },
      ablation_summary: [
        { variant: 'Full Proposed Framework', pr_auc: 0.912, roc_auc: 0.955 },
        { variant: 'Ablation 1 (No Conformal)', pr_auc: 0.795, roc_auc: 0.850 },
      ],
      significance_tests: [
        {
          metric: 'PR-AUC',
          baseline_name: 'Isolation Forest',
          sample_size: 3,
          mean_proposed: 0.912,
          mean_baseline: 0.735,
          mean_difference: 0.177,
          cohen_d: 5.2,
          paired_t_test: { statistic: 7.85, p_value: 0.0005 },
          wilcoxon_test: { statistic: 0.0, p_value: 0.02 },
          is_significant: true,
          significance_level: '*** (p < 0.001)',
        },
      ],
      latex_tables: {
        benchmark_table: '\\begin{table*}[t]\n\\caption{Benchmark Results}\n\\end{table*}',
        ablation_table: '\\begin{table}[t]\n\\caption{Ablation Results}\n\\end{table}',
        significance_table: '\\begin{table}[t]\n\\caption{Significance Tests}\n\\end{table}',
      },
    },
  }),
  exportLatex: jest.fn().mockResolvedValue({
    success: true,
    latex_tables: {
      benchmark_table: '\\begin{table*}[t]\n\\end{table*}',
      ablation_table: '\\begin{table}[t]\n\\end{table}',
      significance_table: '\\begin{table}[t]\n\\end{table}',
    },
  }),
}));

describe('Phase 12 Backend Tests: Experiment Lab & Benchmarking (Contribution C9)', () => {
  let adminToken;
  let reviewerToken;
  let adminUser;
  let reviewerUser;

  beforeAll(async () => {
    process.env.MONGODB_URI =
      process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/anomaly_detection_test_p12';
    await connectDB();

    await User.deleteMany({});
    await Dataset.deleteMany({});
    await ExperimentRun.deleteMany({});
    await AuditLog.deleteMany({});

    // Register Admin
    const adminRes = await request(app).post('/api/auth/register').send({
      name: 'Lab Admin',
      email: 'lab_admin@example.com',
      password: 'Password123!',
      role: 'ADMIN',
    });
    adminToken = adminRes.body.data.token;
    adminUser = adminRes.body.data.user;

    // Register Reviewer
    const reviewerRes = await request(app).post('/api/auth/register').send({
      name: 'Lab Reviewer',
      email: 'lab_reviewer@example.com',
      password: 'Password123!',
      role: 'REVIEWER',
    });
    reviewerToken = reviewerRes.body.data.token;
    reviewerUser = reviewerRes.body.data.user;
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('1. Access Control & Experiment Initialization', () => {
    it('restricts experiment run creation from REVIEWER role (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/experiments/run')
        .set('Authorization', `Bearer ${reviewerToken}`)
        .send({
          name: 'Unauthorized Run',
          domain: 'MGNREGA',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('allows ADMIN / ANALYST to initialize benchmark experiment run', async () => {
      const res = await request(app)
        .post('/api/experiments/run')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'MGNREGA Full Publication Benchmark',
          domain: 'MGNREGA',
          nRecords: 100,
          severity: 'high',
          seed: 42,
          nRepetitions: 3,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data._id).toBeDefined();
      expect(res.body.data.seed).toBe(42);
      expect(res.body.data.status).toBeDefined();

      // Give background execution a short moment to complete
      await new Promise((resolve) => setTimeout(resolve, 150));

      const updated = await ExperimentRun.findById(res.body.data._id);
      expect(updated.status).toBe('COMPLETED');
      expect(updated.progress).toBe(100);
      expect(updated.dataHash).toBe('mock_data_hash_sha256');
      expect(updated.configHash).toBe('mock_config_hash_sha256');
      expect(updated.modelVersion).toBe('1.0.0-C9-experiment-lab');
      expect(updated.baselineSummary['Proposed Calibrated Framework (Ours)'].pr_auc).toBe(0.912);
      expect(updated.significanceTests.length).toBeGreaterThan(0);
    });
  });

  describe('2. Cryptographic Audit Log Integration (Hard Rule 7 & C8)', () => {
    it('appends an EXPERIMENT_BENCHMARK_COMPLETED block to the audit hash chain', async () => {
      const auditLog = await AuditLog.findOne({
        action: 'EXPERIMENT_BENCHMARK_COMPLETED',
      });

      expect(auditLog).toBeDefined();
      expect(auditLog.entity).toBe('ExperimentRun');
      expect(auditLog.sequenceNumber).toBeDefined();
      expect(auditLog.currentHash).toBeDefined();
      expect(auditLog.metadata.dataHash).toBe('mock_data_hash_sha256');
    });
  });

  describe('3. Experiment Queries & Publication LaTeX Export', () => {
    let createdRunId;

    beforeAll(async () => {
      const runs = await ExperimentRun.find().sort({ createdAt: -1 });
      createdRunId = runs[0]._id.toString();
    });

    it('retrieves paginated experiment runs via GET /api/experiments', async () => {
      const res = await request(app)
        .get('/api/experiments?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.runs).toBeDefined();
      expect(res.body.data.runs.length).toBeGreaterThan(0);
      expect(res.body.data.pagination.total).toBeGreaterThan(0);
    });

    it('retrieves single experiment run details via GET /api/experiments/:id', async () => {
      const res = await request(app)
        .get(`/api/experiments/${createdRunId}`)
        .set('Authorization', `Bearer ${reviewerToken}`); // REVIEWER can view

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data._id).toBe(createdRunId);
      expect(res.body.data.baselineSummary).toBeDefined();
      expect(res.body.data.ablationSummary).toBeDefined();
      expect(res.body.data.significanceTests).toBeDefined();
      expect(res.body.data.latexTables.benchmarkTable).toContain('\\begin{table*}');
    });

    it('exports complete IEEE LaTeX tables bundle via GET /api/experiments/:id/latex', async () => {
      const res = await request(app)
        .get(`/api/experiments/${createdRunId}/latex`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/plain');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.text).toContain('IEEE Publication Tables');
      expect(res.text).toContain('Benchmark Comparison vs Baselines');
      expect(res.text).toContain('\\begin{table*}');
      expect(res.text).toContain('Ablation Analysis of Proposed Contributions');
    });
  });
});
