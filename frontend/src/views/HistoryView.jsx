/**
 * HistoryView.jsx
 * ---------------
 * Dashboard principal de histórico con soporte para múltiples sensores,
 * estadísticas dinámicas y exportación de datos.
 */

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { api } from '../services/api';
import {
  Loader2, Calendar, RefreshCw, Activity, AlertCircle,
  Download, BarChart2, X, GitCompare, ZoomOut
} from 'lucide-react';
import { Line } from 'react-chartjs-2';
import SelectDash from '../utils/SelectDash';
import CompareView from '../utils/CompareView';
import SOCChart from '../utils/SOChart';
import { fmtAxis } from '../utils/formatTimestamp';
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  PointElement, LineElement, Tooltip, Legend, Filler
} from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler, zoomPlugin);

// ── CONFIGURACIÓN DE VARIABLES ──────────────────────────────
const VARIABLES = [
  { key: 'radiacion',  label: 'Radiación solar', unit: 'W/m²', color: '#F59E0B', yMin: 0,  yMax: 1000 },
  { key: 'temp_amb',   label: 'Temp. ambiente',  unit: '°C',   color: '#F43F5E', yMin: 10, yMax: 60   },
  { key: 'i_generada', label: 'Corriente gen.',  unit: 'A',    color: '#10B981', yMin: 0,  yMax: 1    },
  { key: 'v_bateria',  label: 'Tensión batería', unit: 'V',    color: '#7C3AED', yMin: 10, yMax: 16   },
  { key: 'temp_pan',   label: 'Temp. panel',     unit: '°C',   color: '#3B82F6', yMin: 10, yMax: 60   },
  { key: 'i_carga',    label: 'Corriente carga', unit: 'A',    color: '#06B6D4', yMin: 0,  yMax: 1    },
  { key: 'temp_bat',   label: 'Temp. batería',   unit: '°C',   color: '#F97316', yMin: 10, yMax: 60   },
];

const TIME_FILTERS = [
  { label: '1h',   val: 1   },
  { label: '3h',   val: 3   },
  { label: '6h',   val: 6   },
  { label: '24h',  val: 24  },
  { label: '48h',  val: 48  },
  { label: '72h',  val: 72  },
  { label: '1sem', val: 168 },
  { label: '1mes', val: 720 },
];

const COMPARE_COLORS = ['#6366F1', '#EC4899', '#14B8A6', '#A855F7', '#0EA5E9'];

