import axios from 'axios';

const API_BASE  = 'http://localhost:8000/internal/dashboard/sfa';
const AUTH_BASE = 'http://localhost:8000/internal/dashboard/auth';

// ==========================================
// INSTANCIA AUTENTICADA
// Adjunta el JWT a todas las peticiones SFA
// y expulsa al usuario si el token expira (401)
// ==========================================
const authAxios = axios.create();
 
authAxios.interceptors.request.use(config => {
  const token = localStorage.getItem('sfa_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
 
authAxios.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('sfa_token');
      localStorage.removeItem('sfa_user');
      window.location.reload();
    }
    return Promise.reject(err);
  }
);

export const api = {

  // ==========================================
  // AUTH
  // ==========================================
  login: async (email, password) => {
    try {
      const res = await axios.post(`${AUTH_BASE}/login`, { email, password });
      return res.data;
    } catch (e) {
      const detail = e.response?.data?.detail || 'Error al conectar con el servidor.';
      throw new Error(detail);
    }
  },
 
  register: async (name, email, password) => {
    try {
      const res = await axios.post(`${AUTH_BASE}/register`, { name, email, password });
      return res.data;
    } catch (e) {
      const detail = e.response?.data?.detail || 'Error al registrar la cuenta.';
      throw new Error(detail);
    }
  },
 
  forgotPassword: async (email) => {
    try {
      const res = await axios.post(`${AUTH_BASE}/forgot-password`, { email });
      return res.data;
    } catch (e) {
      const detail = e.response?.data?.detail || 'Error al procesar la solicitud.';
      throw new Error(detail);
    }
  },
 
  resetPassword: async (token, new_password) => {
    try {
      const res = await axios.post(`${AUTH_BASE}/reset-password`, { token, new_password });
      return res.data;
    } catch (e) {
      const detail = e.response?.data?.detail || 'Error al cambiar la contraseña.';
      throw new Error(detail);
    }
  },
  
  // ==========================================
  // DATOS
  // ==========================================
  getSensors: async () => {
    try {
      const res = await axios.get(`${API_BASE}/sensors`);
      return res.data;
    } catch (e) {
      console.error('Error fetching sensors:', e);
      return { sensors: [] };
    }
  },

  getSFALatest: async (sensorId = 'sensor1') => {
    try {
      const res = await axios.get(`${API_BASE}/latest`, { params: { sensor_id: sensorId } });
      return res.data;
    } catch (e) {
      console.error(`Error fetching latest [${sensorId}]:`, e);
      return null;
    }
  },

  getSFAHistory: async (sensorId = 'sensor1', variable, hours = 24) => {
    try {
      const res = await axios.get(`${API_BASE}/history`, {
        params: { sensor_id: sensorId, variable, hours }
      });
      return res.data;
    } catch (e) {
      console.error(`Error fetching history [${sensorId}/${variable}]:`, e);
      return { sensor_id: sensorId, variable, hours, points: [] };
    }
  },

  getSFAStatus: async (sensorId = 'sensor1') => {
    try {
      const res = await axios.get(`${API_BASE}/status`, { params: { sensor_id: sensorId } });
      return res.data;
    } catch (e) {
      console.error(`Error fetching status [${sensorId}]:`, e);
      return null;
    }
  },

  // ==========================================
  // REGLAS DE ALERTA — CRUD
  // ==========================================
  getAlertRules: async (sensorId = 'sensor1') => {
    try {
      const res = await axios.get(`${API_BASE}/alert-rules`, { params: { sensor_id: sensorId } });
      return res.data;   // { sensor_id, rules: [...] }
    } catch (e) {
      console.error(`Error fetching alert rules [${sensorId}]:`, e);
      return { sensor_id: sensorId, rules: [] };
    }
  },

  createAlertRule: async (rule) => {
    // rule: { sensor_id, variable, operator, threshold, level, message }
    try {
      const res = await axios.post(`${API_BASE}/alert-rules`, rule);
      return res.data;
    } catch (e) {
      console.error('Error creating alert rule:', e);
      return null;
    }
  },

  updateAlertRule: async (ruleId, updates) => {
    // updates: { threshold, level, message }
    try {
      const res = await axios.put(`${API_BASE}/alert-rules/${ruleId}`, updates);
      return res.data;
    } catch (e) {
      console.error(`Error updating alert rule ${ruleId}:`, e);
      return null;
    }
  },

  deleteAlertRule: async (ruleId) => {
    try {
      const res = await axios.delete(`${API_BASE}/alert-rules/${ruleId}`);
      return res.data;
    } catch (e) {
      console.error(`Error deleting alert rule ${ruleId}:`, e);
      return null;
    }
  },

  getAlertsHistory: async (sensorId = 'sensor1', { page = 1, limit = 10 } = {}) => {
  try {
    const res = await axios.get(`${API_BASE}/alerts/history`, {
      params: { sensor_id: sensorId, page, limit }
    });
    return res.data; // Se espera { alerts: [], total: X, pages: Y }
  } catch (e) {
    console.error(`Error fetching alerts history [${sensorId}]:`, e);
    return { alerts: [], total: 0, pages: 1 };
  }
},

  // ==========================================
  // EVALUACIÓN Y GESTIÓN DE ALERTAS
  // ==========================================
  evaluateAlerts: async (sensorId = 'sensor1') => {
    try {
      const res = await axios.get(`${API_BASE}/alerts/evaluate`, { params: { sensor_id: sensorId } });
      return res.data;   // { sensor_id, evaluated, new_alerts, alerts: [...] }
    } catch (e) {
      console.error(`Error evaluating alerts [${sensorId}]:`, e);
      return null;
    }
  },

  clearAlerts: async (sensorId = 'sensor1') => {
    try {
      const res = await axios.delete(`${API_BASE}/alerts`, { params: { sensor_id: sensorId } });
      return res.data;
    } catch (e) {
      console.error(`Error clearing alerts [${sensorId}]:`, e);
      return null;
    }
  },
};