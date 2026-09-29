import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Interceptor to inject JWT token into outgoing requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('ad_auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Interceptor for response handling and global 401 unauthorized detection
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const status = error.response ? error.response.status : null;
    const errorData = error.response?.data || {
      success: false,
      message: error.message || 'Network error occurred',
      data: null,
      error: null,
    };

    if (status === 401 && !window.location.pathname.includes('/login')) {
      localStorage.removeItem('ad_auth_token');
      localStorage.removeItem('ad_user_info');
      window.dispatchEvent(new Event('auth:unauthorized'));
    }

    return Promise.reject(errorData);
  }
);

export const authService = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (userData) => api.post('/auth/register', userData),
  logout: () => api.post('/auth/logout'),
  getMe: () => api.get('/auth/me'),
  checkAdminAccess: () => api.get('/auth/admin-only'),
  checkAnalystAccess: () => api.get('/auth/analyst-only'),
  checkReviewerAccess: () => api.get('/auth/reviewer-only'),
};

export default api;
