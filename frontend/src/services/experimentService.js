import api from './api';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

export const experimentService = {
  getRuns: (params = {}) => api.get('/experiments', { params }),

  getRunById: (id) => api.get(`/experiments/${id}`),

  createRun: (data) => api.post('/experiments/run', data),

  downloadLatex: async (id, experimentName = 'tables') => {
    const token = localStorage.getItem('ad_auth_token');
    const response = await fetch(`${API_BASE_URL}/experiments/${id}/latex`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to download LaTeX tables');
    }

    const text = await response.text();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `experiment_${experimentName.replace(/\s+/g, '_').toLowerCase()}_${id}.tex`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },
};

export default experimentService;
