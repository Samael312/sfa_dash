import React, { useState } from 'react';
import { LayoutDashboard, Loader2, Mail, Lock, Eye, EyeOff, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { api } from '../services/api';

// ── Paso 1: introducir email ──────────────────────────────────
const StepEmail = ({ onEmailVerified, onBack }) => {
  const [email, setEmail]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);

  const handleSubmit = async () => {
    if (!email.trim()) { setError('Introduce tu email.'); return; }
    setLoading(true);
    setError(null);
    try {
      // El backend ahora solo debería validar que el usuario existe
      await api.forgotPassword(email.trim());
      onEmailVerified(email.trim());
    } catch (e) {
      setError(e.message || 'Error al verificar el correo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 mb-5 transition-colors">
        <ArrowLeft size={13} /> Volver al inicio de sesión
      </button>

      <h2 className="text-xl font-bold text-gray-800 mb-1">Recuperar contraseña</h2>
      <p className="text-gray-500 text-sm mb-6">Introduce el email asociado a tu cuenta para cambiar tu contraseña.</p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-5 flex items-start gap-2">
          <span className="mt-0.5 shrink-0">⚠</span>{error}
        </div>
      )}

      <div className="flex flex-col gap-4">
        <div>
          <label htmlFor="email" className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Email</label>
          <div className="relative">
            <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="tu@email.com"
              className="w-full border border-gray-300 rounded-lg pl-9 pr-4 py-2.5 text-sm
                         focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-colors"
              autoComplete="email"
            />
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-2.5 rounded-lg text-sm
                     flex items-center justify-center gap-2 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          {loading && <Loader2 size={15} className="animate-spin" />}
          {loading ? 'Verificando…' : 'Verificar email'}
        </button>
      </div>
    </>
  );
};

// ── Paso 2: resetear contraseña ───────────────────────────────
const StepReset = ({ email, onSuccess, onBack }) => {
  const [form, setForm]         = useState({ password: '', confirm: '' });
  const [showPwd, setShowPwd]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);

  const set = (key, val) => setForm(p => ({ ...p, [key]: val }));

  const handleSubmit = async () => {
    if (form.password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return; }
    if (form.password !== form.confirm) { setError('Las contraseñas no coinciden.'); return; }

    setLoading(true);
    setError(null);
    try {
      // Ahora enviamos el email directamente en lugar del token
      await api.resetPassword(email, form.password);
      onSuccess();
    } catch (e) {
      setError(e.message || 'Error al cambiar la contraseña.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 mb-5 transition-colors">
        <ArrowLeft size={13} /> Cambiar email
      </button>

      <h2 className="text-xl font-bold text-gray-800 mb-1">Nueva contraseña</h2>
      <p className="text-gray-500 text-sm mb-5">
        Email verificado: <span className="font-medium text-gray-700">{email}</span>. Introduce tu nueva clave.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-5 flex items-start gap-2">
          <span className="mt-0.5 shrink-0">⚠</span>{error}
        </div>
      )}

      <div className="flex flex-col gap-4">
        
        {/* Nueva contraseña */}
        <div>
          <label htmlFor="new-password" className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
            Nueva contraseña
          </label>
          <div className="relative">
            <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              id="new-password"
              type={showPwd ? 'text' : 'password'}
              value={form.password}
              onChange={e => set('password', e.target.value)}
              placeholder="••••••••"
              className="w-full border border-gray-300 rounded-lg pl-9 pr-10 py-2.5 text-sm
                         focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-colors"
              autoComplete="new-password"
            />
            <button type="button" onClick={() => setShowPwd(p => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" tabIndex={-1}>
              {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        {/* Confirmar */}
        <div>
          <label htmlFor="confirm-password" className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
            Confirmar contraseña
          </label>
          <div className="relative">
            <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              id="confirm-password"
              type={showPwd ? 'text' : 'password'}
              value={form.confirm}
              onChange={e => set('confirm', e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="••••••••"
              className={`w-full border rounded-lg pl-9 pr-4 py-2.5 text-sm
                         focus:outline-none focus:ring-2 transition-colors
                         ${form.confirm && form.confirm !== form.password
                           ? 'border-red-300 focus:border-red-400 focus:ring-red-50'
                           : 'border-gray-300 focus:border-blue-400 focus:ring-blue-50'}`}
              autoComplete="new-password"
            />
          </div>
          {form.confirm && form.confirm !== form.password && (
            <p className="text-xs text-red-500 mt-1">Las contraseñas no coinciden</p>
          )}
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-2.5 rounded-lg text-sm
                     flex items-center justify-center gap-2 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed shadow-sm mt-1"
        >
          {loading && <Loader2 size={15} className="animate-spin" />}
          {loading ? 'Guardando…' : 'Guardar nueva contraseña'}
        </button>
      </div>
    </>
  );
};

// ── Paso 3: éxito ─────────────────────────────────────────────
const StepSuccess = ({ onBack }) => (
  <>
    <div className="flex flex-col items-center text-center py-4">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
        <CheckCircle2 size={36} className="text-green-600" />
      </div>
      <h2 className="text-xl font-bold text-gray-800 mb-2">¡Contraseña actualizada!</h2>
      <p className="text-gray-500 text-sm mb-6">
        Tu contraseña se ha cambiado correctamente. Ya puedes iniciar sesión con tus nuevas credenciales.
      </p>
      <button
        onClick={onBack}
        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-2.5 rounded-lg text-sm transition-colors shadow-sm"
      >
        Ir al inicio de sesión
      </button>
    </div>
  </>
);

// ── Componente principal ──────────────────────────────────────
const ForgotPasswordView = ({ onBack }) => {
  const [step, setStep]   = useState('email'); // 'email' | 'reset' | 'success'
  const [email, setEmail] = useState('');

  const handleEmailVerified = (userEmail) => {
    setEmail(userEmail);
    setStep('reset');
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">

      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="bg-blue-600 px-8 py-6">
          <div className="flex items-center gap-2.5 text-white font-bold text-xl">
            <LayoutDashboard size={24} />
            SFA Dashboard
          </div>
          <p className="text-blue-200 text-sm mt-1">Universidad de Jaén</p>
        </div>

        {/* Indicador de pasos */}
        {step !== 'success' && (
          <div className="flex border-b border-gray-100">
            {['email', 'reset'].map((s, i) => (
              <div key={s}
                className={`flex-1 py-2.5 text-xs font-semibold text-center transition-colors
                  ${step === s
                    ? 'text-blue-600 border-b-2 border-blue-600 -mb-px bg-blue-50/40'
                    : 'text-gray-400'}`}
              >
                {i + 1}. {s === 'email' ? 'Verificar email' : 'Nueva contraseña'}
              </div>
            ))}
          </div>
        )}

        <div className="px-8 py-7">
          {step === 'email'   && <StepEmail onEmailVerified={handleEmailVerified} onBack={onBack} />}
          {step === 'reset'   && <StepReset email={email} onSuccess={() => setStep('success')} onBack={() => setStep('email')} />}
          {step === 'success' && <StepSuccess onBack={onBack} />}
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-6">Sistema de monitorización SFA · v4.0</p>
    </div>
  );
};

export default ForgotPasswordView;