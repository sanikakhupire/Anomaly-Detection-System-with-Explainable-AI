import api from './api';

export const validationService = {
  /**
   * Fetch prioritized review queue with server-side filtering and pagination
   */
  getReviewQueue: async (params = {}) => {
    const response = await api.get('/validations/queue', { params });
    return response.data;
  },

  /**
   * Fetch or lazily generate validation report for an anomaly record
   */
  getValidationReport: async (anomalyId) => {
    const response = await api.get(`/validations/${anomalyId}`);
    return response.data;
  },

  /**
   * Trigger or re-run multi-agent validation for an anomaly
   */
  validateAnomaly: async (anomalyId, force = false) => {
    const response = await api.post(`/validations/${anomalyId}${force ? '?force=true' : ''}`);
    return response.data;
  },

  /**
   * Batch validate top unreviewed anomalies for a dataset
   */
  batchValidate: async (datasetId, topK = 10) => {
    const response = await api.post('/validations/batch', { datasetId, topK });
    return response.data;
  },

  /**
   * Submit human reviewer verdict, status change, and audit justification notes
   */
  submitReview: async (anomalyId, payload) => {
    const response = await api.post(`/validations/${anomalyId}/review`, payload);
    return response.data;
  },
};

export default validationService;
