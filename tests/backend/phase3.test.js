const request = require('supertest');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const app = require('../../backend/src/app');
const User = require('../../backend/src/models/User');
const Dataset = require('../../backend/src/models/Dataset');
const FeatureSet = require('../../backend/src/models/FeatureSet');
const PeerGroup = require('../../backend/src/models/PeerGroup');
const AuditLog = require('../../backend/src/models/AuditLog');
const { connectDB } = require('../../backend/src/config/db');

// Mock ML service for deterministic backend test execution
jest.mock('../../backend/src/services/ml.service', () => ({
  requestProfiling: jest.fn().mockResolvedValue({
    rowCount: 10,
    columnCount: 4,
    columns: [],
    duplicateRowCount: 0,
    duplicateRowPercentage: 0,
    overallQualityScore: 95,
    issues: [],
    transformationLog: [],
  }),
  inferSchemaMapping: jest.fn().mockResolvedValue({
    district: { canonicalRole: 'district', confidence: 0.95, isHierarchy: true },
    population: { canonicalRole: 'population_total', confidence: 0.92, isHierarchy: false },
    area_sq_km: { canonicalRole: 'area_sq_km', confidence: 0.90, isHierarchy: false },
    wages: { canonicalRole: 'wages_total', confidence: 0.92, isHierarchy: false },
  }),
  runFeatureEngineering: jest.fn().mockResolvedValue({
    generatedCount: 2,
    features: [
      {
        name: 'pop_density',
        description: 'Population Density',
        domain: 'Census',
        formula: 'population_total / area_sq_km',
        sourceColumns: ['population', 'area_sq_km'],
        dtype: 'numeric',
        mean: 150.2,
        min: 50.0,
        max: 300.0,
        std: 25.1,
        median: 145.0,
        nonNullCount: 10,
      },
    ],
  }),
  buildPeerGroups: jest.fn().mockResolvedValue({
    metadata: {
      groupColumn: 'district',
      parentColumn: null,
      totalGroups: 2,
      smallGroupCount: 1,
      shrinkageN0: 15,
      minGroupSize: 5,
    },
    globalBaselines: {
      pop_density: { median: 145.0, mad: 15.0 },
    },
    peerGroups: [
      {
        groupName: 'District_Large',
        parentGroup: null,
        sampleCount: 50,
        shrinkageFactor: 0.77,
        isSmallGroup: false,
        baselines: {
          pop_density: {
            rawMedian: 160.0,
            rawMad: 12.0,
            refMedian: 145.0,
            refMad: 15.0,
            shrunkMedian: 156.55,
            shrunkMad: 12.69,
            normShrunkMad: 18.81,
          },
        },
      },
      {
        groupName: 'District_Small',
        parentGroup: null,
        sampleCount: 3,
        shrinkageFactor: 0.1667,
        isSmallGroup: true,
        baselines: {
          pop_density: {
            rawMedian: 300.0,
            rawMad: 5.0,
            refMedian: 145.0,
            refMad: 15.0,
            shrunkMedian: 170.83,
            shrunkMad: 13.33,
            normShrunkMad: 19.76,
          },
        },
      },
    ],
  }),
}));

const TEST_DB_URI = 'mongodb://127.0.0.1:27017/anomaly_detection_test_db';

