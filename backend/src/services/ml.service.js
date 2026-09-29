const axios = require('axios');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000';

const mlClient = axios.create({
  baseURL: ML_SERVICE_URL,
  timeout: 120000, // 2 minutes for processing large datasets
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Triggers profiling of a dataset file on disk via the FastAPI ML microservice.
 */
const requestProfiling = async (filePath) => {
  try {
    const response = await mlClient.post('/ml/profile', {
      file_path: filePath,
      chunk_size: 10000,
    });

    if (response.data && response.data.status === 'success') {
      return response.data.data;
    }
    throw new Error('ML service returned unexpected response format');
  } catch (error) {
    const errorDetail =
      error.response?.data?.detail || error.response?.data?.message || error.message;
    throw new Error(`ML Profiling Service Error: ${errorDetail}`);
  }
};

/**
 * Infers semantic schema mapping with confidence scores.
 */
const inferSchemaMapping = async (filePath) => {
  try {
    const response = await mlClient.post('/ml/schema-mapping/infer', {
      file_path: filePath,
    });
    if (response.data && response.data.status === 'success') {
      return response.data.data;
    }
    throw new Error('ML schema mapping returned unexpected format');
  } catch (error) {
    const errorDetail =
      error.response?.data?.detail || error.response?.data?.message || error.message;
    throw new Error(`ML Schema Mapping Error: ${errorDetail}`);
  }
};

/**
 * Runs feature engineering plugins for confirmed schema mapping.
 */
const runFeatureEngineering = async (filePath, mapping) => {
  try {
    const response = await mlClient.post('/ml/features/run', {
      file_path: filePath,
      mapping,
    });
    if (response.data && response.data.status === 'success') {
      return response.data.data;
    }
    throw new Error('ML feature engineering returned unexpected format');
  } catch (error) {
    const errorDetail =
      error.response?.data?.detail || error.response?.data?.message || error.message;
    throw new Error(`ML Feature Engineering Error: ${errorDetail}`);
  }
};

/**
 * Builds peer groups, computes robust median/MAD, and applies shrinkage.
 */
const buildPeerGroups = async ({
  filePath,
  mapping,
  groupColumn = null,
  parentColumn = null,
  featureColumns = null,
  shrinkageN0 = 15,
  minGroupSize = 5,
}) => {
  try {
    const response = await mlClient.post('/ml/peer-groups/build', {
      file_path: filePath,
      mapping,
      group_column: groupColumn,
      parent_column: parentColumn,
      feature_columns: featureColumns,
      shrinkage_n0: shrinkageN0,
      min_group_size: minGroupSize,
    });
    if (response.data && response.data.status === 'success') {
      return response.data.data;
    }
    throw new Error('ML peer groups returned unexpected format');
  } catch (error) {
    const errorDetail =
      error.response?.data?.detail || error.response?.data?.message || error.message;
    throw new Error(`ML Peer Group Error: ${errorDetail}`);
  }
};

/**
 * Executes statistical and machine-learning detectors on dataset via ML service.
 */
const analyzeDataset = async ({
  filePath,
  featureCols = null,
  peerGroupCol = null,
  peerBaselines = null,
  dateCol = null,
  detectors = null,
  contamination = 0.05,
  randomState = 42,
  maxRecords = null,
  fusionMethod = 'acat',
  fdrMethod = 'bh',
  targetFdr = 0.05,
  contaminationTrim = 0.02,
}) => {
  try {
    const response = await mlClient.post('/ml/analyze', {
      file_path: filePath,
      feature_cols: featureCols,
      peer_group_col: peerGroupCol,
      peer_baselines: peerBaselines,
      date_col: dateCol,
      detectors,
      contamination,
      random_state: randomState,
      max_records: maxRecords,
      fusion_method: fusionMethod,
      fdr_method: fdrMethod,
      target_fdr: targetFdr,
      contamination_trim: contaminationTrim,
    });
    if (response.data && response.data.success) {
      return response.data.data;
    }
    throw new Error('ML anomaly analysis returned unexpected format');
  } catch (error) {
    const errorDetail =
      error.response?.data?.detail || error.response?.data?.message || error.message;
    throw new Error(`ML Anomaly Detection Error: ${errorDetail}`);
  }
};

module.exports = {
  requestProfiling,
  inferSchemaMapping,
  runFeatureEngineering,
  buildPeerGroups,
  analyzeDataset,
};
