/**
 * EnergyView.jsx
 * --------------
 * Panel de gestión energética:
 * - Energía acumulada diaria/mensual (Ah)
 * - Balance generación vs consumo
 * - Gráfica de barras por día
 * - Indicadores de tendencia energética
 * - Estado de carga histórico
 */

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { api } from '../services/api';
import {
  Loader2, RefreshCw, Zap, Battery, TrendingUp,
  TrendingDown, Minus, BarChart2, Activity,
  AlertCircle, Calendar, ArrowUp, ArrowDown, ZoomOut,
  Download
} from 'lucide-react';
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  BarElement, PointElement, LineElement,
  Tooltip, Legend, Filler
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import zoomPlugin from 'chartjs-plugin-zoom';

ChartJS.register(
  CategoryScale, LinearScale, BarElement,
  PointElement, LineElement, Tooltip, Legend, Filler, zoomPlugin
);

// ── Constantes ────────────────────────────────────────────────
const DAY_FILTERS = [
  { label: '7 días',  val: 7  },
  { label: '14 días', val: 14 },
  { label: '30 días', val: 30 },
  { label: '60 días', val: 60 },
  { label: '90 días', val: 90 },
];

const BALANCE_HOURS = [
  { label: '3h',  val: 3   },
  { label: '6h',  val: 6   },
  { label: '12h', val: 12  },
  { label: '24h', val: 24  },
  { label: '48h', val: 48  },
  { label: '72h', val: 72  },
];

const CHART_TOOLTIP = {
  backgroundColor: 'rgba(255,255,255,0.97)',
  titleColor:      '#64748B',
  bodyColor:       '#0F172A',
  borderColor:     '#E2E8F0',
  borderWidth:     1,
  padding:         12,
  cornerRadius:    12,
  displayColors:   true,
  boxPadding:      6,
  usePointStyle:   true,
};

