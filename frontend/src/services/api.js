import axios from 'axios';

const API_BASE = 'http://localhost:8000/internal/dashboard/sfa';

export const api = {

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