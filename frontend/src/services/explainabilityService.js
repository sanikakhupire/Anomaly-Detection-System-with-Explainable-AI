import api from './api';

export const explainabilityService = {
  /**
   * Fetch or lazily generate explanation for a single anomaly record
   */
  getExplanation: async (anomalyId) => {
    const response = await api.get(`/explanations/${anomalyId}`);
    return response.data;
  },

  /**
   * Fetch aggregate faithfulness and stability metrics for a dataset
   */
  getMetrics: async (datasetId) => {
    const response = await api.get(`/explanations/metrics/${datasetId}`);
    return response.data;
  },

  /**
   * Trigger batch explanation generation for top anomalies in a dataset
   */
  generateBatchExplanations: async (datasetId, topK = 10) => {
    const response = await api.post('/explanations/batch', { datasetId, topK });
    return response.data;
  },
};

export default explainabilityService;
