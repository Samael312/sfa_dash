/**
 * HistoryView.jsx
 * ---------------
 * Mejoras Fase 3:
 * - Downsampling automático via endpoint /history/aggregated
 * - Estadísticas por variable (min/max/media/stddev)
 * - Exportar CSV
 * - Comparación multi-sensor en la misma gráfica
 * - Búsqueda automática de datos (Fallback si hay 502 o no hay datos)
 * - Zoom y Paneo interactivo en gráficas
 */

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { api } from '../services/api';
import {
  Loader2, Calendar, RefreshCw, Activity, AlertCircle,
  Download, BarChart2, X, GitCompare, ZoomOut
} from 'lucide-react';
import { Line } from 'react-chartjs-2';
import SelectDash from '../utils/SelectDash';
import SOCChart from '../utils/SOChart';
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  PointElement, LineElement, Tooltip, Legend, Filler
} from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';

// Registrar el plugin de zoom
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler, zoomPlugin);

const VARIABLES = [
  { key: 'radiacion',  label: 'Radiación solar', unit: 'W/m²', color: '#F59E0B', tcolor: 'text-amber-500'   },
  { key: 'temp_amb',   label: 'Temp. ambiente',  unit: '°C',   color: '#F43F5E', tcolor: 'text-rose-500'    },
  { key: 'i_generada', label: 'Corriente gen.',  unit: 'A',    color: '#10B981', tcolor: 'text-emerald-500' },
  { key: 'v_bateria',  label: 'Tensión batería', unit: 'V',    color: '#7C3AED', tcolor: 'text-purple-800'  },
  { key: 'temp_pan',   label: 'Temp. panel',     unit: '°C',   color: '#3B82F6', tcolor: 'text-blue-800'    },
  { key: 'i_carga',    label: 'Corriente carga', unit: 'A',    color: '#06B6D4', tcolor: 'text-cyan-500'    },
  { key: 'temp_bat',   label: 'Temp. batería',   unit: '°C',   color: '#F97316', tcolor: 'text-orange-500'  },
];

const TIME_FILTERS = [
  { label: '1h',   val: 1   },
  { label: '3h',   val: 3   },
  { label: '6h',   val: 6   },
  { label: '24h',  val: 24  },
  { label: '48h',  val: 48  },
  { label: '72h',  val: 72  },
  { label: '1sem', val: 168 },
  { label: '2sem', val: 336 },
  { label: '1mes', val: 720 },
];

const COMPARE_COLORS = [
  '#6366F1', '#EC4899', '#14B8A6', '#A855F7',
  '#0EA5E9', '#84CC16', '#EAB308',
];

// ─── Tarjeta de estadísticas ──────────────────────────────────
const StatsCard = ({ stats, unit, color }) => {
  if (!stats) return null;
  const items = [
    { label: 'Mín',    value: stats.min,    icon: '↓' },
    { label: 'Máx',    value: stats.max,    icon: '↑' },
    { label: 'Media',  value: stats.avg,    icon: '∅' },
    { label: 'σ Desv. Est.',      value: stats.stddev, icon: '±' },
  ];
  return (
    <div className="grid grid-cols-4 gap-2 mt-3">
      {items.map(item => (
        <div key={item.label} className="bg-slate-50 rounded-xl px-3 py-2 text-center">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            {item.icon} {item.label}
          </div>
          <div className="text-sm font-bold mt-0.5" style={{ color }}>
            {item.value ?? '—'} <span className="text-[10px] font-normal text-slate-400">{unit}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── Exportar CSV ─────────────────────────────────────────────
const exportCSV = (variable, points, sensorId, hours) => {
  if (!points?.length) return;
  const header = 'timestamp,value\n';
  const rows   = points.map(p => `${p.timestamp},${p.value}`).join('\n');
  const blob   = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement('a');
  a.href       = url;
  a.download   = `${sensorId}_${variable}_${hours}h.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

// ─── Selector de sensores para comparación ───────────────────
const SensorCompareSelector = ({ allSensors, primaryId, compareIds, onChange }) => {
  const available = allSensors.filter(s => s !== primaryId);
  if (!available.length) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
        Comparar con:
      </span>
      {available.map(sid => {
        const active = compareIds.includes(sid);
        return (
          <button
            key={sid}
            onClick={() => {
              if (active) onChange(compareIds.filter(s => s !== sid));
              else        onChange([...compareIds, sid]);
            }}
            className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all
              ${active
                ? 'bg-indigo-600 border-indigo-600 text-white'
                : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'}`}
          >
            {active && <X size={10} className="inline mr-1" />}
            {sid}
          </button>
        );
      })}
    </div>
  );
};

