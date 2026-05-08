/**
 * CompareView.jsx
 * ---------------
 * Panel de comparación de variables en un rango de tiempo específico.
 * Permite seleccionar fecha/hora inicio y fin, elegir qué variables
 * mostrar y ver todas en una misma gráfica con ejes Y normalizados.
 *
 * Integración en HistoryView: añadir como sección adicional en SelectDash
 * o como tab independiente dentro del mismo componente.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  PointElement, LineElement, Tooltip, Legend, Filler
} from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
import {
  GitCompare, RefreshCw, ZoomOut, Download,
  AlertCircle, Loader2, X, CheckSquare, Square,
  Calendar, Clock, TrendingUp
} from 'lucide-react';
import { api } from '../services/api';
import { fmtAxis } from '../utils/formatTimestamp';

ChartJS.register(
  CategoryScale, LinearScale,
  PointElement, LineElement, Tooltip, Legend, Filler,
  zoomPlugin
);

// ── Configuración de variables ──────────────────────────────
const VARIABLES = [
  { key: 'radiacion',  label: 'Radiación solar', unit: 'W/m²', color: '#F59E0B', yMin: 0,   yMax: 1000 },
  { key: 'temp_amb',   label: 'Temp. ambiente',  unit: '°C',   color: '#F43F5E', yMin: 10,  yMax: 60   },
  { key: 'i_generada', label: 'Corriente gen.',  unit: 'A',    color: '#10B981', yMin: 0,   yMax: 1    },
  { key: 'v_bateria',  label: 'Tensión batería', unit: 'V',    color: '#7C3AED', yMin: 10,  yMax: 16   },
  { key: 'temp_pan',   label: 'Temp. panel',     unit: '°C',   color: '#3B82F6', yMin: 10,  yMax: 60   },
  { key: 'i_carga',    label: 'Corriente carga', unit: 'A',    color: '#06B6D4', yMin: 0,   yMax: 1    },
  { key: 'temp_bat',   label: 'Temp. batería',   unit: '°C',   color: '#F97316', yMin: 10,  yMax: 60   },
];

// ── Helper: datetime-local input value ← → Date ────────────
const toInputValue = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const fromInputValue = (val) => val ? new Date(val) : null;

// ── Helper: calcular horas entre dos fechas ──────────────────
const hoursBetween = (start, end) => {
  if (!start || !end) return 24;
  return Math.max(1, Math.round(Math.abs(end - start) / 36e5));
};

// ── Normalización para eje Y compartido (0-100%) ─────────────
const normalize = (value, min, max) => {
  if (max === min) return 50;
  return ((value - min) / (max - min)) * 100;
};

// ── Exportar CSV con todas las variables ─────────────────────
const exportCSV = (datasets, labels, sensorId) => {
  if (!datasets.length) return;
  const headers = ['timestamp', ...datasets.map(d => d.label)].join(',');
  const rows = labels.map((label, i) => {
    const vals = datasets.map(d => d.rawData?.[i] ?? '');
    return [label, ...vals].join(',');
  });
  const blob = new Blob([[headers, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `${sensorId}_comparacion.csv`; a.click();
  URL.revokeObjectURL(url);
};

// ── Componente principal ─────────────────────────────────────
const CompareView = ({ sensorId = 's1' }) => {
  // Rango de tiempo — por defecto últimas 6 horas
  const now     = new Date();
  const sixAgo  = new Date(now.getTime() - 6 * 3600 * 1000);

  const [startDate,    setStartDate]    = useState(sixAgo);
  const [endDate,      setEndDate]      = useState(now);
  const [startInput,   setStartInput]   = useState(toInputValue(sixAgo));
  const [endInput,     setEndInput]     = useState(toInputValue(now));

  // Variables seleccionadas — por defecto las 4 más relevantes
  const [selected, setSelected] = useState(
    new Set(['radiacion', 'v_bateria', 'i_generada', 'temp_amb'])
  );

  // Modo de visualización: 'normalized' (0-100 shared Y) o 'raw' (dual Y)
  const [viewMode, setViewMode] = useState('normalized');

  // Datos y estado
  const [data,        setData]        = useState({});  // { variable: points[] }
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const [hasLoaded,   setHasLoaded]   = useState(false);

  const chartRef = useRef(null);

  // ── Cargar datos ────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!startDate || !endDate || startDate >= endDate) {
      setError('El rango de fechas no es válido. El inicio debe ser anterior al fin.');
      return;
    }
    if (selected.size === 0) {
      setError('Selecciona al menos una variable.');
      return;
    }

    setLoading(true);
    setError(null);

    const hours = hoursBetween(startDate, endDate);

    try {
      const results = await Promise.all(
        [...selected].map(key =>
          api.getSFAHistory(sensorId, key, hours).catch(() => null)
        )
      );

      const map = {};
      [...selected].forEach((key, i) => {
        const raw = results[i]?.points ?? [];
        // Filtrar al rango exacto seleccionado
        map[key] = raw.filter(p => {
          const ts = new Date(p.timestamp);
          return ts >= startDate && ts <= endDate;
        });
      });

      setData(map);
      setHasLoaded(true);
    } catch (e) {
      setError('Error al cargar los datos. Comprueba la conexión.');
    } finally {
      setLoading(false);
    }
  }, [sensorId, startDate, endDate, selected]);

  // ── Toggle variable ─────────────────────────────────────────
  const toggleVar = (key) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size === 1) return prev; // mínimo 1
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // ── Sincronizar inputs con estado ───────────────────────────
  const handleStartChange = (val) => {
    setStartInput(val);
    const d = fromInputValue(val);
    if (d) setStartDate(d);
  };

  const handleEndChange = (val) => {
    setEndInput(val);
    const d = fromInputValue(val);
    if (d) setEndDate(d);
  };

  // ── Presets de tiempo ───────────────────────────────────────
  const applyPreset = (hours) => {
    const end   = new Date();
    const start = new Date(end.getTime() - hours * 3600 * 1000);
    setStartDate(start); setStartInput(toInputValue(start));
    setEndDate(end);     setEndInput(toInputValue(end));
  };

  // ── Construir chartData ─────────────────────────────────────
  const buildChartData = () => {
    const activeVars = VARIABLES.filter(v => selected.has(v.key) && data[v.key]?.length);
    if (!activeVars.length) return null;

    // Unión de todos los timestamps ordenados
    const allTs = [...new Set(
      activeVars.flatMap(v => data[v.key].map(p => p.timestamp))
    )].sort();

    const labels = allTs.map(ts => fmtAxis(ts, hoursBetween(startDate, endDate)));

    const datasets = activeVars.map(v => {
      const pointMap = Object.fromEntries(data[v.key].map(p => [p.timestamp, p.value]));
      const rawData  = allTs.map(ts => pointMap[ts] ?? null);

      const values = viewMode === 'normalized'
        ? rawData.map(val => val != null ? normalize(val, v.yMin, v.yMax) : null)
        : rawData;

      return {
        label:           `${v.label} (${v.unit})`,
        data:            values,
        rawData,         // para tooltip y CSV
        borderColor:     v.color,
        backgroundColor: `${v.color}12`,
        borderWidth:     2,
        pointRadius:     0,
        pointHoverRadius: 5,
        tension:         0.4,
        fill:            false,
        spanGaps:        true,
      };
    });

    return { labels, datasets };
  };

  const chartData = hasLoaded ? buildChartData() : null;

  // ── Opciones del chart ──────────────────────────────────────
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: { usePointStyle: true, pointStyle: 'circle', font: { size: 11 } },
      },
      zoom: {
        pan:  { enabled: true, mode: 'x' },
        zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' },
      },
      tooltip: {
        backgroundColor: 'rgba(255,255,255,0.97)',
        titleColor:      '#64748B',
        bodyColor:       '#0F172A',
        borderColor:     '#E2E8F0',
        borderWidth:     1,
        padding:         12,
        cornerRadius:    12,
        usePointStyle:   true,
        callbacks: {
          // Si está normalizado, mostrar el valor real en el tooltip
          label: (ctx) => {
            if (viewMode !== 'normalized') {
              return ` ${ctx.dataset.label}: ${ctx.parsed.y}`;
            }
            const raw = ctx.dataset.rawData?.[ctx.dataIndex];
            // Extraer unidad del label: "Radiación solar (W/m²)" → "W/m²"
            const unit = ctx.dataset.label.match(/\((.+)\)/)?.[1] ?? '';
            return ` ${ctx.dataset.label.replace(/ \(.+\)/, '')}: ${raw ?? '—'} ${unit}`;
          },
        },
      },
    },
    scales: {
      x: {
        ticks:  { maxTicksLimit: 8, font: { size: 11 }, color: '#94A3B8' },
        grid:   { display: false },
        border: { display: false },
      },
      y: {
        min: viewMode === 'normalized' ? 0 : undefined,
        max: viewMode === 'normalized' ? 100 : undefined,
        ticks: {
          maxTicksLimit: 6,
          font:  { size: 11 },
          color: '#94A3B8',
          callback: viewMode === 'normalized' ? v => `${v}%` : v => v,
        },
        grid:   { color: '#F1F5F9', borderDash: [4, 4] },
        border: { display: false },
      },
    },
  };

  const hours = hoursBetween(startDate, endDate);

  return (
    <div className="flex flex-col gap-5 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">

      {/* ── CABECERA ── */}
      <div className="px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/40">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
            <GitCompare size={20} strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800">Comparador de Variables</h3>
            <p className="text-xs text-slate-500 mt-0.5">Visualiza múltiples variables en el mismo gráfico</p>
          </div>
        </div>

        {/* Modo de visualización */}
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/50">
            <button
              onClick={() => setViewMode('normalized')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap
                ${viewMode === 'normalized'
                  ? 'bg-white shadow-sm text-indigo-600 ring-1 ring-slate-200/50'
                  : 'text-slate-500 hover:text-slate-800'}`}>
              Normalizado (%)
            </button>
            <button
              onClick={() => setViewMode('raw')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap
                ${viewMode === 'raw'
                  ? 'bg-white shadow-sm text-indigo-600 ring-1 ring-slate-200/50'
                  : 'text-slate-500 hover:text-slate-800'}`}>
              Valores reales
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 flex flex-col gap-5">

        {/* ── SELECTOR DE RANGO ── */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-slate-400" />
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Rango de tiempo</span>
          </div>

          {/* Presets */}
          <div className="flex flex-wrap gap-2">
            {[
              { label: '1h',   h: 1   },
              { label: '3h',   h: 3   },
              { label: '6h',   h: 6   },
              { label: '12h',  h: 12  },
              { label: '24h',  h: 24  },
              { label: '48h',  h: 48  },
              { label: '1sem', h: 168 },
            ].map(p => (
              <button
                key={p.h}
                onClick={() => applyPreset(p.h)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all
                  ${hours === p.h && !loading
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                    : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-200 hover:text-indigo-600'}`}>
                {p.label}
              </button>
            ))}
          </div>

          {/* Inputs de fecha */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Clock size={10} /> Inicio
              </label>
              <input
                type="datetime-local"
                value={startInput}
                onChange={e => handleStartChange(e.target.value)}
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700
                  focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400
                  bg-slate-50/50 transition-all"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Clock size={10} /> Fin
              </label>
              <input
                type="datetime-local"
                value={endInput}
                onChange={e => handleEndChange(e.target.value)}
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700
                  focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400
                  bg-slate-50/50 transition-all"
              />
            </div>
          </div>
        </div>

        {/* ── SELECTOR DE VARIABLES ── */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp size={14} className="text-slate-400" />
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Variables a comparar</span>
            <span className="text-[10px] text-slate-400 ml-1">({selected.size} seleccionadas)</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {VARIABLES.map(v => {
              const isSelected = selected.has(v.key);
              return (
                <button
                  key={v.key}
                  onClick={() => toggleVar(v.key)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-xs
                    font-semibold transition-all text-left
                    ${isSelected
                      ? 'border-transparent text-white shadow-sm'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}
                  style={isSelected ? { backgroundColor: v.color } : {}}
                >
                  {isSelected
                    ? <CheckSquare size={14} className="flex-shrink-0" />
                    : <Square size={14} className="flex-shrink-0 text-slate-300" />
                  }
                  <span className="leading-tight truncate">{v.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── BOTÓN CARGAR ── */}
        <button
          onClick={load}
          disabled={loading || selected.size === 0}
          className="flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-600
            hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl
            shadow-sm shadow-indigo-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto self-start">
          {loading
            ? <><Loader2 size={16} className="animate-spin" /> Cargando...</>
            : <><RefreshCw size={16} /> Generar gráfica</>
          }
        </button>

        {/* ── ERROR ── */}
        {error && (
          <div className="flex items-center gap-3 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3 text-rose-700">
            <AlertCircle size={16} className="flex-shrink-0" />
            <span className="text-sm font-medium">{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-rose-400 hover:text-rose-600">
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {/* ── GRÁFICA ── */}
      {hasLoaded && (
        <div className="px-6 pb-6">
          <div className="group relative bg-slate-50/50 rounded-2xl border border-slate-100 p-4">

            {/* Controles de la gráfica */}
            <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
              <button
                onClick={() => chartRef.current?.resetZoom()}
                className="p-1.5 text-slate-400 bg-white/90 backdrop-blur border border-slate-200
                  shadow-sm hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all
                  opacity-0 group-hover:opacity-100"
                title="Restablecer zoom">
                <ZoomOut size={14} />
              </button>
              {chartData && (
                <button
                  onClick={() => exportCSV(chartData.datasets, chartData.labels, sensorId)}
                  className="p-1.5 text-slate-400 bg-white/90 backdrop-blur border border-slate-200
                    shadow-sm hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all
                    opacity-0 group-hover:opacity-100"
                  title="Exportar CSV">
                  <Download size={14} />
                </button>
              )}
            </div>

            {/* Info del rango */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Rango:
              </span>
              <span className="text-xs text-slate-600 font-medium bg-white px-2 py-0.5 rounded-lg border border-slate-200">
                {startDate?.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                {' — '}
                {endDate?.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
              {viewMode === 'normalized' && (
                <span className="text-[10px] text-indigo-500 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-lg font-semibold">
                  Valores normalizados 0–100%
                </span>
              )}
            </div>

            {/* Chart o empty state */}
            {chartData ? (
              <div className="h-80">
                <Line ref={chartRef} data={chartData} options={chartOptions} />
              </div>
            ) : (
              <div className="h-80 flex flex-col items-center justify-center text-slate-400
                border border-dashed border-slate-200 rounded-xl bg-white/50">
                <GitCompare size={32} className="mb-3 opacity-30" strokeWidth={1.5} />
                <p className="text-sm font-medium">Sin datos en el rango seleccionado</p>
                <p className="text-xs mt-1 text-slate-300">Prueba con un rango de tiempo más amplio</p>
              </div>
            )}
          </div>

          {/* ── TABLA RESUMEN ESTADÍSTICO ── */}
          {chartData && chartData.datasets.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="pb-2 pr-4 font-bold text-slate-400 uppercase tracking-wider">Variable</th>
                    <th className="pb-2 px-3 text-right font-bold text-slate-400 uppercase tracking-wider">Mín</th>
                    <th className="pb-2 px-3 text-right font-bold text-slate-400 uppercase tracking-wider">Máx</th>
                    <th className="pb-2 px-3 text-right font-bold text-slate-400 uppercase tracking-wider">Media</th>
                    <th className="pb-2 px-3 text-right font-bold text-slate-400 uppercase tracking-wider">Último</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {chartData.datasets.map((ds, idx) => {
                    const raw    = ds.rawData?.filter(v => v != null) ?? [];
                    const varCfg = VARIABLES.find(v => ds.label.includes(v.label));
                    const unit   = varCfg?.unit ?? '';
                    const min    = raw.length ? Math.min(...raw).toFixed(2) : '—';
                    const max    = raw.length ? Math.max(...raw).toFixed(2) : '—';
                    const avg    = raw.length ? (raw.reduce((a, b) => a + b, 0) / raw.length).toFixed(2) : '—';
                    const last   = raw.length ? raw[raw.length - 1].toFixed(2) : '—';
                    return (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-2 pr-4">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: varCfg?.color ?? '#94a3b8' }} />
                            <span className="font-medium text-slate-700">{varCfg?.label ?? ds.label}</span>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-600">{min} <span className="text-slate-400">{unit}</span></td>
                        <td className="py-2 px-3 text-right font-mono text-slate-600">{max} <span className="text-slate-400">{unit}</span></td>
                        <td className="py-2 px-3 text-right font-mono text-slate-600">{avg} <span className="text-slate-400">{unit}</span></td>
                        <td className="py-2 px-3 text-right font-mono text-slate-600">{last} <span className="text-slate-400">{unit}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Estado inicial — sin cargar */}
      {!hasLoaded && !loading && (
        <div className="px-6 pb-6">
          <div className="h-48 flex flex-col items-center justify-center text-slate-300
            border border-dashed border-slate-200 rounded-2xl bg-slate-50/30">
            <GitCompare size={36} className="mb-3 opacity-40" strokeWidth={1.2} />
            <p className="text-sm font-medium text-slate-400">Configura el rango y pulsa "Generar gráfica"</p>
          </div>
        </div>
      )}

    </div>
  );
};

export default CompareView;