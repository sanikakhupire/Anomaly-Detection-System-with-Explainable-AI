import api from './api';

export const forensicService = {
  /**
   * Run forensic test battery on a dataset
   */
  runForensics: async (payload) => {
    const response = await api.post('/forensics/run', payload);
    return response.data;
  },

  /**
   * Get all forensic reports for a dataset
   */
  getReportsByDataset: async (datasetId) => {
    const response = await api.get(`/forensics/${datasetId}`);
    return response.data;
  },

  /**
   * Get detailed forensic report by report ID
   */
  getReportById: async (id) => {
    const response = await api.get(`/forensics/report/${id}`);
    return response.data;
  },
};

export default forensicService;
