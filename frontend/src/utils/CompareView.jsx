/**
 * CompareView.jsx
 * ---------------
 * Panel de comparación de variables en un rango de tiempo específico.
 *
 * Cambios:
 *  - Selectores de fecha simples (dropdowns) en lugar de datetime-local nativo
 *  - La gráfica SOLO se genera al pulsar "Generar gráfica" (no en tiempo real)
 *  - Selección de variables sin efecto inmediato en la gráfica
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  PointElement, LineElement, Tooltip, Legend, Filler
} from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
import {
  GitCompare, RefreshCw, ZoomOut, Download, Maximize2, Minimize2,
  AlertCircle, Loader2, X, CheckSquare, Square,
  TrendingUp, Image
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

// ── Helpers de fecha ─────────────────────────────────────────
const normalize = (value, min, max) => {
  if (max === min) return 50;
  return ((value - min) / (max - min)) * 100;
};

const hoursBetween = (s, e) => !s || !e ? 24 : Math.max(1, Math.round(Math.abs(e - s) / 36e5));

/** Devuelve { year, month, day, hour } en UTC a partir de un Date */
const dateToFields = (date) => {
  if (!date) return { year: 2025, month: 1, day: 1, hour: 0 };
  return {
    year:  date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day:   date.getUTCDate(),
    hour:  date.getUTCHours(),
  };
};

/** Construye un Date UTC a partir de campos */
const fieldsToDate = ({ year, month, day, hour }) =>
  new Date(Date.UTC(year, month - 1, day, hour, 0, 0));

/** Días del mes */
const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

// ── Componente selector de fecha ─────────────────────────────
const DatePicker = ({ label, value, onChange }) => {
  const fields = dateToFields(value);

  const set = (key, val) => {
    const next = { ...fields, [key]: Number(val) };
    // Ajustar día si sobrepasa el límite del mes
    const maxDay = daysInMonth(next.year, next.month);
    if (next.day > maxDay) next.day = maxDay;
    onChange(fieldsToDate(next));
  };

  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const years = Array.from({ length: 3 }, (_, i) => currentYear - i);
  const months = [
    'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
    'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
  ];
  const days = Array.from({ length: daysInMonth(fields.year, fields.month) }, (_, i) => i + 1);
  const hours = Array.from({ length: 24 }, (_, i) => i);

  const selectCls = `
    bg-white border border-slate-200 rounded-lg text-sm text-slate-700 font-medium
    focus:outline-none focus:ring-2 focus:ring-indigo-400/40 focus:border-indigo-400
    cursor-pointer transition-all px-2 py-1.5
  `;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
      <div className="flex items-center gap-1 flex-wrap">
        {/* Día */}
        <select value={fields.day} onChange={e => set('day', e.target.value)} className={selectCls}>
          {days.map(d => (
            <option key={d} value={d}>{String(d).padStart(2, '0')}</option>
          ))}
        </select>

        {/* Mes */}
        <select value={fields.month} onChange={e => set('month', e.target.value)} className={selectCls}>
          {months.map((m, i) => (
            <option key={i + 1} value={i + 1}>{m}</option>
          ))}
        </select>

        {/* Año */}
        <select value={fields.year} onChange={e => set('year', e.target.value)} className={selectCls}>
          {years.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>

        <span className="text-slate-300 font-light mx-0.5">–</span>

        {/* Hora */}
        <select value={fields.hour} onChange={e => set('hour', e.target.value)} className={selectCls}>
          {hours.map(h => (
            <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
          ))}
        </select>
        <span className="text-[10px] text-slate-400 font-semibold bg-slate-100 px-1.5 py-0.5 rounded">UTC</span>
      </div>
    </div>
  );
};

