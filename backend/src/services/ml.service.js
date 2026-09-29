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

module.exports = {
  requestProfiling,
};
