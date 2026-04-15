import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard,
  Wifi,
  Cpu,
  ChevronDown,
  Server,
  Layers,
  Radio,
  FileCode,
  Bell,
  Info,
  Power,
  Library,
  Settings2,
  LogOut,
  Sun,
  UserCircle2,
} from 'lucide-react';

import LatestView       from './views/LatestView';
import StatusView       from './views/StatusView';
import HistoryView      from './views/HistoryView';
import AlertRulesView   from './views/Alertrulesview';
import LoginView        from './views/LoginView';
import RegisterView     from './views/RegisterView';
import ForgotPasswordView from './views/ForgotPasswordView';
import WeatherView from './views/WeatherView';

// ==========================================
// HELPERS DE SESIÓN
// ==========================================
const getStoredUser = () => {
  try {
    const token = localStorage.getItem('sfa_token');
    const raw   = localStorage.getItem('sfa_user');
    if (token && raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
};

// ==========================================
// COMPONENTE PRINCIPAL APP
// ==========================================
const App = () => {
  // ── Auth ──────────────────────────────────────────────
  const [user, setUser]         = useState(getStoredUser);
  const [authView, setAuthView] = useState('login'); // 'login' | 'register' | 'forgot'

  // ── Dashboard ─────────────────────────────────────────
  const [activeView, setActiveView] = useState('Latest');
  const [openMenu, setOpenMenu]     = useState(null);
  const navRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (navRef.current && !navRef.current.contains(event.target)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── Handlers de autenticación ─────────────────────────
  const handleLogin = (userData) => {
    setUser(userData);
    setAuthView('login'); // reset para próxima vez
  };

  const handleLogout = () => {
    localStorage.removeItem('sfa_token');
    localStorage.removeItem('sfa_user');
    setUser(null);
    setActiveView('Latest');
  };

  // ── Guard: mostrar pantallas de auth si no hay sesión ─
  if (!user) {
    if (authView === 'register') {
      return (
        <RegisterView
          onLogin={handleLogin}
          onBack={() => setAuthView('login')}
        />
      );
    }
    if (authView === 'forgot') {
      return (
        <ForgotPasswordView
          onBack={() => setAuthView('login')}
        />
      );
    }
    return (
      <LoginView
        onLogin={handleLogin}
        onRegister={() => setAuthView('register')}
        onForgot={() => setAuthView('forgot')}
      />
    );
  }

  // ── Dashboard ─────────────────────────────────────────
  const renderContent = () => {
    switch (activeView) {
      case 'Latest':     return <LatestView />;
      case 'Status':     return <StatusView onNavigate={setActiveView} />;
      case 'History':    return <HistoryView />;
      case 'AlertRules': return <AlertRulesView />;
      case 'Weather':    return <WeatherView />;
      default:           return <LatestView />;
    }
  };

  const menuStructure = [
    {
      title: 'Recientes',
      icon: <Wifi size={18} />,
      items: [
        { label: 'Últimos Datos', id: 'Latest', icon: <Radio size={16} /> },
      ]
    },
    {
      title: 'Estado',
      icon: <Cpu size={18} />,
      items: [
        { label: 'Variables', id: 'Status', icon: <Server size={16} /> },
      ]
    },
    {
      title: 'Historial',
      icon: <FileCode size={18} />,
      items: [
        { label: 'Historial', id: 'History', icon: <Info size={16} /> },
      ]
    },
    {
      title: 'Alertas',
      icon: <Bell size={18} />,
      items: [
        { label: 'Configurar umbrales', id: 'AlertRules', icon: <Settings2 size={16} /> },
      ]
    },
    {
      title: 'Clima',
      icon: <Sun size={18} />,
      items: [
        { label: 'Predicción del tiempo', id: 'Weather', icon: <Sun size={16} /> },
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900 flex flex-col w-full">

      {/* ================= BARRA SUPERIOR ================= */}
      <nav ref={navRef} className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50 w-full">
        <div className="w-full px-6">
          <div className="flex justify-between h-16">

            {/* LOGO Y MENÚS */}
            <div className="flex items-center">
              <div className="flex-shrink-0 flex items-center text-blue-600 font-bold text-xl tracking-tight mr-8">
                <LayoutDashboard className="mr-2" size={24} />
                SFA Dashboard
              </div>

              <div className="hidden md:flex md:space-x-4 h-full items-center">
                {menuStructure.map((menu, index) => (
                  <div key={index} className="relative group h-full flex items-center">
                    <button
                      onClick={() => setOpenMenu(openMenu === index ? null : index)}
                      className={`inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md transition-colors
                        ${openMenu === index
                          ? 'text-blue-600 bg-blue-50'
                          : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'}`}
                    >
                      {menu.icon}
                      <span className="ml-2">{menu.title}</span>
                      <ChevronDown size={14} className={`ml-1 transition-transform duration-200 ${openMenu === index ? 'rotate-180' : ''}`} />
                    </button>

                    {openMenu === index && (
                      <div className="absolute top-14 left-0 w-56 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 py-1 z-50">
                        {menu.items.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => { setActiveView(item.id); setOpenMenu(null); }}
                            className={`w-full text-left px-4 py-3 text-sm flex items-center hover:bg-gray-50 transition-colors
                              ${activeView === item.id
                                ? 'bg-blue-50 text-blue-700 border-l-4 border-blue-600'
                                : 'text-gray-700'}`}
                          >
                            <span className="mr-3 text-gray-400">{item.icon}</span>
                            {item.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* ZONA DERECHA — usuario + badge + logout */}
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 rounded-full bg-green-100 text-green-800 text-xs font-semibold border border-green-200 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                SFA: Connected
              </span>

              {/* Badge usuario */}
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200">
                <UserCircle2 size={16} className="text-gray-400" />
                <span className="text-sm text-gray-700 font-medium max-w-[120px] truncate">
                  {user.name}
                </span>
              </div>

              {/* Botón cerrar sesión */}
              <button
                onClick={handleLogout}
                title="Cerrar sesión"
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600
                           border border-gray-200 hover:border-red-200 hover:bg-red-50
                           px-3 py-1.5 rounded-lg transition-colors"
              >
                <LogOut size={15} />
                <span className="hidden sm:inline">Salir</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* ================= CONTENIDO PRINCIPAL ================= */}
      <main className="flex-1 w-full max-w-none px-6 py-6">

        <div className="mb-6 border-b border-gray-200 pb-2">
          <h2 className="text-2xl font-bold text-gray-800 capitalize flex items-center gap-2">
            {menuStructure.flatMap(m => m.items).find(i => i.id === activeView)?.icon}
            {menuStructure.flatMap(m => m.items).find(i => i.id === activeView)?.label || 'Dashboard'}
          </h2>
        </div>

        <div className="w-full">
          {renderContent()}
        </div>

      </main>
    </div>
  );
};

export default App;