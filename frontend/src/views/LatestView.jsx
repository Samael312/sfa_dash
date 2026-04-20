/**
 * LatestView.jsx
 * --------------
 * Panel de última telemetría del nodo con indicadores de tendencia.
 * La tendencia se mantiene al navegar entre vistas usando un caché
 * a nivel de módulo (vive mientras la SPA no se recarga).
 */

import React, { useEffect, useState, useRef } from 'react';
import { api } from '../services/api';
import { 
  Loader2, RefreshCw, TrendingUp, TrendingDown, Minus,
  Sun, Thermometer, Zap, Battery, Cpu, Plug, 
  BarChart3, AlertTriangle, Clock
} from 'lucide-react';

const VARIABLES = [
  { key: 'radiacion',  label: 'Radiación solar', unit: 'W/m²', color: "text-amber-600",   icon: Sun,         colorTheme: 'amber'   },
  { key: 'temp_amb',   label: 'Temp. ambiente',  unit: '°C',   color: "text-rose-600",    icon: Thermometer, colorTheme: 'rose'    },
  { key: 'i_generada', label: 'Corr. generada',  unit: 'A',    color: "text-emerald-600", icon: Zap,         colorTheme: 'emerald' },
  { key: 'v_bateria',  label: 'Tensión batería', unit: 'V',    color: "text-indigo-600",  icon: Battery,     colorTheme: 'indigo'  },
  { key: 'temp_pan',   label: 'Temp. panel',     unit: '°C',   color: "text-purple-600",  icon: Cpu,         colorTheme: 'purple'  },
  { key: 'i_carga',    label: 'Corr. carga',     unit: 'A',    color: "text-cyan-600",    icon: Plug,        colorTheme: 'cyan'    },
  { key: 'temp_bat',   label: 'Temp. batería',   unit: '°C',   color: "text-orange-600",  icon: Thermometer, colorTheme: 'orange'  },
];

const getThemeClasses = (theme) => {
  const themes = {
    amber:   { bg: 'bg-amber-50',   text: 'text-amber-600',   icon: 'text-amber-500',   border: 'border-amber-100' },
    rose:    { bg: 'bg-rose-50',    text: 'text-rose-600',    icon: 'text-rose-500',    border: 'border-rose-100' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', icon: 'text-emerald-500', border: 'border-emerald-100' },
    indigo:  { bg: 'bg-indigo-50',  text: 'text-indigo-600',  icon: 'text-indigo-500',  border: 'border-indigo-100' },
    purple:  { bg: 'bg-purple-50',  text: 'text-purple-600',  icon: 'text-purple-500',  border: 'border-purple-100' },
    cyan:    { bg: 'bg-cyan-50',    text: 'text-cyan-600',    icon: 'text-cyan-500',    border: 'border-cyan-100' },
    orange:  { bg: 'bg-orange-50',  text: 'text-orange-600',  icon: 'text-orange-500',  border: 'border-orange-100' },
  };
  return themes[theme] || themes.indigo;
};

const TREND_THRESHOLD = 0.05; // 5% de cambio para considerar una tendencia significativa

// ─────────────────────────────────────────────────────────────
// Caché a nivel de módulo: sobrevive cambios de vista mientras
// la SPA esté montada. Se indexa por sensorId.
// ─────────────────────────────────────────────────────────────
const _cache = {};   // { [sensorId]: { current: {...}, previous: {...} } }

const getCache = (sensorId) => _cache[sensorId] ?? { current: null, previous: null };

const setCache = (sensorId, current, previous) => {
  _cache[sensorId] = { current, previous };
};

// ─────────────────────────────────────────────────────────────

const TrendIndicator = ({ current, previous, unit }) => {
  if (previous === null || previous === undefined) {
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

const LatestView = ({ sensorId = 's1' }) => {
  // Inicializamos desde el caché para que la tendencia sea inmediata al volver
  const [data, setData]       = useState(() => getCache(sensorId).current);
  const [prev, setPrev]       = useState(() => getCache(sensorId).previous);
  const [loading, setLoading] = useState(!getCache(sensorId).current);
  const [error, setError]     = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = async (manual = false) => {
    if (manual) setIsRefreshing(true);
    setError(null);
    try {
      const res = await api.getSFALatest(sensorId);

      // El "anterior" es lo que teníamos en caché como "actual"
      const cached = getCache(sensorId);
      const prevSnapshot = cached.current;

      setCache(sensorId, res, prevSnapshot);
      setPrev(prevSnapshot);
      setData(res);
    } catch {
      setError('Error al cargar los datos. Comprueba la conexión.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    // Si hay caché, no mostramos spinner pero refrescamos en segundo plano
    if (!getCache(sensorId).current) setLoading(true);
    load();
    const interval = setInterval(() => load(false), 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sensorId]);

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

        <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto">
          {data?.timestamp && (
            <div className="flex items-center gap-2 text-xs font-medium text-slate-400 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
              <Clock size={14} />
              {new Date(data.timestamp).toLocaleString('es-ES', {
                hour: '2-digit', minute: '2-digit', second: '2-digit'
              })}
            </div>
          )}
          <button
            onClick={() => load(true)}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-sm font-semibold text-white transition-colors disabled:opacity-50 rounded-xl shadow-sm shadow-indigo-200 flex-1 sm:flex-none justify-center"
          >
            <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
            {isRefreshing ? 'Actualizando' : 'Actualizar'}
          </button>
        </div>
      </div>

      {/* ERROR BANNER */}
      {error && (
        <div className="bg-white border border-rose-100 p-5 flex items-center gap-4 text-rose-700 shadow-sm rounded-2xl animate-in slide-in-from-top-2">
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
                <span className={`text-sm font-semibold ${v.color} leading-tight`}>
                  {v.label}
                </span>
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
                      <span className="font-bold text-slate-900 text-base">
                        {current ?? '—'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end">
                        <TrendIndicator current={current} previous={previous} unit="" />
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-slate-400">
                      {v.unit}
                    </td>
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