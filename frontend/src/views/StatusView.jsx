/**
 * StatusView.jsx
 * --------------
 * Panel de estado en tiempo real del nodo.
 * Estilo: Premium, Modern SaaS (Curvas suaves, paleta apastelada, sombras sutiles).
 */

import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import SOCChart from '../utils/SOChart';
import { 
  Loader2, RefreshCw, Trash2, Settings2, 
  Activity, Zap, AlertTriangle, ShieldCheck,
  BatteryFull, BatteryMedium, BatteryWarning, Battery
} from 'lucide-react';

const VARIABLE_LABELS = {
  radiacion:  'Radiación solar',
  temp_amb:   'Temp. ambiente',
  i_generada: 'Corriente generada',
  v_bateria:  'Tensión batería',
  temp_pan:   'Temperatura panel',
  i_carga:    'Corriente carga',
  temp_bat:   'Temp. batería',
};

const StatusView = ({ sensorId = 's1', onNavigate }) => {
  const [status, setStatus]     = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [clearing, setClearing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = async (manual = false) => {
    if (manual) setIsRefreshing(true);
    await api.evaluateAlerts(sensorId);
    setError(null);
    try {
      const res = await api.getSFAStatus(sensorId);
      setStatus(res);
    } catch (e) {
      setError('Error al cargar el estado. Comprueba la conexión.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleClearAlerts = async () => {
    if (!window.confirm(`¿Estás seguro de eliminar todas las alertas del nodo ${sensorId}?`)) return;
    setClearing(true);
    await api.clearAlerts(sensorId);
    await load();
    setClearing(false);
  };

  useEffect(() => {
    setLoading(true);
    load();
    const interval = setInterval(() => load(false), 10000);
    return () => clearInterval(interval);
  }, [sensorId]);

  if (loading && !status) return (
    <div className="flex flex-col items-center justify-center h-96 bg-slate-50/50 rounded-3xl border border-dashed border-slate-200 animate-in fade-in m-4 md:m-6">
      <Loader2 className="animate-spin text-indigo-500 mb-4" size={40} />
      <p className="text-sm text-slate-500 font-medium tracking-tight animate-pulse">
        Sincronizando telemetría...
      </p>
    </div>
  );

  // Lógica de Batería (Estilizada)
  const pct = status?.battery_percent ?? 0;
  let battColor = 'bg-rose-500';
  let battText  = 'text-rose-600';
  let battBg    = 'bg-rose-50';
  let BattIcon  = BatteryWarning;

  if (pct > 60) { 
    battColor = 'bg-emerald-500'; 
    battText  = 'text-emerald-600'; 
    battBg    = 'bg-emerald-50';
    BattIcon  = BatteryFull; 
  } else if (pct > 20) { 
    battColor = 'bg-amber-400'; 
    battText  = 'text-amber-600'; 
    battBg    = 'bg-amber-50';
    BattIcon  = BatteryMedium; 
  } else if (pct === 0 && !status) {
    battColor = 'bg-slate-300';
    battText  = 'text-slate-400';
    battBg    = 'bg-slate-50';
    BattIcon  = Battery;
  }

  const activeAlertsCount = status?.active_alerts ?? 0;
  const isGenerating = status?.solar_generating;

  return (
    <div className="flex flex-col gap-6 w-full mx-auto p-4 md:p-6 text-slate-800 font-sans animate-in fade-in duration-500">

      {/* HEADER CONTROLS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-white p-6 border border-slate-100 shadow-sm rounded-2xl">
        <div className="flex items-center gap-5">
          <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-2xl shadow-sm border border-indigo-100/50">
            <Activity size={26} strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">Estado del Sistema</h2>
            <div className="flex items-center gap-2 text-sm text-slate-500 mt-0.5">
              <span>Nodo activo:</span>
              <span className="font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md font-mono text-xs">
                {sensorId}
              </span>
              {status?.last_update && (
                <>
                  <span className="text-slate-300 hidden sm:inline">|</span>
                  <span className="text-xs text-slate-400 hidden sm:inline-block">
                    Act: {new Date(status.last_update).toLocaleTimeString('es-ES')}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {onNavigate && (
            <button
              onClick={() => onNavigate('AlertRules')}
              className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-sm font-semibold text-slate-700 transition-colors rounded-xl shadow-sm flex-1 sm:flex-none justify-center"
            >
              <Settings2 size={16} />
              <span>Umbrales</span>
            </button>
          )}
          <button
            onClick={() => load(true)}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-sm font-semibold text-white transition-colors disabled:opacity-50 rounded-xl shadow-sm shadow-indigo-200 flex-1 sm:flex-none justify-center"
          >
            <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
            {isRefreshing ? 'Actualizando' : 'Actualizar'}
          </button>
        </div>
      </div>

      {/* ERROR BANNER */}
      {error && (
        <div className="bg-white border border-rose-100 p-5 flex items-center gap-4 text-rose-700 shadow-sm rounded-2xl animate-in slide-in-from-top-2">
          <div className="p-2 bg-rose-50 rounded-full">
            <AlertTriangle size={20} className="text-rose-500" />
          </div>
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {/* KPIs SUPERIORES */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        
        {/* KPI: Modo */}
        <div className="bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow flex flex-col rounded-2xl overflow-hidden">
          <div className="px-6 py-5 flex justify-between items-center">
            <span className="text-sm font-medium text-indigo-500">Modo Operativo</span>
            <div className="p-2 bg-indigo-50 rounded-xl">
              <Settings2 size={20} className="text-indigo-500" strokeWidth={2} />
            </div>
          </div>
          <div className="px-6 pb-6">
            <span className="text-3xl font-bold tracking-tight text-indigo-900 capitalize">
              {status?.mode ?? '—'}
            </span>
          </div>
          <div className="bg-slate-50/50 px-6 py-4 border-t border-slate-100 mt-auto">
            <span className="text-sm font-medium text-indigo-500">
              {status?.mode === 'mock' ? 'Simulador de datos activado' : 'Recibiendo telemetría real'}
            </span>
          </div>
        </div>

        {/* KPI: Corriente Generada */}
        <div className="bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow flex flex-col rounded-2xl overflow-hidden">
          <div className="px-6 py-5 flex justify-between items-center">
            <span className="text-sm font-medium text-green-500">Corriente Generada</span>
            <div className="p-2 bg-indigo-50 rounded-xl">
              <Zap size={20} className="text-green-500" strokeWidth={2} />
            </div>
          </div>
          <div className="px-6 pb-6">
            <span className="text-3xl font-bold tracking-tight text-green-500 capitalize">
              {status?.i_generada ?? '—'}
            </span>
          </div>
          <div className="bg-slate-50/50 px-6 py-4 border-t border-slate-100 mt-auto">
            <span className="text-sm font-medium text-green-500">
              {status?.i_generada > 0 ? 'Carga activa' : 'Sin generación en este momento'}
            </span>
          </div>
        </div>

        {/* KPI: Generación */}
        <div className={`bg-white border ${isGenerating ? 'border-emerald-100' : 'border-slate-100'} shadow-sm hover:shadow-md transition-shadow flex flex-col rounded-2xl overflow-hidden`}>
          <div className="px-6 py-5 flex justify-between items-center">
            <span className="text-sm font-medium text-emerald-500">Generación Solar</span>
            <div className={`p-2 rounded-xl ${isGenerating ? 'bg-emerald-50' : 'bg-slate-100'}`}>
              <Zap size={20} className={isGenerating ? 'text-emerald-500' : 'text-slate-400'} strokeWidth={2} />
            </div>
          </div>
          <div className="px-6 pb-6">
            <span className={`text-3xl font-bold tracking-tight ${isGenerating ? 'text-emerald-600' : 'text-slate-400'}`}>
              {isGenerating ? 'Activa' : 'Inactiva'}
            </span>
          </div>
          <div className={`px-6 py-4 border-t mt-auto ${isGenerating ? 'bg-emerald-50/30 border-emerald-50' : 'bg-slate-50/50 border-slate-100'}`}>
            <span className={`text-sm font-medium ${isGenerating ? 'text-emerald-600' : 'text-slate-500'}`}>
              {isGenerating ? 'Paneles produciendo energía' : 'Sin producción en este momento'}
            </span>
          </div>
        </div>

        {/* KPI: Alertas */}
        <div className={`bg-white border ${activeAlertsCount > 0 ? 'border-rose-100' : 'border-slate-100'} shadow-sm hover:shadow-md transition-shadow flex flex-col rounded-2xl overflow-hidden`}>
          <div className="px-6 py-5 flex justify-between items-center">
            <span className="text-sm font-medium text-rose-500">Alertas Activas</span>
            <div className={`p-2 rounded-xl ${activeAlertsCount > 0 ? 'bg-rose-50' : 'bg-slate-50'}`}>
              {activeAlertsCount > 0 
                ? <AlertTriangle size={20} className="text-rose-500" strokeWidth={2} /> 
                : <ShieldCheck size={20} className="text-slate-400" strokeWidth={2} />
              }
            </div>
          </div>
          <div className="px-6 pb-6 flex items-baseline gap-2">
            <span className={`text-3xl font-bold tracking-tight ${activeAlertsCount > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
              {activeAlertsCount}
            </span>
          </div>
          <div className={`px-6 py-4 border-t mt-auto ${activeAlertsCount > 0 ? 'bg-rose-50/30 border-rose-50' : 'bg-slate-50/50 border-slate-100'}`}>
            <span className={`text-sm font-medium ${activeAlertsCount > 0 ? 'text-rose-600' : 'text-slate-500'}`}>
               {activeAlertsCount === 1 ? 'Incidencia detectada' : activeAlertsCount > 1 ? 'Incidencias detectadas' : 'Sistema operando estable'}
            </span>
          </div>
        </div>

      </div>

      {/* ESTADO DE BATERÍA ESTILIZADO */}
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden flex flex-col justify-center min-h-[160px]">
        {/* Decoración de fondo */}
        <div className={`absolute -right-6 -top-6 opacity-5 ${battText} pointer-events-none`}>
          <BattIcon size={180} />
        </div>
        
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-6 relative z-10 gap-4">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-xl ${battBg} ${battText} shadow-sm border border-white`}>
              <BattIcon size={24} strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-500">Capacidad de Batería (SOC)</h3>
              <p className="text-xs text-slate-400 mt-0.5">Nivel de carga en tiempo real</p>
            </div>
          </div>
          <span className={`text-5xl font-bold tracking-tight ${battText}`}>{pct}%</span>
        </div>
        
        <div className="w-full bg-slate-100 rounded-full h-4 overflow-hidden relative z-10 shadow-inner">
          <div
            className={`h-full rounded-full transition-all duration-1000 ease-out ${battColor} relative overflow-hidden`}
            style={{ width: `${pct}%` }}
          >
            {/* Efecto de brillo sutil */}
            <div className="absolute top-0 bottom-0 left-0 right-0 bg-white/20 w-full animate-[shimmer_2s_infinite] -translate-x-full" />
          </div>
        </div>
        
        <div className="flex justify-between text-xs font-semibold text-slate-400 mt-3 relative z-10 px-1">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>

      {/* PANEL DE ALERTAS */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        
        <div className="border-b border-slate-100 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
           <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
             <AlertTriangle size={22} className="text-indigo-400" />
             Registro de Alertas
           </h3>
           
           {status?.alerts?.length > 0 && (
             <button
               onClick={handleClearAlerts}
               disabled={clearing}
               className="flex items-center justify-center gap-2 text-sm font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
             >
               {clearing ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
               Descartar todas
             </button>
           )}
        </div>

        <div className="p-6">
          {status?.alerts?.length > 0 ? (
            <div className="flex flex-col gap-4">
              {status.alerts.map((a, i) => (
                <div
                  key={i}
                  className={`p-5 rounded-2xl border text-sm flex flex-col sm:flex-row sm:items-center gap-4 transition-all hover:shadow-md
                    ${a.level === 'critical'
                      ? 'bg-rose-50/40 border-rose-100'
                      : 'bg-amber-50/40 border-amber-100'}`}
                >
                  <div className="flex items-start sm:items-center gap-4 flex-1">
                    <div className={`p-2.5 rounded-full flex-shrink-0 ${a.level === 'critical' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'}`}>
                      <AlertTriangle size={20} strokeWidth={2} />
                    </div>
                    <div>
                      <p className={`font-semibold text-base ${a.level === 'critical' ? 'text-rose-800' : 'text-amber-800'}`}>
                        {a.message}
                      </p>
                      {a.variable && (
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className={`text-xs px-2.5 py-1 rounded-lg font-medium border
                            ${a.level === 'critical' ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                            {VARIABLE_LABELS[a.variable] ?? a.variable}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {a.timestamp && (
                    <div className="flex sm:flex-col items-center sm:items-end gap-2 sm:gap-1 text-sm font-medium text-slate-500 pl-14 sm:pl-0 border-t sm:border-t-0 border-slate-200/50 pt-3 sm:pt-0">
                      <span>{new Date(a.timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}</span>
                      <span className="text-xs">{new Date(a.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-8 flex flex-col sm:flex-row items-center justify-between gap-6 text-center sm:text-left">
              <div className="flex flex-col sm:flex-row items-center gap-5">
                <div className="bg-emerald-100 p-4 rounded-full text-emerald-600">
                  <ShieldCheck size={32} strokeWidth={1.5} />
                </div>
                <div>
                  <h4 className="text-emerald-800 font-bold text-lg">Sistema operando con normalidad</h4>
                  <p className="text-emerald-600 text-sm mt-1">No hay alertas activas en este momento para el nodo seleccionado.</p>
                </div>
              </div>
              {onNavigate && (
                <button
                  onClick={() => onNavigate('AlertRules')}
                  className="flex items-center gap-2 text-sm font-semibold text-emerald-700 bg-white border border-emerald-200 hover:bg-emerald-50 px-5 py-2.5 rounded-xl transition-colors shadow-sm whitespace-nowrap"
                >
                  <Settings2 size={16} />
                  Ver umbrales
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* GRÁFICA SOC (Estado de carga) */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-5 flex items-center gap-2">
           <Activity size={22} className="text-indigo-400" />
           <h3 className="text-lg font-semibold text-slate-800">
             Curva de Carga (SOC) - Últimas 24h
           </h3>
        </div>
        <div className="p-4 sm:p-6">
          <SOCChart sensorId={sensorId} hours={24} />
        </div>
      </div>

    </div>
  );
};

export default StatusView;