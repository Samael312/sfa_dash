/**
 * HistoryView.jsx
 * --------------
 * Panel de análisis histórico y tendencias.
 * Estilo: Premium, Modern SaaS con mejoras de accesibilidad (a11y) en gráficas.
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '../services/api';
import { Loader2, Calendar, RefreshCw, Activity, AlertCircle } from 'lucide-react';
import { Line } from 'react-chartjs-2';
import SelectDash from '../utils/SelectDash';
import SOCChart from '../utils/SOChart';
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  PointElement, LineElement, Tooltip, Legend, Filler
} from 'chart.js';

// Registrar componentes de ChartJS
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

// Colores unificados con la paleta de Tailwind del dashboard
const VARIABLES = [
  { key: 'radiacion',  label: 'Radiación solar', tcolor:"text-amber-500", unit: 'W/m²',   color: '#F59E0B' }, // Amber 500
  { key: 'temp_amb',   label: 'Temp. ambiente',  tcolor:"text-rose-500", unit: '°C',      color: '#F43F5E' }, // Rose 500
  { key: 'i_generada', label: 'Corriente gen.',  tcolor:"text-emerald-500", unit: 'A',    color: '#10B981' }, // Emerald 500
  { key: 'v_bateria',  label: 'Tensión batería', tcolor:"text-purple-800", unit: 'V',     color: '#7C3AED' }, // Purple 500
  { key: 'temp_pan',   label: 'Temp. panel',     tcolor:"text-blue-800", unit: '°C',      color: '#3B82F6' }, // Blue 500
  { key: 'i_carga',    label: 'Corriente carga', tcolor:"text-cyan-500", unit: 'A',       color: '#06B6D4' }, // Cyan 500
  { key: 'temp_bat',   label: 'Temp. batería',   tcolor:"text-orange-500", unit: '°C',    color: '#F97316' }, // Orange 500
];

const TIME_FILTERS = [
  { label: '1h',   val: 1 },
  { label: '3h',   val: 3 },
  { label: '6h',   val: 6 },
  { label: '24h',  val: 24 },
  { label: '48h',  val: 48 },
  { label: '72h',  val: 72 },
  { label: '1sem', val: 168 },
  { label: '2sem', val: 336 },
  { label: '1mes', val: 720 },
];

const HistoryView = ({ sensorId = 's1' }) => {
  const [history, setHistory] = useState({});
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState(24);
  const [error, setError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async (manual = false) => {
    if (manual) setIsRefreshing(true);
    else setLoading(true);
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
      setIsRefreshing(false);
    }
  }, [sensorId, hours]);

  useEffect(() => { load(); }, [load]);

  // Memorizamos las secciones de SelectDash para evitar re-renders innecesarios
  const chartSections = useMemo(() => {
    // Configuración base de ChartJS (Estilo Premium SaaS y Accesibilidad)
    const baseChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false, // Mejora UX: muestra tooltip al acercarse a la línea
      },
      plugins: { 
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(255, 255, 255, 0.95)', // Fondo claro para mejor contraste
          titleColor: '#64748B', // slate-500
          bodyColor: '#0F172A', // slate-900
          borderColor: '#E2E8F0', // slate-200
          borderWidth: 1,
          titleFont: { size: 12, family: 'inherit', weight: 'normal' },
          bodyFont: { size: 14, weight: 'bold', family: 'inherit' },
          padding: 12,
          cornerRadius: 12,
          displayColors: true,
          boxPadding: 6,
          usePointStyle: true, // Bolitas en lugar de cuadrados en el tooltip
        }
      },
      scales: {
        x: { 
          ticks: { maxTicksLimit: 6, font: { size: 11, family: 'inherit' }, color: '#94A3B8' }, 
          grid: { display: false },
          border: { display: false }
        },
        y: { 
          ticks: { maxTicksLimit: 5, font: { size: 11, family: 'inherit' }, color: '#94A3B8' }, 
          grid: { color: '#F1F5F9', borderDash: [4, 4] },
          border: { display: false }
        },
      },
    };

    return VARIABLES.map((v) => ({
      id: v.key,
      title: v.label,
      color: v.tcolor,
      defaultMode: 'show',
      render: () => {
        const points = history[v.key] ?? [];
        const isEmpty = points.length === 0;

        const chartData = {
          labels: points.map(p => {
            const date = new Date(p.timestamp);
            return hours > 24 
              ? date.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
              : date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
          }),
          datasets: [{
            label: `${v.label} (${v.unit})`, // Etiqueta con color para accesibilidad
            data: points.map(p => p.value),
            borderColor: v.color,
            backgroundColor: `${v.color}15`, // Transparencia sutil
            borderWidth: 2.5,
            pointRadius: 0,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: '#ffffff',
            pointHoverBorderColor: v.color,
            pointHoverBorderWidth: 2.5,
            tension: 0.4, // Curva suave
            fill: true,
            spanGaps: true, // Funcionalidad: Conecta puntos si hay datos perdidos en el centro
          }],
        };

        return (
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm transition-all hover:shadow-md flex flex-col h-full group">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: v.color }} />
                <span className="font-bold" style={{ color: v.color }}>
                  {v.label}
                </span>
              </div>
              <span className="text-xs font-bold text-slate-400 bg-slate-50 px-2.5 py-1 rounded-lg uppercase tracking-wider group-hover:bg-slate-100 transition-colors">
                {v.unit}
              </span>
            </div>

            <div className="flex-1 relative w-full min-h-[200px]">
              {isEmpty ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                  <Activity size={28} className="mb-3 opacity-30" strokeWidth={1.5} />
                  <span className="text-sm font-medium">Sin datos en este periodo</span>
                </div>
              ) : (
                <Line 
                  data={chartData} 
                  options={baseChartOptions}
                  // Accesibilidad (a11y)
                  role="img"
                  aria-label={`Gráfica histórica mostrando ${v.label} en las últimas ${hours} horas`}
                />
              )}
            </div>
          </div>
        );
      }
    }));
  }, [history, hours]);

  return (
    <div className="flex flex-col gap-6 w-full mx-auto p-4 md:p-6 text-slate-800 font-sans animate-in fade-in duration-500">
      
      {/* HEADER CONTROLS ESTILIZADOS */}
      <div className="bg-white p-5 lg:p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        
        {/* Info Sensor */}
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

        {/* Separador Desktop */}
        <div className="hidden lg:block w-px h-10 bg-slate-100" />

        {/* Controles de Tiempo y Refresco */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between w-full lg:w-auto gap-4">
          
          {/* Segmented Control de Tiempo */}
          <div className="w-full sm:w-auto overflow-x-auto pb-2 -mb-2 sm:pb-0 sm:mb-0 scrollbar-hide">
            <div className="flex bg-slate-100/80 p-1 rounded-xl w-max border border-slate-200/50">
              {TIME_FILTERS.map(opt => (
                <button
                  key={opt.val}
                  onClick={() => setHours(opt.val)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                    hours === opt.val
                      ? 'bg-white shadow-sm text-indigo-600 ring-1 ring-slate-200/50'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50'
                  }`}
                  aria-pressed={hours === opt.val}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => load(true)}
            disabled={loading || isRefreshing}
            className="flex items-center justify-center gap-2 px-5 py-2 bg-indigo-600 border border-transparent rounded-xl text-sm font-semibold text-white hover:bg-indigo-700 shadow-sm shadow-indigo-200 transition-colors disabled:opacity-50 flex-shrink-0 w-full sm:w-auto h-[38px]"
          >
            <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
            <span>{isRefreshing ? 'Actualizando' : 'Actualizar'}</span>
          </button>
        </div>
      </div>

      {/* ERROR BANNER */}
      {error && (
        <div className="bg-white border border-rose-100 p-5 flex items-center gap-4 text-rose-700 shadow-sm rounded-2xl animate-in slide-in-from-top-2">
          <div className="p-2 bg-rose-50 rounded-full">
            <AlertCircle size={20} className="text-rose-500" />
          </div>
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {/* VISUALIZACIONES PRINCIPALES */}
      {loading && !Object.keys(history).length ? (
        <div className="flex flex-col items-center justify-center h-96 bg-slate-50/50 rounded-3xl border border-dashed border-slate-200 animate-in fade-in">
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

      {/* SECCIÓN ESPECIAL: SOC */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-5 flex items-center gap-2 bg-slate-50/30">
           <Activity size={20} className="text-indigo-400" />
           <h3 className="text-base font-semibold text-slate-800">
             Gestión de Energía (SOC)
           </h3>
        </div>
        <div className="p-4 sm:p-6">
          <SOCChart 
            sensorId={sensorId} 
            hours={hours} 
            title="Estado de carga vs. Tensión de batería" 
          />
        </div>
      </div>

    </div>
  );
};

export default HistoryView;