/**
 * OverviewView.jsx
 * ----------------
 * Panel resumen ejecutivo.
 * SOC obtenido de /soc/current (motor Coulomb) en lugar de fórmula de voltaje.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../services/api';
import useWebSocket from '../hooks/useWebSocket';
import {
  Loader2, RefreshCw, Wifi, WifiOff, AlertTriangle,
  ShieldCheck, Zap, Battery, Sun, Thermometer, Cpu,
  Plug, Activity, TrendingUp, TrendingDown, Minus,
  Clock, Radio
} from 'lucide-react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  PointElement, LineElement, Tooltip, Filler
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler);

const VARIABLES = [
  { key: 'radiacion',  label: 'Radiación',    unit: 'W/m²', icon: Sun,         color: '#F59E0B', bg: 'bg-amber-50',   text: 'text-amber-600'   },
  { key: 'temp_amb',   label: 'Temp. amb.',   unit: '°C',   icon: Thermometer, color: '#F43F5E', bg: 'bg-rose-50',    text: 'text-rose-600'    },
  { key: 'i_generada', label: 'Generación',   unit: 'A',    icon: Zap,         color: '#10B981', bg: 'bg-emerald-50', text: 'text-emerald-600' },
  { key: 'v_bateria',  label: 'Tensión bat.', unit: 'V',    icon: Battery,     color: '#6366F1', bg: 'bg-indigo-50',  text: 'text-indigo-600'  },
  { key: 'temp_pan',   label: 'Temp. panel',  unit: '°C',   icon: Cpu,         color: '#8B5CF6', bg: 'bg-purple-50',  text: 'text-purple-600'  },
  { key: 'i_carga',    label: 'Consumo',      unit: 'A',    icon: Plug,        color: '#06B6D4', bg: 'bg-cyan-50',    text: 'text-cyan-600'    },
  { key: 'temp_bat',   label: 'Temp. bat.',   unit: '°C',   icon: Thermometer, color: '#F97316', bg: 'bg-orange-50',  text: 'text-orange-600'  },
];

const TREND_THRESHOLD = 0.05;

// ── Sparkline ─────────────────────────────────────────────────
const Sparkline = ({ points, color }) => {
  if (!points?.length) return <div className="h-10 flex items-center justify-center text-slate-200 text-xs">—</div>;
  const data = {
    labels:   points.map((_, i) => i),
    datasets: [{ data: points, borderColor: color, backgroundColor: `${color}20`, borderWidth: 1.5, pointRadius: 0, tension: 0.4, fill: true }],
  };
  const options = {
    responsive: true, maintainAspectRatio: false, animation: false,
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales:  { x: { display: false }, y: { display: false } },
  };
  return <div className="h-10 w-full"><Line data={data} options={options} /></div>;
};

// ── Tendencia compacta ────────────────────────────────────────
const MiniTrend = ({ current, previous }) => {
  if (previous == null || current == null) return null;
  const delta = current - previous;
  const pct   = previous !== 0 ? Math.abs(delta / previous) : Math.abs(delta);
  if (pct < TREND_THRESHOLD) return <Minus size={12} className="text-slate-400" />;
  return delta > 0
    ? <TrendingUp   size={12} className="text-emerald-500" />
    : <TrendingDown size={12} className="text-rose-500" />;
};

const formatAge = (seconds) => {
  if (seconds == null || seconds < 0) return 'ahora mismo';
  if (seconds < 60)    return `${seconds}s`;
  if (seconds < 3600)  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
};

// ── Badge conectividad ────────────────────────────────────────
const ConnectivityBadge = ({ sensor }) => (
  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border
    ${sensor.connected ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
    {sensor.connected
      ? <><Wifi size={12} />{sensor.sensor_id}<span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /></>
      : <><WifiOff size={12} />{sensor.sensor_id}</>}
  </div>
);

// ── KPI card ──────────────────────────────────────────────────
const OverviewCard = ({ variable, current, previous, sparkPoints }) => {
  const Icon = variable.icon;
  return (
    <div className="bg-white border border-slate-100 shadow-sm hover:shadow-md transition-all rounded-2xl p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${variable.bg}`}>
            <Icon size={14} className={variable.text} strokeWidth={2} />
          </div>
          <span className="text-xs font-bold text-slate-500">{variable.label}</span>
        </div>
        <MiniTrend current={current} previous={previous} />
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-2xl font-black tracking-tight ${variable.text}`}>{current ?? '—'}</span>
        <span className={`text-xs font-semibold ${variable.text} opacity-60`}>{variable.unit}</span>
      </div>
      <Sparkline points={sparkPoints} color={variable.color} />
    </div>
  );
};

// ── Componente principal ──────────────────────────────────────
const OverviewView = ({ sensorId = 's1' }) => {
  const [snapshots,     setSnapshots]     = useState({});
  const [sparklines,    setSparklines]    = useState({});
  const [connectivity,  setConnectivity]  = useState([]);
  const [allSensors,    setAllSensors]    = useState([]);
  const [alerts,        setAlerts]        = useState([]);
  const [energySummary, setEnergySummary] = useState(null);
  // ── NUEVO: SOC desde el motor Coulomb ────────────────────────
  const [socData,       setSocData]       = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [isRefreshing,  setIsRefreshing]  = useState(false);
  const [lastUpdate,    setLastUpdate]    = useState(null);
  const prevRef = useRef({});

  const { readings: wsReadings, connected: wsConnected, lastUpdate: wsTs } = useWebSocket(sensorId);

  const load = useCallback(async (manual = false) => {
    if (manual) setIsRefreshing(true);
    else        setLoading(true);

    try {
      const sensorsRes = await api.getSensors();
      const sensors    = sensorsRes?.sensors ?? [];
      setAllSensors(sensors);

      const [snapRes, connRes, histResults, statusRes, energyRes, socRes] = await Promise.all([
        Promise.all(sensors.map(s => api.getSFALatest(s).catch(() => null))),
        api.getSensorsConnectivity(sensors).catch(() => ({ sensors: [] })),
        Promise.all(VARIABLES.map(v => api.getSFAHistory(sensorId, v.key, 3).catch(() => null))),
        api.getSFAStatus(sensorId).catch(() => null),
        api.getEnergyDaily(sensorId, 1).catch(() => null),
        // ── NUEVO: obtener SOC real del motor Coulomb ────────────
        api.getSocCurrent(sensorId).catch(() => null),
      ]);

      const snaps = {};
      sensors.forEach((s, i) => { if (snapRes[i]) snaps[s] = snapRes[i]; });
      setSnapshots(snaps);

      const sparks = {};
      VARIABLES.forEach((v, i) => {
        sparks[v.key] = (histResults[i]?.points ?? []).map(p => p.value).slice(-30);
      });
      setSparklines(sparks);

      setConnectivity(connRes?.sensors ?? []);
      setAlerts(statusRes?.alerts ?? []);
      setEnergySummary(energyRes?.data?.[0] ?? null);
      // ── NUEVO ────────────────────────────────────────────────
      setSocData(socRes);
      setLastUpdate(new Date());
    } catch {
      // Silencioso
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [sensorId]);

  useEffect(() => { load(); }, [load]);

  // Polling fallback si no hay WS
  useEffect(() => {
    if (wsConnected) return;
    const iv = setInterval(() => load(false), 15_000);
    return () => clearInterval(iv);
  }, [wsConnected, load]);

  // Actualizar snapshot con datos WS
  useEffect(() => {
    if (!wsConnected || !Object.keys(wsReadings).length) return;
    setSnapshots(prev => ({ ...prev, [sensorId]: { ...(prev[sensorId] ?? {}), ...wsReadings } }));
    setSparklines(prev => {
      const next = { ...prev };
      Object.entries(wsReadings).forEach(([key, value]) => {
        if (next[key]) next[key] = [...next[key].slice(-29), value];
      });
      return next;
    });
    if (wsTs) setLastUpdate(wsTs);
  }, [wsReadings, wsConnected, wsTs, sensorId]);

  const current  = snapshots[sensorId];
  const previous = prevRef.current[sensorId];

  useEffect(() => {
    if (current) prevRef.current[sensorId] = current;
  }, [current, sensorId]);

  // ── SOC: prioridad al motor Coulomb, fallback a voltaje ──────
  const soc = (() => {
    if (socData?.soc_pct != null) return Math.round(socData.soc_pct);
    if (current?.v_bateria != null) {
      const V_BAT_MIN = 10.8, V_BAT_MAX = 14.4;
      return Math.round(Math.max(0, Math.min(100, (current.v_bateria - V_BAT_MIN) / (V_BAT_MAX - V_BAT_MIN) * 100)));
    }
    return null;
  })();

  // Etiqueta del método SOC para transparencia
  const socMethod = socData?.method === 'ocv_calibration' ? 'OCV'
    : socData?.method === 'coulomb_counting'               ? 'Coulomb'
    : socData?.soc_pct != null                             ? 'Motor'
    : 'Voltaje';

  const battColor = soc == null ? 'bg-slate-200'
    : soc > 60 ? 'bg-emerald-500'
    : soc > 20 ? 'bg-amber-400'
    : 'bg-rose-500';

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-96 bg-slate-50/50
      rounded-3xl border border-dashed border-slate-200 animate-in fade-in m-4 md:m-6">
      <Loader2 className="animate-spin text-indigo-500 mb-4" size={40} />
      <p className="text-sm text-slate-500 font-medium animate-pulse">Cargando panel de control...</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-6 w-full mx-auto p-4 md:p-6 text-slate-800 font-sans animate-in fade-in duration-500">

      {/* HEADER */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100
        flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-5">
          <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-2xl shadow-sm border border-indigo-100/50">
            <Radio size={26} strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">Panel de Control</h2>
            <p className="text-sm text-slate-500 mt-0.5">Resumen ejecutivo · Todos los sistemas</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border
            ${wsConnected ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
            {wsConnected
              ? <><Wifi size={12} />Tiempo real<span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /></>
              : <><WifiOff size={12} />Polling</>}
          </div>
          {lastUpdate && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
              <Clock size={12} />
              {lastUpdate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
          )}
          <button onClick={() => load(true)} disabled={isRefreshing}
            className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700
              text-sm font-semibold text-white rounded-xl shadow-sm shadow-indigo-200
              transition-colors disabled:opacity-50">
            <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
            {isRefreshing ? 'Actualizando' : 'Actualizar'}
          </button>
        </div>
      </div>

      {/* CONECTIVIDAD */}
      {connectivity.length > 0 && (
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Estado de sensores</p>
          <div className="flex flex-wrap gap-2">
            {connectivity.map(s => <ConnectivityBadge key={s.sensor_id} sensor={s} />)}
          </div>
          <div className="mt-3 flex flex-wrap gap-4">
            {connectivity.map(s => (
              <div key={s.sensor_id} className="text-xs text-slate-400">
                <span className="font-bold text-slate-600">{s.sensor_id}</span>
                {s.last_seen ? ` · Último dato: ${formatAge(s.seconds_ago)}` : ' · Sin datos'}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ALERTAS */}
      {alerts.length > 0 ? (
        <div className="bg-rose-50 border border-rose-100 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={18} className="text-rose-500 animate-pulse" />
            <span className="text-sm font-bold text-rose-700">
              {alerts.length} incidencia{alerts.length > 1 ? 's' : ''} activa{alerts.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {alerts.slice(0, 3).map((a, i) => (
              <div key={i} className={`text-xs font-medium px-3 py-2 rounded-xl
                ${a.level === 'critical' ? 'bg-rose-100 text-rose-800 border border-rose-200' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
                {a.message}
              </div>
            ))}
            {alerts.length > 3 && <p className="text-xs text-rose-500 font-medium pl-1">+{alerts.length - 3} más en el panel de estado</p>}
          </div>
        </div>
      ) : (
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-5 py-3 flex items-center gap-3">
          <ShieldCheck size={18} className="text-emerald-500" />
          <span className="text-sm font-semibold text-emerald-700">Sistema operando con normalidad — Sin alertas activas</span>
        </div>
      )}

      {/* BATERÍA + ENERGÍA HOY */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

        {/* SOC — ahora con método visible */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Estado de carga (SOC)</p>
            <div className="flex items-center gap-2">
              {/* Badge del método de cálculo */}
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border
                ${socMethod === 'OCV'     ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : socMethod === 'Coulomb' ? 'bg-blue-50 border-blue-200 text-blue-700'
                :                          'bg-slate-50 border-slate-200 text-slate-500'}`}>
                {socMethod}
              </span>
              <span className={`text-2xl font-black
                ${soc == null ? 'text-slate-400' : soc > 60 ? 'text-emerald-600' : soc > 20 ? 'text-amber-600' : 'text-rose-600'}`}>
                {soc != null ? `${soc}%` : '—'}
              </span>
            </div>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-4 overflow-hidden shadow-inner">
            <div className={`h-full rounded-full transition-all duration-1000 ${battColor}`} style={{ width: `${soc ?? 0}%` }} />
          </div>
          <div className="flex justify-between text-xs font-semibold text-slate-400 mt-2 px-0.5">
            <span>0%</span><span>50%</span><span>100%</span>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
            <Battery size={13} />
            <span>Tensión: <strong className="text-slate-700">{current?.v_bateria ?? '—'} V</strong></span>
            {/* Horas desde calibración si disponible */}
            {socData?.hours_since_calib != null && (
              <span className="ml-auto text-[10px] text-slate-300">
                cal. hace {socData.hours_since_calib}h
              </span>
            )}
          </div>
        </div>

        {/* Energía hoy */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Energía hoy</p>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { label: 'Generada',  value: energySummary?.gen_ah,  color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { label: 'Consumida', value: energySummary?.load_ah, color: 'text-indigo-600',  bg: 'bg-indigo-50'  },
              { label: 'Neto',      value: energySummary?.net_ah,  color: energySummary?.net_ah >= 0 ? 'text-amber-600' : 'text-rose-600', bg: energySummary?.net_ah >= 0 ? 'bg-amber-50' : 'bg-rose-50' },
            ].map(item => (
              <div key={item.label} className={`${item.bg} rounded-xl p-3`}>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{item.label}</p>
                <p className={`text-lg font-black ${item.color}`}>
                  {item.value != null ? `${Number(item.value).toFixed(1)}` : '—'}
                  <span className="text-[10px] font-normal ml-0.5">Ah</span>
                </p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
            <Zap size={13} />
            <span>Generando ahora: <strong className={`${(current?.i_generada ?? 0) > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>{current?.i_generada ?? '—'} A</strong></span>
          </div>
        </div>
      </div>

      {/* KPIs CON SPARKLINES */}
      <div>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">
          Telemetría en tiempo real · {sensorId}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
          {VARIABLES.map(v => (
            <OverviewCard
              key={v.key}
              variable={v}
              current={current?.[v.key]}
              previous={previous?.[v.key]}
              sparkPoints={sparklines[v.key] ?? []}
            />
          ))}
        </div>
      </div>

      {/* MULTI-SENSOR */}
      {allSensors.length > 1 && (
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">
            Comparativa de sensores — Últimas lecturas
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                <tr>
                  <th className="pb-3 pr-4">Sensor</th>
                  {VARIABLES.map(v => <th key={v.key} className="pb-3 px-3 text-right whitespace-nowrap">{v.label}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {allSensors.map(s => {
                  const snap = snapshots[s];
                  const conn = connectivity.find(c => c.sensor_id === s);
                  return (
                    <tr key={s} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${conn?.connected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                          <span className="font-bold text-slate-800 font-mono text-xs">{s}</span>
                        </div>
                      </td>
                      {VARIABLES.map(v => (
                        <td key={v.key} className="py-3 px-3 text-right">
                          <span className={`font-semibold ${v.text}`}>{snap?.[v.key] ?? '—'}</span>
                          <span className="text-xs text-slate-400 ml-1">{v.unit}</span>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
};

export default OverviewView;