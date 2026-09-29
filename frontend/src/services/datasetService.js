import api from './api';

export const datasetService = {
  getDatasets: (params) => api.get('/datasets', { params }),

  getDatasetById: (id) => api.get(`/datasets/${id}`),

  uploadDataset: (formData, onUploadProgress) => {
    return api.post('/datasets/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress,
    });
  },

  deleteDataset: (id) => api.delete(`/datasets/${id}`),

  getJobStatus: (jobId) => api.get(`/jobs/${jobId}`),
};

export default datasetService;
