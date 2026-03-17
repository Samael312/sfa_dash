import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Loader2, RefreshCw } from 'lucide-react';

const StatusView = ({ sensorId = 'sensor1' }) => {
  const [status, setStatus]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const load = async () => {
    setError(null);
    try {
      const res = await api.getSFAStatus(sensorId);
      setStatus(res);
    } catch (e) {
      setError('Error al cargar el estado. Comprueba la conexión.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [sensorId]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin text-blue-500" size={40} />
    </div>
  );

  const pct       = status?.battery_percent ?? 0;
  const battColor = pct > 50 ? 'bg-green-500' : pct > 20 ? 'bg-yellow-400' : 'bg-red-500';
  const battText  = pct > 50 ? 'text-green-600' : pct > 20 ? 'text-yellow-600' : 'text-red-600';

  return (
    <div className="flex flex-col gap-6">

      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-gray-400 uppercase">Sensor</span>
          <span className="text-sm font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
            {sensorId}
          </span>
          {status?.last_update && (
            <span className="text-sm text-gray-400">
              Actualizado: {new Date(status.last_update).toLocaleString('es-ES')}
            </span>
          )}
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 transition-colors"
        >
          <RefreshCw size={14} />
          Actualizar
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* KPIs superiores */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        <div className="bg-white p-5 rounded shadow border-l-4 border-blue-500">
          <span className="text-gray-500 text-xs font-bold uppercase">Modo</span>
          <p className="text-2xl font-bold text-blue-900 mt-2 capitalize">{status?.mode ?? '—'}</p>
          <p className="text-xs text-gray-400 mt-1">
            {status?.mode === 'mock' ? 'Datos simulados' : 'Datos reales'}
          </p>
        </div>

        <div className={`bg-white p-5 rounded shadow border-l-4 ${status?.solar_generating ? 'border-green-500' : 'border-gray-300'}`}>
          <span className="text-gray-500 text-xs font-bold uppercase">Generando energía</span>
          <p className={`text-2xl font-bold mt-2 ${status?.solar_generating ? 'text-green-600' : 'text-gray-400'}`}>
            {status?.solar_generating ? 'Sí' : 'No'}
          </p>
        </div>

        <div className={`bg-white p-5 rounded shadow border-l-4 ${status?.active_alerts > 0 ? 'border-red-500' : 'border-gray-300'}`}>
          <span className="text-gray-500 text-xs font-bold uppercase">Alertas activas</span>
          <p className={`text-2xl font-bold mt-2 ${status?.active_alerts > 0 ? 'text-red-600' : 'text-gray-400'}`}>
            {status?.active_alerts ?? 0}
          </p>
        </div>

      </div>

      {/* Batería */}
      <div className="bg-white p-6 rounded shadow border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-gray-700 uppercase">Estado de la batería</h3>
          <span className={`text-2xl font-bold ${battText}`}>{pct}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
          <div
            className={`h-4 rounded-full transition-all duration-500 ${battColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-2">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Alertas */}
      {status?.alerts?.length > 0 && (
        <div className="bg-white p-6 rounded shadow border border-gray-200">
          <h3 className="text-sm font-bold text-gray-700 uppercase mb-4">Alertas</h3>
          <div className="flex flex-col gap-2">
            {status.alerts.map((a, i) => (
              <div
                key={i}
                className={`px-4 py-3 rounded border text-sm font-medium flex items-center gap-2
                  ${a.level === 'critical'
                    ? 'bg-red-50 border-red-200 text-red-700'
                    : 'bg-orange-50 border-orange-200 text-orange-700'}`}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${a.level === 'critical' ? 'bg-red-500' : 'bg-orange-400'}`} />
                <span className="flex-1">{a.message}</span>
                {a.timestamp && (
                  <span className="text-xs opacity-60 ml-auto">
                    {new Date(a.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sin alertas */}
      {status?.alerts?.length === 0 && (
        <div className="bg-green-50 border border-green-200 rounded p-4 text-green-700 text-sm font-medium">
          ✓ Sin alertas activas. Sistema operando con normalidad.
        </div>
      )}

    </div>
  );
};

export default StatusView;