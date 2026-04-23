/**
 * SOChart.jsx  (v2.1 — tolerante a fallos)
 * -----------------------------------------
 * Cada endpoint falla de forma independiente:
 *   GET /sfa/history        → historial v_bateria (siempre existente)
 *   GET /sfa/soc/current    → SOC del backend     (puede no estar aún)
 *
 * Si /soc/current no está desplegado aún, el gráfico de tensión
 * sigue funcionando y muestra un aviso amarillo en su lugar.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  PointElement, LineElement,
  Tooltip, Legend, Filler,
} from 'chart.js';
import { Loader2, ZoomOut, Download, RefreshCw, CheckCircle2, AlertCircle, AlertTriangle } from 'lucide-react';
import { api } from '../services/api';
import zoomPlugin from 'chartjs-plugin-zoom';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler, zoomPlugin);

const exportCSV = (voltagePoints, sensorId, hours) => {
  if (!voltagePoints?.length) return;
  const header = 'timestamp,voltage_v\n';
  const rows   = voltagePoints.map(p => `${p.timestamp},${p.value}`).join('\n');
  const blob   = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement('a');
  a.href = url; a.download = `${sensorId}_tensión_${hours}h.csv`; a.click();
  URL.revokeObjectURL(url);
};

const MethodBadge = ({ method, hoursSince }) => {
  if (!method || method === 'default')
    return <span className="text-[10px] font-bold text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">Sin calibrar</span>;
  if (method === 'ocv_calibration')
    return <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded"><CheckCircle2 size={10} /> OCV calibrado</span>;
  if (method === 'coulomb_counting') {
    const color = hoursSince == null ? 'text-blue-700 bg-blue-50 border-blue-200'
                : hoursSince < 12   ? 'text-blue-700 bg-blue-50 border-blue-200'
                : hoursSince < 24   ? 'text-amber-700 bg-amber-50 border-amber-200'
                :                     'text-rose-700 bg-rose-50 border-rose-200';
    return <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${color}`}>Coulomb{hoursSince != null ? ` · cal. hace ${hoursSince}h` : ''}</span>;
  }
  return null;
};

const SOCChart = ({ sensorId = 's1', hours = 24, title = 'Estado de carga (SOC)' }) => {
  const [voltagePoints, setVoltagePoints] = useState([]);
  const [socState,      setSocState]      = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [voltError,     setVoltError]     = useState(null);
  const [socError,      setSocError]      = useState(null);
  const [calibrating,   setCalibrating]   = useState(false);
  const [calibMsg,      setCalibMsg]      = useState(null);
  const chartRef = useRef(null);

  const load = useCallback(async () => {
    setVoltError(null);
    setSocError(null);

    // Promise.allSettled: cada endpoint falla de forma independiente
    const [voltResult, socResult] = await Promise.allSettled([
      api.getSFAHistory(sensorId, 'v_bateria', hours),
      api.getSocCurrent(sensorId),
    ]);

    if (voltResult.status === 'fulfilled') {
      setVoltagePoints(voltResult.value?.points ?? []);
    } else {
      console.error('[SOCChart] /history v_bateria:', voltResult.reason);
      setVoltError('No se pudo cargar el historial de tensión.');
    }

    if (socResult.status === 'fulfilled') {
      setSocState(socResult.value ?? null);
    } else {
      const status = socResult.reason?.response?.status;
      const msg    = socResult.reason?.response?.data?.detail ?? socResult.reason?.message ?? 'Error desconocido';
      console.error(`[SOCChart] /soc/current HTTP ${status}:`, msg);
      setSocError(`HTTP ${status ?? '?'} — ${msg}`);
    }

    setLoading(false);
  }, [sensorId, hours]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const handleCompute = async () => {
    setCalibrating(true); setCalibMsg(null);
    try {
      const res = await api.computeSoc(sensorId);
      setSocState(prev => ({ ...(prev ?? {}), ...res }));
      setSocError(null);
      setCalibMsg({ type: 'ok', text: `SOC = ${res.soc_pct}%  (${res.method}${res.delta_ah != null ? `  ΔAh=${res.delta_ah > 0 ? '+' : ''}${res.delta_ah}` : ''})` });
    } catch (err) {
      const detail = err?.response?.data?.detail ?? err?.message ?? 'Error desconocido';
      setCalibMsg({ type: 'err', text: `Error al recalcular: ${detail}` });
    } finally {
      setCalibrating(false);
      setTimeout(() => setCalibMsg(null), 8000);
    }
  };

  const handleCalibrate = async () => {
    setCalibrating(true); setCalibMsg(null);
    try {
      const res = await api.calibrateSoc(sensorId);
      setSocState(prev => ({ ...(prev ?? {}), ...res }));
      setSocError(null);
      setCalibMsg({ type: 'ok', text: `OCV calibrado: ${res.soc_pct}% con ${res.voltage_used}V en reposo` });
    } catch (err) {
      const detail = err?.response?.data?.detail ?? 'Batería no en reposo (necesita >=30 min con i<0.1A).';
      setCalibMsg({ type: 'warn', text: detail });
    } finally {
      setCalibrating(false);
      setTimeout(() => setCalibMsg(null), 7000);
    }
  };

  if (loading) return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 flex items-center justify-center h-48">
      <Loader2 className="animate-spin text-blue-500" size={32} />
    </div>
  );

  // Error total solo si historial también falla
  if (voltError && !voltagePoints.length) return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-rose-100 flex flex-col gap-3">
      <p className="text-rose-600 text-sm flex items-center gap-2 font-medium">
        <AlertCircle size={16} /> Error al cargar historial de tensión
      </p>
      <p className="text-xs text-slate-500 font-mono bg-slate-50 px-3 py-2 rounded-lg">{voltError}</p>
      <button onClick={() => { setLoading(true); load(); }}
        className="self-start flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-600 rounded-xl">
        <RefreshCw size={13} /> Reintentar
      </button>
    </div>
  );

  const labels     = voltagePoints.map(p => {
    const d = new Date(p.timestamp);
    return hours > 24
      ? d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      : d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  });
  const voltages   = voltagePoints.map(p => p.value);
  const currentSOC = socState?.soc_pct ?? null;
  const ahRemaining = currentSOC != null ? ((currentSOC / 100) * 7.2).toFixed(2) : null;

  const chartData = {
    labels,
    datasets: [{
      label:           'Tensión (V)',
      data:            voltages,
      borderColor:     '#10B981',
      backgroundColor: 'rgba(16,185,129,0.08)',
      borderWidth:     2,
      pointRadius:     0,
      tension:         0.4,
      fill:            true,
      yAxisID:         'yVolt',
    }],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      zoom:   { pan: { enabled: true, mode: 'x' }, zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' } },
      tooltip: {
        backgroundColor: 'rgba(255,255,255,0.95)',
        titleColor: '#1f2937', bodyColor: '#1f2937', borderColor: '#e5e7eb', borderWidth: 1, padding: 10,
        callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}V` }
      }
    },
    scales: {
      x: { ticks: { maxTicksLimit: 7, font: { size: 10 }, color: '#9ca3af' }, grid: { display: false } },
      yVolt: { type: 'linear', position: 'left', min: 10, max: 16, ticks: { font: { size: 10 }, color: '#10b981', callback: v => `${v}V` }, grid: { color: '#f3f4f6' } },
    },
  };

  return (
    <div className="group bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all flex flex-col gap-4">

      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)] flex-shrink-0" />
          <span className="font-bold text-slate-800 text-sm">{title}</span>
          <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded uppercase">Últimas {hours}h</span>
          <MethodBadge method={socState?.method} hoursSince={socState?.hours_since_calib} />
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleCompute} disabled={calibrating}
            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all disabled:opacity-50"
            title="Recalcular SOC">
            <RefreshCw size={14} className={calibrating ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => chartRef.current?.resetZoom()}
            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
            title="Restablecer zoom">
            <ZoomOut size={14} />
          </button>
          <button onClick={() => exportCSV(voltagePoints, sensorId, hours)}
            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
            title="Exportar CSV">
            <Download size={14} />
          </button>
        </div>
      </div>

      {/* Aviso si /soc/current falla — no bloquea el gráfico */}
      {socError && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertTriangle size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-amber-700">
            <p className="font-bold mb-0.5">SOC no disponible (endpoint /soc/current)</p>
            <p className="font-mono text-[10px] text-amber-600">{socError}</p>
            <p className="mt-1 text-amber-600">Despliega <code>soc_routes.py</code> en Railway y asegúrate de que <code>app.include_router(soc_router)</code> está en main.py.</p>
          </div>
        </div>
      )}

      {/* SOC + barra — solo si tenemos el dato */}
      {currentSOC != null && (
        <div className="flex items-center gap-5">
          <div className="flex flex-col items-center min-w-[4.5rem]">
            <span className={`text-5xl font-black tracking-tight
              ${currentSOC > 60 ? 'text-emerald-600' : currentSOC > 20 ? 'text-amber-500' : 'text-rose-600'}`}>
              {currentSOC}%
            </span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">SOC</span>
          </div>
          <div className="flex-1 flex flex-col gap-1.5">
            <div className="w-full bg-slate-100 rounded-full h-4 overflow-hidden shadow-inner">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${currentSOC > 60 ? 'bg-emerald-500' : currentSOC > 20 ? 'bg-amber-400' : 'bg-rose-500'}`}
                style={{ width: `${currentSOC}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] font-semibold text-slate-400 px-0.5">
              <span>0%</span><span>50%</span><span>100%</span>
            </div>
            <div className="text-xs text-slate-400 flex flex-wrap gap-x-3 gap-y-1 mt-0.5">
              <span>Tensión: <strong className="text-slate-700">{voltages.at(-1) ?? '—'} V</strong></span>
              <span>Capacidad: <strong className="text-slate-700">7.2 Ah</strong></span>
              {ahRemaining && (
                <span>Carga restante: <strong className={currentSOC > 20 ? 'text-emerald-600' : 'text-rose-600'}>~{ahRemaining} Ah</strong></span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mensaje de calibración */}
      {calibMsg && (
        <div className={`text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-2
          ${calibMsg.type === 'ok'   ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          : calibMsg.type === 'warn' ? 'bg-amber-50 text-amber-700 border border-amber-200'
          :                            'bg-rose-50 text-rose-700 border border-rose-200'}`}>
          {calibMsg.type === 'ok' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          {calibMsg.text}
        </div>
      )}

      {/* Panel OCV — solo si el endpoint está disponible */}
      {!socError && (
        <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="text-xs text-slate-500 flex-1">
            <p className="font-bold text-slate-700 mb-0.5">Calibración OCV automática</p>
            <p>Activa ~04:00 AM si i_gen &lt; 0.1A e i_carga &lt; 0.1A durante &ge;30 min (batería en reposo).</p>
            {socState?.last_calibrated && (
              <p className="mt-1 text-slate-400">
                Última:{' '}
                <strong className="text-slate-600">
                  {new Date(socState.last_calibrated).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </strong>
                {socState.calibration_soc != null && ` → ${socState.calibration_soc}%`}
              </p>
            )}
          </div>
          <button onClick={handleCalibrate} disabled={calibrating}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-indigo-50 hover:border-indigo-300 text-xs font-bold text-slate-600 hover:text-indigo-700 rounded-xl transition-all disabled:opacity-50 whitespace-nowrap">
            {calibrating ? <><Loader2 size={13} className="animate-spin" /> Calibrando...</> : <><CheckCircle2 size={13} /> Calibrar OCV</>}
          </button>
        </div>
      )}

      {/* Gráfica tensión — siempre visible si hay datos */}
      <div className="h-44 w-full">
        {voltagePoints.length > 0 ? (
          <Line ref={chartRef} data={chartData} options={options} />
        ) : (
          <div className="h-full flex items-center justify-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            <p className="text-sm">Sin datos de tensión en las últimas {hours}h</p>
          </div>
        )}
      </div>

    </div>
  );
};

export default SOCChart;