import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Loader2, Plus, Trash2, Pencil, Check, X, AlertTriangle, AlertCircle, Bell } from 'lucide-react';

const VARIABLES = [
  'radiacion', 'temp_amb', 'i_generada',
  'v_bateria', 'temp_pan', 'i_carga', 'temp_bat',
];

const VARIABLE_LABELS = {
  radiacion: 'Rad. Solar',
  temp_amb: 'Temp. Ambiente',
  i_generada: 'Corriente Gen.',
  v_bateria: 'Tensión Bat.',
  temp_pan: 'Temp. Panel',
  i_carga: 'Corriente Carga',
  temp_bat: 'Temp. Batería',
};

const UNITS = {
  radiacion: 'W/m²', temp_amb: '°C', i_generada: 'A',
  v_bateria: 'V', temp_pan: '°C', i_carga: 'A', temp_bat: '°C',
};

const EMPTY_FORM = {
  variable: 'v_bateria', operator: '<=',
  threshold: '', level: 'warning', message: '',
};

const AlertRulesView = ({ sensorId = 's1' }) => {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setError(null);
    try {
      const res = await api.getAlertRules(sensorId);
      setRules(res?.rules ?? []);
    } catch {
      setError('Error al cargar las reglas de alerta. Comprueba la conexión.');
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
      variable: rule.variable,
      operator: rule.operator,
      threshold: rule.threshold,
      level: rule.level,
      message: rule.message,
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (ruleId) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar esta regla?')) return;
    try {
        await api.deleteAlertRule(ruleId);
        load();
    } catch (err) {
        setError('Fallo al eliminar la regla.');
    }
  };

  const handleSubmit = async () => {
    if (!form.threshold || !form.message) {
      setError('Por favor, rellena todos los campos (Umbral y Mensaje).');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        threshold: parseFloat(form.threshold),
        level: form.level,
        message: form.message,
      };

      if (editingId) {
        await api.updateAlertRule(editingId, payload);
      } else {
        await api.createAlertRule({
          sensor_id: sensorId,
          variable: form.variable,
          operator: form.operator,
          ...payload
        });
      }
      handleCancel();
      load();
    } catch {
      setError('Error de escritura al guardar la regla.');
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

  const autoMessage = (f) => {
    const label = VARIABLE_LABELS[f.variable] ?? f.variable.toUpperCase();
    const unit = UNITS[f.variable] ?? '';
    const op = f.operator === '<=' ? 'Baja' : 'Alta';
    return `${label} ${op}: {value} ${unit}`;
  };

  const handleFormChange = (key, value) => {
    setForm(prev => {
      const next = { ...prev, [key]: value };
      if (['variable', 'operator'].includes(key)) {
        next.message = autoMessage(next);
      }
      return next;
    });
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4 text-slate-500 animate-in fade-in">
      <Loader2 className="animate-spin text-indigo-500" size={36} />
      <p className="text-sm font-medium tracking-tight animate-pulse">Cargando reglas de monitoreo...</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-6 w-full mx-auto p-4 md:p-6 text-slate-800 font-sans animate-in fade-in duration-500">

      {/* HEADER CONTROLS */}
      <div className="bg-white p-5 lg:p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-2xl shadow-sm border border-indigo-100/50">
            <Bell size={26} strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">Reglas de Alerta</h2>
            <div className="flex items-center gap-2 text-sm text-slate-500 mt-0.5">
              <span>Nodo objetivo:</span>
              <span className="font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md font-mono text-xs">
                {sensorId}
              </span>
            </div>
          </div>
        </div>
        {!showForm && (
          <button
            onClick={() => { setShowForm(true); setEditingId(null); setForm(EMPTY_FORM); }}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm transition-all shadow-sm shadow-indigo-200 w-full sm:w-auto"
          >
            <Plus size={18} />
            Nueva Regla
          </button>
        )}
      </div>

      {/* ERROR BANNER */}
      {error && (
        <div 
          role="alert" 
          aria-live="assertive"
          className="bg-white border border-rose-100 p-5 flex items-center justify-between gap-4 text-rose-700 shadow-sm rounded-2xl animate-in slide-in-from-top-2"
        >
          <div className="flex items-center gap-4">
            <div className="p-2 bg-rose-50 rounded-full">
              <AlertCircle size={20} className="text-rose-500" />
            </div>
            <p className="text-sm font-medium">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="p-2 hover:bg-rose-50 rounded-full transition-colors text-rose-500" aria-label="Cerrar alerta">
            <X size={18} />
          </button>
        </div>
      )}

      {/* FORMULARIO */}
      {showForm && (
        <div className="bg-white border border-slate-100 shadow-sm rounded-2xl overflow-hidden animate-in slide-in-from-bottom-2">
          <div className="bg-slate-50/50 px-6 py-4 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-700 tracking-wide uppercase">
              {editingId ? 'Editar Regla Existente' : 'Configurar Nueva Regla'}
            </h3>
          </div>
          
          <div className="p-6 flex flex-col gap-5">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
              
              {/* Variable */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="variable-select" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Parámetro</label>
                <select
                  id="variable-select"
                  disabled={!!editingId}
                  value={form.variable}
                  onChange={e => handleFormChange('variable', e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {VARIABLES.map(v => (
                    <option key={v} value={v}>{VARIABLE_LABELS[v]} ({UNITS[v]})</option>
                  ))}
                </select>
              </div>

              {/* Operador */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="operator-select" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Condición</label>
                <select
                  id="operator-select"
                  value={form.operator}
                  onChange={e => handleFormChange('operator', e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                >
                  <option value="<=">≤ Menor o igual a</option>
                  <option value=">=">≥ Mayor o igual a</option>
                </select>
              </div>

              {/* Umbral */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="threshold-input" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Umbral ({UNITS[form.variable]})
                </label>
                <input
                  id="threshold-input"
                  type="number"
                  step="0.1"
                  value={form.threshold}
                  onChange={e => setForm(p => ({ ...p, threshold: e.target.value }))}
                  placeholder="0.0"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                />
              </div>

              {/* Nivel */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="level-select" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Severidad</label>
                <select
                  id="level-select"
                  value={form.level}
                  onChange={e => setForm(p => ({ ...p, level: e.target.value }))}
                  className={`w-full border rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 transition-all 
                    ${form.level === 'critical' 
                      ? 'border-rose-200 bg-rose-50 text-rose-700 focus:ring-rose-500/50 focus:border-rose-500' 
                      : 'border-amber-200 bg-amber-50 text-amber-700 focus:ring-amber-500/50 focus:border-amber-500'}
                  `}
                >
                  <option value="warning">Advertencia (Warning)</option>
                  <option value="critical">Crítico (Critical)</option>
                </select>
              </div>
            </div>

            {/* Mensaje */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-end">
                <label htmlFor="message-input" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Mensaje de Notificación</label>
                <span className="text-[11px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">Variable dinámica: <code className="text-indigo-500 font-bold">{'{value}'}</code></span>
              </div>
              <input
                id="message-input"
                type="text"
                value={form.message}
                onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
                placeholder="Ej. Tensión baja detectada: {value} V"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
              />
            </div>

            <div className="flex gap-3 justify-end mt-4 pt-6 border-t border-slate-100">
              <button
                onClick={handleCancel}
                className="px-5 py-2.5 text-sm font-semibold text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-sm shadow-indigo-200 disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={2.5} />}
                {editingId ? 'Guardar Cambios' : 'Añadir Regla'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LISTA DE REGLAS */}
      {rules.length === 0 ? (
        <div className="bg-slate-50/50 border border-dashed border-slate-200 rounded-3xl p-10 text-center flex flex-col items-center gap-3">
          <div className="p-4 bg-slate-100 rounded-full text-slate-400 mb-2">
            <AlertTriangle size={32} />
          </div>
          <h4 className="text-slate-700 font-semibold text-lg">Sin reglas activas</h4>
          <p className="text-sm text-slate-500 max-w-sm">No se han configurado reglas de alerta para este nodo. Crea una nueva para comenzar a monitorear.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-100 shadow-sm rounded-2xl overflow-hidden mt-2">
          
          <div className="px-6 py-4 bg-slate-50/50 border-b border-slate-100 flex items-center">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Reglas Activas</h3>
          </div>

          {/* TABLA: Desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <th className="px-6 py-4">Parámetro</th>
                  <th className="px-6 py-4 text-center">Condición</th>
                  <th className="px-6 py-4">Mensaje</th>
                  <th className="px-6 py-4 text-center">Nivel</th>
                  <th className="px-6 py-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-800 text-sm">{VARIABLE_LABELS[rule.variable]}</div>
                      <div className="text-xs text-slate-400 font-mono mt-1">{rule.variable}</div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center justify-center font-mono bg-slate-100/80 border border-slate-200 px-3 py-1 rounded-lg text-slate-700 text-sm font-semibold">
                        {rule.operator} {rule.threshold} <span className="ml-1 text-xs text-slate-400 font-sans font-normal">{UNITS[rule.variable]}</span>
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate" title={rule.message}>
                      {rule.message}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide
                        ${rule.level === 'critical' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                        {rule.level === 'critical' ? 'Crítico' : 'Aviso'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleEdit(rule)} 
                          className="p-2 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 rounded-xl transition-all" 
                          aria-label="Editar regla"
                        >
                          <Pencil size={18} strokeWidth={2} />
                        </button>
                        <button 
                          onClick={() => handleDelete(rule.id)} 
                          className="p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 rounded-xl transition-all" 
                          aria-label="Eliminar regla"
                        >
                          <Trash2 size={18} strokeWidth={2} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* CARDS: Mobile */}
          <div className="md:hidden divide-y divide-slate-100">
            {rules.map((rule) => (
              <div key={rule.id} className="p-5 bg-white flex flex-col gap-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">{VARIABLE_LABELS[rule.variable]}</h4>
                    <p className="text-xs font-mono text-slate-400 mt-0.5">{rule.variable}</p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider
                    ${rule.level === 'critical' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                    {rule.level === 'critical' ? 'Crítico' : 'Aviso'}
                  </span>
                </div>
                
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex justify-between items-center">
                   <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Condición</span>
                   <span className="font-mono text-sm font-bold text-slate-800 bg-white px-2 py-1 rounded border border-slate-200">
                     {rule.operator} {rule.threshold} <span className="text-xs text-slate-400 font-sans font-normal">{UNITS[rule.variable]}</span>
                   </span>
                </div>

                <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded-xl border-l-4 border-indigo-300">
                  <span className="font-semibold text-xs text-slate-400 uppercase block mb-1">Notificación:</span>
                  {rule.message}
                </div>

                <div className="flex gap-3 mt-1">
                  <button 
                    onClick={() => handleEdit(rule)}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-sm font-semibold transition-colors"
                  >
                    <Pencil size={16} /> Editar
                  </button>
                  <button 
                    onClick={() => handleDelete(rule.id)}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-xl text-sm font-semibold transition-colors"
                  >
                    <Trash2 size={16} /> Borrar
                  </button>
                </div>
              </div>
            ))}
          </div>

        </div>
      )}
    </div>
  );
};

export default AlertRulesView;