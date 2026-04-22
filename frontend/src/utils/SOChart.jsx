/**
 * SOChart.jsx
 * ------------
 * Gráfica dual-axis:
 * - Eje Y izquierdo: SOC estimado (%)  → línea azul
 * - Eje Y derecho:   Tensión batería (V) → línea verde
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  PointElement, LineElement,
  Tooltip, Legend, Filler, 
} from 'chart.js';
import { Loader2, ZoomOut, Download } from 'lucide-react';
import { api } from '../services/api';
import zoomPlugin from 'chartjs-plugin-zoom';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler, zoomPlugin);

const V_MIN  = 10.8; 
const V_MAX  = 14.4;
const toSOC  = v => Math.round(Math.max(0, Math.min(100, (v - V_MIN) / (V_MAX - V_MIN) * 100)) * 10) / 10;

// ─── Exportar CSV ─────────────────────────────────────────────
const exportCSV = (points, sensorId, hours) => {
  if (!points?.length) return;
  const header = 'timestamp,voltage,soc\n';
  const rows   = points.map(p => `${p.timestamp},${p.value},${toSOC(p.value)}`).join('\n');
  const blob   = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement('a');
  a.href       = url;
  a.download   = `${sensorId}_SOC_${hours}h.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

const SOCChart = ({ sensorId = 's1', hours = 24, title = 'Estado de carga (SOC)' }) => {
  const [points, setPoints]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  
  // CORRECCIÓN: useRef DEBE ir dentro del componente
  const chartRef = useRef(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      // Usamos el endpoint de historial (v_bateria es la clave)
      const res = await api.getSFAHistory(sensorId, 'v_bateria', hours);
      setPoints(res?.points ?? []);
    } catch (err) {
      setError('Error al cargar el historial de tensión.');
    } finally {
      setLoading(false);
    }
  }, [sensorId, hours]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  if (loading) return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 flex items-center justify-center h-64">
      <Loader2 className="animate-spin text-blue-500" size={32} />
    </div>
  );

  if (error) return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200">
      <p className="text-red-500 text-sm flex items-center gap-2">
        <span className="w-2 h-2 bg-red-500 rounded-full" /> {error}
      </p>
    </div>
  );

  if (points.length === 0) return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 flex items-center justify-center h-64">
      <p className="text-gray-400 text-sm italic">Sin datos de tensión en las últimas {hours} h</p>
    </div>
  );

  const labels   = points.map(p => {
    const d = new Date(p.timestamp);
    return hours > 24 
      ? d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      : d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  });
  
  const voltages = points.map(p => p.value);
  const socs     = voltages.map(toSOC);

  const chartData = {
    labels,
    datasets: [
      {
        label:           'SOC (%)',
        data:            socs,
        borderColor:     '#3B82F6',
        backgroundColor: '#3B82F615',
        borderWidth:     2.5,
        pointRadius:     0,
        pointHoverRadius: 5,
        tension:         0.4,
        fill:            true,
        yAxisID:         'ySoc',
      },
      {
        label:           'Tensión (V)',
        data:            voltages,
        borderColor:     '#10B981',
        backgroundColor: 'transparent',
        borderWidth:     1.5,
        borderDash:      [5, 5],
        pointRadius:     0,
        tension:         0.4,
        fill:            false,
        yAxisID:         'yVolt',
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: true, position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
      zoom: {
        pan: { enabled: true, mode: 'x' },
        zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' }
      },
      tooltip: {
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        titleColor: '#1f2937',
        bodyColor: '#1f2937',
        borderColor: '#e5e7eb',
        borderWidth: 1,
        padding: 10,
        displayColors: true,
        callbacks: {
          label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}${ctx.datasetIndex === 0 ? '%' : 'V'}`
        }
      }
    },
    scales: {
      x: { ticks: { maxTicksLimit: 7, font: { size: 10 }, color: '#9ca3af' }, grid: { display: false } },
      ySoc: {
        type: 'linear',
        position: 'left',
        min: 0,
        max: 100,
        ticks: { font: { size: 10 }, color: '#3b82f6', callback: v => `${v}%` },
        grid: { color: '#f3f4f6' }
      },
      yVolt: {
        type: 'linear',
        position: 'right',
        min: 10,
        max: 16,
        ticks: { font: { size: 10 }, color: '#10b981', callback: v => `${v}V` },
        grid: { display: false }
      },
    },
  };

  return (
    <div className="group bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)] flex-shrink-0" />
        <span className="font-bold text-slate-800 text-sm tracking-tight">{title}</span>
        <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded ml-auto uppercase">
          Últimas {hours}h
        </span>
        <span className="text-[10px] font-bold text-blue-400 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded">
          SOC 0–100%
        </span>
        <span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded">
          V 10–16V
        </span>
        <div className="flex items-center gap-1 ml-2">
          <button
            onClick={() => chartRef.current?.resetZoom()} 
            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
            title="Restablecer zoom"
          >
            <ZoomOut size={16} />
          </button>

          <button
            onClick={() => exportCSV(points, sensorId, hours)}
            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
            title="Exportar CSV"
          >
            <Download size={16} />
          </button>
        </div>
      </div>

      <div className="h-64 w-full">
        <Line 
          ref={chartRef} 
          data={chartData} 
          options={options} 
        />
      </div>
    </div>
  );
};

export default SOCChart;