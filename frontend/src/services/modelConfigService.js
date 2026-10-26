import api from './api';

export const modelConfigService = {
  /**
   * Fetch active detector weight configuration and iteration history
   */
  getWeights: (datasetId = '') => {
    const url = datasetId ? `/models/weights/${datasetId}` : '/models/weights';
    return api.get(url);
  },

  /**
   * Manually tune detector weights and learning parameters
   */
  tuneWeights: (datasetId, payload) => {
    const url = datasetId ? `/models/weights/${datasetId}/tune` : '/models/weights/tune';
    return api.post(url, payload);
  },

  /**
   * Recalculate anomaly ensemble scores using active adaptive weights
   */
  recalculateScores: (datasetId) => {
    const url = datasetId ? `/models/weights/${datasetId}/recalculate` : '/models/weights/recalculate';
    return api.post(url, { datasetId });
  },

  /**
   * Reset detector weights to system baseline defaults
   */
  resetWeights: (datasetId = '') => {
    const url = datasetId ? `/models/weights/${datasetId}/reset` : '/models/weights/reset';
    return api.post(url, {});
  },
};

export default modelConfigService;
