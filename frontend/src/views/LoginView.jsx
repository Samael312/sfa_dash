import React, { useState } from 'react';
import { LayoutDashboard, Loader2, User, Lock, Eye, EyeOff } from 'lucide-react';
import { api } from '../services/api';

const LoginView = ({ onLogin, onRegister, onForgot }) => {
  const [username, setUsername]   = useState('');
  const [password, setPassword]   = useState('');
  const [showPwd, setShowPwd]     = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);

  const handleSubmit = async () => {
    if (!username.trim() || !password) {
      setError('Rellena todos los campos.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.login(username.trim(), password);
      localStorage.setItem('sfa_token', res.access_token);
      const displayName = res.name || res.username;
      localStorage.setItem('sfa_user', JSON.stringify({ name: displayName, username: res.username }));
      onLogin({ name: displayName, username: res.username });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => { if (e.key === 'Enter') handleSubmit(); };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">

      {/* Card */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 w-full max-w-md overflow-hidden">

        {/* Header con acento azul */}
        <div className="bg-blue-600 px-8 py-6">
          <div className="flex items-center gap-2.5 text-white font-bold text-xl">
            <LayoutDashboard size={24} />
            SFA Dashboard
          </div>
          <p className="text-blue-200 text-sm mt-1">Universidad de Jaén</p>
        </div>

        {/* Body */}
        <div className="px-8 py-7">
          <h2 className="text-xl font-bold text-gray-800 mb-1">Iniciar sesión</h2>
          <p className="text-gray-500 text-sm mb-6">Accede al panel de monitorización</p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-5 flex items-start gap-2">
              <span className="mt-0.5 shrink-0">⚠</span>
              {error}
            </div>
          )}

          <div className="flex flex-col gap-4">

            {/* Usuario */}
            <div>
              <label htmlFor="username" className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                Usuario
              </label>
              <div className="relative">
               <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Usuario"
                  className="w-full border border-gray-300 rounded-lg pl-9 pr-4 py-2.5 text-sm
                             focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50
                             transition-colors"
                  autoComplete="username"
                />
              </div>
            </div>

            {/* Contraseña */}
            <div>
              <label htmlFor="password" className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  id="password"
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="••••••••"
                  className="w-full border border-gray-300 rounded-lg pl-9 pr-10 py-2.5 text-sm
                             focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50
                             transition-colors"
                  autoComplete="current-password"
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

            {/* Enlace olvidé contraseña */}
            <div className="flex justify-end -mt-1">
              <button
                onClick={onForgot}
                className="text-xs text-blue-600 hover:text-blue-800 hover:underline transition-colors"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>

            {/* Botón entrar */}
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800
                         text-white font-semibold py-2.5 rounded-lg text-sm
                         flex items-center justify-center gap-2 transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {loading && <Loader2 size={15} className="animate-spin" />}
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
          </div>

          {/* Footer */}
          <p className="text-center text-sm text-gray-500 mt-6">
            ¿Sin cuenta?{' '}
            <button
              onClick={onRegister}
              className="text-blue-600 hover:text-blue-800 font-semibold hover:underline transition-colors"
            >
              Regístrate
            </button>
          </p>
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-6">Sistema de monitorización SFA · v4.0</p>
    </div>
  );
};

export default LoginView;