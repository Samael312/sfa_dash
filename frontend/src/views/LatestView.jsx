/**
 * LatestView.jsx
 * --------------
 * Usa WebSocket para datos en tiempo real.
 * Fallback a polling REST si el WS no está disponible.
 * La tendencia se mantiene entre navegaciones con caché de módulo.
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '../services/api';
import useWebSocket from '../hooks/useWebSocket';
import {
  Loader2, RefreshCw, TrendingUp, TrendingDown, Minus,
  Sun, Thermometer, Zap, Battery, Cpu, Plug,
  BarChart3, AlertTriangle, Clock, Wifi, WifiOff
} from 'lucide-react';

const VARIABLES = [
  { key: 'radiacion',  label: 'Radiación solar', unit: 'W/m²', color: 'text-amber-600',   icon: Sun,         colorTheme: 'amber'   },
  { key: 'temp_amb',   label: 'Temp. ambiente',  unit: '°C',   color: 'text-rose-600',    icon: Thermometer, colorTheme: 'rose'    },
  { key: 'i_generada', label: 'Corr. generada',  unit: 'A',    color: 'text-emerald-600', icon: Zap,         colorTheme: 'emerald' },
  { key: 'v_bateria',  label: 'Tensión batería', unit: 'V',    color: 'text-indigo-600',  icon: Battery,     colorTheme: 'indigo'  },
  { key: 'temp_pan',   label: 'Temp. panel',     unit: '°C',   color: 'text-purple-600',  icon: Cpu,         colorTheme: 'purple'  },
  { key: 'i_carga',    label: 'Corr. carga',     unit: 'A',    color: 'text-cyan-600',    icon: Plug,        colorTheme: 'cyan'    },
  { key: 'temp_bat',   label: 'Temp. batería',   unit: '°C',   color: 'text-orange-600',  icon: Thermometer, colorTheme: 'orange'  },
];

const getThemeClasses = (theme) => {
  const themes = {
    amber:   { bg: 'bg-amber-50',   icon: 'text-amber-500'   },
    rose:    { bg: 'bg-rose-50',    icon: 'text-rose-500'    },
    emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-500' },
    indigo:  { bg: 'bg-indigo-50',  icon: 'text-indigo-500'  },
    purple:  { bg: 'bg-purple-50',  icon: 'text-purple-500'  },
    cyan:    { bg: 'bg-cyan-50',    icon: 'text-cyan-500'    },
    orange:  { bg: 'bg-orange-50',  icon: 'text-orange-500'  },
  };
  return themes[theme] || themes.indigo;
};

const TREND_THRESHOLD = 0.05;

// Caché módulo: sobrevive cambios de vista
const _cache = {};
const getCache  = (id) => _cache[id] ?? { current: null, previous: null };
const setCache  = (id, current, previous) => { _cache[id] = { current, previous }; };

// ─── Indicador de tendencia ───────────────────────────────────
const TrendIndicator = ({ current, previous, unit }) => {
  if (previous == null) {
    return <span className="text-slate-400 text-xs font-medium">Sin datos previos</span>;
  }
  const delta = current - previous;
  const pct   = previous !== 0 ? Math.abs(delta / previous) : Math.abs(delta);

  if (pct < TREND_THRESHOLD) {
    return (
      <div className="flex items-center gap-1.5 text-slate-400">
        <Minus size={16} strokeWidth={2.5} />
        <span className="text-xs font-semibold">Estable</span>
      </div>
    );
  }
  const isUp = delta > 0;
  return (
    <div className={`flex items-center gap-1.5 ${isUp ? 'text-emerald-500' : 'text-rose-500'}`}>
      {isUp ? <TrendingUp size={16} strokeWidth={2.5} /> : <TrendingDown size={16} strokeWidth={2.5} />}
      <span className="text-xs font-semibold">
        {isUp ? '+' : ''}{delta.toFixed(2)} {unit}
      </span>
    </div>
  );
};

// ─── Componente principal ─────────────────────────────────────
const LatestView = ({ sensorId = 's1' }) => {
  const [data,         setData]         = useState(() => getCache(sensorId).current);
  const [prev,         setPrev]         = useState(() => getCache(sensorId).previous);
  const [loading,      setLoading]      = useState(!getCache(sensorId).current);
  const [error,        setError]        = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdate,   setLastUpdate]   = useState(null);

  // WebSocket en tiempo real
  const { readings: wsReadings, connected: wsConnected, lastUpdate: wsLastUpdate }
    = useWebSocket(sensorId);

  // ── Carga inicial REST (snapshot completo) ────────────────────
  const loadRest = useCallback(async (manual = false) => {
    if (manual) setIsRefreshing(true);
    setError(null);
    try {
      const res = await api.getSFALatest(sensorId);
      const cached = getCache(sensorId);
      setCache(sensorId, res, cached.current);
      setPrev(cached.current);
      setData(res);
      setLastUpdate(new Date(res.timestamp));
    } catch {
      setError('Error al cargar los datos. Comprueba la conexión.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [sensorId]);

  // Carga inicial al montar o cambiar sensor
  useEffect(() => {
    if (!getCache(sensorId).current) setLoading(true);
    loadRest();
  }, [sensorId, loadRest]);

  // ── Actualizar con datos WebSocket ────────────────────────────
  // Cada vez que llegan lecturas por WS, actualizamos el estado
  // usando un ref para no perder el "anterior"
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);

  useEffect(() => {
    if (!wsConnected || Object.keys(wsReadings).length === 0) return;

    setData(prev => {
      if (!prev) return prev;   // Esperamos snapshot inicial
      const updated = { ...prev, ...wsReadings };
      // Solo guardamos el timestamp si llega en el mensaje
      if (wsLastUpdate) updated.timestamp = wsLastUpdate.toISOString();

      // Actualizar caché preservando el "previous" (no cambiar a cada msg WS)
      const cached = getCache(sensorId);
      setCache(sensorId, updated, cached.previous);

      return updated;
    });

    if (wsLastUpdate) setLastUpdate(wsLastUpdate);
  }, [wsReadings, wsConnected, wsLastUpdate, sensorId]);

  // ── Polling de fallback si WS no está conectado ───────────────
  useEffect(() => {
    if (wsConnected) return;  // WS activo → no hace falta polling
    const interval = setInterval(() => loadRest(false), 10_000);
    return () => clearInterval(interval);
  }, [wsConnected, loadRest]);

  if (loading && !data) return (
    <div className="flex flex-col items-center justify-center h-96 bg-slate-50/50 rounded-3xl border border-dashed border-slate-200 animate-in fade-in m-4 md:m-6">
      <Loader2 className="animate-spin text-indigo-500 mb-4" size={40} />
      <p className="text-sm text-slate-500 font-medium tracking-tight animate-pulse">
        Obteniendo últimas métricas...
      </p>
    </div>
  );

  return (
    <div className="flex flex-col gap-6 w-full mx-auto p-4 md:p-6 text-slate-800 font-sans animate-in fade-in duration-500">

      {/* CABECERA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-white p-6 border border-slate-100 shadow-sm rounded-2xl">
        <div className="flex items-center gap-5">
          <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-2xl shadow-sm border border-indigo-100/50">
            <BarChart3 size={26} strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">Telemetría Reciente</h2>
            <div className="flex items-center gap-2 text-sm text-slate-500 mt-0.5">
              <span>Nodo activo:</span>
              <span className="font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md font-mono text-xs">
                {sensorId}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">

          {/* Indicador WS */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border
            ${wsConnected
              ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
              : 'bg-slate-50 border-slate-200 text-slate-400'}`}
          >
            {wsConnected
              ? <><Wifi size={13} /><span>Tiempo real</span><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /></>
              : <><WifiOff size={13} /><span>Polling 10s</span></>
            }
          </div>

          {lastUpdate && (
            <div className="flex items-center gap-2 text-xs font-medium text-slate-400 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
              <Clock size={14} />
              {lastUpdate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
          )}

          <button
            onClick={() => loadRest(true)}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-sm font-semibold text-white transition-colors disabled:opacity-50 rounded-xl shadow-sm shadow-indigo-200 flex-1 sm:flex-none justify-center"
          >
            <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
            {isRefreshing ? 'Actualizando' : 'Actualizar'}
          </button>
        </div>
      </div>

      {/* ERROR */}
      {error && (
        <div className="bg-white border border-rose-100 p-5 flex items-center gap-4 text-rose-700 shadow-sm rounded-2xl">
          <div className="p-2 bg-rose-50 rounded-full">
            <AlertTriangle size={20} className="text-rose-500" />
          </div>
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {/* KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {VARIABLES.map(v => {
          const current  = data?.[v.key];
          const previous = prev?.[v.key];
          const theme    = getThemeClasses(v.colorTheme);
          const Icon     = v.icon;

          return (
            <div key={v.key} className="bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow flex flex-col rounded-2xl overflow-hidden">
              <div className="px-5 py-4 flex justify-between items-start">
                <span className={`text-sm font-semibold ${v.color} leading-tight`}>{v.label}</span>
                <div className={`p-2 rounded-xl ${theme.bg}`}>
                  <Icon size={18} className={theme.icon} strokeWidth={2} />
                </div>
              </div>
              <div className="px-5 pb-2 flex items-baseline gap-1.5">
                <span className={`text-3xl font-bold tracking-tight ${v.color}`}>
                  {current ?? '—'}
                </span>
                <span className={`text-sm font-medium ${v.color}`}>{v.unit}</span>
              </div>
              <div className="px-5 py-3 mt-auto border-t border-slate-50 bg-slate-50/30">
                <TrendIndicator current={current} previous={previous} unit={v.unit} />
              </div>
            </div>
          );
        })}
      </div>

      {/* TABLA RESUMEN */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100">
          <h3 className="text-lg font-semibold text-slate-800">Resumen Analítico</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50/50 text-slate-500 font-semibold border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 whitespace-nowrap">Variable</th>
                <th className="px-6 py-4 text-right whitespace-nowrap">Valor Actual</th>
                <th className="px-6 py-4 text-right whitespace-nowrap">Tendencia (Δ)</th>
                <th className="px-6 py-4 text-right whitespace-nowrap">Unidad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {VARIABLES.map(v => {
                const current  = data?.[v.key];
                const previous = prev?.[v.key];
                const theme    = getThemeClasses(v.colorTheme);
                const Icon     = v.icon;
                return (
                  <tr key={v.key} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-700 flex items-center gap-3">
                      <div className={`p-1.5 rounded-lg ${theme.bg}`}>
                        <Icon size={16} className={theme.icon} />
                      </div>
                      {v.label}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="font-bold text-slate-900 text-base">{current ?? '—'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end">
                        <TrendIndicator current={current} previous={previous} unit="" />
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-slate-400">{v.unit}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

export default LatestView;