import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../services/api';
import { Loader2 } from 'lucide-react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  PointElement, LineElement, Tooltip, Legend, Filler
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

const VARIABLES = [
  { key: 'radiacion_solar',      label: 'Radiación solar',    unit: 'W/m²', color: '#F59E0B' },
  { key: 'temperatura_ambiente', label: 'Temp. ambiente',     unit: '°C',   color: '#EF4444' },
  { key: 'corriente_generada',   label: 'Corriente generada', unit: 'A',    color: '#10B981' },
  { key: 'tension_bateria',      label: 'Tensión batería',    unit: 'V',    color: '#3B82F6' },
  { key: 'corriente_bateria',    label: 'Corriente batería',  unit: 'A',    color: '#8B5CF6' },
  { key: 'corriente_carga',      label: 'Corriente carga',    unit: 'A',    color: '#06B6D4' },
  { key: 'temperatura_bateria',  label: 'Temp. batería',      unit: '°C',   color: '#F97316' },
];

const chartOptions = {
  responsive: true,
  plugins: { legend: { display: false } },
  scales: {
    x: { ticks: { maxTicksLimit: 6, font: { size: 11 } } },
    y: { ticks: { maxTicksLimit: 5, font: { size: 11 } } },
  },
};

const HistoryView = () => {
  const [history, setHistory] = useState({});
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState(24);

  const load = useCallback(async () => {
    setLoading(true);
    const results = await Promise.all(
      VARIABLES.map(v => api.getSFAHistory(v.key, hours))
    );
    const map = {};
    VARIABLES.forEach((v, i) => { map[v.key] = results[i]?.points ?? []; });
    setHistory(map);
    setLoading(false);
  }, [hours]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col gap-6">

      {/* Selector rango */}
      <div className="bg-white px-5 py-4 rounded shadow border border-gray-200 flex items-center gap-4">
        <span className="text-sm font-bold text-gray-700 uppercase">Rango temporal</span>
        {[
          { label: '6 horas', value: 6 },
          { label: '24 horas', value: 24 },
          { label: '48 horas', value: 48 },
          { label: '7 días', value: 168 },
        ].map(opt => (
          <button
            key={opt.value}
            onClick={() => setHours(opt.value)}
            className={`px-4 py-1.5 rounded text-sm font-medium border transition-colors
              ${hours === opt.value
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-600'}`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Gráficas */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="animate-spin text-blue-500" size={40} />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {VARIABLES.map(v => {
            const points = history[v.key] ?? [];
            const chartData = {
              labels: points.map(p =>
                new Date(p.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
              ),
              datasets: [{
                label: `${v.label} (${v.unit})`,
                data: points.map(p => p.value),
                borderColor: v.color,
                backgroundColor: v.color + '18',
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.3,
                fill: true,
              }],
            };
            return (
              <div key={v.key} className="bg-white p-5 rounded shadow border border-gray-200">
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: v.color }} />
                  <span className="font-semibold text-gray-700 text-sm">{v.label}</span>
                  <span className="text-xs text-gray-400 ml-auto">{v.unit}</span>
                </div>
                <Line data={chartData} options={chartOptions} />
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
};

export default HistoryView;