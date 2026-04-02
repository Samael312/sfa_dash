import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Loader2, Plus, Trash2, Pencil, Check, X } from 'lucide-react';

const VARIABLES = [
  'radiacion_solar', 'temperatura_ambiente', 'corriente_generada',
  'tension_bateria', 'corriente_bateria', 'corriente_carga', 'temperatura_bateria',
];

const VARIABLE_LABELS = {
  radiacion_solar:      'Radiación solar',
  temperatura_ambiente: 'Temp. ambiente',
  corriente_generada:   'Corriente generada',
  tension_bateria:      'Tensión batería',
  corriente_bateria:    'Corriente batería',
  corriente_carga:      'Corriente carga',
  temperatura_bateria:  'Temp. batería',
};

const UNITS = {
  radiacion_solar: 'W/m²', temperatura_ambiente: '°C', corriente_generada: 'A',
  tension_bateria: 'V', corriente_bateria: 'A', corriente_carga: 'A', temperatura_bateria: '°C',
};

const EMPTY_FORM = {
  variable: 'tension_bateria', operator: '<=',
  threshold: '', level: 'warning', message: 'usa {value} para insertar el valor',
};

const AlertRulesView = ({ sensorId = 'sensor1' }) => {
  const [rules, setRules]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving]       = useState(false);

  const load = async () => {
    setError(null);
    try {
      const res = await api.getAlertRules(sensorId);
      setRules(res?.rules ?? []);
    } catch {
      setError('Error al cargar las reglas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    load();
  }, [sensorId]);

  const handleEdit = (rule) => {
    setEditingId(rule.id);
    setForm({
      variable:  rule.variable,
      operator:  rule.operator,
      threshold: rule.threshold,
      level:     rule.level,
      message:   rule.message,
    });
    setShowForm(true);
  };

  const handleDelete = async (ruleId) => {
    if (!window.confirm('¿Eliminar esta regla de alerta?')) return;
    await api.deleteAlertRule(ruleId);
    load();
  };

  const handleSubmit = async () => {
    if (!form.threshold || !form.message) {
      setError('Rellena todos los campos.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        await api.updateAlertRule(editingId, {
          threshold: parseFloat(form.threshold),
          level:     form.level,
          message:   form.message,
        });
      } else {
        await api.createAlertRule({
          sensor_id: sensorId,
          variable:  form.variable,
          operator:  form.operator,
          threshold: parseFloat(form.threshold),
          level:     form.level,
          message:   form.message,
        });
      }
      setForm(EMPTY_FORM);
      setEditingId(null);
      setShowForm(false);
      load();
    } catch {
      setError('Error al guardar la regla.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
    setError(null);
  };

  // Auto-generar mensaje al cambiar variable/operator/threshold
  const autoMessage = (f) => {
    const label = VARIABLE_LABELS[f.variable] ?? f.variable;
    const unit  = UNITS[f.variable] ?? '';
    const op    = f.operator === '<=' ? 'baja' : 'alta';
    return `${label} ${op}: {value} ${unit}`;
  };

  const handleFormChange = (key, value) => {
    setForm(prev => {
      const next = { ...prev, [key]: value };
      // Auto-actualizar mensaje si no ha sido editado manualmente
      if (['variable', 'operator'].includes(key)) {
        next.message = autoMessage(next);
      }
      return next;
    });
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin text-blue-500" size={40} />
    </div>
  );

  return (
    <div className="flex flex-col gap-6">

      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-gray-400 uppercase">Sensor</span>
          <span className="text-sm font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
            {sensorId}
          </span>
        </div>
        {!showForm && (
          <button
            onClick={() => { setShowForm(true); setEditingId(null); setForm(EMPTY_FORM); }}
            className="flex items-center gap-2 text-sm font-medium text-white bg-blue-600
                       hover:bg-blue-700 px-4 py-2 rounded transition-colors"
          >
            <Plus size={15} />
            Nueva regla
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Formulario */}
      {showForm && (
        <div className="bg-white border border-blue-200 rounded shadow p-5 flex flex-col gap-4">
          <h3 className="text-sm font-bold text-gray-700 uppercase">
            {editingId ? 'Editar regla' : 'Nueva regla de alerta'}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Variable — deshabilitado en edición */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500 uppercase">Variable</label>
              <select
                disabled={!!editingId}
                value={form.variable}
                onChange={e => handleFormChange('variable', e.target.value)}
                className="border border-gray-300 rounded px-3 py-2 text-sm
                           focus:outline-none focus:border-blue-400 disabled:bg-gray-100"
              >
                {VARIABLES.map(v => (
                  <option key={v} value={v}>{VARIABLE_LABELS[v]} ({UNITS[v]})</option>
                ))}
              </select>
            </div>

            {/* Operador — deshabilitado en edición */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500 uppercase">Operador</label>
              <select
                value={form.operator}
                onChange={e => handleFormChange('operator', e.target.value)}
                className="border border-gray-300 rounded px-3 py-2 text-sm
                           focus:outline-none focus:border-blue-400 disabled:bg-gray-100"
              >
                <option value="<=">≤ menor o igual que</option>
                <option value=">=">≥ mayor o igual que</option>
              </select>
            </div>

            {/* Umbral */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500 uppercase">
                Umbral ({UNITS[form.variable]})
              </label>
              <input
                type="number"
                step="0.1"
                value={form.threshold}
                onChange={e => setForm(p => ({ ...p, threshold: e.target.value }))}
                placeholder="ej: 11.8"
                className="border border-gray-300 rounded px-3 py-2 text-sm
                           focus:outline-none focus:border-blue-400"
              />
            </div>

            {/* Nivel */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500 uppercase">Nivel</label>
              <select
                value={form.level}
                onChange={e => setForm(p => ({ ...p, level: e.target.value }))}
                className="border border-gray-300 rounded px-3 py-2 text-sm
                           focus:outline-none focus:border-blue-400"
              >
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            {/* Mensaje */}
            <div className="flex flex-col gap-1 md:col-span-2">
              <label className="text-xs font-semibold text-gray-500 uppercase">
                Mensaje <span className="text-gray-400 normal-case font-normal">
                  (usa {'{value}'} para insertar el valor)
                </span>
              </label>
              <input
                type="text"
                value={form.message}
                onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
                placeholder="ej: Tensión baja: {value} V"
                className="border border-gray-300 rounded px-3 py-2 text-sm
                           focus:outline-none focus:border-blue-400"
              />
            </div>
          </div>

          {/* Acciones formulario */}
          <div className="flex gap-3 justify-end">
            <button
              onClick={handleCancel}
              className="flex items-center gap-2 text-sm text-gray-600 border border-gray-300
                         hover:border-gray-400 px-4 py-2 rounded transition-colors"
            >
              <X size={14} /> Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex items-center gap-2 text-sm font-medium text-white bg-blue-600
                         hover:bg-blue-700 px-4 py-2 rounded transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {editingId ? 'Guardar cambios' : 'Crear regla'}
            </button>
          </div>
        </div>
      )}

      {/* Tabla de reglas */}
      {rules.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded p-6 text-center text-gray-400 text-sm">
          No hay reglas de alerta configuradas para este sensor.
          Pulsa "Nueva regla" para añadir la primera.
        </div>
      ) : (
        <div className="bg-white rounded shadow border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-700 uppercase">
              Reglas activas — {rules.length} regla{rules.length !== 1 ? 's' : ''}
            </h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-5 py-3 text-left">Variable</th>
                <th className="px-5 py-3 text-center">Condición</th>
                <th className="px-5 py-3 text-left">Mensaje</th>
                <th className="px-5 py-3 text-center">Nivel</th>
                <th className="px-5 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rules.map((rule, idx) => (
                <tr key={rule.id} className={`hover:bg-gray-50 transition-colors ${idx % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                  <td className="px-5 py-3 font-medium text-blue-700">
                    {VARIABLE_LABELS[rule.variable] ?? rule.variable}
                    <span className="text-gray-400 font-normal ml-1">({UNITS[rule.variable]})</span>
                  </td>
                  <td className="px-5 py-3 text-center font-mono text-gray-700">
                    {rule.operator} {rule.threshold}
                  </td>
                  <td className="px-5 py-3 text-gray-600">{rule.message}</td>
                  <td className="px-5 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold
                      ${rule.level === 'critical'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-orange-100 text-orange-700'}`}>
                      {rule.level}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-center gap-3">
                      <button
                        onClick={() => handleEdit(rule)}
                        className="text-blue-500 hover:text-blue-700 transition-colors"
                        title="Editar"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => handleDelete(rule.id)}
                        className="text-red-400 hover:text-red-600 transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AlertRulesView;