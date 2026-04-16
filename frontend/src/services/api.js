import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const API_BASE = `${BASE_URL}/internal/dashboard/sfa`;
const AUTH_BASE = `${BASE_URL}/internal/dashboard/auth`;

// ==========================================
// INSTANCIA AUTENTICADA
// ==========================================
const authAxios = axios.create();
 
authAxios.interceptors.request.use(config => {
  const token = localStorage.getItem('sfa_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
 
authAxios.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('sfa_token');
      localStorage.removeItem('sfa_user');
      window.location.href = '/login'; // Redirección más limpia
    }
    return Promise.reject(err);
  }
);

export const api = {
  // ==========================================
  // AUTH (Sin token)
  // ==========================================
  login: async (username, password) => {
    const res = await axios.post(`${AUTH_BASE}/login`, { username, password });
    return res.data;
  },
 
  register: async (username, name, surname, email, password) => {
    const res = await axios.post(`${AUTH_BASE}/register`, { 
      username, name, surname, email, password 
    });
    return res.data;
  },
 
  forgotPassword: async (email) => {
    const res = await axios.post(`${AUTH_BASE}/forgot-password`, { email });
    return res.data;
  },
 
  resetPassword: async (token, new_password) => {
    const res = await axios.post(`${AUTH_BASE}/reset-password`, { token, new_password });
    return res.data;
  },
 
  // ==========================================
  // DATOS (Usando authAxios)
  // ==========================================
  getSensors: async () => {
    const res = await authAxios.get(`${API_BASE}/sensors`);
    return res.data;
  },

  getSFALatest: async (sensorId = 'sensor1') => {
    const res = await authAxios.get(`${API_BASE}/latest`, { params: { sensor_id: sensorId } });
    return res.data;
  },

  getSFAHistory: async (sensorId = 'sensor1', variable, hours = 24) => {
    const res = await authAxios.get(`${API_BASE}/history`, {
      params: { sensor_id: sensorId, variable, hours }
    });
    return res.data;
  },

  getSFAStatus: async (sensorId = 'sensor1') => {
    const res = await authAxios.get(`${API_BASE}/status`, { params: { sensor_id: sensorId } });
    return res.data;
  },

  // ==========================================
  // REGLAS Y EVALUACIÓN (Usando authAxios)
  // ==========================================
  getAlertRules: async (sensorId = 'sensor1') => {
    const res = await authAxios.get(`${API_BASE}/alert-rules`, { params: { sensor_id: sensorId } });
    return res.data;
  },

  createAlertRule: async (rule) => {
    const res = await authAxios.post(`${API_BASE}/alert-rules`, rule);
    return res.data;
  },

  updateAlertRule: async (ruleId, updates) => {
    const res = await authAxios.put(`${API_BASE}/alert-rules/${ruleId}`, updates);
    return res.data;
  },

  deleteAlertRule: async (ruleId) => {
    const res = await authAxios.delete(`${API_BASE}/alert-rules/${ruleId}`);
    return res.data;
  },

  getAlertsHistory: async (sensorId = 'sensor1', { page = 1, limit = 10 } = {}) => {
    const res = await authAxios.get(`${API_BASE}/alerts/history`, {
      params: { sensor_id: sensorId, page, limit }
    });
    return res.data;
  },

  evaluateAlerts: async (sensorId = 'sensor1') => {
    const res = await authAxios.get(`${API_BASE}/alerts/evaluate`, { params: { sensor_id: sensorId } });
    return res.data;
  },

  clearAlerts: async (sensorId = 'sensor1') => {
    const res = await authAxios.delete(`${API_BASE}/alerts`, { params: { sensor_id: sensorId } });
    return res.data;
  },
};