import api from './api';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

export const reportService = {
  getAuditBlocks: (params = {}) => api.get('/reports/audit/chain', { params }),

  verifyAuditChain: () => api.get('/reports/audit/verify'),

  getDatasetCertificate: (datasetId) => api.get(`/reports/dataset/${datasetId}`),

  downloadCertificateJson: async (datasetId) => {
    const token = localStorage.getItem('ad_auth_token');
    const response = await fetch(`${API_BASE_URL}/reports/dataset/${datasetId}/export/json`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      throw new Error('Failed to download certificate JSON');
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_certificate_${datasetId}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  downloadAnomaliesCsv: async (datasetId) => {
    const token = localStorage.getItem('ad_auth_token');
    const response = await fetch(`${API_BASE_URL}/reports/dataset/${datasetId}/export/csv`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      throw new Error('Failed to download anomalies CSV');
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `anomalies_audit_${datasetId}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },
};

export default reportService;
