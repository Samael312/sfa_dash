/**
 * useWebSocket.js
 * ---------------
 * Hook que gestiona la conexión WebSocket con el backend.
 * Acumula las lecturas por variable y notifica con el último valor.
 *
 * Uso:
 *   const { readings, connected, lastUpdate } = useWebSocket(sensorId);
 *
 *   readings → { radiacion: 523.4, temp_amb: 28.1, ... }
 *   connected → true / false
 *   lastUpdate → Date | null
 *
 * Colocar en: frontend/src/hooks/useWebSocket.js
 */

import { useEffect, useRef, useState, useCallback } from 'react';

const WS_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000')
  .replace(/^http/, 'ws');   // http → ws  /  https → wss

const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECTS     = 10;

const useWebSocket = (sensorId) => {
  const [readings,   setReadings]   = useState({});
  const [connected,  setConnected]  = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);

  const wsRef          = useRef(null);
  const reconnectsRef  = useRef(0);
  const timeoutRef     = useRef(null);
  const mountedRef     = useRef(true);

  const connect = useCallback(() => {
    if (!sensorId || !mountedRef.current) return;

    const token = localStorage.getItem('sfa_token');
    if (!token) return;

    const url = `${WS_BASE}/ws/${sensorId}?token=${token}`;
    const ws  = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      reconnectsRef.current = 0;
      setConnected(true);
      console.log(`🔌 WS conectado: sensor=${sensorId}`);
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'reading' && msg.variable != null) {
          setReadings(prev => ({
            ...prev,
            [msg.variable]: msg.value,
          }));
          setLastUpdate(new Date(msg.timestamp));
        }
      } catch {
        // payload inválido, ignorar
      }
    };

    ws.onerror = () => {
      setConnected(false);
    };

    ws.onclose = (event) => {
      if (!mountedRef.current) return;
      setConnected(false);
      console.log(`🔌 WS cerrado: code=${event.code} sensor=${sensorId}`);

      // No reconectar si el servidor rechazó por auth (4001)
      if (event.code === 4001) return;

      if (reconnectsRef.current < MAX_RECONNECTS) {
        reconnectsRef.current += 1;
        const delay = RECONNECT_DELAY_MS * reconnectsRef.current;
        console.log(`🔄 WS reconectando en ${delay}ms (intento ${reconnectsRef.current})`);
        timeoutRef.current = setTimeout(connect, delay);
      }
    };
  }, [sensorId]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      clearTimeout(timeoutRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // evitar reconexión al desmontar
        wsRef.current.close();
      }
      setConnected(false);
    };
  }, [connect]);

  return { readings, connected, lastUpdate };
};

export default useWebSocket;