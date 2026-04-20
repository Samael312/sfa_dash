/**
 * AlertNotifier.jsx
 * -----------------
 * Componente global que evalúa alertas cada N segundos y muestra
 * toasts persistentes mientras haya incidencias activas.
 * Se monta en App.jsx, es independiente de la vista activa.
 */

import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, X, ShieldCheck, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../services/api';

const POLL_INTERVAL = 30_000; // 30 segundos

// Niveles de severidad para ordenar y colorear
const LEVEL_CONFIG = {
  critical: {
    bg:     'bg-rose-600',
    border: 'border-rose-700',
    badge:  'bg-rose-800 text-rose-100',
    icon:   'text-rose-100',
    label:  'CRÍTICO',
  },
  warning: {
    bg:     'bg-amber-500',
    border: 'border-amber-600',
    badge:  'bg-amber-600 text-amber-100',
    icon:   'text-amber-100',
    label:  'AVISO',
  },
};

const AlertNotifier = ({ sensorId }) => {
  const [alerts, setAlerts]       = useState([]);   // alertas activas
  const [expanded, setExpanded]   = useState(false); // desplegado o contraído
  const [dismissed, setDismissed] = useState(false); // ocultado manualmente
  const timerRef = useRef(null);

  const fetchAlerts = async () => {
    try {
      await api.evaluateAlerts(sensorId);
      const res = await api.getSFAStatus(sensorId);
      const active = res?.alerts ?? [];
      setAlerts(active);
      // Si llegan alertas nuevas, reabrimos si el usuario había cerrado
      if (active.length > 0) setDismissed(false);
    } catch {
      // Silencioso: no interrumpir la UX si falla
    }
  };

  useEffect(() => {
    if (!sensorId) return;
    setDismissed(false);
    fetchAlerts();
    timerRef.current = setInterval(fetchAlerts, POLL_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, [sensorId]);

  // Nada que mostrar
  if (!alerts.length || dismissed) return null;

  const hasCritical = alerts.some(a => a.level === 'critical');
  const cfg = hasCritical ? LEVEL_CONFIG.critical : LEVEL_CONFIG.warning;
  const topAlert = alerts.find(a => a.level === 'critical') ?? alerts[0];

  return (
    <div
      className={`fixed bottom-24 md:bottom-6 right-4 md:right-6 z-[200] w-[calc(100vw-2rem)] max-w-sm
        rounded-2xl shadow-2xl border ${cfg.border} ${cfg.bg}
        text-white overflow-hidden transition-all duration-300`}
      role="alert"
      aria-live="assertive"
    >
      {/* CABECERA — siempre visible */}
      <div className="flex items-center gap-3 px-4 py-3">
        <AlertTriangle size={20} className={`flex-shrink-0 ${cfg.icon} animate-pulse`} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${cfg.badge}`}>
              {cfg.label}
            </span>
            <span className="text-xs font-bold opacity-80">
              {alerts.length} incidencia{alerts.length > 1 ? 's' : ''} · {sensorId}
            </span>
          </div>
          <p className="text-sm font-semibold truncate mt-0.5 leading-tight">
            {topAlert.message}
          </p>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {alerts.length > 1 && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
              title={expanded ? 'Contraer' : 'Ver todas'}
            >
              {expanded
                ? <ChevronDown size={16} />
                : <ChevronUp   size={16} />}
            </button>
          )}
          <button
            onClick={() => setDismissed(true)}
            className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
            title="Cerrar notificación"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* LISTA EXPANDIDA */}
      {expanded && alerts.length > 1 && (
        <div className="border-t border-white/20 max-h-52 overflow-y-auto">
          {alerts.map((a, i) => {
            const c = LEVEL_CONFIG[a.level] ?? LEVEL_CONFIG.warning;
            return (
              <div
                key={i}
                className="flex items-start gap-3 px-4 py-2.5 border-b border-white/10 last:border-0 hover:bg-white/10 transition-colors"
              >
                <span className={`mt-0.5 text-[10px] font-black px-1.5 py-0.5 rounded flex-shrink-0 ${c.badge}`}>
                  {c.label}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold leading-snug">{a.message}</p>
                  {a.timestamp && (
                    <p className="text-[10px] opacity-60 mt-0.5">
                      {new Date(a.timestamp).toLocaleTimeString('es-ES', {
                        hour: '2-digit', minute: '2-digit'
                      })}
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