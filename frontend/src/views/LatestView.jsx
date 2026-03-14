import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Loader2, RefreshCw } from 'lucide-react';

const VARIABLES = [
  { key: 'radiacion_solar',      label: 'Radiación solar',    unit: 'W/m²', color: 'border-yellow-400', text: 'text-yellow-600' },
  { key: 'temperatura_ambiente', label: 'Temp. ambiente',     unit: '°C',   color: 'border-red-400',    text: 'text-red-600'    },
  { key: 'corriente_generada',   label: 'Corriente generada', unit: 'A',    color: 'border-green-400',  text: 'text-green-600'  },
  { key: 'tension_bateria',      label: 'Tensión batería',    unit: 'V',    color: 'border-blue-400',   text: 'text-blue-600'   },
  { key: 'corriente_bateria',    label: 'Corriente batería',  unit: 'A',    color: 'border-purple-400', text: 'text-purple-600' },
  { key: 'corriente_carga',      label: 'Corriente carga',    unit: 'A',    color: 'border-cyan-400',   text: 'text-cyan-600'   },
  { key: 'temperatura_bateria',  label: 'Temp. batería',      unit: '°C',   color: 'border-orange-400', text: 'text-orange-600' },
];

const LatestView = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const res = await api.getSFALatest();
    setData(res);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin text-blue-500" size={40} />
    </div>
  );

  return (
    <div className="flex flex-col gap-6">

      {/* Info última actualización */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">
          Última actualización: {data?.timestamp ? new Date(data.timestamp).toLocaleString('es-ES') : '—'}
        </p>
        <button
          onClick={load}
          className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 transition-colors"
        >
          <RefreshCw size={14} />
          Actualizar
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        {VARIABLES.map(v => (
          <div key={v.key} className={`bg-white p-5 rounded shadow border-l-4 ${v.color}`}>
            <span className="text-gray-500 text-xs font-bold uppercase leading-tight block">{v.label}</span>
            <div className="mt-3 flex items-end gap-1">
              <span className={`text-3xl font-bold ${v.text}`}>{data?.[v.key] ?? '—'}</span>
              <span className="text-sm text-gray-400 mb-1">{v.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Tabla resumen */}
      <div className="bg-white rounded shadow border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-700 uppercase">Resumen de medición</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="px-6 py-3 text-left">Variable</th>
              <th className="px-6 py-3 text-right">Valor</th>
              <th className="px-6 py-3 text-right">Unidad</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {VARIABLES.map(v => (
              <tr key={v.key} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-3 font-medium text-gray-700">{v.label}</td>
                <td className={`px-6 py-3 text-right font-bold ${v.text}`}>{data?.[v.key] ?? '—'}</td>
                <td className="px-6 py-3 text-right text-gray-400">{v.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
};

export default LatestView;