import api from './api';

export const featureService = {
  getSchemaMapping: (datasetId) => api.get(`/datasets/${datasetId}/schema-mapping`),

  updateSchemaMapping: (datasetId, mapping) =>
    api.put(`/datasets/${datasetId}/schema-mapping`, { mapping }),

  runFeatures: (datasetId) => api.post('/features/run', { datasetId }),

  getFeatures: (datasetId) => api.get(`/features/${datasetId}`),

  buildPeerGroups: (payload) => api.post('/peer-groups/build', payload),

  getPeerGroups: (datasetId) => api.get(`/peer-groups/${datasetId}`),
};

export default featureService;
