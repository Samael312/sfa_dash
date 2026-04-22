/**
 * WeatherView.jsx
 * ---------------
 * Mejoras Fase 3:
 * - I_MAX configurable (igual que coordenadas)
 * - Gráfica eficiencia real vs estimada
 * - Energía acumulada diaria real via /energy/daily
 * - CORRECCIÓN: Bucle infinito resuelto eliminando 'weather' de las dependencias de useCallback.
 * - CORRECCIÓN: Espacios invisibles (non-breaking spaces) limpiados para evitar errores de sintaxis.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  PointElement, LineElement, BarElement, Tooltip, Legend, Filler
} from 'chart.js';
import {
  Sun, CloudSun, Thermometer, Zap, Check, X,
  RefreshCw, Loader2, TrendingUp, TrendingDown, Minus,
  BarChart2, Info, Navigation, Settings2, ZoomOut, Download
} from 'lucide-react';
import { api } from '../services/api';
import zoomPlugin from 'chartjs-plugin-zoom';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Tooltip, Legend, Filler, zoomPlugin
);

// ── Constantes ────────────────────────────────────────────────
const DEFAULT_I_MAX  = 8.0;
const OPEN_METEO_URL = (lat, lon) =>
  `https://api.open-meteo.com/v1/forecast` +
  `?latitude=${lat}&longitude=${lon}` +
  `&hourly=shortwave_radiation,temperature_2m` +
  `&daily=shortwave_radiation_sum,temperature_2m_max,temperature_2m_min,sunrise,sunset` +
  `&forecast_days=7&timezone=auto`;

const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const toGen = (rad, iMax) => Math.max(0, +(iMax * rad / 1000).toFixed(2));

const radToColor = rad => {
  if (rad >= 600) return 'text-orange-500';
  if (rad >= 300) return 'text-amber-500';
  return 'text-slate-400';
};

const deltaIcon = (pred, real) => {
  if (real == null) return null;
  const pct = pred > 0 ? ((real - pred) / pred) * 100 : 0;
  if (Math.abs(pct) < 5)  return <Minus    size={16} className="text-slate-400" />;
  if (pct > 0)            return <TrendingUp  size={16} className="text-emerald-500" />;
  return                         <TrendingDown  size={16} className="text-rose-500" />;
};

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
const exportCSV = (next24, sensorId) => {
  if (!next24 || !next24.time?.length) return;
  
  const header = 'timestamp,radiacion,temp_amb,i_generada\n';
  
  const rows = next24.time.map((t, i) => {
    return `${t},${next24.rad[i]},${next24.temp[i]},${next24.gen[i]}`;
  }).join('\n');
  
  const blob   = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement('a');
  a.href       = url;
  a.download   = `${sensorId}_previsión_24h.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

// ── Componente principal ──────────────────────────────────────
const WeatherView = ({ sensorId = 's1' }) => {

  const [lat, setLat] = useState(() => parseFloat(localStorage.getItem('solar_lat') || '37.40'));
  const [lon, setLon] = useState(() => parseFloat(localStorage.getItem('solar_lon') || '-4.48'));

  const [iMax, setIMax] = useState(() =>
    parseFloat(localStorage.getItem('solar_imax') || String(DEFAULT_I_MAX))
  );

  const chartRef = useRef(null);

  // Edición
  const [editing, setEditing]     = useState(false);
  const [tempLat, setTempLat]     = useState(lat);
  const [tempLon, setTempLon]     = useState(lon);
  const [tempIMax, setTempIMax]   = useState(iMax);

  // Datos meteorológicos
  const [weather,      setWeather]      = useState(null);
  const [loadingW,     setLoadingW]     = useState(true);
  const [errorW,       setErrorW]       = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Datos del sensor
  const [sensorLatest, setSensorLatest] = useState(null);
  const [energyDaily,  setEnergyDaily]  = useState([]);

  // Modo gráfica 24h
  const [chart24Mode, setChart24Mode] = useState('radiation');

  // ── Fetch meteorología ──────────────────────────────────────
  const fetchWeather = useCallback(async (manual = false) => {
    if (manual) setIsRefreshing(true);
    else setLoadingW(true);
    
    setErrorW(null);
    try {
      const res  = await fetch(OPEN_METEO_URL(lat, lon));
      const data = await res.json();
      if (data.error) throw new Error(data.reason || 'Coordenadas inválidas');

      const now         = new Date();
      const currentHour = now.getHours();
      const todayStr    = now.toISOString().slice(0, 10);
      const hourlyTime  = data.hourly.time;

      const startIdx = hourlyTime.findIndex(
        t => t.startsWith(todayStr) && parseInt(t.slice(11, 13)) === currentHour
      );
      const idx = startIdx >= 0 ? startIdx : currentHour;

      const hourlyRad  = data.hourly.shortwave_radiation;
      const hourlyTemp = data.hourly.temperature_2m;

      const next24Rad  = hourlyRad.slice(idx, idx + 24);
      const next24Temp = hourlyTemp.slice(idx, idx + 24);
      const next24Time = hourlyTime.slice(idx, idx + 24);
      const next24Gen  = next24Rad.map(r => toGen(r, iMax));

      const currentRad  = hourlyRad[idx]  ?? 0;
      const currentTemp = hourlyTemp[idx] ?? 0;
      const currentGen  = toGen(currentRad, iMax);
      const peakRad     = Math.max(...next24Rad);
      const peakHour    = next24Time[next24Rad.indexOf(peakRad)]?.slice(11, 16) ?? '--:--';

      const daily = data.daily;
      const days  = daily.time.map((date, i) => ({
        date,
        label:     DAYS_ES[new Date(date + 'T12:00:00').getDay()],
        radSum:    +(daily.shortwave_radiation_sum[i]?.toFixed(0) ?? 0),
        tempMax:   daily.temperature_2m_max[i],
        tempMin:   daily.temperature_2m_min[i],
        sunrise:   daily.sunrise[i]?.slice(11, 16) ?? '--:--',
        sunset:    daily.sunset[i]?.slice(11, 16)  ?? '--:--',
        estGenAh:  +((daily.shortwave_radiation_sum[i] ?? 0) * iMax / 1000).toFixed(2),
      }));

      setWeather({
        currentRad, currentTemp, currentGen,
        peakRad, peakHour,
        next24: { rad: next24Rad, temp: next24Temp, gen: next24Gen, time: next24Time },
        days,
      });
    } catch (e) {
      setErrorW(e.message || 'Error al conectar con Open-Meteo');
    } finally {
      setLoadingW(false);
      setIsRefreshing(false);
    }
  }, [lat, lon, iMax]); // <-- CORRECCIÓN: Eliminado 'weather' de las dependencias para evitar el bucle infinito

  useEffect(() => { fetchWeather(); }, [fetchWeather]);

  // ── Fetch sensor + energía ──────────────────────────────────
  useEffect(() => {
    api.getSFALatest(sensorId).then(setSensorLatest).catch(() => {});
    api.getEnergyDaily(sensorId, 7).then(res => setEnergyDaily(res?.data ?? [])).catch(() => {});
  }, [sensorId]);

  // ── Guardar configuración ───────────────────────────────────
  const handleSave = () => {
    const la = parseFloat(tempLat);
    const lo = parseFloat(tempLon);
    const im = parseFloat(tempIMax);
    if (isNaN(la) || isNaN(lo) || la < -90 || la > 90 || lo < -180 || lo > 180) return;
    if (isNaN(im) || im <= 0) return;
    setLat(la); setLon(lo); setIMax(im);
    localStorage.setItem('solar_lat',  la);
    localStorage.setItem('solar_lon',  lo);
    localStorage.setItem('solar_imax', im);
    setEditing(false);
  };

  const handleCancel = () => {
    setTempLat(lat); setTempLon(lon); setTempIMax(iMax); setEditing(false);
  };

  const getYScales = (mode) => {
    const scales = {
      radiation:   { min: 0,  max: 1000, callback: v => `${v} W/m²` },
      temperature: { min: 10, max: 60,   callback: v => `${v}°C`    },
      generation:  { min: 0,  max: 1,    callback: v => `${v}A`     },
    };
    return scales[mode] ?? scales.radiation;
  };

  // ── Construcción gráfica 24h ────────────────────────────────
  const build24hChart = () => {
    if (!weather) return null;
    const { next24 } = weather;
    const labels = next24.time.map(t => t.slice(11, 16));

    const datasets = {
      radiation: [{
        label:            'Rad. Prevista (W/m²)',
        data:             next24.rad,
        borderColor:      '#f97316',
        backgroundColor:  'rgba(249,115,22,0.08)',
        borderWidth:      3, pointRadius: 0, pointHoverRadius: 6, tension: 0.4, fill: true,
      }],
      temperature: [{
        label:            'Temp. Prevista (°C)',
        data:             next24.temp,
        borderColor:      '#f43f5e',
        backgroundColor:  'rgba(244,63,94,0.08)',
        borderWidth:      3, pointRadius: 0, pointHoverRadius: 6, tension: 0.4, fill: true,
      }],
      generation: [{
        label:            `Gen. Estimada (A) · I_MAX=${iMax}A`,
        data:             next24.gen,
        borderColor:      '#10b981',
        backgroundColor:  'rgba(16,185,129,0.08)',
        borderWidth:      3, pointRadius: 0, pointHoverRadius: 6, tension: 0.4, fill: true,
      }],
    };

    return { labels, datasets: datasets[chart24Mode] };
  };

  // ── Gráfica eficiencia real vs estimada ─────────────────────
  const buildEfficiencyChart = () => {
    if (!weather || !sensorLatest) return null;

    const estNow  = weather.currentGen;
    const realNow = sensorLatest.i_generada ?? null;

    return {
      labels: ['Ahora'],
      datasets: [
        {
          label:           'Estimada (A)',
          data:            [estNow],
          backgroundColor: 'rgba(16,185,129,0.7)',
          borderColor:     '#10b981',
          borderWidth:     2,
          borderRadius:    8,
        },
        {
          label:           'Real sensor (A)',
          data:            [realNow],
          backgroundColor: 'rgba(99,102,241,0.7)',
          borderColor:     '#6366F1',
          borderWidth:     2,
          borderRadius:    8,
        },
      ],
    };
  };

  // ── Gráfica energía diaria real vs estimada ─────────────────
  const buildEnergyChart = () => {
    if (!energyDaily.length && !weather) return null;

    const days   = weather?.days.slice(0, 7) ?? [];
    const labels = days.map((d, i) => i === 0 ? 'Hoy' : d.label);

    const estData = days.map(d => d.estGenAh);
    const realMap = {};
    energyDaily.forEach(e => { realMap[e.day] = e.gen_ah; });
    const realData = days.map(d => realMap[d.date] ?? null);

    return {
      labels,
      datasets: [
        {
          label:           'Estimada (Ah)',
          data:            estData,
          backgroundColor: 'rgba(16,185,129,0.6)',
          borderColor:     '#10b981',
          borderWidth:     2,
          borderRadius:    6,
        },
        {
          label:           'Real sensor (Ah)',
          data:            realData,
          backgroundColor: 'rgba(99,102,241,0.6)',
          borderColor:     '#6366F1',
          borderWidth:     2,
          borderRadius:    6,
        },
      ],
    };
  }; 

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: CHART_TOOLTIP,
      zoom: {
        pan: { enabled: true, mode: 'x' },
        zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 12 }, color: '#64748b' },
        border: { display: false }
      },
      y: {
        min: getYScales(chart24Mode).min,
        max: getYScales(chart24Mode).max,
        grid: { color: '#f1f5f9', borderDash: [5, 5] },
        ticks: {
          font: { size: 12 },
          color: '#64748b',
          callback: getYScales(chart24Mode).callback,
        },
        border: { display: false }
      },
    },
  };
 
  const barOptions = {
    ...chartOptions,
    plugins: {
      ...chartOptions.plugins,
      legend: { display: true, position: 'top' },
      zoom: {
        pan: { enabled: true, mode: 'xy' },
        zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'xy' }
      }
    },
    scales: {
      ...chartOptions.scales,
      y: {
        grid:   { color: '#f1f5f9', borderDash: [5, 5] },
        ticks:  { font: { size: 12 }, color: '#64748b', callback: v => `${v}Ah` },
        border: { display: false },
      }
    }
  };

  const chart24 = build24hChart();
  const effChart = buildEfficiencyChart();
  const energyChart = buildEnergyChart();

  if (loadingW) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4 bg-slate-50/50 m-4 rounded-3xl">
      <Loader2 className="animate-spin text-indigo-500" size={40} />
      <p className="text-sm font-medium text-slate-500">Cargando condiciones meteorológicas...</p>
    </div>
  );

  if (errorW) return (
    <div className="flex flex-col gap-4 mx-auto p-4 w-full">
      <div className="bg-white border border-rose-100 p-6 flex justify-between items-center text-rose-700 shadow-sm rounded-2xl">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-rose-50 rounded-full"><Info size={24} className="text-rose-500" /></div>
          <span className="font-medium">{errorW}</span>
        </div>
        <button onClick={() => fetchWeather(true)}
          className="px-5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-sm font-semibold">
          Reintentar
        </button>
      </div>
    </div>
  );

  const realRad  = sensorLatest?.radiacion   ?? null;
  const realTemp = sensorLatest?.temp_amb    ?? null;
  const realGen  = sensorLatest?.i_generada  ?? null;

  return (
    <div className="w-full mx-auto p-4 md:p-6 flex flex-col gap-6 bg-slate-50/50 min-h-screen text-slate-800">

      {/* CABECERA Y CONFIGURACIÓN */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-white p-6 border border-slate-100 shadow-sm rounded-2xl">
          <div className="flex items-center gap-5">
            <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-2xl shadow-sm border border-indigo-100/50">
              <Navigation size={26} strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900">Meteorología & Predicción</h2>
              <div className="flex items-center gap-2 text-sm text-slate-500 mt-0.5">
                <span>Coordenadas:</span>
                <span className="font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                  {lat.toFixed(4)}, {lon.toFixed(4)}
                </span>
                <span className="text-slate-300">|</span>
                <span>I_MAX:</span>
                <span className="font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                  {iMax} A
                </span>
                <span className="text-[10px] text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded hidden sm:inline">
                  Panel 10W · Isc=0.8A
                </span>
              </div>
            </div>
          </div>
          
          {/* Botones de acción de la cabecera */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchWeather(true)}
              className="p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors"
              title="Actualizar datos"
            >
              <RefreshCw size={20} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => setEditing(!editing)}
              className={`p-2.5 rounded-xl transition-colors ${editing ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'}`}
              title="Configuración de instalación"
            >
              <Settings2 size={20} />
            </button>
          </div>
        </div>

        {/* Panel de Configuración Oculto */}
        {editing && (
          <div className="bg-white border border-slate-100 shadow-sm p-6 rounded-2xl">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-5">
              Configuración de la instalación
            </h3>
            <div className="mb-5 p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700">
              <strong>Hardware:</strong> Panel policristalino 10W 12V (Voc=18V, Isc=0.8A) ·
              Controlador STECA 10A · Batería 12V 7.2Ah · ACS730 ±5A
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Latitud</label>
                <input type="number" step="0.0001" value={tempLat}
                  onChange={e => setTempLat(e.target.value)}
                  className="border border-slate-200 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded-xl bg-slate-50/50" />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Longitud</label>
                <input type="number" step="0.0001" value={tempLon}
                  onChange={e => setTempLon(e.target.value)}
                  className="border border-slate-200 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded-xl bg-slate-50/50" />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                  Corriente máx. panel (A)
                </label>
                <input type="number" step="0.01" min="0.01" value={tempIMax}
                  onChange={e => setTempIMax(e.target.value)}
                  className="border border-slate-200 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 rounded-xl bg-slate-50/50" />
                <p className="text-[11px] text-slate-400">
                  Isc a 1000 W/m² — panel 10W = 0.8A
                </p>
              </div>
            </div>
            
            <div className="flex justify-end items-center gap-3 mt-6 pt-5 border-t border-slate-100">
              <button onClick={handleCancel} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                <X size={16} /> Cancelar
              </button>
              <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-sm">
                <Check size={16} /> Guardar
              </button>
            </div>
          </div>
        )}
      </div>
 
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          {
            label: 'Radiación Solar', unit: 'W/m²', color: 'text-orange-500',
            bg: 'bg-orange-50', icon: <Sun size={20} className="text-orange-500" strokeWidth={2} />,
            current: weather.currentRad, real: realRad,
            extra: { label: `Pico estimado (${weather.peakHour})`, value: `${weather.peakRad} W/m²`, cls: 'text-orange-600 bg-orange-50' },
          },
          {
            label: 'Temperatura Amb.', unit: '°C', color: 'text-rose-500',
            bg: 'bg-rose-50', icon: <Thermometer size={20} className="text-rose-500" strokeWidth={2} />,
            current: weather.currentTemp, real: realTemp,
            extra: { label: 'Mín / Máx diaria', value: `${weather.days[0]?.tempMin}° / ${weather.days[0]?.tempMax}°`, cls: 'text-rose-600 bg-rose-50' },
          },
          {
            label: 'Generación Est.', unit: 'A', color: 'text-emerald-500',
            bg: 'bg-emerald-50', icon: <Zap size={20} className="text-emerald-500" strokeWidth={2} />,
            current: weather.currentGen, real: realGen,
            extra: { label: 'Acum. diario est.', value: `${weather.days[0]?.estGenAh} Ah`, cls: 'text-emerald-600 bg-emerald-50' },
          },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow flex flex-col rounded-2xl overflow-hidden">
            <div className="px-6 py-5 flex justify-between items-center">
              <span className={`text-sm font-medium ${kpi.color}`}>{kpi.label}</span>
              <div className={`p-2 rounded-xl ${kpi.bg}`}>{kpi.icon}</div>
            </div>
            <div className="px-6 pb-6 flex items-baseline gap-2">
              <span className={`text-5xl font-bold tracking-tight ${kpi.color}`}>{kpi.current}</span>
              <span className={`text-lg font-medium ${kpi.color} opacity-70`}>{kpi.unit}</span>
            </div>
            <div className="bg-slate-50/50 px-6 py-4 flex flex-col gap-3 text-sm border-t border-slate-100 mt-auto">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Sensor local:</span>
                <span className="font-semibold text-slate-700 flex items-center gap-1.5 bg-white px-2 py-1 rounded-md border border-slate-200 shadow-sm">
                  {deltaIcon(kpi.current, kpi.real)}
                  {kpi.real != null ? `${kpi.real} ${kpi.unit}` : 'Offline'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">{kpi.extra.label}:</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${kpi.extra.cls}`}>
                  {kpi.extra.value}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
 
      {/* GRÁFICA 24H con eje Y fijo */}
      <div className="group bg-white border border-slate-100 shadow-sm rounded-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <BarChart2 size={22} className="text-indigo-400" /> Previsión de 24 Horas
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded hidden sm:inline">
              {chart24Mode === 'radiation' ? '0–1000 W/m²' : chart24Mode === 'temperature' ? '10–60°C' : `0–1A`}
            </span>
            <div className="flex p-1 bg-slate-100 rounded-xl">
              {[
                { id: 'radiation',   label: 'Radiación'   },
                { id: 'temperature', label: 'Temperatura' },
                { id: 'generation',  label: 'Generación'  },
              ].map(opt => (
                <button key={opt.id} onClick={() => setChart24Mode(opt.id)}
                  className={`px-4 py-1.5 text-sm font-medium transition-all rounded-lg
                    ${chart24Mode === opt.id
                      ? 'bg-white text-slate-800 shadow-sm border border-slate-200/50'
                      : 'text-slate-500 hover:text-slate-700'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="p-6 h-[340px] w-full relative">
          <div className="absolute top-4 right-8 flex items-center gap-2 z-10">
            <button
              onClick={() => chartRef.current?.resetZoom()}
              className="p-2 text-slate-400 bg-white/80 backdrop-blur border border-slate-200 shadow-sm hover:text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 rounded-lg transition-all opacity-0 group-hover:opacity-100"
              title="Restablecer zoom"
            >
              <ZoomOut size={16} />
            </button>
            <button
              onClick={() => exportCSV(weather.next24, sensorId)}
              className="p-2 text-slate-400 bg-white/80 backdrop-blur border border-slate-200 shadow-sm hover:text-emerald-600 hover:bg-emerald-50 hover:border-emerald-200 rounded-lg transition-all opacity-0 group-hover:opacity-100"
              title="Exportar CSV"
            >
              <Download size={16} />
            </button>
          </div>
          {chart24 && (
            <Line
              ref={chartRef}
              data={chart24}
              options={chartOptions}
            />
          )}
        </div>
      </div>
 
      {/* GRÁFICAS SECUNDARIAS (Energía y Eficiencia) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* GRÁFICA ENERGÍA DIARIA */}
        {energyChart && (
          <div className="lg:col-span-2 bg-white border border-slate-100 shadow-sm rounded-2xl overflow-hidden h-full">
            <div className="px-6 py-5 border-b border-slate-100">
              <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <Zap size={22} className="text-emerald-400" />
                Energía diaria: Real vs Estimada (Ah)
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Basado en datos reales del sensor e I_MAX = {iMax} A (panel 10W)
              </p>
            </div>
            <div className="p-6 h-[280px]">
              <Bar data={energyChart} options={barOptions} />
            </div>
          </div>
        )}

        {/* GRÁFICA EFICIENCIA INSTANTÁNEA */}
        {effChart && (
          <div className="lg:col-span-1 bg-white border border-slate-100 shadow-sm rounded-2xl overflow-hidden h-full">
            <div className="px-6 py-5 border-b border-slate-100">
              <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <TrendingUp size={22} className="text-indigo-400" />
                Eficiencia Instantánea
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Lectura del sensor actual (A)
              </p>
            </div>
            <div className="p-6 h-[280px]">
              <Bar data={effChart} options={barOptions} />
            </div>
          </div>
        )}

      </div>
 
      {/* 7 DÍAS */}
      <div className="bg-white border border-slate-100 shadow-sm rounded-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <CloudSun size={22} className="text-indigo-400" /> Previsión a 7 Días
          </h3>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-7 divide-x divide-y lg:divide-y-0 divide-slate-100 bg-slate-50/30">
          {weather.days.map((day, i) => (
            <div key={day.date}
              className={`flex flex-col p-5 hover:bg-slate-50 transition-colors ${i === 0 ? 'bg-orange-50/20' : ''}`}>
              <div className="flex justify-between items-center mb-5">
                <span className={`text-sm font-semibold ${i === 0 ? 'text-orange-600' : 'text-slate-700'}`}>
                  {i === 0 ? 'Hoy' : day.label}
                </span>
                <span className="text-xs text-slate-400 font-medium">
                  {new Date(day.date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}
                </span>
              </div>
              <div className="flex justify-center my-4">
                <Sun size={38} strokeWidth={1.5} className={radToColor(day.radSum / 12)} />
              </div>
              <div className="flex justify-center items-baseline gap-1.5 mb-5">
                <span className="text-2xl font-bold tracking-tight text-slate-800">{day.tempMax}°</span>
                <span className="text-sm font-medium text-slate-400">{day.tempMin}°</span>
              </div>
              <div className="flex flex-col gap-2.5 mt-auto pt-4 border-t border-slate-100">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-orange-500">Rad:</span>
                  <span className="font-semibold text-orange-700">{day.radSum} W/m²</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">Est:</span>
                  <span className="font-semibold text-emerald-600">~{day.estGenAh} Ah</span>
                </div>
                {energyDaily.find(e => e.day === day.date) && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-indigo-500">Real:</span>
                    <span className="font-semibold text-indigo-600">
                      {energyDaily.find(e => e.day === day.date)?.gen_ah} Ah
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      
    </div>
  );
};
 
export default WeatherView;