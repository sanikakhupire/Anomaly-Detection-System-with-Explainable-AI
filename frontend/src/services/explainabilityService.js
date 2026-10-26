import api from './api';

export const explainabilityService = {
  /**
   * Fetch or lazily generate explanation for a single anomaly record
   */
  getExplanation: (anomalyId) => api.get(`/explanations/${anomalyId}`),

  /**
   * Fetch aggregate faithfulness and stability metrics for a dataset
   */
  getMetrics: (datasetId) => api.get(`/explanations/metrics/${datasetId}`),

  /**
   * Trigger batch explanation generation for top anomalies in a dataset
   */
  generateBatchExplanations: (datasetId, topK = 10) =>
    api.post('/explanations/batch', { datasetId, topK }),
};

export default explainabilityService;
