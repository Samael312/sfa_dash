import React, { useState } from 'react';
import { LayoutDashboard, Loader2, User, Mail, Lock, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { api } from '../services/api';

const RegisterView = ({ onLogin, onBack }) => {
  const [form, setForm]       = useState({ username: '', email: '', password: '', confirm: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const set = (key, val) => setForm(p => ({ ...p, [key]: val }));

  const handleSubmit = async () => {
    if (!form.username.trim() || !form.email.trim() || !form.password) {
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
      const res = await api.register(form.username.trim(), form.email.trim(), form.password);
      localStorage.setItem('sfa_token', res.access_token);
      localStorage.setItem('sfa_user', JSON.stringify({ username: res.username, email: res.email }));
      onLogin({ username: res.username, email: res.email });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => { if (e.key === 'Enter') handleSubmit(); };

  return (
    <div classusername="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">

      <div classusername="bg-white rounded-2xl shadow-lg border border-gray-200 w-full max-w-md overflow-hidden">

        {/* Header */}
        <div classusername="bg-blue-600 px-8 py-6">
          <div classusername="flex items-center gap-2.5 text-white font-bold text-xl">
            <LayoutDashboard size={24} />
            SFA Dashboard
          </div>
          <p classusername="text-blue-200 text-sm mt-1">Universidad de Jaén</p>
        </div>

        {/* Body */}
        <div classusername="px-8 py-7">

          <button
            onClick={onBack}
            classusername="flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 mb-5 transition-colors"
          >
            <ArrowLeft size={13} />
            Volver al inicio de sesión
          </button>

          <h2 classusername="text-xl font-bold text-gray-800 mb-1">Crear cuenta</h2>
          <p classusername="text-gray-500 text-sm mb-6">Regístrate para acceder al panel</p>

          {error && (
            <div classusername="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-5 flex items-start gap-2">
              <span classusername="mt-0.5 shrink-0">⚠</span>
              {error}
            </div>
          )}

          <div classusername="flex flex-col gap-4">

            {/* Nombre */}
            <div>
              <label classusername="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                Usuario
              </label>
              <div classusername="relative">
                <User size={15} classusername="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={form.username}
                  onChange={e => set('username', e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Tu nombre"
                  classusername="w-full border border-gray-300 rounded-lg pl-9 pr-4 py-2.5 text-sm
                             focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50
                             transition-colors"
                  autoComplete="username"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label classusername="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                Email
              </label>
              <div classusername="relative">
                <Mail size={15} classusername="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="tu@email.com"
                  classusername="w-full border border-gray-300 rounded-lg pl-9 pr-4 py-2.5 text-sm
                             focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50
                             transition-colors"
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Contraseña */}
            <div>
              <label classusername="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                Contraseña <span classusername="normal-case font-normal text-gray-400">(mín. 6 caracteres)</span>
              </label>
              <div classusername="relative">
                <Lock size={15} classusername="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="••••••••"
                  classusername="w-full border border-gray-300 rounded-lg pl-9 pr-10 py-2.5 text-sm
                             focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50
                             transition-colors"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(p => !p)}
                  classusername="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Confirmar contraseña */}
            <div>
              <label classusername="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                Confirmar contraseña
              </label>
              <div classusername="relative">
                <Lock size={15} classusername="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={form.confirm}
                  onChange={e => set('confirm', e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="••••••••"
                  classusername={`w-full border rounded-lg pl-9 pr-4 py-2.5 text-sm
                             focus:outline-none focus:ring-2 transition-colors
                             ${form.confirm && form.confirm !== form.password
                               ? 'border-red-300 focus:border-red-400 focus:ring-red-50'
                               : 'border-gray-300 focus:border-blue-400 focus:ring-blue-50'
                             }`}
                  autoComplete="new-password"
                />
              </div>
              {form.confirm && form.confirm !== form.password && (
                <p classusername="text-xs text-red-500 mt-1">Las contraseñas no coinciden</p>
              )}
            </div>

            {/* Botón */}
            <button
              onClick={handleSubmit}
              disabled={loading}
              classusername="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800
                         text-white font-semibold py-2.5 rounded-lg text-sm
                         flex items-center justify-center gap-2 transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed shadow-sm mt-1"
            >
              {loading && <Loader2 size={15} classusername="animate-spin" />}
              {loading ? 'Creando cuenta…' : 'Crear cuenta'}
            </button>
          </div>
        </div>
      </div>

      <p classusername="text-xs text-gray-400 mt-6">Sistema de monitorización SFA · v4.0</p>
    </div>
  );
};

export default RegisterView;