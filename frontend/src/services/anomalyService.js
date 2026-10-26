import api from './api';

export const anomalyService = {
  /**
   * Fetch anomalies with server-side filtering, sorting, and pagination
   */
  getAnomalies: (params = {}) => api.get('/anomalies', { params }),

  /**
   * Fetch a single anomaly record by its MongoDB ID
   */
  getAnomalyById: (id) => api.get(`/anomalies/${id}`),

  /**
   * Trigger detection pipeline on a dataset
   */
  detectAnomalies: (payload) => api.post('/anomalies/detect', payload),

  /**
   * Update investigation status, review verdict, and add note
   */
  updateAnomalyStatus: (id, payload) => api.patch(`/anomalies/${id}/status`, payload),
};

export default anomalyService;
