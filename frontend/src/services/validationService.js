import api from './api';

export const validationService = {
  /**
   * Fetch prioritized review queue with server-side filtering and pagination
   */
  getReviewQueue: (params = {}) => api.get('/validations/queue', { params }),

  /**
   * Fetch or lazily generate validation report for an anomaly record
   */
  getValidationReport: (anomalyId) => api.get(`/validations/${anomalyId}`),

  /**
   * Trigger or re-run multi-agent validation for an anomaly
   */
  validateAnomaly: (anomalyId, force = false) =>
    api.post(`/validations/${anomalyId}${force ? '?force=true' : ''}`),

  /**
   * Batch validate top unreviewed anomalies for a dataset
   */
  batchValidate: (datasetId, topK = 10) =>
    api.post('/validations/batch', { datasetId, topK }),

  /**
   * Submit human reviewer verdict, status change, and audit justification notes
   */
  submitReview: (anomalyId, payload) =>
    api.post(`/validations/${anomalyId}/review`, payload),
};

export default validationService;
