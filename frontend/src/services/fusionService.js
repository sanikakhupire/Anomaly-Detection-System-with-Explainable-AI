import api from './api';

export const fusionService = {
  /**
   * Run data fusion and provenance conflict detection between two datasets
   */
  runFusion: async (payload) => {
    const response = await api.post('/fusion/run', payload);
    return response.data;
  },

  /**
   * List data fusion runs with pagination
   */
  getFusions: async (params = {}) => {
    const response = await api.get('/fusion', { params });
    return response.data;
  },

  /**
   * Get specific fusion details and conflicts
   */
  getFusionById: async (id) => {
    const response = await api.get(`/fusion/${id}`);
    return response.data;
  },

  /**
   * Resolve a specific conflict with provenance tracking
   */
  resolveConflict: async (id, payload) => {
    const response = await api.patch(`/fusion/${id}/resolve`, payload);
    return response.data;
  },

  /**
   * Delete a data fusion run
   */
  deleteFusion: async (id) => {
    const response = await api.delete(`/fusion/${id}`);
    return response.data;
  },
};

export default fusionService;
