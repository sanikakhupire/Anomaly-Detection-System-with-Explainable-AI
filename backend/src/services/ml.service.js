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

/**
 * Executes forensic test battery (Benford, digit heaping, last-digit uniformity, etc.) on dataset.
 */
const analyzeForensics = async ({ filePath, columns = null, testNames = null }) => {
  try {
    const response = await mlClient.post('/ml/forensics/analyze', {
      file_path: filePath,
      columns,
      test_names: testNames,
    });
    if (response.data && response.data.success) {
      return response.data.data;
    }
    throw new Error('ML forensics analysis returned unexpected format');
  } catch (error) {
    const errorDetail =
      error.response?.data?.detail || error.response?.data?.message || error.message;
    throw new Error(`ML Forensics Analysis Error: ${errorDetail}`);
  }
};

/**
 * Generates local SHAP, DIFFI, perturbation baseline, and counterfactuals for an anomaly.
 */
const explainAnomaly = async ({
  filePath,
  recordIndex,
  recordData,
  featureCols,
  peerBaselines = null,
  dataHash = 'data_hash',
  configHash = 'config_hash',
  topK = 4,
}) => {
  try {
    const response = await mlClient.post('/ml/explain', {
      file_path: filePath,
      record_index: recordIndex,
      record_data: recordData,
      feature_cols: featureCols,
      peer_baselines: peerBaselines,
      data_hash: dataHash,
      config_hash: configHash,
      top_k: topK,
    });
    if (response.data && response.data.success) {
      return response.data.data;
    }
    throw new Error('ML explainability returned unexpected format');
  } catch (error) {
    const errorDetail =
      error.response?.data?.detail || error.response?.data?.message || error.message;
    throw new Error(`ML Explainability Error: ${errorDetail}`);
  }
};

/**
 * Generates batch explanations and computes dataset-wide faithfulness and stability metrics.
 */
const explainBatchAnomalies = async ({
  filePath,
  anomalies,
  featureCols,
  peerBaselines = null,
  dataHash = 'data_hash',
  configHash = 'config_hash',
  topK = 4,
}) => {
  try {
    const response = await mlClient.post('/ml/explain/batch', {
      file_path: filePath,
      anomalies,
      feature_cols: featureCols,
      peer_baselines: peerBaselines,
      data_hash: dataHash,
      config_hash: configHash,
      top_k: topK,
    });
    if (response.data && response.data.success) {
      return response.data.data;
    }
    throw new Error('ML batch explainability returned unexpected format');
  } catch (error) {
    const errorDetail =
      error.response?.data?.detail || error.response?.data?.message || error.message;
    throw new Error(`ML Batch Explainability Error: ${errorDetail}`);
  }
};

/**
 * Validates a single anomaly record using Grounded Multi-Agent Validation (C5).
 */
const validateAnomaly = async (payload) => {
  try {
    const response = await mlClient.post('/ml/validate', payload);
    return response.data;
  } catch (error) {
    const errorDetail =
      error.response?.data?.detail || error.response?.data?.message || error.message;
    throw new Error(`ML Multi-Agent Validation Error: ${errorDetail}`);
  }
};

/**
 * Validates a batch of anomaly records.
 */
const validateBatchAnomalies = async (items) => {
  try {
    const response = await mlClient.post('/ml/validate/batch', items);
    return response.data;
  } catch (error) {
    const errorDetail =
      error.response?.data?.detail || error.response?.data?.message || error.message;
    throw new Error(`ML Batch Validation Error: ${errorDetail}`);
  }
};

/**
 * Computes updated detector weights using Exponentiated Gradient descent on human feedback (C6).
 */
const updateDetectorWeights = async (payload) => {
  try {
    const response = await mlClient.post('/ml/weights/update', payload);
    return response.data;
  } catch (error) {
    const errorDetail =
      error.response?.data?.detail || error.response?.data?.message || error.message;
    throw new Error(`ML Adaptive Weighting Error: ${errorDetail}`);
  }
};

/**
 * Runs reproducible benchmark suite across baselines, ablations, and significance tests (C9).
 */
const runBenchmark = async (payload) => {
  try {
    const response = await mlClient.post('/ml/experiments/run-benchmark', payload);
    return response.data;
  } catch (error) {
    const errorDetail =
      error.response?.data?.detail || error.response?.data?.message || error.message;
    throw new Error(`ML Benchmark Error: ${errorDetail}`);
  }
};

/**
 * Generates publication-ready LaTeX tables for experiment results (C9).
 */
const exportLatex = async (payload) => {
  try {
    const response = await mlClient.post('/ml/experiments/export-latex', payload);
    return response.data;
  } catch (error) {
    const errorDetail =
      error.response?.data?.detail || error.response?.data?.message || error.message;
    throw new Error(`ML LaTeX Export Error: ${errorDetail}`);
  }
};

module.exports = {
  requestProfiling,
  inferSchemaMapping,
  runFeatureEngineering,
  buildPeerGroups,
  analyzeDataset,
  analyzeForensics,
  explainAnomaly,
  explainBatchAnomalies,
  validateAnomaly,
  validateBatchAnomalies,
  updateDetectorWeights,
  runBenchmark,
  exportLatex,
};


