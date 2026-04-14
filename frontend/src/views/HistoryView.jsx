import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '../services/api';
import { Loader2, Calendar, RefreshCw } from 'lucide-react';
import { Line } from 'react-chartjs-2';
import SelectDash from '../utils/SelectDash';
import SOCChart from '../utils/SOChart';
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
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { ticks: { maxTicksLimit: 6, font: { size: 10 } }, grid: { display: false } },
    y: { ticks: { maxTicksLimit: 5, font: { size: 10 } }, grid: { color: '#f1f5f9' } },
  },
};

const HistoryView = ({ sensorId = 'sensor1' }) => {
  const [history, setHistory] = useState({});
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState(24);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.all(
        VARIABLES.map(v => api.getSFAHistory(sensorId, v.key, hours))
      );
      const map = {};
      VARIABLES.forEach((v, i) => { map[v.key] = results[i]?.points ?? []; });
      setHistory(map);
    } catch (e) {
      setError('Error al cargar el historial. Comprueba la conexión.');
    } finally {
      setLoading(false);
    }
  }, [sensorId, hours]);

  useEffect(() => { load(); }, [load]);

  // Transformamos las VARIABLES en secciones para SelectDash
  const chartSections = useMemo(() => {
    return VARIABLES.map((v) => ({
      id: v.key,
      title: v.label,
      defaultMode: 'show',
      render: () => {
        const points = history[v.key] ?? [];
        const isEmpty = points.length === 0;

        const chartData = {
          labels: points.map(p =>
            new Date(p.timestamp).toLocaleTimeString('es-ES', {
              hour: '2-digit', minute: '2-digit'
            })
          ),
          datasets: [{
            label: `${v.label} (${v.unit})`,
            data: points.map(p => p.value),
            borderColor: v.color,
            backgroundColor: v.color + '18',
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.3,
            fill: true,
          }],
        };

        return (
          <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm transition-all hover:shadow-md h-full">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: v.color }} />
              <span className="font-bold text-gray-700 text-sm tracking-tight">{v.label}</span>
              <span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full ml-auto">
                {v.unit}
              </span>
            </div>

            <div className="h-48 relative">
              {isEmpty ? (
                <div className="flex items-center justify-center h-full text-xs text-gray-400 italic">
                  Sin datos registrados
                </div>
              ) : (
                <Line data={chartData} options={chartOptions} />
              )}
            </div>
          </div>
        );
      }
    }));
  }, [history]);

  return (
    <div className="flex flex-col gap-6 p-1 animate-in fade-in duration-500">
      
      {/* HEADER CONTROLS */}
      <div className="bg-white px-5 py-4 rounded-xl shadow-sm border border-gray-200 flex flex-wrap items-center gap-4 justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
              <Calendar size={18} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase leading-none">Sensor Activo</p>
              <p className="text-sm font-bold text-blue-700">{sensorId}</p>
            </div>
          </div>

          <div className="h-8 w-px bg-gray-200 mx-2 hidden sm:block" />

          <div className="flex bg-gray-100 p-1 rounded-lg">
            {[
              { label: '1h',  val: 1 },
              { label: '3h',  val: 3 },
              { label: '6h',  val: 6 },
              { label: '24h', val: 24 },
              { label: '48h', val: 48 },
              { label: '72h', val: 72 },
              { label: '1s',  val: 168 },
              { label: '2s', val: 336 },
              { label: '1m', val: 720 },
            ].map(opt => (
              <button
                key={opt.val}
                onClick={() => setHours(opt.val)}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                  hours === opt.val
                    ? 'bg-white shadow-sm text-blue-600'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-50 hover:border-blue-300 hover:text-blue-600 transition-all disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded shadow-sm text-sm">
          {error}
        </div>
      )}

      {/* VISUALIZACIONES PRINCIPALES (USANDO SELECTDASH) */}
      {loading ? (
        <div className="flex flex-col items-center justify-center h-80 bg-white rounded-xl border border-dashed border-gray-300">
          <Loader2 className="animate-spin text-blue-500 mb-3" size={32} />
          <p className="text-sm text-gray-400 font-medium">Sincronizando telemetría...</p>
        </div>
      ) : (
        <SelectDash
          storageKey={`historyDashboard:sections:${sensorId}`}
          headerTitle="Métricas del Sistema"
          sections={chartSections}
        />
      )}

      {/* SECCIÓN ESPECIAL: SOC (FUERA DE SELECTDASH O PUEDES INCLUIRLO DENTRO) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
         <SOCChart 
            sensorId={sensorId} 
            hours={hours} 
            title="Estado de carga (SOC) + Tensión batería" 
         />
      </div>

    </div>
  );
};

export default HistoryView;