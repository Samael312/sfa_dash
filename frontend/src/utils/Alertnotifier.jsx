/**
 * AlertNotifier.jsx
 * -----------------
 * Corrección: timestamps de alertas y snoozes en UTC.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  AlertTriangle, X, ChevronDown, ChevronUp,
  BellOff, Bell, Clock
} from 'lucide-react';
import { api } from '../services/api';
import { fmtTime } from '../utils/formatTimestamp';

const POLL_INTERVAL  = 30_000;
const SNOOZE_OPTIONS = [1, 2, 4, 8, 24];

const LEVEL_CONFIG = {
  critical: {
    bg:     'bg-rose-600 dark:bg-rose-700',
    border: 'border-rose-700 dark:border-rose-800',
    badge:  'bg-rose-800 text-rose-100',
    label:  'CRÍTICO',
  },
  warning: {
    bg:     'bg-amber-500 dark:bg-amber-600',
    border: 'border-amber-600 dark:border-amber-700',
    badge:  'bg-amber-600 text-amber-100',
    label:  'AVISO',
  },
  trend_warning: {
    bg:     'bg-sky-500 dark:bg-sky-600',
    border: 'border-sky-600 dark:border-sky-700',
    badge:  'bg-sky-700 text-sky-100',
    label:  'TENDENCIA',
  },
  trend_critical: {
    bg:     'bg-purple-600 dark:bg-purple-700',
    border: 'border-purple-700 dark:border-purple-800',
    badge:  'bg-purple-800 text-purple-100',
    label:  'TENDENCIA ↑↑',
  },
};

const getCfg = (level) => LEVEL_CONFIG[level] ?? LEVEL_CONFIG.warning;

const AlertNotifier = ({ sensorId }) => {
  const [alerts,       setAlerts]       = useState([]);
  const [snoozes,      setSnoozes]      = useState([]);
  const [expanded,     setExpanded]     = useState(false);
  const [dismissed,    setDismissed]    = useState(false);
  const [showSnooze,   setShowSnooze]   = useState(false);
  const [snoozingVar,  setSnoozingVar]  = useState(null);
  const timerRef = useRef(null);

  const fetchAlerts = useCallback(async () => {
    try {
      await api.evaluateAlertsFull?.(sensorId) ?? await api.evaluateAlerts(sensorId);

      const [statusRes, snoozeRes] = await Promise.all([
        api.getSFAStatus(sensorId),
        api.getSnoozes?.(sensorId).catch(() => ({ snoozes: [] })),
      ]);

      const active = statusRes?.alerts ?? [];
      setAlerts(active);
      setSnoozes(snoozeRes?.snoozes ?? []);

      if (active.length > 0) setDismissed(false);
    } catch {
      // Silencioso
    }
  }, [sensorId]);

  useEffect(() => {
    if (!sensorId) return;
    setDismissed(false);
    setAlerts([]);
    fetchAlerts();
    timerRef.current = setInterval(fetchAlerts, POLL_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, [sensorId, fetchAlerts]);

  const handleSnooze = async (variable, hours) => {
    try {
      setSnoozingVar(variable);
      await api.snoozeAlert?.({ sensor_id: sensorId, variable, hours });
      setShowSnooze(false);
      await fetchAlerts();
    } catch {
      // Silencioso
    } finally {
      setSnoozingVar(null);
    }
  };

  const handleSnoozeAll = async (hours) => {
    try {
      await api.snoozeAlert?.({ sensor_id: sensorId, variable: null, hours });
      setDismissed(true);
      setShowSnooze(false);
      await fetchAlerts();
    } catch {}
  };

  if (!alerts.length || dismissed) return null;

  const priority = ['critical', 'trend_critical', 'trend_warning', 'warning'];
  const topLevel = priority.find(l => alerts.some(a => a.level === l)) ?? 'warning';
  const topAlert = alerts.find(a => a.level === topLevel) ?? alerts[0];
  const cfg      = getCfg(topLevel);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`fixed bottom-24 md:bottom-6 right-4 md:right-6 z-[200]
        w-[calc(100vw-2rem)] max-w-sm rounded-2xl shadow-2xl border
        ${cfg.border} ${cfg.bg} text-white overflow-hidden
        transition-all duration-300 animate-in slide-in-from-bottom-4`}
    >
      {/* CABECERA */}
      <div className="flex items-center gap-3 px-4 py-3">
        <AlertTriangle size={20} className="flex-shrink-0 opacity-90 animate-pulse" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${getCfg(topLevel).badge}`}>
              {getCfg(topLevel).label}
            </span>
            <span className="text-xs font-bold opacity-80">
              {alerts.length} incidencia{alerts.length > 1 ? 's' : ''} · {sensorId}
            </span>
          </div>
          <p className="text-sm font-semibold truncate mt-0.5 leading-tight">{topAlert.message}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => setShowSnooze(v => !v)}
            className="p-1.5 hover:bg-white/20 rounded-lg transition-colors" title="Silenciar alertas">
            <BellOff size={15} />
          </button>
          {alerts.length > 1 && (
            <button onClick={() => setExpanded(v => !v)}
              className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
              title={expanded ? 'Contraer' : 'Ver todas'}>
              {expanded ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
            </button>
          )}
          <button onClick={() => setDismissed(true)}
            className="p-1.5 hover:bg-white/20 rounded-lg transition-colors" title="Cerrar">
            <X size={15} />
          </button>
        </div>
      </div>

      {/* PANEL SNOOZE */}
      {showSnooze && (
        <div className="border-t border-white/20 bg-black/20 px-4 py-3">
          <p className="text-xs font-bold opacity-80 mb-2">Silenciar todo {sensorId}:</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {SNOOZE_OPTIONS.map(h => (
              <button key={h} onClick={() => handleSnoozeAll(h)}
                className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-bold transition-colors">
                {h}h
              </button>
            ))}
          </div>

          {alerts.length > 0 && (
            <>
              <p className="text-xs font-bold opacity-80 mb-2">Por variable:</p>
              <div className="flex flex-col gap-1 max-h-28 overflow-y-auto">
                {[...new Set(alerts.map(a => a.variable))].filter(Boolean).map(v => (
                  <div key={v} className="flex items-center justify-between gap-2">
                    <span className="text-xs opacity-80 truncate">{v}</span>
                    <div className="flex gap-1 flex-shrink-0">
                      {[2, 4, 8].map(h => (
                        <button key={h} onClick={() => handleSnooze(v, h)} disabled={snoozingVar === v}
                          className="px-2 py-0.5 bg-white/20 hover:bg-white/30 rounded text-[10px] font-bold transition-colors disabled:opacity-50">
                          {h}h
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Snoozes activos */}
          {snoozes.length > 0 && (
            <div className="mt-2 pt-2 border-t border-white/20">
              <p className="text-[10px] font-bold opacity-60 mb-1">Activos:</p>
              {snoozes.map(s => (
                <div key={s.id} className="flex items-center gap-1.5 text-[10px] opacity-70">
                  <Clock size={10} />
                  <span>{s.variable ?? 'Sensor completo'}</span>
                  <span>·</span>
                  {/* ✅ CORREGIDO: fmtTime usa timeZone UTC */}
                  <span>hasta {fmtTime(s.until_ts)} UTC</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* LISTA EXPANDIDA */}
      {expanded && alerts.length > 1 && (
        <div className="border-t border-white/20 max-h-52 overflow-y-auto">
          {alerts.map((a, i) => {
            const c = getCfg(a.level);
            return (
              <div key={i} className="flex items-start gap-3 px-4 py-2.5 border-b
                border-white/10 last:border-0 hover:bg-white/10 transition-colors">
                <span className={`mt-0.5 text-[10px] font-black px-1.5 py-0.5 rounded flex-shrink-0 ${c.badge}`}>
                  {c.label}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold leading-snug">{a.message}</p>
                  {/* ✅ CORREGIDO: fmtTime usa timeZone UTC */}
                  {a.timestamp && (
                    <p className="text-[10px] opacity-60 mt-0.5">
                      {fmtTime(a.timestamp)} UTC
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AlertNotifier;