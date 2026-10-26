import api from './api';

export const fusionService = {
  /**
   * Run data fusion and provenance conflict detection between two datasets
   */
  runFusion: (payload) => api.post('/fusion/run', payload),

  /**
   * List data fusion runs with pagination
   */
  getFusions: (params = {}) => api.get('/fusion', { params }),

  /**
   * Get specific fusion details and conflicts
   */
  getFusionById: (id) => api.get(`/fusion/${id}`),

  /**
   * Resolve a specific conflict with provenance tracking
   */
  resolveConflict: (id, payload) => api.patch(`/fusion/${id}/resolve`, payload),

  /**
   * Delete a data fusion run
   */
  deleteFusion: (id) => api.delete(`/fusion/${id}`),
};

export default fusionService;