// ── COMPONENTES AUXILIARES ──────────────────────────────────
const StatsCard = ({ stats, unit, color }) => {
  if (!stats) return null;
  const items = [
    { label: 'Mín',    value: stats.min,    icon: '↓' },
    { label: 'Máx',    value: stats.max,    icon: '↑' },
    { label: 'Media',  value: stats.avg,    icon: '∅' },
    { label: 'Desv.',  value: stats.stddev, icon: '±' },
  ];
  return (
    <div className="grid grid-cols-4 gap-2 mt-3">
      {items.map(item => (
        <div key={item.label} className="bg-slate-50 rounded-xl px-2 py-2 text-center border border-slate-100">
          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">
            {item.icon} {item.label}
          </div>
          <div className="text-xs font-bold mt-0.5" style={{ color }}>
            {item.value ?? '—'} <span className="text-[9px] font-normal text-slate-400">{unit}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

const HistoryView = ({ sensorId = 's1' }) => {
  const [history, setHistory] = useState({});
  const [allSensors, setAllSensors] = useState([]);
  const [compareIds, setCompareIds] = useState([]);
  const [multiData, setMultiData] = useState({});
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState(24);
  const [error, setError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showStats, setShowStats] = useState(true);

  const autoSearchRef = useRef(true);
  const chartRefs = useRef({});

  // Cargar lista de sensores disponibles
  useEffect(() => {
    api.getSensors().then(res => setAllSensors(res?.sensors ?? [])).catch(() => {});
  }, []);

  // Función de carga de datos
  const load = useCallback(async (manual = false) => {
    if (manual) {
      setIsRefreshing(true);
      autoSearchRef.current = false;
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const [histResults, statsResults] = await Promise.all([
        Promise.all(VARIABLES.map(v => api.getHistoryAggregated(sensorId, v.key, hours).catch(() => null))),
        Promise.all(VARIABLES.map(v => api.getStats(sensorId, v.key, hours).catch(() => null))),
      ]);

      const hasData = histResults.some(res => res?.points?.length > 0);

      // Lógica de búsqueda automática si no hay datos
      if (!hasData && autoSearchRef.current) {
        const currentIndex = TIME_FILTERS.findIndex(f => f.val === hours);
        if (currentIndex >= 0 && currentIndex < TIME_FILTERS.length - 1) {
          setHours(TIME_FILTERS[currentIndex + 1].val);
          return;
        }
      }

      const map = {};
      VARIABLES.forEach((v, i) => {
        map[v.key] = {
          points: histResults[i]?.points ?? [],
          interval: histResults[i]?.interval ?? 'raw',
          stats: statsResults[i] ?? null,
        };
      });
      setHistory(map);
      autoSearchRef.current = false;
    } catch (e) {
      setError('Error al conectar con el servidor.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [sensorId, hours]);

  useEffect(() => { load(); }, [load]);

  // Carga de comparación multi-sensor
  useEffect(() => {
    if (!compareIds.length) { setMultiData({}); return; }
    const allIds = [sensorId, ...compareIds];
    Promise.all(VARIABLES.map(v => api.getMultiSensorHistory(allIds, v.key, hours).catch(() => null)))
      .then(results => {
        const map = {};
        VARIABLES.forEach((v, i) => { if (results[i]) map[v.key] = results[i]; });
        setMultiData(map);
      });
  }, [compareIds, sensorId, hours]);

  // Opciones de ChartJS
  const getBaseOptions = useCallback((v) => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: compareIds.length > 0, position: 'top', labels: { boxWidth: 12, font: { size: 10 } } },
      zoom: {
        pan: { enabled: true, mode: 'x' },
        zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' }
      },
      tooltip: {
        backgroundColor: 'rgba(255,255,255,0.97)',
        titleColor: '#64748B', bodyColor: '#0F172A',
        borderColor: '#E2E8F0', borderWidth: 1,
        padding: 12, cornerRadius: 12, usePointStyle: true,
      },
    },
    scales: {
      x: { ticks: { maxTicksLimit: 6, font: { size: 11 }, color: '#94A3B8' }, grid: { display: false } },
      y: { min: v.yMin, max: v.yMax, ticks: { maxTicksLimit: 5, font: { size: 11 }, color: '#94A3B8' }, grid: { borderDash: [4, 4], color: '#F1F5F9' } },
    },
  }), [compareIds.length]);

  const buildChartData = useCallback((v) => {
    const isMulti = compareIds.length > 0 && multiData[v.key];
    if (isMulti) {
      const series = multiData[v.key]?.series ?? [];
      return {
        labels: series[0]?.points.map(p => fmtAxis(p.timestamp, hours)) ?? [],
        datasets: series.map((s, idx) => ({
          label: s.sensor_id,
          data: s.points.map(p => p.value),
          borderColor: idx === 0 ? v.color : COMPARE_COLORS[idx - 1] || '#000',
          backgroundColor: `${idx === 0 ? v.color : COMPARE_COLORS[idx - 1]}18`,
          borderWidth: 2, pointRadius: 0, tension: 0.4, fill: idx === 0, spanGaps: true,
        })),
      };
    }

    const points = history[v.key]?.points ?? [];
    return {
      labels: points.map(p => fmtAxis(p.timestamp, hours)),
      datasets: [{
        label: v.label,
        data: points.map(p => p.value),
        borderColor: v.color,
        backgroundColor: `${v.color}15`,
        borderWidth: 2.5, pointRadius: 0, tension: 0.4, fill: true, spanGaps: true,
      }],
    };
  }, [history, multiData, compareIds, hours]);

  // Secciones para el Dashboard Dinámico
  const chartSections = useMemo(() => {
    const charts = VARIABLES.map(v => ({
      id: v.key,
      title: v.label,
      render: () => {
        const data = buildChartData(v);
        const isEmpty = !data.datasets[0]?.data?.length;
        return (
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all flex flex-col group">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: v.color }} />
                <span className="font-bold text-slate-800 text-sm">{v.label}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => chartRefs.current[v.key]?.resetZoom()} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><ZoomOut size={14}/></button>
              </div>
            </div>
            {showStats && history[v.key]?.stats && <StatsCard stats={history[v.key].stats} unit={v.unit} color={v.color} />}
            <div className="h-48 mt-4 relative">
              {isEmpty ? <div className="flex items-center justify-center h-full text-slate-400 text-xs">Sin datos</div> : 
              <Line ref={el => chartRefs.current[v.key] = el} data={data} options={getBaseOptions(v)} />}
            </div>
          </div>
        );
      }
    }));

    // Añadimos la vista de comparación avanzada como sección final
    charts.push({
      id: 'advanced-compare',
      title: 'Comparador Avanzado',
      render: () => <CompareView sensorId={sensorId} />
    });

    return charts;
  }, [history, buildChartData, getBaseOptions, showStats, sensorId]);

  return (
    <div className="flex flex-col gap-6 w-full p-4 md:p-6 animate-in fade-in duration-500">
      {/* CABECERA DE CONTROL */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-4">
        <div className="flex flex-col md:flex-row justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl"><Calendar size={24} /></div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Análisis Histórico</h2>
              <p className="text-xs text-slate-500 font-mono">Nodo: {sensorId}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowStats(!showStats)} className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${showStats ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-500'}`}>
              <BarChart2 size={14} className="inline mr-2"/> Estadísticas
            </button>
            <button onClick={() => load(true)} disabled={isRefreshing} className="flex items-center gap-2 px-5 py-2 bg-indigo-600 rounded-xl text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
              <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} /> {isRefreshing ? 'Cargando' : 'Actualizar'}
            </button>
          </div>
        </div>

        {/* FILTROS DE TIEMPO */}
        <div className="flex bg-slate-100 p-1 rounded-xl w-fit border border-slate-200">
          {TIME_FILTERS.map(opt => (
            <button key={opt.val} onClick={() => { autoSearchRef.current = false; setHours(opt.val); }} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${hours === opt.val ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-900'}`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="p-4 bg-rose-50 text-rose-700 rounded-xl border border-rose-100 flex gap-3"><AlertCircle size={18}/> {error}</div>}

      {/* DASHBOARD PRINCIPAL */}
      {loading && !Object.keys(history).length ? (
        <div className="h-96 flex flex-col items-center justify-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
          <Loader2 className="animate-spin text-indigo-500 mb-2" size={32} />
          <p className="text-slate-500 text-sm">Cargando telemetría...</p>
        </div>
      ) : (
        <SelectDash 
          storageKey={`historyDash:${sensorId}`} 
          headerTitle="Telemetría Detallada" 
          sections={chartSections} 
        />
      )}

      {/* SOC CHART */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
          <Activity size={18} className="text-indigo-500"/>
          <h3 className="font-bold text-slate-800 text-sm">Gestión Energética (SOC)</h3>
        </div>
        <div className="p-6">
          <SOCChart sensorId={sensorId} hours={hours} />
        </div>
      </div>
    </div>
  );
};

export default HistoryView;