// ─── Exportar CSV Específico para Balance ──────────────────────
const exportBalanceCSV = (points, sensorId, hours) => {
  if (!points?.length) return;
  
  // Cabecera con todas las columnas
  const header = 'timestamp,i_generada_A,i_carga_A,neto_A\n';
  const rows   = points.map(p => `${p.timestamp},${p.i_generada},${p.i_carga},${p.net}`).join('\n');
  
  const blob   = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement('a');
  a.href       = url;
  a.download   = `${sensorId}_balance_${hours}h.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

// ── Helpers ───────────────────────────────────────────────────
const fmt = (v, dec = 2) =>
  v != null ? Number(v).toFixed(dec) : '—';

const TrendBadge = ({ value }) => {
  if (value == null) return <span className="text-slate-400 text-xs">—</span>;
  const isPos = value >= 0;
  return (
    <span className={`flex items-center gap-1 text-xs font-bold
      ${isPos ? 'text-emerald-600' : 'text-rose-600'}`}>
      {isPos ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
      {isPos ? '+' : ''}{fmt(value)} Ah
    </span>
  );
};

// ── KPI Card ──────────────────────────────────────────────────
const KpiCard = ({ label, value, unit, sub, icon, color, bg, trend }) => (
  <div className="bg-white border border-slate-100 shadow-sm hover:shadow-md
    transition-shadow flex flex-col rounded-2xl overflow-hidden">
    <div className="px-6 py-5 flex justify-between items-center">
      <span className={`text-sm font-medium ${color}`}>{label}</span>
      <div className={`p-2 rounded-xl ${bg}`}>{icon}</div>
    </div>
    <div className="px-6 pb-2 flex items-baseline gap-1.5">
      <span className={`text-4xl font-bold tracking-tight ${color}`}>{value}</span>
      <span className={`text-sm font-medium ${color} opacity-70`}>{unit}</span>
    </div>
    <div className="px-6 py-3 mt-auto border-t border-slate-50 bg-slate-50/30
      flex items-center justify-between">
      <span className="text-xs text-slate-500 font-medium">{sub}</span>
      {trend !== undefined && <TrendBadge value={trend} />}
    </div>
  </div>
);

// ── Componente principal ──────────────────────────────────────
const EnergyView = ({ sensorId = 's1' }) => {
  const [days,         setDays]         = useState(7);
  const [balanceHours, setBalanceHours] = useState(24);
  const [energyDaily,  setEnergyDaily]  = useState([]);
  const [balance,      setBalance]      = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error,        setError]        = useState(null);
  
  // Referencia específica para el gráfico de líneas (balance)
  const balanceChartRef = useRef(null); 

  const load = useCallback(async (manual = false) => {
    if (manual) setIsRefreshing(true);
    else        setLoading(true);
    setError(null);
    try {
      const [dailyRes, balanceRes] = await Promise.all([
        api.getEnergyDaily(sensorId, days),
        api.getEnergyBalance(sensorId, balanceHours),
      ]);
      setEnergyDaily(dailyRes?.data ?? []);
      setBalance(balanceRes ?? null);
    } catch {
      setError('Error al cargar los datos de energía.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [sensorId, days, balanceHours]);

  useEffect(() => { load(); }, [load]);

  // ── KPIs derivados ────────────────────────────────────────
  const kpis = useMemo(() => {
    if (!energyDaily.length) return null;

    const totalGen  = energyDaily.reduce((s, d) => s + (d.gen_ah  ?? 0), 0);
    const totalLoad = energyDaily.reduce((s, d) => s + (d.load_ah ?? 0), 0);
    const totalNet  = totalGen - totalLoad;

    const bestDay  = [...energyDaily].sort((a, b) => b.gen_ah  - a.gen_ah)[0];
    const worstDay = [...energyDaily].sort((a, b) => a.gen_ah  - b.gen_ah)[0];

    const avgGen  = totalGen  / energyDaily.length;
    const avgLoad = totalLoad / energyDaily.length;

    const half   = Math.floor(energyDaily.length / 2);
    const first  = energyDaily.slice(0, half).reduce((s, d) => s + d.gen_ah, 0) / (half || 1);
    const second = energyDaily.slice(half).reduce((s, d) => s + d.gen_ah, 0)    / (energyDaily.length - half || 1);
    const trend  = second - first;

    return { totalGen, totalLoad, totalNet, bestDay, worstDay, avgGen, avgLoad, trend };
  }, [energyDaily]);

  // ── Gráfica barras diaria ─────────────────────────────────
  const dailyChartData = useMemo(() => {
    if (!energyDaily.length) return null;
    const labels = energyDaily.map(d => {
      const date = new Date(d.day + 'T12:00:00');
      return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
    });
    return {
      labels,
      datasets: [
        {
          label:           'Generada (Ah)',
          data:            energyDaily.map(d => d.gen_ah),
          backgroundColor: 'rgba(16,185,129,0.75)',
          borderColor:     '#10B981',
          borderWidth:     1.5,
          borderRadius:    6,
          borderSkipped:   false,
        },
        {
          label:           'Consumida (Ah)',
          data:            energyDaily.map(d => d.load_ah),
          backgroundColor: 'rgba(99,102,241,0.65)',
          borderColor:     '#6366F1',
          borderWidth:     1.5,
          borderRadius:    6,
          borderSkipped:   false,
        },
        {
          label:           'Neto (Ah)',
          data:            energyDaily.map(d => d.net_ah),
          backgroundColor: energyDaily.map(d =>
            d.net_ah >= 0
              ? 'rgba(245,158,11,0.5)'
              : 'rgba(239,68,68,0.5)'
          ),
          borderColor:     energyDaily.map(d =>
            d.net_ah >= 0 ? '#F59E0B' : '#EF4444'
          ),
          borderWidth:     1.5,
          borderRadius:    4,
          borderSkipped:   false,
        },
      ],
    };
  }, [energyDaily]);

  // ── Gráfica balance histórico ─────────────────────────────
  const balanceChartData = useMemo(() => {
    if (!balance?.points?.length) return null;
    const labels = balance.points.map(p => {
      const d = new Date(p.timestamp);
      return balanceHours > 24
        ? d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
        : d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    });
    return {
      labels,
      datasets: [
        {
          label:            'Generada (A)',
          data:             balance.points.map(p => p.i_generada),
          borderColor:      '#10B981',
          backgroundColor:  'rgba(16,185,129,0.1)',
          borderWidth:      2.5,
          pointRadius:      0,
          pointHoverRadius: 5,
          tension:          0.4,
          fill:             true,
        },
        {
          label:            'Consumida (A)',
          data:             balance.points.map(p => p.i_carga),
          borderColor:      '#6366F1',
          backgroundColor:  'rgba(99,102,241,0.08)',
          borderWidth:      2.5,
          pointRadius:      0,
          pointHoverRadius: 5,
          tension:          0.4,
          fill:             true,
        },
        {
          label:            'Neto (A)',
          data:             balance.points.map(p => p.net),
          borderColor:      '#F59E0B',
          backgroundColor:  'transparent',
          borderWidth:      1.5,
          borderDash:       [5, 4],
          pointRadius:      0,
          pointHoverRadius: 5,
          tension:          0.4,
          fill:             false,
        },
      ],
    };
  }, [balance, balanceHours]);

  const barOptions = {
    responsive:           true,
    maintainAspectRatio:  false,
    interaction:          { mode: 'index', intersect: false },
    plugins: {
      legend:  { display: true, position: 'top' },
      zoom:    {
        pan: {
          enabled: true,
          mode: 'x', 
        },
        zoom: {
          wheel: { enabled: true },
          pinch: { enabled: true },
          mode: 'x', 
        },
      },
      tooltip: CHART_TOOLTIP,
    },
    scales: {
      x: {
        grid:   { display: false },
        ticks:  { font: { size: 11 }, color: '#94A3B8' },
        border: { display: false },
      },
      y: {
        grid:   { color: '#F1F5F9', borderDash: [4, 4] },
        ticks:  { font: { size: 11 }, color: '#94A3B8', callback: v => `${v} Ah` },
        border: { display: false },
      },
    },
  };

  const lineOptions = {
    responsive:          true,
    maintainAspectRatio: false,
    interaction:         { mode: 'index', intersect: false },
    plugins: {
      legend:  { display: true, position: 'top' },
      tooltip: CHART_TOOLTIP,
      // Habilitar el zoom para el balance de líneas
      zoom: {
        pan: {
          enabled: true,
          mode: 'x',
        },
        zoom: {
          wheel: { enabled: true },
          pinch: { enabled: true },
          mode: 'x',
        },
      },
    },
    scales: {
      x: {
        grid:   { display: false },
        ticks:  { maxTicksLimit: 8, font: { size: 11 }, color: '#94A3B8' },
        border: { display: false },
      },
      y: {
        grid:   { color: '#F1F5F9', borderDash: [4, 4] },
        ticks:  { font: { size: 11 }, color: '#94A3B8', callback: v => `${v} A` },
        border: { display: false },
      },
    },
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-96 bg-slate-50/50
      rounded-3xl border border-dashed border-slate-200 animate-in fade-in m-4 md:m-6">
      <Loader2 className="animate-spin text-indigo-500 mb-4" size={40} />
      <p className="text-sm text-slate-500 font-medium animate-pulse">
        Calculando balance energético...
      </p>
    </div>
  );

  return (
    <div className="flex flex-col gap-6 w-full mx-auto p-4 md:p-6 text-slate-800
      font-sans animate-in fade-in duration-500">

      {/* HEADER */}
      <div className="bg-white p-5 lg:p-6 rounded-2xl shadow-sm border border-slate-100
        flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5">
        <div className="flex items-center gap-5">
          <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-2xl shadow-sm
            border border-emerald-100/50">
            <Zap size={26} strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              Gestión Energética
            </h2>
            <div className="flex items-center gap-2 text-sm text-slate-500 mt-0.5">
              <span>Nodo activo:</span>
              <span className="font-medium text-slate-700 bg-slate-100 px-2 py-0.5
                rounded-md font-mono text-xs">{sensorId}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {/* Selector días */}
          <div className="flex bg-slate-100/80 p-1 rounded-xl border border-slate-200/50">
            {DAY_FILTERS.map(opt => (
              <button key={opt.val} onClick={() => setDays(opt.val)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap
                  ${days === opt.val
                    ? 'bg-white shadow-sm text-emerald-600 ring-1 ring-slate-200/50'
                    : 'text-slate-500 hover:text-slate-900'}`}>
                {opt.label}
              </button>
            ))}
          </div>

          <button onClick={() => load(true)} disabled={isRefreshing}
            className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700
              text-sm font-semibold text-white rounded-xl shadow-sm shadow-emerald-200
              transition-colors disabled:opacity-50 h-[38px]">
            <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
            {isRefreshing ? 'Actualizando' : 'Actualizar'}
          </button>
        </div>
      </div>

      {/* ERROR */}
      {error && (
        <div className="bg-white border border-rose-100 p-5 flex items-center gap-4
          text-rose-700 shadow-sm rounded-2xl">
          <div className="p-2 bg-rose-50 rounded-full">
            <AlertCircle size={20} className="text-rose-500" />
          </div>
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {/* KPIs */}
      {kpis && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <KpiCard
            label="Total Generada"
            value={fmt(kpis.totalGen)}
            unit="Ah"
            sub={`Media ${fmt(kpis.avgGen)} Ah/día`}
            trend={kpis.trend}
            color="text-emerald-600"
            bg="bg-emerald-50"
            icon={<Zap size={18} className="text-emerald-500" strokeWidth={2} />}
          />
          <KpiCard
            label="Total Consumida"
            value={fmt(kpis.totalLoad)}
            unit="Ah"
            sub={`Media ${fmt(kpis.avgLoad)} Ah/día`}
            color="text-indigo-600"
            bg="bg-indigo-50"
            icon={<Activity size={18} className="text-indigo-500" strokeWidth={2} />}
          />
          <KpiCard
            label="Balance Neto"
            value={fmt(kpis.totalNet)}
            unit="Ah"
            sub={kpis.totalNet >= 0 ? 'Superávit energético' : 'Déficit energético'}
            color={kpis.totalNet >= 0 ? 'text-amber-600' : 'text-rose-600'}
            bg={kpis.totalNet >= 0 ? 'bg-amber-50' : 'bg-rose-50'}
            icon={kpis.totalNet >= 0
              ? <TrendingUp   size={18} className="text-amber-500"  strokeWidth={2} />
              : <TrendingDown size={18} className="text-rose-500"   strokeWidth={2} />
            }
          />
          <KpiCard
            label="Mejor Día"
            value={fmt(kpis.bestDay?.gen_ah)}
            unit="Ah"
            sub={kpis.bestDay?.day
              ? new Date(kpis.bestDay.day + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
              : '—'}
            color="text-sky-600"
            bg="bg-sky-50"
            icon={<Battery size={18} className="text-sky-500" strokeWidth={2} />}
          />
        </div>
      )}

      {/* GRÁFICA BARRAS DIARIA */}
      <div className="bg-white border border-slate-100 shadow-sm rounded-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-2">
          <BarChart2 size={22} className="text-emerald-400" />
          <div>
            <h3 className="text-lg font-semibold text-slate-800">
              Energía Diaria — Últimos {days} días
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Generada vs Consumida vs Balance neto (Ah)
            </p>
          </div>
        </div>
        <div className="p-6 h-[320px]">
          {dailyChartData ? (
            <Bar data={dailyChartData} options={barOptions} />
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400">
              <p className="text-sm">Sin datos en el período seleccionado</p>
            </div>
          )}
        </div>
      </div>

      {/* RESUMEN POR DÍA — tabla compacta */}
      {energyDaily.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-2">
            <Calendar size={20} className="text-indigo-400" />
            <h3 className="text-base font-semibold text-slate-800">Detalle por Día</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50/50 text-slate-500 font-semibold border-b border-slate-100">
                <tr>
                  <th className="px-6 py-3 whitespace-nowrap">Fecha</th>
                  <th className="px-6 py-3 text-right whitespace-nowrap text-emerald-600">Generada (Ah)</th>
                  <th className="px-6 py-3 text-right whitespace-nowrap text-indigo-600">Consumida (Ah)</th>
                  <th className="px-6 py-3 text-right whitespace-nowrap">Neto (Ah)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {[...energyDaily].reverse().map(d => (
                  <tr key={d.day} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-3 text-slate-600 font-medium">
                      {new Date(d.day + 'T12:00:00').toLocaleDateString('es-ES', {
                        weekday: 'short', day: '2-digit', month: 'short'
                      })}
                    </td>
                    <td className="px-6 py-3 text-right font-bold text-emerald-600">
                      {fmt(d.gen_ah)}
                    </td>
                    <td className="px-6 py-3 text-right font-bold text-indigo-600">
                      {fmt(d.load_ah)}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <span className={`font-bold ${d.net_ah >= 0 ? 'text-amber-600' : 'text-rose-600'}`}>
                        {d.net_ah >= 0 ? '+' : ''}{fmt(d.net_ah)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* Totales */}
              {kpis && (
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50">
                    <td className="px-6 py-3 font-black text-slate-700 uppercase text-xs tracking-wider">
                      Total {days}d
                    </td>
                    <td className="px-6 py-3 text-right font-black text-emerald-700">
                      {fmt(kpis.totalGen)}
                    </td>
                    <td className="px-6 py-3 text-right font-black text-indigo-700">
                      {fmt(kpis.totalLoad)}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <span className={`font-black ${kpis.totalNet >= 0 ? 'text-amber-700' : 'text-rose-700'}`}>
                        {kpis.totalNet >= 0 ? '+' : ''}{fmt(kpis.totalNet)}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* BALANCE HISTÓRICO EN TIEMPO - AHORA CON CLASE "group" PARA EL HOVER */}
      <div className="group bg-white border border-slate-100 shadow-sm rounded-2xl overflow-hidden transition-shadow hover:shadow-md">
        <div className="px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row
          sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Activity size={22} className="text-indigo-400" />
            <div>
              <h3 className="text-lg font-semibold text-slate-800">
                Balance en Tiempo Real
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Corriente generada vs consumida (agrupado: {balance?.interval ?? '—'})
              </p>
            </div>
          </div>

          {/* Selector horas balance */}
          <div className="flex bg-slate-100/80 p-1 rounded-xl border border-slate-200/50">
            {BALANCE_HOURS.map(opt => (
              <button key={opt.val} onClick={() => setBalanceHours(opt.val)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap
                  ${balanceHours === opt.val
                    ? 'bg-white shadow-sm text-indigo-600 ring-1 ring-slate-200/50'
                    : 'text-slate-500 hover:text-slate-900'}`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        
        {/* Contenedor relativo de la gráfica con botones absolutos */}
        <div className="p-6 h-[320px] relative">
          
          {/* Botones Flotantes ocultos por defecto, visibles al pasar el ratón (hover) */}
          <div className="absolute top-4 right-8 flex items-center gap-2 z-10">
            <button
              onClick={() => balanceChartRef.current?.resetZoom()} 
              className="p-2 text-slate-400 bg-white/80 backdrop-blur border border-slate-200 shadow-sm hover:text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 rounded-lg transition-all opacity-0 group-hover:opacity-100"
              title="Restablecer zoom"
            >
              <ZoomOut size={16} />
            </button>

            <button
              onClick={() => exportBalanceCSV(balance?.points, sensorId, balanceHours)}
              className="p-2 text-slate-400 bg-white/80 backdrop-blur border border-slate-200 shadow-sm hover:text-emerald-600 hover:bg-emerald-50 hover:border-emerald-200 rounded-lg transition-all opacity-0 group-hover:opacity-100"
              title="Exportar CSV"
            >
              <Download size={16} />
            </button>
          </div>

          {balanceChartData ? (
            <Line ref={balanceChartRef} data={balanceChartData} options={lineOptions} />
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400">
              <p className="text-sm">Sin datos de balance en este período</p>
            </div>
          )}
        </div>
      </div>

    </div>
  );
};

export default EnergyView;