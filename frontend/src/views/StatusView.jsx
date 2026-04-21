/**
 * StatusView.jsx
 * --------------
 * Mejoras Fase 3:
 *  - Historial completo de alertas paginado (GET /alerts/history)
 *  - Filtros por nivel y variable
 *  - Eliminar evaluateAlerts (ya lo hace AlertNotifier globalmente)
 */

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../services/api';
import SOCChart from '../utils/SOChart';
import {
  Loader2, RefreshCw, Trash2, Settings2,
  Activity, Zap, AlertTriangle, ShieldCheck,
  BatteryFull, BatteryMedium, BatteryWarning, Battery,
  ChevronLeft, ChevronRight, Filter, X
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

const VARIABLES_LIST = Object.keys(VARIABLE_LABELS);

// ─── Paginación ───────────────────────────────────────────────
const Pagination = ({ page, pages, total, onPage }) => {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
      <span className="text-xs text-slate-400 font-medium">
        {total} alerta{total !== 1 ? 's' : ''} en total
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page === 1}
          className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50
            disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft size={16} className="text-slate-600" />
        </button>
        <span className="text-sm font-semibold text-slate-700 px-2">
          {page} / {pages}
        </span>
        <button
          onClick={() => onPage(page + 1)}
          disabled={page === pages}
          className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50
            disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight size={16} className="text-slate-600" />
        </button>
      </div>
    </div>
  );
};

