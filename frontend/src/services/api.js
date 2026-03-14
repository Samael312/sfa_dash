import axios from 'axios';

// Prueba local
const API_BASE = 'http://localhost:8000/internal/dashboard/sfa';

export const api = {

getSFALatest: async () => {
  try {
    const response = await axios.get(`${API_BASE}/latest`);
    return response.data;
  } catch (error) {
    console.error('Error fetching SFA latest:', error);
    return null;
  }
},

getSFAHistory: async (variable, hours = 24) => {
  try {
    const response = await axios.get(`${API_BASE}/history`, {
      params: { variable, hours }
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching SFA history for ${variable}:`, error);
    return { variable, hours, points: [] };
  }
},

getSFAStatus: async () => {
  try {
    const response = await axios.get(`${API_BASE}/status`);
    return response.data;
  } catch (error) {
    console.error('Error fetching SFA status:', error);
    return null;
  }
},
};