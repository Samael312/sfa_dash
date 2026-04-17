/**
 * WeatherView.jsx
 * ---------------
 * Panel de predicción meteorológica y estimación de generación SFA.
 * Fuente de datos: Open-Meteo API (gratuita, sin clave).
 *
 * Variables predichas:
 *   - Radiación solar (W/m²)
 *   - Temperatura ambiente (°C)
 *   - Generación estimada (A) → modelo lineal: I = 8.0 * rad / 1000
 *
 * Horizonte:
 *   - Próximas 24 h hora a hora (gráfica)
 *   - Próximos 7 días resumen diario (tarjetas)
 *   - Comparativa radiación prevista vs medida por sensor
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Line }    from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  PointElement, LineElement, Tooltip, Legend, Filler, BarElement
} from 'chart.js';
import {
  Sun, CloudSun, Thermometer, Zap, MapPin,
  Edit2, Check, X, RefreshCw, Loader2,
  TrendingUp, TrendingDown, Minus, BarChart2
} from 'lucide-react';
import { api } from '../services/api';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Tooltip, Legend, Filler
);

// ==========================================
// CONSTANTES
// ==========================================
const I_MAX        = 8.0;   // corriente máxima del generador (A)
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
  if (rad >= 600) return 'text-amber-600';
  if (rad >= 300) return 'text-yellow-500';
  return 'text-gray-400';
};

const radToBg = rad => {
  if (rad >= 600) return 'bg-amber-50 border-amber-200';
  if (rad >= 300) return 'bg-yellow-50 border-yellow-200';
  return 'bg-gray-50 border-gray-200';
};

const deltaIcon = (pred, real) => {
  if (real === null || real === undefined) return null;
  const pct = pred > 0 ? ((real - pred) / pred) * 100 : 0;
  if (Math.abs(pct) < 5)  return <Minus    size={12} className="text-gray-400" />;
  if (pct > 0)            return <TrendingUp   size={12} className="text-green-500" />;
  return                         <TrendingDown size={12} className="text-red-400"  />;
};

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================
const WeatherView = ({ sensorId = 's1' }) => {

  // Coordenadas persistidas
  const [lat, setLat] = useState(() => parseFloat(localStorage.getItem('solar_lat') || '37.40'));
  const [lon, setLon] = useState(() => parseFloat(localStorage.getItem('solar_lon') || '-4.48'));
  const [editing, setEditing] = useState(false);
  const [tempLat, setTempLat] = useState(lat);
  const [tempLon, setTempLon] = useState(lon);

  // Datos meteorológicos
  const [weather, setWeather]   = useState(null);
  const [loadingW, setLoadingW] = useState(true);
  const [errorW, setErrorW]     = useState(null);

  // Última lectura real del sensor para comparativa
  const [sensorLatest, setSensorLatest] = useState(null);

  // Vista de la gráfica 24h
  const [chart24Mode, setChart24Mode] = useState('radiation'); // 'radiation' | 'temperature' | 'generation'

  // ==========================================
  // FETCH OPEN-METEO
  // ==========================================
  const fetchWeather = useCallback(async () => {
    setLoadingW(true);
    setErrorW(null);
    try {
      const res  = await fetch(OPEN_METEO(lat, lon));
      const data = await res.json();
      if (data.error) throw new Error(data.reason || 'Coordenadas inválidas');

      const now         = new Date();
      const currentHour = now.getHours();

      // Próximas 24 h (desde ahora)
      const hourlyRad   = data.hourly.shortwave_radiation;
      const hourlyTemp  = data.hourly.temperature_2m;
      const hourlyTime  = data.hourly.time;

      // Índice de la hora actual (primera hora que coincide con hoy)
      const todayStr = now.toISOString().slice(0, 10);
      const startIdx = hourlyTime.findIndex(t => t.startsWith(todayStr) && parseInt(t.slice(11, 13)) === currentHour);
      const idx      = startIdx >= 0 ? startIdx : currentHour;

      const next24Rad   = hourlyRad.slice(idx, idx + 24);
      const next24Temp  = hourlyTemp.slice(idx, idx + 24);
      const next24Time  = hourlyTime.slice(idx, idx + 24);
      const next24Gen   = next24Rad.map(estCurrent);

      // Métricas actuales
      const currentRad  = hourlyRad[idx]  ?? 0;
      const currentTemp = hourlyTemp[idx] ?? 0;
      const currentGen  = estCurrent(currentRad);
      const peakRad     = Math.max(...next24Rad);
      const peakHour    = next24Time[next24Rad.indexOf(peakRad)]?.slice(11, 16) ?? '--:--';

      // 7 días resumen diario
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
      setErrorW(e.message || 'Error al cargar Open-Meteo');
    } finally {
      setLoadingW(false);
    }
  }, [lat, lon]);

  useEffect(() => { fetchWeather(); }, [fetchWeather]);

  // Lectura real del sensor
  useEffect(() => {
    api.getSFALatest(sensorId).then(res => setSensorLatest(res)).catch(() => {});
  }, [sensorId]);

  // ==========================================
  // HANDLERS
  // ==========================================
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

  // ==========================================
  // GRÁFICA 24H
  // ==========================================
  const build24hChart = () => {
    if (!weather) return null;
    const { next24 } = weather;
    const labels = next24.time.map(t => t.slice(11, 16));

    const datasets = {
      radiation: [{
        label:           'Radiación prevista (W/m²)',
        data:            next24.rad,
        borderColor:     '#F59E0B',
        backgroundColor: '#F59E0B22',
        borderWidth:     2,
        pointRadius:     0,
        tension:         0.4,
        fill:            true,
        yAxisID:         'y',
      }],
      temperature: [{
        label:           'Temperatura prevista (°C)',
        data:            next24.temp,
        borderColor:     '#EF4444',
        backgroundColor: '#EF444422',
        borderWidth:     2,
        pointRadius:     0,
        tension:         0.4,
        fill:            true,
        yAxisID:         'y',
      }],
      generation: [{
        label:           'Generación estimada (A)',
        data:            next24.gen,
        borderColor:     '#10B981',
        backgroundColor: '#10B98122',
        borderWidth:     2,
        pointRadius:     0,
        tension:         0.4,
        fill:            true,
        yAxisID:         'y',
      }],
    };

    const yLabels = {
      radiation:   'W/m²',
      temperature: '°C',
      generation:  'A',
    };

    return {
      data: { labels, datasets: datasets[chart24Mode] },
      options: {
        responsive: true,
        plugins: { legend: { display: true, position: 'top' } },
        scales: {
          x: { ticks: { maxTicksLimit: 8, font: { size: 11 } } },
          y: {
            ticks: { maxTicksLimit: 6, font: { size: 11 } },
            title: { display: true, text: yLabels[chart24Mode], font: { size: 11 } },
          }
        }
      }
    };
  };

  const chart24 = build24hChart();

  // ==========================================
  // RENDER ESTADOS
  // ==========================================
  if (loadingW) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin text-amber-500" size={40} />
    </div>
  );

  if (errorW) return (
    <div className="flex flex-col gap-4">
      <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded flex items-center justify-between">
        <span>Error: {errorW}</span>
        <button onClick={fetchWeather} className="flex items-center gap-1 text-red-600 hover:text-red-800">
          <RefreshCw size={14} /> Reintentar
        </button>
      </div>
      {renderCoordEditor()}
    </div>
  );

  // ==========================================
  // RENDER PRINCIPAL
  // ==========================================
  const realRad  = sensorLatest?.radiacion_solar ?? null;
  const realTemp = sensorLatest?.temperatura_ambiente ?? null;
  const realGen  = sensorLatest?.corriente_generada ?? null;

  return (
    <div className="flex flex-col gap-6">

      {/* CABECERA */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-gray-400 uppercase">Ubicación</span>
          <span className="text-sm font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded flex items-center gap-1">
            <MapPin size={12} />
            {lat.toFixed(4)}°, {lon.toFixed(4)}°
          </span>
        </div>
        <div className="flex items-center gap-3">
          {editing ? (
            <>
              <button onClick={handleCancel}
                className="flex items-center gap-1 text-sm text-gray-500 border border-gray-300
                           hover:border-gray-400 px-3 py-1.5 rounded transition-colors">
                <X size={14} /> Cancelar
              </button>
              <button onClick={handleSave}
                className="flex items-center gap-1 text-sm text-white bg-blue-600
                           hover:bg-blue-700 px-3 py-1.5 rounded transition-colors">
                <Check size={14} /> Guardar
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)}
                className="flex items-center gap-1 text-sm text-gray-600 border border-gray-300
                           hover:border-blue-400 hover:text-blue-600 px-3 py-1.5 rounded transition-colors">
                <Edit2 size={14} /> Editar ubicación
              </button>
              <button onClick={fetchWeather}
                className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 transition-colors">
                <RefreshCw size={14} /> Actualizar
              </button>
            </>
          )}
        </div>
      </div>

      {/* EDITOR COORDENADAS */}
      {editing && (
        <div className="bg-blue-50 border border-blue-200 rounded p-4 grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">Latitud</label>
            <input type="number" step="0.0001" value={tempLat}
              onChange={e => setTempLat(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
              placeholder="ej: 37.4000"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">Longitud</label>
            <input type="number" step="0.0001" value={tempLon}
              onChange={e => setTempLon(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
              placeholder="ej: -4.4800"
            />
          </div>
        </div>
      )}

      {/* KPIs ACTUALES — PREVISTO VS REAL */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Radiación */}
        <div className={`bg-white p-5 rounded shadow border-l-4 border-amber-400`}>
          <span className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1">
            <Sun size={12} /> Radiación solar
          </span>
          <div className="mt-2 flex items-end gap-2">
            <span className={`text-3xl font-bold ${radToColor(weather.currentRad)}`}>
              {weather.currentRad}
            </span>
            <span className="text-sm text-gray-400 mb-1">W/m²</span>
          </div>
          <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between text-xs">
            <span className="text-gray-400">Sensor real:</span>
            <span className="flex items-center gap-1 font-semibold text-gray-700">
              {deltaIcon(weather.currentRad, realRad)}
              {realRad !== null ? `${realRad} W/m²` : '—'}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs">
            <span className="text-gray-400">Pico hoy ({weather.peakHour}):</span>
            <span className="font-bold text-amber-600">{weather.peakRad} W/m²</span>
          </div>
        </div>

        {/* Temperatura */}
        <div className="bg-white p-5 rounded shadow border-l-4 border-red-400">
          <span className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1">
            <Thermometer size={12} /> Temperatura
          </span>
          <div className="mt-2 flex items-end gap-2">
            <span className="text-3xl font-bold text-red-600">{weather.currentTemp}</span>
            <span className="text-sm text-gray-400 mb-1">°C</span>
          </div>
          <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between text-xs">
            <span className="text-gray-400">Sensor real:</span>
            <span className="flex items-center gap-1 font-semibold text-gray-700">
              {deltaIcon(weather.currentTemp, realTemp)}
              {realTemp !== null ? `${realTemp} °C` : '—'}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs">
            <span className="text-gray-400">Hoy:</span>
            <span className="font-semibold text-gray-600">
              {weather.days[0]?.tempMin}° / {weather.days[0]?.tempMax}°C
            </span>
          </div>
        </div>

        {/* Generación estimada */}
        <div className="bg-white p-5 rounded shadow border-l-4 border-green-400">
          <span className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1">
            <Zap size={12} /> Generación estimada
          </span>
          <div className="mt-2 flex items-end gap-2">
            <span className="text-3xl font-bold text-green-600">{weather.currentGen}</span>
            <span className="text-sm text-gray-400 mb-1">A</span>
          </div>
          <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between text-xs">
            <span className="text-gray-400">Sensor real:</span>
            <span className="flex items-center gap-1 font-semibold text-gray-700">
              {deltaIcon(weather.currentGen, realGen)}
              {realGen !== null ? `${realGen} A` : '—'}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs">
            <span className="text-gray-400">Est. generación hoy:</span>
            <span className="font-bold text-green-600">{weather.days[0]?.estGenKwh} Ah</span>
          </div>
        </div>

      </div>

      {/* GRÁFICA 24H */}
      <div className="bg-white p-5 rounded shadow border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-gray-700 uppercase flex items-center gap-2">
            <BarChart2 size={15} /> Previsión próximas 24 h
          </h3>
          <div className="flex items-center gap-2">
            {[
              { id: 'radiation',   label: 'Radiación',   color: 'bg-amber-500'  },
              { id: 'temperature', label: 'Temperatura', color: 'bg-red-500'    },
              { id: 'generation',  label: 'Generación',  color: 'bg-green-500'  },
            ].map(opt => (
              <button key={opt.id} onClick={() => setChart24Mode(opt.id)}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded
                  border transition-colors
                  ${chart24Mode === opt.id
                    ? 'bg-gray-800 text-white border-gray-800'
                    : 'text-gray-600 border-gray-300 hover:border-gray-400'}`}>
                <span className={`w-2 h-2 rounded-full ${opt.color}`} />
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        {chart24 && <Line data={chart24.data} options={chart24.options} />}
      </div>

      {/* 7 DÍAS */}
      <div className="bg-white p-5 rounded shadow border border-gray-200">
        <h3 className="text-sm font-bold text-gray-700 uppercase mb-4 flex items-center gap-2">
          <CloudSun size={15} /> Previsión 7 días
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {weather.days.map((day, i) => (
            <div key={day.date}
              className={`flex flex-col items-center gap-1 p-3 rounded border
                ${i === 0 ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
              <span className={`text-xs font-bold uppercase ${i === 0 ? 'text-amber-700' : 'text-gray-500'}`}>
                {i === 0 ? 'Hoy' : day.label}
              </span>
              <span className="text-xs text-gray-400">{day.date.slice(5)}</span>
              <Sun size={18} className={radToColor(day.radSum / 12)} />
              <span className="text-sm font-bold text-gray-700">
                {day.tempMax}° <span className="font-normal text-gray-400">{day.tempMin}°</span>
              </span>
              <div className="w-full pt-1 border-t border-gray-200 flex flex-col gap-0.5">
                <span className="text-xs text-center text-amber-600 font-semibold">
                  {day.radSum} Wh/m²
                </span>
                <span className="text-xs text-center text-green-600 font-semibold">
                  ~{day.estGenKwh} Ah
                </span>
              </div>
              <div className="text-xs text-gray-400 flex flex-col items-center">
                <span>↑ {day.sunrise}</span>
                <span>↓ {day.sunset}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* NOTA METODOLOGÍA */}
      <div className="bg-gray-50 border border-gray-200 rounded px-4 py-3 text-xs text-gray-500">
        <span className="font-semibold">Nota metodológica:</span> La generación estimada se calcula
        mediante el modelo lineal <span className="font-mono">I = 8.0 × rad / 1000</span> (A),
        donde rad es la irradiancia en W/m². Los datos meteorológicos provienen de{' '}
        <a href="https://open-meteo.com" target="_blank" rel="noopener noreferrer"
           className="text-blue-500 hover:underline">Open-Meteo</a>.
        La comparativa con el sensor muestra la diferencia entre la previsión y la medida real.
      </div>

    </div>
  );
};

export default WeatherView;