describe('Phase 3: Schema Mapping, Features, Peer Groups Endpoints', () => {
  let adminToken;
  let analystToken;
  let reviewerToken;
  let testDatasetId;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test_secret_key_12345';
    await connectDB(TEST_DB_URI);
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Dataset.deleteMany({});
    await FeatureSet.deleteMany({});
    await PeerGroup.deleteMany({});
    await AuditLog.deleteMany({});

    // Create Analyst
    const analystRes = await request(app).post('/api/auth/register').send({
      name: 'P3 Analyst',
      email: 'p3_analyst@example.com',
      password: 'AnalystPassword123',
      role: 'ANALYST',
    });
    analystToken = analystRes.body.data.token;
    const analystId = analystRes.body.data.user._id;

    // Create Reviewer
    const reviewerRes = await request(app).post('/api/auth/register').send({
      name: 'P3 Reviewer',
      email: 'p3_reviewer@example.com',
      password: 'ReviewerPassword123',
      role: 'REVIEWER',
    });
    reviewerToken = reviewerRes.body.data.token;

    // Create Dataset
    const dataset = await Dataset.create({
      name: 'Test Census Dataset',
      category: 'Census',
      dataType: 'REAL',
      filePath: 'dummy/path/census.csv',
      fileName: 'census.csv',
      originalFileName: 'census.csv',
      fileSize: 1024,
      fileType: 'csv',
      dataHash: 'abc123hash',
      status: 'Ready',
      uploadedBy: analystId,
    });
    testDatasetId = dataset._id.toString();
  });

  afterAll(async () => {
    await User.deleteMany({});
    await Dataset.deleteMany({});
    await FeatureSet.deleteMany({});
    await PeerGroup.deleteMany({});
    await AuditLog.deleteMany({});
    await mongoose.connection.close();
  });

  describe('GET & PUT /api/datasets/:id/schema-mapping', () => {
    it('should retrieve inferred schema mapping suggestions', async () => {
      const res = await request(app)
        .get(`/api/datasets/${testDatasetId}/schema-mapping`)
        .set('Authorization', `Bearer ${analystToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.mapping).toBeDefined();
      expect(res.body.data.mapping.district.canonicalRole).toBe('district');
      expect(res.body.data.isConfirmed).toBe(false);
    });

    it('should confirm schema mapping when submitted by ANALYST', async () => {
      const confirmedMapping = {
        district: { canonicalRole: 'district', confidence: 1.0, isHierarchy: true },
        population: { canonicalRole: 'population_total', confidence: 1.0, isHierarchy: false },
        area_sq_km: { canonicalRole: 'area_sq_km', confidence: 1.0, isHierarchy: false },
      };

      const res = await request(app)
        .put(`/api/datasets/${testDatasetId}/schema-mapping`)
        .set('Authorization', `Bearer ${analystToken}`)
        .send({ mapping: confirmedMapping });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isConfirmed).toBe(true);

      const updated = await Dataset.findById(testDatasetId);
      expect(updated.isSchemaConfirmed).toBe(true);
      expect(updated.schemaMapping.district.canonicalRole).toBe('district');

      const audit = await AuditLog.findOne({ action: 'SCHEMA_MAPPING_CONFIRMED' });
      expect(audit).toBeTruthy();
    });

    it('should forbid REVIEWER from confirming schema mapping (403)', async () => {
      const res = await request(app)
        .put(`/api/datasets/${testDatasetId}/schema-mapping`)
        .set('Authorization', `Bearer ${reviewerToken}`)
        .send({ mapping: {} });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST & GET /api/features', () => {
    beforeEach(async () => {
      // Confirm schema mapping first
      await Dataset.findByIdAndUpdate(testDatasetId, {
        schemaMapping: {
          population: { canonicalRole: 'population_total' },
          area_sq_km: { canonicalRole: 'area_sq_km' },
        },
        isSchemaConfirmed: true,
      });
    });

    it('should run feature engineering and store FeatureSet', async () => {
      const res = await request(app)
        .post('/api/features/run')
        .set('Authorization', `Bearer ${analystToken}`)
        .send({ datasetId: testDatasetId });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.features.length).toBeGreaterThan(0);
      expect(res.body.data.features[0].name).toBe('pop_density');

      const saved = await FeatureSet.findOne({ datasetId: testDatasetId });
      expect(saved).toBeTruthy();
      expect(saved.features.length).toBeGreaterThan(0);
    });

    it('should retrieve feature set via GET /api/features/:datasetId', async () => {
      // Seed FeatureSet
      await FeatureSet.create({
        datasetId: testDatasetId,
        features: [
          {
            name: 'pop_density',
            description: 'Population Density',
            domain: 'Census',
            formula: 'population_total / area_sq_km',
            mean: 150.0,
          },
        ],
        featureCount: 1,
      });

      const res = await request(app)
        .get(`/api/features/${testDatasetId}`)
        .set('Authorization', `Bearer ${reviewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.features.length).toBe(1);
      expect(res.body.data.features[0].name).toBe('pop_density');
    });
  });

  describe('POST & GET /api/peer-groups (C2 Shrinkage)', () => {
    it('should build peer groups with shrinkage and flag small groups', async () => {
      const res = await request(app)
        .post('/api/peer-groups/build')
        .set('Authorization', `Bearer ${analystToken}`)
        .send({
          datasetId: testDatasetId,
          groupColumn: 'district',
          shrinkageN0: 15,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.peerGroups.length).toBe(2);
      expect(res.body.data.metadata.smallGroupCount).toBe(1);

      const savedGroups = await PeerGroup.find({ datasetId: testDatasetId });
      expect(savedGroups.length).toBe(2);

      const small = savedGroups.find((g) => g.isSmallGroup);
      expect(small).toBeTruthy();
      expect(small.groupName).toBe('District_Small');
      expect(small.sampleCount).toBe(3);
    });

    it('should retrieve peer groups via GET /api/peer-groups/:datasetId', async () => {
      await PeerGroup.create({
        datasetId: testDatasetId,
        groupColumn: 'district',
        groupName: 'District_Alpha',
        sampleCount: 40,
        shrinkageFactor: 0.7273,
        isSmallGroup: false,
        baselines: {
          metricA: { rawMedian: 100, shrunkMedian: 95 },
        },
      });

      const res = await request(app)
        .get(`/api/peer-groups/${testDatasetId}`)
        .set('Authorization', `Bearer ${reviewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.peerGroups.length).toBe(1);
      expect(res.body.data.peerGroups[0].groupName).toBe('District_Alpha');
    });
  });
});
