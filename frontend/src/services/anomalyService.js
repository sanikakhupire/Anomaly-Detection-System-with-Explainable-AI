import api from './api';

export const anomalyService = {
  /**
   * Fetch anomalies with server-side filtering, sorting, and pagination
   */
  getAnomalies: async (params = {}) => {
    const response = await api.get('/anomalies', { params });
    return response.data;
  },

  /**
   * Fetch a single anomaly record by its MongoDB ID
   */
  getAnomalyById: async (id) => {
    const response = await api.get(`/anomalies/${id}`);
    return response.data;
  },

  /**
   * Trigger detection pipeline on a dataset
   */
  detectAnomalies: async (payload) => {
    const response = await api.post('/anomalies/detect', payload);
    return response.data;
  },

  /**
   * Update investigation status, review verdict, and add note
   */
  updateAnomalyStatus: async (id, payload) => {
    const response = await api.patch(`/anomalies/${id}/status`, payload);
    return response.data;
  },
};

export default anomalyService;
