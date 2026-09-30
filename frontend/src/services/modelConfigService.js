import api from './api';

export const modelConfigService = {
  /**
   * Fetch active detector weight configuration and iteration history
   */
  getWeights: async (datasetId = '') => {
    const url = datasetId ? `/models/weights/${datasetId}` : '/models/weights';
    const response = await api.get(url);
    return response.data;
  },

  /**
   * Manually tune detector weights and learning parameters
   */
  tuneWeights: async (datasetId, payload) => {
    const url = datasetId ? `/models/weights/${datasetId}/tune` : '/models/weights/tune';
    const response = await api.post(url, payload);
    return response.data;
  },

  /**
   * Recalculate anomaly ensemble scores using active adaptive weights
   */
  recalculateScores: async (datasetId) => {
    const url = datasetId ? `/models/weights/${datasetId}/recalculate` : '/models/weights/recalculate';
    const response = await api.post(url, { datasetId });
    return response.data;
  },

  /**
   * Reset detector weights to system baseline defaults
   */
  resetWeights: async (datasetId = '') => {
    const url = datasetId ? `/models/weights/${datasetId}/reset` : '/models/weights/reset';
    const response = await api.post(url, {});
    return response.data;
  },
};

export default modelConfigService;
