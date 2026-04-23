import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const API_BASE  = `${BASE_URL}/internal/dashboard/sfa`;
const AUTH_BASE = `${BASE_URL}/internal/dashboard/auth`;
const MOCK_BASE = `${BASE_URL}/internal/dashboard/mock`;

// ==========================================
// INSTANCIA AUTENTICADA
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

  resetPassword: async (email, new_password) => {
    const res = await axios.post(`${AUTH_BASE}/reset-password`, { email, new_password });
    return res.data;
  },

  // ==========================================
  // DATOS BASE (authAxios)
  // ==========================================
  getSensors: async () => {
    const res = await authAxios.get(`${API_BASE}/sensors`);
    return res.data;
  },

  getSFALatest: async (sensorId = 's1') => {
    const res = await authAxios.get(`${API_BASE}/latest`, { params: { sensor_id: sensorId } });
    return res.data;
  },

  getSFAHistory: async (sensorId = 's1', variable, hours = 24) => {
    const res = await authAxios.get(`${API_BASE}/history`, {
      params: { sensor_id: sensorId, variable, hours }
    });
    return res.data;
  },

  getSFAStatus: async (sensorId = 's1') => {
    const res = await authAxios.get(`${API_BASE}/status`, { params: { sensor_id: sensorId } });
    return res.data;
  },

  // ==========================================
  // REGLAS Y EVALUACIÓN (authAxios)
  // ==========================================
  getAlertRules: async (sensorId = 's1') => {
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

  evaluateAlerts: async (sensorId = 's1') => {
    const res = await authAxios.get(`${API_BASE}/alerts/evaluate`, { params: { sensor_id: sensorId } });
    return res.data;
  },

  clearAlerts: async (sensorId = 's1') => {
    const res = await authAxios.delete(`${API_BASE}/alerts`, { params: { sensor_id: sensorId } });
    return res.data;
  },

  // ==========================================
  // MOCK CONTROL (authAxios)
  // ==========================================
  startMock: async (sensorId = 's2') => {
    const res = await authAxios.post(`${MOCK_BASE}/start`, null, {
      params: { sensor_id: sensorId }
    });
    return res.data;
  },

  stopMock: async (sensorId = 's2') => {
    const res = await authAxios.post(`${MOCK_BASE}/stop`, null, {
      params: { sensor_id: sensorId }
    });
    return res.data;
  },

  getMockStatus: async () => {
    const res = await authAxios.get(`${MOCK_BASE}/status`);
    return res.data;
  },

  // ==========================================
  // ENDPOINTS EXTENDIDOS (authAxios)
  // ==========================================

  /** Historial con downsampling automático. Incluye avg, min, max, stddev por bucket. */
  getHistoryAggregated: async (sensorId, variable, hours = 24) => {
    const res = await authAxios.get(`${API_BASE}/history/aggregated`, {
      params: { sensor_id: sensorId, variable, hours }
    });
    return res.data;
  },

  /** Estadísticas globales de una variable: min, max, media, stddev, conteo, último valor. */
  getStats: async (sensorId, variable, hours = 24) => {
    const res = await authAxios.get(`${API_BASE}/stats`, {
      params: { sensor_id: sensorId, variable, hours }
    });
    return res.data;
  },

  /** Energía acumulada por día (Ah): generada, consumida y balance neto. */
  getEnergyDaily: async (sensorId, days = 7) => {
    const res = await authAxios.get(`${API_BASE}/energy/daily`, {
      params: { sensor_id: sensorId, days }
    });
    return res.data;
  },

  /** Balance energético histórico: generación vs consumo vs neto con downsampling. */
  getEnergyBalance: async (sensorId, hours = 24) => {
    const res = await authAxios.get(`${API_BASE}/energy/balance`, {
      params: { sensor_id: sensorId, hours }
    });
    return res.data;
  },

  /** Estado de conectividad de varios sensores (offline si última lectura > 5 min). */
  getSensorsConnectivity: async (sensorIds = []) => {
    const res = await authAxios.get(`${API_BASE}/sensors/connectivity`, {
      params: { sensor_ids: sensorIds.join(',') }
    });
    return res.data;
  },

  /**
   * Historial completo de alertas paginado, sin límite de 24h.
   * Reemplaza la versión anterior vacía.
   * @param {string} sensorId
   * @param {{ page?, limit?, level?, variable? }} opts
   */
  getAlertsHistory: async (sensorId = 's1', { page = 1, limit = 20, level, variable } = {}) => {
    const res = await authAxios.get(`${API_BASE}/alerts/history`, {
      params: { sensor_id: sensorId, page, limit, level, variable }
    });
    return res.data;
  },

  /** Historial de una variable para múltiples sensores simultáneamente. */
  getMultiSensorHistory: async (sensorIds = [], variable, hours = 24) => {
    const res = await authAxios.get(`${API_BASE}/history/multi`, {
      params: { sensor_ids: sensorIds.join(','), variable, hours }
    });
    return res.data;
  },

  // ── Evaluación completa (umbral + tendencia) ──────────────────
  evaluateAlertsFull: async (sensorId = 's1') => {
    const res = await authAxios.get(`${API_BASE}/alerts/evaluate/full`, {
      params: { sensor_id: sensorId }
    });
    return res.data;
  },
 
  // ── Snooze: silenciar alertas ─────────────────────────────────
  snoozeAlert: async ({ sensor_id, variable = null, hours = 2 }) => {
    const res = await authAxios.post(`${API_BASE}/alerts/snooze`, {
      sensor_id, variable, hours
    });
    return res.data;
  },
 
  // ── Cancelar snooze ───────────────────────────────────────────
  cancelSnooze: async (sensorId, variable = null) => {
    const params = { sensor_id: sensorId };
    if (variable) params.variable = variable;
    const res = await authAxios.delete(`${API_BASE}/alerts/snooze`, { params });
    return res.data;
  },
 
  // ── Listar snoozes activos ────────────────────────────────────
  getSnoozes: async (sensorId = 's1') => {
    const res = await authAxios.get(`${API_BASE}/alerts/snooze`, {
      params: { sensor_id: sensorId }
    });
    return res.data;
  },
 
  // ── Configuración del motor de tendencias ────────────────────
  getTrendsConfig: async () => {
    const res = await authAxios.get(`${API_BASE}/alerts/trends/config`);
    return res.data;
  },

  //──────────────────── SOC - Estado de Carga de la batería ────────────────────
  /** Recalcula el SOC con Coulomb Counting (o OCV si es madrugada y hay reposo). */
  /** SOC actual almacenado (lectura rápida, sin recalcular). */
  getSocCurrent: async (sensorId = 's1') => {
    const res = await authAxios.get(`${API_BASE}/soc/current`, {
      params: { sensor_id: sensorId }
    });
    return res.data;
  },
  
  computeSoc: async (sensorId = 's1') => {
    const res = await authAxios.post(`${API_BASE}/soc/compute`, null, {
      params: { sensor_id: sensorId }
    });
    return res.data;
  },

  /** Fuerza una calibración OCV inmediata si la batería está en reposo. */
  calibrateSoc: async (sensorId = 's1') => {
    const res = await authAxios.post(`${API_BASE}/soc/calibrate`, null, {
      params: { sensor_id: sensorId }
    });
    return res.data;
  },

  /** Devuelve la tabla OCV→SOC y los parámetros de la batería. */
  getSocOcvTable: async () => {
    const res = await authAxios.get(`${API_BASE}/soc/ocv-table`);
    return res.data;
  },
  
  /** Convierte un voltaje OCV a SOC (para diagnóstico). */
  getSocFromVoltage: async (voltage, sensorId = 's1') => {
    const res = await authAxios.get(`${API_BASE}/soc/ocv-to-soc`, {
      params: { sensor_id: sensorId, voltage }
    });
    return res.data;
  },
};