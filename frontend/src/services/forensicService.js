import api from './api';

export const forensicService = {
  /**
   * Run forensic test battery on a dataset
   */
  runForensics: (payload) => api.post('/forensics/run', payload),

  /**
   * Get all forensic reports for a dataset
   */
  getReportsByDataset: (datasetId) => api.get(`/forensics/${datasetId}`),

  /**
   * Get detailed forensic report by report ID
   */
  getReportById: (id) => api.get(`/forensics/report/${id}`),
};

export default forensicService;
