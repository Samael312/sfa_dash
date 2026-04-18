/**
 * SOChart.jsx
 * ------------
 * Gráfica dual-axis:
 *   - Eje Y izquierdo: SOC estimado (%)  → línea azul
 *   - Eje Y derecho:   Tensión batería (V) → línea verde
 *
 * El SOC se calcula a partir del histórico de v_bateria:
 *   SOC(%) = clamp((V - 11.0) / 3.4 * 100, 0, 100)
 *
 * Props:
 *   sensorId  string  — sensor a consultar
 *   hours     number  — ventana temporal (por defecto 24)
 *   title     string  — título del panel (opcional)
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  PointElement, LineElement,
  Tooltip, Legend, Filler
} from 'chart.js';
import { Loader2 } from 'lucide-react';
import { api } from '../services/api';

ChartJS.register(
  CategoryScale, LinearScale,
  PointElement, LineElement,
  Tooltip, Legend, Filler
);

const V_MIN  = 11.0;
const V_MAX  = 14.4;
const toSOC  = v => Math.round(Math.max(0, Math.min(100, (v - V_MIN) / (V_MAX - V_MIN) * 100)) * 10) / 10;

const SOCChart = ({ sensorId = 's1', hours = 24, title = 'Estado de carga (SOC)' }) => {
  const [points, setPoints]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.getSFAHistory(sensorId, 'v_bateria', hours);
      setPoints(res?.points ?? []);
    } catch {
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
    <div className="bg-white p-5 rounded shadow border border-gray-200 flex items-center justify-center h-48">
      <Loader2 className="animate-spin text-blue-500" size={32} />
    </div>
  );

  if (error) return (
    <div className="bg-white p-5 rounded shadow border border-gray-200">
      <p className="text-red-500 text-sm">{error}</p>
    </div>
  );

  if (points.length === 0) return (
    <div className="bg-white p-5 rounded shadow border border-gray-200 flex items-center justify-center h-48">
      <p className="text-gray-400 text-sm">Sin datos de tensión en las últimas {hours} h</p>
    </div>
  );

  const labels   = points.map(p =>
    new Date(p.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  );
  const voltages = points.map(p => p.value);
  const socs     = voltages.map(toSOC);

  const chartData = {
    labels,
    datasets: [
      {
        label:           'SOC (%)',
        data:            socs,
        borderColor:     '#3B82F6',
        backgroundColor: '#3B82F620',
        borderWidth:     2,
        pointRadius:     0,
        tension:         0.3,
        fill:            true,
        yAxisID:         'ySoc',
      },
      {
        label:           'Tensión (V)',
        data:            voltages,
        borderColor:     '#10B981',
        backgroundColor: 'transparent',
        borderWidth:     1.5,
        borderDash:      [4, 3],
        pointRadius:     0,
        tension:         0.3,
        fill:            false,
        yAxisID:         'yVolt',
      },
    ],
  };

  const options = {
    responsive: true,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: true, position: 'top' },
      tooltip: {
        callbacks: {
          label: ctx => {
            if (ctx.datasetIndex === 0) return ` SOC: ${ctx.parsed.y} %`;
            return ` Tensión: ${ctx.parsed.y} V`;
          }
        }
      }
    },
    scales: {
      x: {
        ticks: { maxTicksLimit: 6, font: { size: 11 } }
      },
      ySoc: {
        type:     'linear',
        position: 'left',
        min:      0,
        max:      100,
        title:    { display: true, text: 'SOC (%)', font: { size: 11 } },
        ticks:    {
          maxTicksLimit: 6,
          font: { size: 11 },
          callback: v => `${v}%`
        },
        grid: { color: '#F3F4F6' },
      },
      yVolt: {
        type:     'linear',
        position: 'right',
        min:      10.5,
        max:      15.0,
        title:    { display: true, text: 'V', font: { size: 11 } },
        ticks:    {
          maxTicksLimit: 6,
          font: { size: 11 },
          callback: v => `${v}V`
        },
        grid: { drawOnChartArea: false },
      },
    },
  };

  return (
    <div className="bg-white p-5 rounded shadow border border-gray-200">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-3 h-3 rounded-full bg-blue-500 flex-shrink-0" />
        <span className="font-semibold text-gray-700 text-sm">{title}</span>
        <span className="text-xs text-gray-400 ml-auto">Últimas {hours} h</span>
      </div>
      <Line data={chartData} options={options} />
    </div>
  );
};

export default SOCChart;