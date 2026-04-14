import React, { useState } from 'react';
import { LayoutDashboard, Loader2, User, Mail, Lock, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { api } from '../services/api';

const RegisterView = ({ onLogin, onBack }) => {
  const [form, setForm]       = useState({ name: '', email: '', password: '', confirm: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const set = (key, val) => setForm(p => ({ ...p, [key]: val }));

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      setError('Rellena todos los campos.');
      return;
    }
    if (form.password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (form.password !== form.confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await api.register(form.name.trim(), form.email.trim(), form.password);
      localStorage.setItem('sfa_token', res.access_token);
      localStorage.setItem('sfa_user', JSON.stringify({ name: res.name, email: res.email }));
      onLogin({ name: res.name, email: res.email });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => { if (e.key === 'Enter') handleSubmit(); };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">

      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="bg-blue-600 px-8 py-6">
          <div className="flex items-center gap-2.5 text-white font-bold text-xl">
            <LayoutDashboard size={24} />
            SFA Dashboard
          </div>
          <p className="text-blue-200 text-sm mt-1">Universidad de Jaén</p>
        </div>

        {/* Body */}
        <div className="px-8 py-7">

          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 mb-5 transition-colors"
          >
            <ArrowLeft size={13} />
            Volver al inicio de sesión
          </button>

          <h2 className="text-xl font-bold text-gray-800 mb-1">Crear cuenta</h2>
          <p className="text-gray-500 text-sm mb-6">Regístrate para acceder al panel</p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-5 flex items-start gap-2">
              <span className="mt-0.5 shrink-0">⚠</span>
              {error}
            </div>
          )}

          <div className="flex flex-col gap-4">

            {/* Nombre */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                Nombre completo
              </label>
              <div className="relative">
                <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Tu nombre"
                  className="w-full border border-gray-300 rounded-lg pl-9 pr-4 py-2.5 text-sm
                             focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50
                             transition-colors"
                  autoComplete="name"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                Email
              </label>
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="tu@email.com"
                  className="w-full border border-gray-300 rounded-lg pl-9 pr-4 py-2.5 text-sm
                             focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50
                             transition-colors"
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Contraseña */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                Contraseña <span className="normal-case font-normal text-gray-400">(mín. 6 caracteres)</span>
              </label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="••••••••"
                  className="w-full border border-gray-300 rounded-lg pl-9 pr-10 py-2.5 text-sm
                             focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50
                             transition-colors"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Confirmar contraseña */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                Confirmar contraseña
              </label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={form.confirm}
                  onChange={e => set('confirm', e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="••••••••"
                  className={`w-full border rounded-lg pl-9 pr-4 py-2.5 text-sm
                             focus:outline-none focus:ring-2 transition-colors
                             ${form.confirm && form.confirm !== form.password
                               ? 'border-red-300 focus:border-red-400 focus:ring-red-50'
                               : 'border-gray-300 focus:border-blue-400 focus:ring-blue-50'
                             }`}
                  autoComplete="new-password"
                />
              </div>
              {form.confirm && form.confirm !== form.password && (
                <p className="text-xs text-red-500 mt-1">Las contraseñas no coinciden</p>
              )}
            </div>

            {/* Botón */}
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800
                         text-white font-semibold py-2.5 rounded-lg text-sm
                         flex items-center justify-center gap-2 transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed shadow-sm mt-1"
            >
              {loading && <Loader2 size={15} className="animate-spin" />}
              {loading ? 'Creando cuenta…' : 'Crear cuenta'}
            </button>
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-6">Sistema de monitorización SFA · v4.0</p>
    </div>
  );
};

export default RegisterView;