// ─── Componente principal ─────────────────────────────────────
const HistoryView = ({ sensorId = 's1' }) => {
  const [history,      setHistory]      = useState({});
  const [allSensors,   setAllSensors]   = useState([]);
  const [compareIds,   setCompareIds]   = useState([]);
  const [multiData,    setMultiData]    = useState({});
  const [loading,      setLoading]      = useState(true);
  const [hours,        setHours]        = useState(24);
  const [error,        setError]        = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showStats,    setShowStats]    = useState(true);

  // Referencias para el modo "Búsqueda Automática" y para las instancias de las gráficas (para el Zoom)
  const autoSearchRef = useRef(true); 
  const chartRefs     = useRef({});

  // Cargar lista de sensores para comparación
  useEffect(() => {
    api.getSensors()
      .then(res => setAllSensors(res?.sensors ?? []))
      .catch(() => {});
  }, []);

  // Carga principal: historial agregado + stats por variable
  const load = useCallback(async (manual = false) => {
    if (manual) {
      setIsRefreshing(true);
      autoSearchRef.current = false; // Detener auto-búsqueda si el usuario actualiza a mano
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const [histResults, statsResults] = await Promise.all([
        Promise.all(VARIABLES.map(v => api.getHistoryAggregated(sensorId, v.key, hours).catch(() => null))),
        Promise.all(VARIABLES.map(v => api.getStats(sensorId, v.key, hours).catch(() => null))),
      ]);

      // Lógica de Fallback Automático: Verificar si TODAS las consultas vinieron vacías o dieron error
      const hasData = histResults.some(res => res && res.points && res.points.length > 0);

      if (!hasData && autoSearchRef.current) {
        const currentIndex = TIME_FILTERS.findIndex(f => f.val === hours);
        if (currentIndex >= 0 && currentIndex < TIME_FILTERS.length - 1) {
          const nextHours = TIME_FILTERS[currentIndex - 1].val;
          console.log(`[Auto-Búsqueda] Sin datos en ${hours}h. Buscando en ${nextHours}h...`);
          setHours(nextHours);
          return; // Salimos prematuramente, el cambio de estado 'hours' relanzará este hook.
        } else {
          // Si llegamos aquí, hemos probado todos los filtros y no hay nada
          autoSearchRef.current = false;
        }
      }

      const map = {};
      VARIABLES.forEach((v, i) => {
        map[v.key] = {
          points:   histResults[i]?.points ?? [],
          interval: histResults[i]?.interval ?? 'raw',
          stats:    statsResults[i] ?? null,
        };
      });
      setHistory(map);
    } catch {
      setError('Error al cargar el historial.');
      autoSearchRef.current = false;
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [sensorId, hours]);

  useEffect(() => { load(); }, [load]);

  // Carga multi-sensor cuando hay sensores en comparación
  useEffect(() => {
    if (!compareIds.length) { setMultiData({}); return; }
    const allIds = [sensorId, ...compareIds];

    Promise.all(
      VARIABLES.map(v =>
        api.getMultiSensorHistory(allIds, v.key, hours).catch(() => null)
      )
    ).then(results => {
      const map = {};
      VARIABLES.forEach((v, i) => {
        if (results[i]) map[v.key] = results[i];
      });
      setMultiData(map);
    });
  }, [compareIds, sensorId, hours]);

  // Configuración base de ChartJS (Con Zoom Habilitado)
  const baseOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: compareIds.length > 0, position: 'top' },
      zoom: {
        pan: {
          enabled: true,
          mode: 'x', // Permite arrastrar en el eje X
        },
        zoom: {
          wheel: { enabled: true }, // Zoom con rueda del ratón
          pinch: { enabled: true }, // Zoom pellizcando (móviles)
          mode: 'x', // Solo zoom temporal (eje X)
        }
      },
      tooltip: {
        backgroundColor: 'rgba(255,255,255,0.97)',
        titleColor:      '#64748B',
        bodyColor:       '#0F172A',
        borderColor:     '#E2E8F0',
        borderWidth:     1,
        titleFont:       { size: 12, family: 'inherit' },
        bodyFont:        { size: 13, weight: 'bold', family: 'inherit' },
        padding:         12,
        cornerRadius:    12,
        displayColors:   true,
        boxPadding:      6,
        usePointStyle:   true,
      },
    },
    scales: {
      x: {
        ticks:  { maxTicksLimit: 6, font: { size: 11 }, color: '#94A3B8' },
        grid:   { display: false },
        border: { display: false },
      },
      y: {
        ticks:  { maxTicksLimit: 5, font: { size: 11 }, color: '#94A3B8' },
        grid:   { color: '#F1F5F9', borderDash: [4, 4] },
        border: { display: false },
      },
    },
  }), [compareIds.length]);

  // Construir datasets para cada variable
  const buildChartData = useCallback((v) => {
    const isMulti = compareIds.length > 0 && multiData[v.key];

    if (isMulti) {
      const series = multiData[v.key]?.series ?? [];
      return {
        labels: series[0]?.points.map(p => {
          const d = new Date(p.timestamp);
          return hours > 24
            ? d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
            : d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        }) ?? [],
        datasets: series.map((s, idx) => ({
          label:            s.sensor_id,
          data:             s.points.map(p => p.value),
          borderColor:      idx === 0 ? v.color : COMPARE_COLORS[idx - 1] ?? COMPARE_COLORS[0],
          backgroundColor:  `${idx === 0 ? v.color : COMPARE_COLORS[idx - 1]}18`,
          borderWidth:      2.5,
          pointRadius:      0,
          pointHoverRadius: 6,
          tension:          0.4,
          fill:             idx === 0,
          spanGaps:         true,
        })),
      };
    }

    // Sensor único
    const points = history[v.key]?.points ?? [];
    return {
      labels: points.map(p => {
        const d = new Date(p.timestamp);
        return hours > 24
          ? d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
          : d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      }),
      datasets: [{
        label:            v.label,
        data:             points.map(p => p.value),
        borderColor:      v.color,
        backgroundColor:  `${v.color}15`,
        borderWidth:      2.5,
        pointRadius:      0,
        pointHoverRadius: 6,
        tension:          0.4,
        fill:             true,
        spanGaps:         true,
      }],
    };
  }, [history, multiData, compareIds, hours]);

  // Secciones para SelectDash
  const chartSections = useMemo(() => VARIABLES.map(v => ({
    id:          v.key,
    title:       v.label,
    defaultMode: 'show',
    render: () => {
      const data     = buildChartData(v);
      const isEmpty  = data.datasets[0]?.data?.length === 0;
      const stats    = history[v.key]?.stats;
      const interval = history[v.key]?.interval;

      return (
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all flex flex-col group">

          {/* Cabecera tarjeta */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <span className="w-3 h-3 rounded-full shadow-sm flex-shrink-0"
                style={{ backgroundColor: v.color }} />
              <span className="font-bold" style={{ color: v.color }}>{v.label}</span>
              {interval && interval !== 'raw' && (
                <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                  agr. {interval}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 bg-slate-50 px-2.5 py-1 rounded-lg uppercase tracking-wider mr-2">
                {v.unit}
              </span>
              
              {/* Botón para resetear Zoom (Solo se muestra en hover) */}
              <button
                onClick={() => chartRefs.current[v.key]?.resetZoom()}
                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                title="Restablecer vista / zoom"
              >
                <ZoomOut size={16} />
              </button>

              <button
                onClick={() => exportCSV(v.key, history[v.key]?.points, sensorId, hours)}
                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                title="Exportar CSV"
              >
                <Download size={16} />
              </button>
            </div>
          </div>

          {/* Estadísticas */}
          {showStats && stats && (
            <StatsCard stats={stats} unit={v.unit} color={v.color} />
          )}

          {/* Gráfica */}
          <div className="flex-1 relative w-full min-h-[200px] mt-4">
            {isEmpty ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center
                text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                <Activity size={28} className="mb-3 opacity-30" strokeWidth={1.5} />
                <span className="text-sm font-medium">Sin datos en este periodo</span>
              </div>
            ) : (
              <Line
                ref={(el) => { chartRefs.current[v.key] = el; }} // Guardar ref para el zoom
                data={data}
                options={baseOptions}
                role="img"
                aria-label={`Historial de ${v.label} en las últimas ${hours}h`}
              />
            )}
          </div>
        </div>
      );
    },
  })), [history, buildChartData, baseOptions, showStats, sensorId, hours]);

  return (
    <div className="flex flex-col gap-6 w-full mx-auto p-4 md:p-6 text-slate-800 font-sans animate-in fade-in duration-500">

      {/* HEADER */}
      <div className="bg-white p-5 lg:p-6 rounded-2xl shadow-sm border border-slate-100
        flex flex-col gap-5">

        {/* Fila 1: título + acciones */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-center gap-5">
            <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-2xl shadow-sm border border-indigo-100/50">
              <Calendar size={26} strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900">Análisis Histórico</h2>
              <div className="flex items-center gap-2 text-sm text-slate-500 mt-0.5">
                <span>Nodo activo:</span>
                <span className="font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md font-mono text-xs">
                  {sensorId}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            {/* Toggle estadísticas */}
            <button
              onClick={() => setShowStats(v => !v)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-all
                ${showStats
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                  : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-200'}`}
            >
              <BarChart2 size={14} />
              Estadísticas
            </button>

            <button
              onClick={() => load(true)}
              disabled={loading || isRefreshing}
              className="flex items-center gap-2 px-5 py-2 bg-indigo-600 border border-transparent
                rounded-xl text-sm font-semibold text-white hover:bg-indigo-700 shadow-sm
                shadow-indigo-200 transition-colors disabled:opacity-50 h-[38px]"
            >
              <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
              {isRefreshing ? 'Actualizando' : 'Actualizar'}
            </button>
          </div>
        </div>

        {/* Fila 2: filtros de tiempo */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="overflow-x-auto pb-1 -mb-1 scrollbar-hide flex-1">
            <div className="flex bg-slate-100/80 p-1 rounded-xl w-max border border-slate-200/50">
              {TIME_FILTERS.map(opt => (
                <button
                  key={opt.val}
                  onClick={() => {
                    autoSearchRef.current = false; // El usuario tomó el control, detenemos la auto-búsqueda
                    setHours(opt.val);
                  }}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap
                    ${hours === opt.val
                      ? 'bg-white shadow-sm text-indigo-600 ring-1 ring-slate-200/50'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50'}`}
                  aria-pressed={hours === opt.val}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Fila 3: comparación multi-sensor */}
        {allSensors.length > 1 && (
          <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
            <GitCompare size={15} className="text-slate-400 flex-shrink-0" />
            <SensorCompareSelector
              allSensors={allSensors}
              primaryId={sensorId}
              compareIds={compareIds}
              onChange={setCompareIds}
            />
          </div>
        )}
      </div>

      {/* ERROR */}
      {error && !autoSearchRef.current && (
        <div className="bg-white border border-rose-100 p-5 flex items-center gap-4
          text-rose-700 shadow-sm rounded-2xl animate-in slide-in-from-top-2">
          <div className="p-2 bg-rose-50 rounded-full">
            <AlertCircle size={20} className="text-rose-500" />
          </div>
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {/* GRÁFICAS */}
      {loading && !Object.keys(history).length ? (
        <div className="flex flex-col items-center justify-center h-96 bg-slate-50/50
          rounded-3xl border border-dashed border-slate-200 animate-in fade-in">
          <Loader2 className="animate-spin text-indigo-500 mb-4" size={40} />
          <p className="text-sm text-slate-500 font-medium tracking-tight animate-pulse">
            Procesando registros históricos...
          </p>
        </div>
      ) : (
        <SelectDash
          storageKey={`historyDashboard:sections:${sensorId}`}
          headerTitle="Telemetría Detallada"
          sections={chartSections}
        />
      )}

      {/* SOC */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-5 flex items-center gap-2 bg-slate-50/30">
          <Activity size={20} className="text-indigo-400" />
          <h3 className="text-base font-semibold text-slate-800">Gestión de Energía (SOC)</h3>
        </div>
        <div className="p-4 sm:p-6">
          <SOCChart sensorId={sensorId} hours={hours} title="Estado de carga vs. Tensión de batería" />
        </div>
      </div>

    </div>
  );
};

export default HistoryView;