// ── Export CSV ────────────────────────────────────────────────
const exportCSV = (datasets, labels, sensorId) => {
  if (!datasets.length) return;
  const headers = ['timestamp', ...datasets.map(d => d.labelClean)].join(',');
  const rows    = labels.map((label, i) => {
    const vals = datasets.map(d => d.rawData?.[i] ?? '');
    return [label, ...vals].join(',');
  });
  const blob = new Blob([[headers, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `${sensorId}_comparacion.csv`; a.click();
  URL.revokeObjectURL(url);
};

// ── Export PNG ────────────────────────────────────────────────
const downloadPNG = (chartRef, datasets, startDate, endDate, sensorId, viewMode) => {
  if (!chartRef.current) return;
  const chartCanvas = chartRef.current.canvas;
  const PADDING = 20;
  const ROW_H   = 26;
  const TABLE_H = 50 + (datasets.length * ROW_H);
  const canvas  = document.createElement('canvas');
  canvas.width  = chartCanvas.width + PADDING * 2;
  canvas.height = PADDING + 50 + chartCanvas.height + TABLE_H + 30;
  const ctx     = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#0f172a';
  ctx.font      = 'bold 16px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`Comparación de variables — ${sensorId}`, PADDING, PADDING + 16);

  ctx.fillStyle = '#64748b';
  ctx.font      = '12px system-ui, sans-serif';
  const rangeStr = `${startDate?.toLocaleString('es-ES', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', timeZone:'UTC' })} → ${endDate?.toLocaleString('es-ES', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', timeZone:'UTC' })}  ·  ${viewMode === 'normalized' ? 'Normalizado 0–100%' : 'Valores reales'}`;
  ctx.fillText(rangeStr, PADDING, PADDING + 36);

  ctx.drawImage(chartCanvas, PADDING, PADDING + 50);

  const tableY0 = PADDING + 50 + chartCanvas.height + 30;
  const w = canvas.width - PADDING * 2;
  const colX = { var: PADDING, min: PADDING + w * 0.45, max: PADDING + w * 0.60, avg: PADDING + w * 0.75, last: PADDING + w * 0.90 };

  ctx.fillStyle = '#94a3b8';
  ctx.font      = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('VARIABLE', colX.var, tableY0);
  ctx.textAlign = 'right';
  ctx.fillText('MÍN', colX.min, tableY0);
  ctx.fillText('MÁX', colX.max, tableY0);
  ctx.fillText('MEDIA', colX.avg, tableY0);
  ctx.fillText('ÚLTIMO', colX.last, tableY0);

  ctx.beginPath();
  ctx.moveTo(PADDING, tableY0 + 10);
  ctx.lineTo(canvas.width - PADDING, tableY0 + 10);
  ctx.strokeStyle = '#f1f5f9';
  ctx.lineWidth = 2;
  ctx.stroke();

  datasets.forEach((ds, i) => {
    const y = tableY0 + 32 + (i * ROW_H);
    ctx.beginPath();
    ctx.arc(colX.var + 6, y - 4, 5, 0, Math.PI * 2);
    ctx.fillStyle = ds.borderColor;
    ctx.fill();
    ctx.fillStyle = '#334155';
    ctx.font      = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(ds.labelClean.split(' (')[0], colX.var + 18, y);

    const raw  = ds.rawData?.filter(v => v != null) ?? [];
    const unitMatch = ds.labelClean.match(/\((.+)\)/);
    const unit = unitMatch ? unitMatch[1] : '';
    const min  = raw.length ? Math.min(...raw).toFixed(2) : '—';
    const max  = raw.length ? Math.max(...raw).toFixed(2) : '—';
    const avg  = raw.length ? (raw.reduce((a, b) => a + b, 0) / raw.length).toFixed(2) : '—';
    const last = raw.length ? raw[raw.length - 1].toFixed(2) : '—';

    ctx.font      = '12px monospace';
    ctx.textAlign = 'right';
    const drawValue = (val, x) => {
      ctx.fillStyle = '#475569';
      const textWidth = ctx.measureText(` ${unit}`).width;
      ctx.fillText(val, x - textWidth, y);
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(` ${unit}`, x, y);
    };
    drawValue(min, colX.min);
    drawValue(max, colX.max);
    drawValue(avg, colX.avg);
    drawValue(last, colX.last);
  });

  ctx.fillStyle  = '#cbd5e1';
  ctx.font       = '10px system-ui, sans-serif';
  ctx.textAlign  = 'right';
  ctx.fillText(`SFA Dashboard · ${new Date().toLocaleString('es-ES')}`, canvas.width - PADDING, canvas.height - 10);

  const link = document.createElement('a');
  link.download = `${sensorId}_comparacion_${Date.now()}.png`;
  link.href     = canvas.toDataURL('image/png');
  link.click();
};

// ── Presets de tiempo ─────────────────────────────────────────
const TIME_PRESETS = [
  { label: '1h',   h: 1   },
  { label: '3h',   h: 3   },
  { label: '6h',   h: 6   },
  { label: '12h',  h: 12  },
  { label: '24h',  h: 24  },
  { label: '48h',  h: 48  },
  { label: '1sem', h: 168 },
  { label: '2sem', h: 336 },
  { label: '1mes', h: 720 },
];

// ── Componente principal ──────────────────────────────────────
const CompareView = ({ sensorId = 's1' }) => {
  const now    = new Date();
  const sixAgo = new Date(now.getTime() - 6 * 3600 * 1000);

  // Estado del formulario (no dispara carga automática)
  const [startDate, setStartDate] = useState(sixAgo);
  const [endDate,   setEndDate]   = useState(now);
  const [selected,  setSelected]  = useState(
    new Set(['radiacion', 'v_bateria', 'i_generada', 'temp_amb'])
  );
  const [viewMode,  setViewMode]  = useState('normalized');

  // Estado de la gráfica (solo se actualiza al pulsar el botón)
  const [chartData,      setChartData]      = useState(null);
  const [chartStart,     setChartStart]     = useState(null);
  const [chartEnd,       setChartEnd]       = useState(null);
  const [chartViewMode,  setChartViewMode]  = useState('normalized');

  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);
  const [hasLoaded,    setHasLoaded]    = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const chartRef     = useRef(null);
  const containerRef = useRef(null);

  // ── Fullscreen ────────────────────────────────────────────
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  // ── Preset rápido de tiempo ───────────────────────────────
  const applyPreset = (h) => {
    const end   = new Date();
    const start = new Date(end.getTime() - h * 3600 * 1000);
    setStartDate(start);
    setEndDate(end);
  };

  // ── Toggle variable ───────────────────────────────────────
  const toggleVar = (key) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size === 1) return prev;
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // ── CARGAR DATOS (solo al pulsar el botón) ────────────────
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

    try {
      const results = await Promise.all(
        [...selected].map(key =>
          api.getSFAHistory(sensorId, key, startDate.toISOString(), endDate.toISOString())
            .catch(() => null)
        )
      );

      const rawData = {};
      [...selected].forEach((key, i) => {
        rawData[key] = results[i]?.points ?? [];
      });

      // Construir datos del gráfico
      const activeVars = VARIABLES.filter(v => selected.has(v.key) && rawData[v.key]?.length);

      if (!activeVars.length) {
        setError('No hay datos en el rango seleccionado. Prueba con un rango más amplio.');
        setHasLoaded(false);
        return;
      }

      const hours = hoursBetween(startDate, endDate);
      const allTs = [...new Set(
        activeVars.flatMap(v => rawData[v.key].map(p => p.timestamp))
      )].sort();

      const labels = allTs.map(ts => fmtAxis(ts, hours));

      const datasets = activeVars.map(v => {
        const pointMap = Object.fromEntries(rawData[v.key].map(p => [p.timestamp, p.value]));
        const raw      = allTs.map(ts => pointMap[ts] ?? null);
        const values   = viewMode === 'normalized'
          ? raw.map(val => val != null ? normalize(val, v.yMin, v.yMax) : null)
          : raw;

        return {
          label:        `${v.label} (${v.unit})`,
          labelClean:   `${v.label} (${v.unit})`,
          data:         values,
          rawData:      raw,
          borderColor:     v.color,
          backgroundColor: `${v.color}12`,
          borderWidth:     2,
          pointRadius:     0,
          pointHoverRadius: 5,
          tension:     0.4,
          fill:        false,
          spanGaps:    true,
        };
      });

      // Guardar snapshot del estado activo de la gráfica
      setChartData({ labels, datasets });
      setChartStart(startDate);
      setChartEnd(endDate);
      setChartViewMode(viewMode);
      setHasLoaded(true);

    } catch {
      setError('Error al cargar los datos. Comprueba la conexión.');
    } finally {
      setLoading(false);
    }
  }, [sensorId, startDate, endDate, selected, viewMode]);

  // ── Opciones del gráfico ──────────────────────────────────
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    animation: { duration: 300 },
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
          label: (ctx) => {
            if (chartViewMode !== 'normalized') return ` ${ctx.dataset.label}: ${ctx.parsed.y}`;
            const raw  = ctx.dataset.rawData?.[ctx.dataIndex];
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
        min: chartViewMode === 'normalized' ? 0 : undefined,
        max: chartViewMode === 'normalized' ? 100 : undefined,
        ticks: {
          maxTicksLimit: 6, font: { size: 11 }, color: '#94A3B8',
          callback: chartViewMode === 'normalized' ? v => `${v}%` : v => v,
        },
        grid:   { color: '#F1F5F9', borderDash: [4, 4] },
        border: { display: false },
      },
    },
  };

  const hours = hoursBetween(startDate, endDate);

  return (
    <div
      ref={containerRef}
      className={`flex flex-col gap-5 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden
        ${isFullscreen ? 'fixed inset-0 z-[300] rounded-none border-none overflow-y-auto p-0' : ''}`}
    >
      {/* ── CABECERA ── */}
      <div className={`px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/40
        ${isFullscreen ? 'sticky top-0 z-10 bg-white shadow-sm' : ''}`}>
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
            <GitCompare size={20} strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800">Comparador de Variables</h3>
            <p className="text-xs text-slate-500 mt-0.5">Configura el rango y pulsa "Generar gráfica"</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Modo normalizado / real */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/50">
            <button
              onClick={() => setViewMode('normalized')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap
                ${viewMode === 'normalized' ? 'bg-white shadow-sm text-indigo-600 ring-1 ring-slate-200/50' : 'text-slate-500 hover:text-slate-800'}`}
            >
              Normalizado (%)
            </button>
            <button
              onClick={() => setViewMode('raw')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap
                ${viewMode === 'raw' ? 'bg-white shadow-sm text-indigo-600 ring-1 ring-slate-200/50' : 'text-slate-500 hover:text-slate-800'}`}
            >
              Valores reales
            </button>
          </div>

          {/* Pantalla completa */}
          <button
            onClick={toggleFullscreen}
            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl border border-slate-200 transition-all"
            title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>

      <div className="px-6 flex flex-col gap-5">

        {/* ── PRESETS RÁPIDOS ── */}
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Atajos rápidos</span>
          <div className="flex flex-wrap gap-1.5">
            {TIME_PRESETS.map(p => (
              <button
                key={p.h}
                onClick={() => applyPreset(p.h)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all
                  ${hours === p.h
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                    : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-200 hover:text-indigo-600'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── SELECTOR DE FECHAS ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
          <DatePicker label="Inicio" value={startDate} onChange={setStartDate} />
          <DatePicker label="Fin"    value={endDate}   onChange={setEndDate}   />
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
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all text-left
                    ${isSelected ? 'border-transparent text-white shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}
                  style={isSelected ? { backgroundColor: v.color } : {}}
                >
                  {isSelected
                    ? <CheckSquare size={14} className="flex-shrink-0" />
                    : <Square      size={14} className="flex-shrink-0 text-slate-300" />}
                  <span className="leading-tight truncate">{v.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── BOTÓN PRINCIPAL ── */}
        <button
          onClick={load}
          disabled={loading || selected.size === 0}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600
            hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-semibold rounded-xl
            shadow-sm shadow-indigo-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed
            w-full sm:w-auto self-start"
        >
          {loading
            ? <><Loader2 size={16} className="animate-spin" /> Cargando...</>
            : <><RefreshCw size={16} /> Generar gráfica</>}
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

      {/* ── GRÁFICA (solo si hay datos cargados) ── */}
      {hasLoaded && chartData && (
        <div className="px-6 pb-6">
          <div className="group relative bg-slate-50/50 rounded-2xl border border-slate-100 p-4">

            {/* Controles superiores */}
            <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
              <button
                onClick={() => chartRef.current?.resetZoom()}
                className="p-1.5 text-slate-400 bg-white/90 backdrop-blur border border-slate-200
                  shadow-sm hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all
                  opacity-0 group-hover:opacity-100"
                title="Restablecer zoom"
              >
                <ZoomOut size={14} />
              </button>

              <button
                onClick={() => downloadPNG(chartRef, chartData.datasets, chartStart, chartEnd, sensorId, chartViewMode)}
                className="p-1.5 text-slate-400 bg-white/90 backdrop-blur border border-slate-200
                  shadow-sm hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-all
                  opacity-0 group-hover:opacity-100"
                title="Descargar gráfica PNG"
              >
                <Image size={14} />
              </button>

              <button
                onClick={() => exportCSV(chartData.datasets, chartData.labels, sensorId)}
                className="p-1.5 text-slate-400 bg-white/90 backdrop-blur border border-slate-200
                  shadow-sm hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all
                  opacity-0 group-hover:opacity-100"
                title="Exportar datos CSV"
              >
                <Download size={14} />
              </button>
            </div>

            {/* Info del rango activo en la gráfica */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mostrando:</span>
              <span className="text-xs text-slate-600 font-medium bg-white px-2 py-0.5 rounded-lg border border-slate-200">
                {chartStart?.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}
                {' — '}
                {chartEnd?.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}
              </span>
              {chartViewMode === 'normalized' && (
                <span className="text-[10px] text-indigo-500 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-lg font-semibold">
                  Valores normalizados 0–100%
                </span>
              )}
            </div>

            {/* Chart */}
            <div className={isFullscreen ? 'h-[60vh]' : 'h-80'}>
              <Line ref={chartRef} data={chartData} options={chartOptions} />
            </div>
          </div>

          {/* ── TABLA ESTADÍSTICA ── */}
          {chartData.datasets.length > 0 && (
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
                            <span
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: varCfg?.color ?? '#94a3b8' }}
                            />
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

      {/* ── Estado inicial ── */}
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