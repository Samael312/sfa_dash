/**
 * WeatherView.jsx
 * ---------------
 * Panel de predicción meteorológica y estimación de generación SFA.
 * Estilo: Estilizado, Premium, Modern SaaS (Curvas suaves, sombras sutiles).
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Line }    from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  PointElement, LineElement, Tooltip, Legend, Filler, BarElement
} from 'chart.js';
import {
  Sun, CloudSun, Thermometer, Zap,
  Edit2, Check, X, RefreshCw, Loader2,
  TrendingUp, TrendingDown, Minus, BarChart2,
  Info, Navigation
} from 'lucide-react';
import { api } from '../services/api';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Tooltip, Legend, Filler
);

// ==========================================
// CONSTANTES
// ==========================================
const I_MAX        = 8.0; 
const estCurrent   = rad => Math.max(0, +(I_MAX * rad / 1000).toFixed(2));
const OPEN_METEO   = (lat, lon) =>
  `https://api.open-meteo.com/v1/forecast` +
  `?latitude=${lat}&longitude=${lon}` +
  `&hourly=shortwave_radiation,temperature_2m` +
  `&daily=shortwave_radiation_sum,temperature_2m_max,temperature_2m_min,sunrise,sunset` +
  `&forecast_days=7&timezone=auto`;

const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// ==========================================
// HELPERS
// ==========================================
const radToColor = rad => {
  if (rad >= 600) return 'text-orange-500';
  if (rad >= 300) return 'text-amber-500';
  return 'text-slate-400';
};

const deltaIcon = (pred, real) => {
  if (real === null || real === undefined) return null;
  const pct = pred > 0 ? ((real - pred) / pred) * 100 : 0;
  if (Math.abs(pct) < 5)  return <Minus    size={16} className="text-slate-400" />;
  if (pct > 0)            return <TrendingUp   size={16} className="text-emerald-500" />;
  return                         <TrendingDown size={16} className="text-rose-500"  />;
};

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================
const WeatherView = ({ sensorId = 's1' }) => {

  const [lat, setLat] = useState(() => parseFloat(localStorage.getItem('solar_lat') || '37.40'));
  const [lon, setLon] = useState(() => parseFloat(localStorage.getItem('solar_lon') || '-4.48'));
  const [editing, setEditing] = useState(false);
  const [tempLat, setTempLat] = useState(lat);
  const [tempLon, setTempLon] = useState(lon);

  const [weather, setWeather]   = useState(null);
  const [loadingW, setLoadingW] = useState(true);
  const [errorW, setErrorW]     = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [sensorLatest, setSensorLatest] = useState(null);
  const [chart24Mode, setChart24Mode] = useState('radiation');

  const fetchWeather = useCallback(async (manual = false) => {
    if (manual) setIsRefreshing(true);
    if (!manual && !weather) setLoadingW(true);
    setErrorW(null);
    try {
      const res  = await fetch(OPEN_METEO(lat, lon));
      const data = await res.json();
      if (data.error) throw new Error(data.reason || 'Coordenadas inválidas');

      const now         = new Date();
      const currentHour = now.getHours();
      const todayStr    = now.toISOString().slice(0, 10);
      const hourlyTime  = data.hourly.time;
      
      const startIdx = hourlyTime.findIndex(t => t.startsWith(todayStr) && parseInt(t.slice(11, 13)) === currentHour);
      const idx      = startIdx >= 0 ? startIdx : currentHour;

      const hourlyRad   = data.hourly.shortwave_radiation;
      const hourlyTemp  = data.hourly.temperature_2m;

      const next24Rad   = hourlyRad.slice(idx, idx + 24);
      const next24Temp  = hourlyTemp.slice(idx, idx + 24);
      const next24Time  = hourlyTime.slice(idx, idx + 24);
      const next24Gen   = next24Rad.map(estCurrent);

      const currentRad  = hourlyRad[idx]  ?? 0;
      const currentTemp = hourlyTemp[idx] ?? 0;
      const currentGen  = estCurrent(currentRad);
      const peakRad     = Math.max(...next24Rad);
      const peakHour    = next24Time[next24Rad.indexOf(peakRad)]?.slice(11, 16) ?? '--:--';

      const daily = data.daily;
      const days  = daily.time.map((date, i) => ({
        date,
        label:      DAYS_ES[new Date(date + 'T12:00:00').getDay()],
        radSum:     +(daily.shortwave_radiation_sum[i]?.toFixed(0) ?? 0),
        tempMax:    daily.temperature_2m_max[i],
        tempMin:    daily.temperature_2m_min[i],
        sunrise:    daily.sunrise[i]?.slice(11, 16) ?? '--:--',
        sunset:     daily.sunset[i]?.slice(11, 16)  ?? '--:--',
        estGenKwh:  +((daily.shortwave_radiation_sum[i] ?? 0) * I_MAX / 1000).toFixed(2),
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
  }, [lat, lon, weather]);

  useEffect(() => { fetchWeather(); }, [fetchWeather]);

  useEffect(() => {
    api.getSFALatest(sensorId).then(res => setSensorLatest(res)).catch(() => {});
  }, [sensorId]);

  const handleSave = () => {
    const la = parseFloat(tempLat);
    const lo = parseFloat(tempLon);
    if (isNaN(la) || isNaN(lo) || la < -90 || la > 90 || lo < -180 || lo > 180) return;
    setLat(la); setLon(lo);
    localStorage.setItem('solar_lat', la);
    localStorage.setItem('solar_lon', lo);
    setEditing(false);
  };

  const handleCancel = () => {
    setTempLat(lat); setTempLon(lon); setEditing(false);
  };

  const build24hChart = () => {
    if (!weather) return null;
    const { next24 } = weather;
    const labels = next24.time.map(t => t.slice(11, 16));

    const datasets = {
      radiation: [{
        label:           'Rad. Prevista (W/m²)',
        data:            next24.rad,
        borderColor:     '#f97316', 
        backgroundColor: 'rgba(249, 115, 22, 0.08)',
        borderWidth:     3,
        pointRadius:     0,
        pointHoverRadius: 6,
        tension:         0.4,
        fill:            true,
      }],
      temperature: [{
        label:           'Temp. Prevista (°C)',
        data:            next24.temp,
        borderColor:     '#f43f5e', 
        backgroundColor: 'rgba(244, 63, 94, 0.08)',
        borderWidth:     3,
        pointRadius:     0,
        pointHoverRadius: 6,
        tension:         0.4,
        fill:            true,
      }],
      generation: [{
        label:           'Gen. Estimada (A)',
        data:            next24.gen,
        borderColor:     '#10b981', 
        backgroundColor: 'rgba(16, 185, 129, 0.08)',
        borderWidth:     3,
        pointRadius:     0,
        pointHoverRadius: 6,
        tension:         0.4,
        fill:            true,
      }],
    };

    return {
      data: { labels, datasets: datasets[chart24Mode] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { 
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            titleFont: { family: 'sans-serif', size: 14, weight: '600' },
            bodyFont: { family: 'sans-serif', size: 14 },
            padding: 12,
            cornerRadius: 12,
            displayColors: false,
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
          }
        },
        scales: {
          x: { 
            grid: { display: false },
            ticks: { maxTicksLimit: 12, font: { size: 12 }, color: '#64748b' },
            border: { display: false }
          },
          y: {
            grid: { color: '#f1f5f9', borderDash: [5, 5] },
            ticks: { maxTicksLimit: 6, font: { size: 12 }, color: '#64748b' },
            border: { display: false }
          }
        }
      }
    };
  };

  const chart24 = build24hChart();

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
          <div className="p-3 bg-rose-50 rounded-full">
            <Info size={24} className="text-rose-500" />
          </div>
          <span className="font-medium">{errorW}</span>
        </div>
        <button onClick={() => fetchWeather(true)} className="px-5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-sm font-semibold transition-colors">
          Reintentar
        </button>
      </div>
    </div>
  );

  const realRad  = sensorLatest?.radiacion ?? null;
  const realTemp = sensorLatest?.temp_amb ?? null;
  const realGen  = sensorLatest?.i_generada ?? null;

  return (
    <div className="w-full mx-auto p-4 md:p-6 flex flex-col gap-6 bg-slate-50/50 min-h-screen text-slate-800 font-sans">

      {/* CABECERA ESTILIZADA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-white p-6 border border-slate-100 shadow-sm rounded-2xl">
        <div className="flex items-center gap-5">
          <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-2xl shadow-sm border border-indigo-100/50">
            <Navigation size={26} strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">Meteorología & Predicción</h2>
            <div className="flex items-center gap-2 text-sm text-slate-500 mt-0.5">
              <span>Coordenadas de la planta:</span>
              <span className="font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                {lat.toFixed(4)}, {lon.toFixed(4)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {editing ? (
            <>
              <button onClick={handleCancel}
                className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-sm font-semibold text-slate-700 transition-colors rounded-xl shadow-sm">
                <X size={16} /> Cancelar
              </button>
              <button onClick={handleSave}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-sm font-semibold text-white transition-colors rounded-xl shadow-sm shadow-indigo-200">
                <Check size={16} /> Guardar
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-sm font-semibold text-slate-700 transition-colors rounded-xl shadow-sm">
                <Edit2 size={16} /> Editar Ubicación
              </button>
              <button onClick={() => fetchWeather(true)} disabled={isRefreshing}
                className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-sm font-semibold text-white transition-colors disabled:opacity-50 rounded-xl shadow-sm">
                <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
                {isRefreshing ? 'Sincronizando' : 'Actualizar'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* EDITOR COORDENADAS SUAVE */}
      {editing && (
        <div className="bg-white border border-slate-100 shadow-sm p-6 flex flex-col sm:flex-row gap-6 rounded-2xl transition-all">
          <div className="flex flex-col gap-2 flex-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest ml-1">Latitud</label>
            <input type="number" step="0.0001" value={tempLat}
              onChange={e => setTempLat(e.target.value)}
              className="border border-slate-200 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded-xl bg-slate-50/50 transition-all"
            />
          </div>
          <div className="flex flex-col gap-2 flex-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest ml-1">Longitud</label>
            <input type="number" step="0.0001" value={tempLon}
              onChange={e => setTempLon(e.target.value)}
              className="border border-slate-200 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded-xl bg-slate-50/50 transition-all"
            />
          </div>
        </div>
      )}

      {/* TARJETAS DE KPIs ELEGANTES */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* KPI: Radiación */}
        <div className="bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow flex flex-col rounded-2xl overflow-hidden">
          <div className="px-6 py-5 flex justify-between items-center">
            <span className="text-sm font-medium text-orange-500">Radiación Solar</span>
            <div className="p-2 bg-orange-50 rounded-xl">
              <Sun size={20} className="text-orange-500" strokeWidth={2} />
            </div>
          </div>
          <div className="px-6 pb-6 flex items-baseline gap-2">
            <span className="text-5xl font-bold tracking-tight text-orange-500">
              {weather.currentRad}
            </span>
            <span className="text-lg text-orange-400 font-medium">W/m²</span>
          </div>
          <div className="bg-slate-50/50 px-6 py-4 flex flex-col gap-3 text-sm border-t border-slate-100 mt-auto">
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Sensor local:</span>
              <span className="font-semibold text-slate-700 flex items-center gap-1.5 bg-white px-2 py-1 rounded-md border border-slate-200 shadow-sm">
                {deltaIcon(weather.currentRad, realRad)}
                {realRad !== null ? `${realRad} W` : 'Offline'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Pico estimado ({weather.peakHour}):</span>
              <span className="font-medium text-orange-600 bg-orange-50 px-2 py-0.5 rounded-md">{weather.peakRad} W</span>
            </div>
          </div>
        </div>

        {/* KPI: Temperatura */}
        <div className="bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow flex flex-col rounded-2xl overflow-hidden">
          <div className="px-6 py-5 flex justify-between items-center">
            <span className="text-sm font-medium text-rose-500">Temperatura Amb.</span>
            <div className="p-2 bg-rose-50 rounded-xl">
              <Thermometer size={20} className="text-rose-500" strokeWidth={2} />
            </div>
          </div>
          <div className="px-6 pb-6 flex items-baseline gap-2">
            <span className="text-5xl font-bold tracking-tight text-rose-500">
              {weather.currentTemp}
            </span>
            <span className="text-lg text-rose-400 font-medium">°C</span>
          </div>
          <div className="bg-slate-50/50 px-6 py-4 flex flex-col gap-3 text-sm border-t border-slate-100 mt-auto">
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Sensor local:</span>
              <span className="font-semibold text-slate-700 flex items-center gap-1.5 bg-white px-2 py-1 rounded-md border border-slate-200 shadow-sm">
                {deltaIcon(weather.currentTemp, realTemp)}
                {realTemp !== null ? `${realTemp} °C` : 'Offline'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Mín / Máx diaria:</span>
              <span className="font-medium text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md">
                {weather.days[0]?.tempMin}° / {weather.days[0]?.tempMax}°
              </span>
            </div>
          </div>
        </div>

        {/* KPI: Generación */}
        <div className="bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow flex flex-col rounded-2xl overflow-hidden">
          <div className="px-6 py-5 flex justify-between items-center">
            <span className="text-sm font-medium text-emerald-500">Generación Est.</span>
            <div className="p-2 bg-emerald-50 rounded-xl">
              <Zap size={20} className="text-emerald-500" strokeWidth={2} />
            </div>
          </div>
          <div className="px-6 pb-6 flex items-baseline gap-2">
            <span className="text-5xl font-bold tracking-tight text-emerald-500">
              {weather.currentGen}
            </span>
            <span className="text-lg text-emerald-400 font-medium">A</span>
          </div>
          <div className="bg-slate-50/50 px-6 py-4 flex flex-col gap-3 text-sm border-t border-slate-100 mt-auto">
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Sensor local:</span>
              <span className="font-semibold text-slate-700 flex items-center gap-1.5 bg-white px-2 py-1 rounded-md border border-slate-200 shadow-sm">
                {deltaIcon(weather.currentGen, realGen)}
                {realGen !== null ? `${realGen} A` : 'Offline'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Acumulado diario:</span>
              <span className="font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">{weather.days[0]?.estGenKwh} Ah</span>
            </div>
          </div>
        </div>

      </div>

      {/* GRÁFICA 24H CON TABS ESTILIZADOS */}
      <div className="bg-white border border-slate-100 shadow-sm rounded-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <BarChart2 size={22} className="text-indigo-400" /> 
            Previsión de 24 Horas
          </h3>
          
          {/* Segmented Control */}
          <div className="flex p-1 bg-slate-100 rounded-xl">
            {[
              { id: 'radiation',   label: 'Radiación' },
              { id: 'temperature', label: 'Temperatura' },
              { id: 'generation',  label: 'Generación' },
            ].map(opt => {
              const isActive = chart24Mode === opt.id;
              return (
                <button 
                  key={opt.id} 
                  onClick={() => setChart24Mode(opt.id)}
                  className={`px-4 py-1.5 text-sm font-medium transition-all rounded-lg 
                    ${isActive 
                      ? 'bg-white text-slate-800 shadow-sm border border-slate-200/50' 
                      : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>
        
        <div className="p-6 h-[340px] w-full">
          {chart24 && <Line data={chart24.data} options={chart24.options} />}
        </div>
      </div>

      {/* 7 DÍAS - ESTILO TARJETAS LIMPIAS */}
      <div className="bg-white border border-slate-100 shadow-sm rounded-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <CloudSun size={22} className="text-indigo-400" /> 
            Previsión a 7 Días
          </h3>
        </div>
        
        <div className="grid grid-cols-2 lg:grid-cols-7 divide-x divide-y lg:divide-y-0 divide-slate-100 bg-slate-50/30">
          {weather.days.map((day, i) => (
            <div key={day.date} className={`flex flex-col p-5 hover:bg-slate-50 transition-colors ${i === 0 ? 'bg-orange-50/20' : ''}`}>
              <div className="flex justify-between items-center mb-5">
                <span className={`text-sm font-semibold ${i === 0 ? 'text-orange-600' : 'text-slate-700'}`}>
                  {i === 0 ? 'Hoy' : day.label}
                </span>
                <span className="text-xs text-slate-400 font-medium">
                  {new Date(day.date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}
                </span>
              </div>
              
              <div className="flex justify-center my-4">
                <Sun size={38} strokeWidth={1.5} className={`${radToColor(day.radSum / 12)}`} />
              </div>
              
              <div className="flex justify-center items-baseline gap-1.5 mb-5">
                <span className="text-2xl font-bold tracking-tight text-slate-800">{day.tempMax}°</span>
                <span className="text-sm font-medium text-slate-400">{day.tempMin}°</span>
              </div>
              
              <div className="flex flex-col gap-2.5 mt-auto pt-4 border-t border-slate-100">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-orange-500">Rad:</span>
                  <span className="font-semibold text-orange-700">{day.radSum} W</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">Gen:</span>
                  <span className="font-semibold text-emerald-600">~{day.estGenKwh} A</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};

export default WeatherView;