// ─── Componente principal ─────────────────────────────────────
const StatusView = ({ sensorId = 's1', onNavigate }) => {
  // Estado general
  const [status,      setStatus]      = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [clearing,    setClearing]    = useState(false);
  const [isRefreshing,setIsRefreshing]= useState(false);

  // Historial de alertas
  const [alertHistory,    setAlertHistory]    = useState(null);
  const [alertPage,       setAlertPage]       = useState(1);
  const [alertLevelFilter,setAlertLevelFilter]= useState('');
  const [alertVarFilter,  setAlertVarFilter]  = useState('');
  const [loadingHistory,  setLoadingHistory]  = useState(false);
  const [showFilters,     setShowFilters]     = useState(false);

  const LIMIT = 10;

  // ── Carga estado general ────────────────────────────────────
  const load = useCallback(async (manual = false) => {
    if (manual) setIsRefreshing(true);
    setError(null);
    try {
      const res = await api.getSFAStatus(sensorId);
      setStatus(res);
    } catch {
      setError('Error al cargar el estado. Comprueba la conexión.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [sensorId]);

  // ── Carga historial de alertas ──────────────────────────────
  const loadHistory = useCallback(async (page = 1) => {
    setLoadingHistory(true);
    try {
      const res = await api.getAlertsHistory(sensorId, {
        page,
        limit:    LIMIT,
        level:    alertLevelFilter || undefined,
        variable: alertVarFilter   || undefined,
      });
      setAlertHistory(res);
      setAlertPage(page);
    } catch {
      setAlertHistory(null);
    } finally {
      setLoadingHistory(false);
    }
  }, [sensorId, alertLevelFilter, alertVarFilter]);

  useEffect(() => {
    setLoading(true);
    load();
    const interval = setInterval(() => load(false), 10_000);
    return () => clearInterval(interval);
  }, [sensorId, load]);

  useEffect(() => { loadHistory(1); }, [loadHistory]);

  const handleClearAlerts = async () => {
    if (!window.confirm(`¿Eliminar todas las alertas del nodo ${sensorId}?`)) return;
    setClearing(true);
    await api.clearAlerts(sensorId);
    await Promise.all([load(), loadHistory(1)]);
    setClearing(false);
  };

  if (loading && !status) return (
    <div className="flex flex-col items-center justify-center h-96 bg-slate-50/50
      rounded-3xl border border-dashed border-slate-200 animate-in fade-in m-4 md:m-6">
      <Loader2 className="animate-spin text-indigo-500 mb-4" size={40} />
      <p className="text-sm text-slate-500 font-medium tracking-tight animate-pulse">
        Sincronizando telemetría...
      </p>
    </div>
  );

  // Lógica batería
  const pct = status?.battery_percent ?? 0;
  let battColor = 'bg-rose-500', battText = 'text-rose-600',
      battBg = 'bg-rose-50', BattIcon = BatteryWarning;
  if (pct > 60)      { battColor = 'bg-emerald-500'; battText = 'text-emerald-600'; battBg = 'bg-emerald-50'; BattIcon = BatteryFull; }
  else if (pct > 20) { battColor = 'bg-amber-400';   battText = 'text-amber-600';   battBg = 'bg-amber-50';   BattIcon = BatteryMedium; }
  else if (!status)  { battColor = 'bg-slate-300';   battText = 'text-slate-400';   battBg = 'bg-slate-50';   BattIcon = Battery; }

  const activeAlertsCount = status?.active_alerts ?? 0;
  const isGenerating      = status?.solar_generating;

  return (
    <div className="flex flex-col gap-6 w-full mx-auto p-4 md:p-6 text-slate-800 font-sans animate-in fade-in duration-500">

      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6
        bg-white p-6 border border-slate-100 shadow-sm rounded-2xl">
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
                <span className="text-xs text-slate-400 hidden sm:inline">
                  · Act: {new Date(status.last_update).toLocaleTimeString('es-ES')}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {onNavigate && (
            <button onClick={() => onNavigate('AlertRules')}
              className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200
                hover:bg-slate-50 text-sm font-semibold text-slate-700 rounded-xl shadow-sm flex-1 sm:flex-none justify-center">
              <Settings2 size={16} /> Umbrales
            </button>
          )}
          <button onClick={() => load(true)} disabled={isRefreshing}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700
              text-sm font-semibold text-white rounded-xl shadow-sm shadow-indigo-200
              disabled:opacity-50 flex-1 sm:flex-none justify-center">
            <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
            {isRefreshing ? 'Actualizando' : 'Actualizar'}
          </button>
        </div>
      </div>

      {/* ERROR */}
      {error && (
        <div className="bg-white border border-rose-100 p-5 flex items-center gap-4
          text-rose-700 shadow-sm rounded-2xl">
          <div className="p-2 bg-rose-50 rounded-full"><AlertTriangle size={20} className="text-rose-500" /></div>
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          {
            label: 'Modo Operativo', color: 'text-indigo-500', bg: 'bg-indigo-50',
            icon: <Settings2 size={20} className="text-indigo-500" strokeWidth={2} />,
            value: <span className="text-3xl font-bold tracking-tight text-indigo-900 capitalize">{status?.mode ?? '—'}</span>,
            sub: status?.mode === 'mock' ? 'Simulador de datos activado' : 'Recibiendo telemetría real',
            subColor: 'text-indigo-500',
          },
          {
            label: 'Corriente Generada', color: 'text-green-500', bg: 'bg-green-50',
            icon: <Zap size={20} className="text-green-500" strokeWidth={2} />,
            value: <span className="text-3xl font-bold tracking-tight text-green-500">{status?.i_generada ?? '—'}</span>,
            sub: (status?.i_generada ?? 0) > 0 ? 'Carga activa' : 'Sin generación en este momento',
            subColor: 'text-green-500',
          },
          {
            label: 'Generación Solar', color: 'text-emerald-500',
            bg: isGenerating ? 'bg-emerald-50' : 'bg-slate-100',
            icon: <Zap size={20} className={isGenerating ? 'text-emerald-500' : 'text-slate-400'} strokeWidth={2} />,
            value: <span className={`text-3xl font-bold tracking-tight ${isGenerating ? 'text-emerald-600' : 'text-slate-400'}`}>
              {isGenerating ? 'Activa' : 'Inactiva'}
            </span>,
            sub: isGenerating ? 'Paneles produciendo energía' : 'Sin producción en este momento',
            subColor: isGenerating ? 'text-emerald-600' : 'text-slate-500',
          },
          {
            label: 'Alertas Activas', color: 'text-rose-500',
            bg: activeAlertsCount > 0 ? 'bg-rose-50' : 'bg-slate-50',
            icon: activeAlertsCount > 0
              ? <AlertTriangle size={20} className="text-rose-500" strokeWidth={2} />
              : <ShieldCheck   size={20} className="text-slate-400" strokeWidth={2} />,
            value: <span className={`text-3xl font-bold tracking-tight ${activeAlertsCount > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
              {activeAlertsCount}
            </span>,
            sub: activeAlertsCount === 1 ? 'Incidencia detectada'
              : activeAlertsCount > 1   ? 'Incidencias detectadas'
              : 'Sistema operando estable',
            subColor: activeAlertsCount > 0 ? 'text-rose-600' : 'text-slate-500',
          },
        ].map((kpi, i) => (
          <div key={i} className="bg-white border border-slate-100 shadow-sm
            hover:shadow-md transition-shadow flex flex-col rounded-2xl overflow-hidden">
            <div className="px-6 py-5 flex justify-between items-center">
              <span className={`text-sm font-medium ${kpi.color}`}>{kpi.label}</span>
              <div className={`p-2 rounded-xl ${kpi.bg}`}>{kpi.icon}</div>
            </div>
            <div className="px-6 pb-6">{kpi.value}</div>
            <div className="bg-slate-50/50 px-6 py-4 border-t border-slate-100 mt-auto">
              <span className={`text-sm font-medium ${kpi.subColor}`}>{kpi.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* BATERÍA */}
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
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
          <div className={`h-full rounded-full transition-all duration-1000 ease-out ${battColor}`}
            style={{ width: `${pct}%` }} />
        </div>
        <div className="flex justify-between text-xs font-semibold text-slate-400 mt-3 px-1">
          <span>0%</span><span>50%</span><span>100%</span>
        </div>
      </div>

      {/* ALERTAS ACTIVAS (últimas 24h) */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-5 flex flex-col sm:flex-row
          sm:items-center justify-between gap-4">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <AlertTriangle size={22} className="text-indigo-400" /> Alertas Activas (24h)
          </h3>
          {status?.alerts?.length > 0 && (
            <button onClick={handleClearAlerts} disabled={clearing}
              className="flex items-center gap-2 text-sm font-semibold text-rose-600
                bg-rose-50 hover:bg-rose-100 px-4 py-2 rounded-xl transition-colors disabled:opacity-50">
              {clearing ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              Descartar todas
            </button>
          )}
        </div>
        <div className="p-6">
          {status?.alerts?.length > 0 ? (
            <div className="flex flex-col gap-4">
              {status.alerts.map((a, i) => (
                <div key={i} className={`p-5 rounded-2xl border text-sm flex flex-col
                  sm:flex-row sm:items-center gap-4 transition-all hover:shadow-md
                  ${a.level === 'critical' ? 'bg-rose-50/40 border-rose-100' : 'bg-amber-50/40 border-amber-100'}`}>
                  <div className="flex items-start sm:items-center gap-4 flex-1">
                    <div className={`p-2.5 rounded-full flex-shrink-0
                      ${a.level === 'critical' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'}`}>
                      <AlertTriangle size={20} strokeWidth={2} />
                    </div>
                    <div>
                      <p className={`font-semibold text-base
                        ${a.level === 'critical' ? 'text-rose-800' : 'text-amber-800'}`}>
                        {a.message}
                      </p>
                      {a.variable && (
                        <span className={`text-xs px-2.5 py-1 rounded-lg font-medium border mt-1.5 inline-block
                          ${a.level === 'critical'
                            ? 'bg-rose-50 border-rose-200 text-rose-700'
                            : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                          {VARIABLE_LABELS[a.variable] ?? a.variable}
                        </span>
                      )}
                    </div>
                  </div>
                  {a.timestamp && (
                    <div className="flex sm:flex-col items-center sm:items-end gap-2 sm:gap-1
                      text-sm font-medium text-slate-500 pl-14 sm:pl-0 border-t sm:border-t-0
                      border-slate-200/50 pt-3 sm:pt-0">
                      <span>{new Date(a.timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}</span>
                      <span className="text-xs">{new Date(a.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-8
              flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="flex flex-col sm:flex-row items-center gap-5">
                <div className="bg-emerald-100 p-4 rounded-full text-emerald-600">
                  <ShieldCheck size={32} strokeWidth={1.5} />
                </div>
                <div>
                  <h4 className="text-emerald-800 font-bold text-lg">Sistema operando con normalidad</h4>
                  <p className="text-emerald-600 text-sm mt-1">No hay alertas activas en las últimas 24 horas.</p>
                </div>
              </div>
              {onNavigate && (
                <button onClick={() => onNavigate('AlertRules')}
                  className="flex items-center gap-2 text-sm font-semibold text-emerald-700
                    bg-white border border-emerald-200 hover:bg-emerald-50 px-5 py-2.5 rounded-xl shadow-sm whitespace-nowrap">
                  <Settings2 size={16} /> Ver umbrales
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* HISTORIAL COMPLETO DE ALERTAS */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-5 flex flex-col sm:flex-row
          sm:items-center justify-between gap-4">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <Activity size={22} className="text-indigo-400" />
            Historial Completo de Alertas
            {alertHistory?.total != null && (
              <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full ml-1">
                {alertHistory.total}
              </span>
            )}
          </h3>
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-all
              ${showFilters
                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-200'}`}
          >
            <Filter size={13} /> Filtros
          </button>
        </div>

        {/* Filtros */}
        {showFilters && (
          <div className="px-6 py-4 bg-slate-50/50 border-b border-slate-100 flex flex-wrap gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nivel</label>
              <select
                value={alertLevelFilter}
                onChange={e => { setAlertLevelFilter(e.target.value); setAlertPage(1); }}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white
                  focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              >
                <option value="">Todos</option>
                <option value="warning">Aviso</option>
                <option value="critical">Crítico</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Variable</label>
              <select
                value={alertVarFilter}
                onChange={e => { setAlertVarFilter(e.target.value); setAlertPage(1); }}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white
                  focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              >
                <option value="">Todas</option>
                {VARIABLES_LIST.map(v => (
                  <option key={v} value={v}>{VARIABLE_LABELS[v]}</option>
                ))}
              </select>
            </div>
            {(alertLevelFilter || alertVarFilter) && (
              <button
                onClick={() => { setAlertLevelFilter(''); setAlertVarFilter(''); }}
                className="self-end flex items-center gap-1 px-3 py-2 text-xs font-bold
                  text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
              >
                <X size={12} /> Limpiar
              </button>
            )}
          </div>
        )}

        {/* Tabla historial */}
        {loadingHistory ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="animate-spin text-indigo-400" size={28} />
          </div>
        ) : !alertHistory?.alerts?.length ? (
          <div className="p-8 text-center text-slate-400">
            <p className="text-sm font-medium">Sin alertas en el historial</p>
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    <th className="px-6 py-4">Fecha</th>
                    <th className="px-6 py-4">Variable</th>
                    <th className="px-6 py-4">Nivel</th>
                    <th className="px-6 py-4">Valor</th>
                    <th className="px-6 py-4">Mensaje</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {alertHistory.alerts.map(a => (
                    <tr key={a.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {new Date(a.timestamp).toLocaleString('es-ES', {
                          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                        })}
                      </td>
                      <td className="px-6 py-3 text-sm font-medium text-slate-700">
                        {VARIABLE_LABELS[a.variable] ?? a.variable}
                      </td>
                      <td className="px-6 py-3">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide
                          ${a.level === 'critical' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                          {a.level === 'critical' ? 'Crítico' : 'Aviso'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm font-mono text-slate-600">
                        {a.value ?? '—'}
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-600 max-w-xs truncate" title={a.message}>
                        {a.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="md:hidden divide-y divide-slate-100">
              {alertHistory.alerts.map(a => (
                <div key={a.id} className="px-5 py-4 flex items-start gap-4">
                  <span className={`mt-0.5 flex-shrink-0 text-[10px] font-black px-2 py-1 rounded-full uppercase
                    ${a.level === 'critical' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                    {a.level === 'critical' ? 'Crítico' : 'Aviso'}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{a.message}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                      <span>{VARIABLE_LABELS[a.variable] ?? a.variable}</span>
                      <span>·</span>
                      <span>{new Date(a.timestamp).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Pagination
              page={alertPage}
              pages={alertHistory.pages}
              total={alertHistory.total}
              onPage={(p) => loadHistory(p)}
            />
          </>
        )}
      </div>

      {/* SOC */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-5 flex items-center gap-2">
          <Activity size={22} className="text-indigo-400" />
          <h3 className="text-lg font-semibold text-slate-800">Curva de Carga (SOC) - Últimas 24h</h3>
        </div>
        <div className="p-4 sm:p-6">
          <SOCChart sensorId={sensorId} hours={24} />
        </div>
      </div>

    </div>
  );
};

export default StatusView;