import axios from 'axios';

const API_BASE = 'http://localhost:8000/internal/dashboard/sfa';

export const api = {

  // Lista de sensores disponibles en la BD
  getSensors: async () => {
    try {
      const response = await axios.get(`${API_BASE}/sensors`);
      return response.data;          // { sensors: ["sensor1", "sensor2", ...] }
    } catch (error) {
      console.error('Error fetching sensors:', error);
      return { sensors: [] };
    }
  },

  // Última lectura de todas las variables de un sensor
  getSFALatest: async (sensorId = 'sensor1') => {
    try {
      const response = await axios.get(`${API_BASE}/latest`, {
        params: { sensor_id: sensorId },
      });
      return response.data;
    } catch (error) {
      console.error(`Error fetching latest for ${sensorId}:`, error);
      return null;
    }
  },

  // Serie temporal de una variable para un sensor
  getSFAHistory: async (sensorId = 'sensor1', variable, hours = 24) => {
    try {
      const response = await axios.get(`${API_BASE}/history`, {
        params: { sensor_id: sensorId, variable, hours },
      });
      return response.data;          // { sensor_id, variable, hours, points: [...] }
    } catch (error) {
      console.error(`Error fetching history [${sensorId}/${variable}]:`, error);
      return { sensor_id: sensorId, variable, hours, points: [] };
    }
  },

  // Estado general del SFA para un sensor
  getSFAStatus: async (sensorId = 'sensor1') => {
    try {
      const response = await axios.get(`${API_BASE}/status`, {
        params: { sensor_id: sensorId },
      });
      return response.data;
    } catch (error) {
      console.error(`Error fetching status for ${sensorId}:`, error);
      return null;
    }
  },
};