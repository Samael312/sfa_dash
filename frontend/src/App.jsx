import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  LayoutDashboard,
  Wifi,
  Cpu,
  ChevronDown,
  Server,
  Radio,
  FileCode,
  Bell,
  Info,
  Settings2,
  LogOut,
  Sun,
  UserCircle2,
  Activity,
  Loader2,
  FlaskConical,
  CircleStop,
} from 'lucide-react';

import LatestView         from './views/LatestView';
import StatusView         from './views/StatusView';
import HistoryView        from './views/HistoryView';
import AlertRulesView     from './views/Alertrulesview';
import LoginView          from './views/LoginView';
import RegisterView       from './views/RegisterView';
import ForgotPasswordView from './views/ForgotPasswordView';
import WeatherView        from './views/WeatherView';
import { api }            from './services/api';

// ==========================================
// HELPERS DE SESIÓN
// ==========================================
const getStoredUser = () => {
  try {
    const token = localStorage.getItem('sfa_token');
    const raw   = localStorage.getItem('sfa_user');
    if (!token || !raw) return null;
    const payload = JSON.parse(atob(token.split('.')[1]));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      localStorage.removeItem('sfa_token');
      localStorage.removeItem('sfa_user');
      return null;
    }
    return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
};

// ==========================================
// SENSOR SELECTOR
// ==========================================
const SensorSelector = ({ sensors, selected, onChange, loading }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        disabled={loading}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200
                   bg-white hover:border-blue-300 hover:bg-blue-50 transition-colors
                   text-sm font-medium text-gray-700 min-w-[110px]"
      >
        <Activity size={14} className="text-blue-500 flex-shrink-0" />
        {loading ? (
          <span className="flex items-center gap-1.5 text-gray-400">
            <Loader2 size={12} className="animate-spin" /> …
          </span>
        ) : (
          <span className="flex-1 text-left">{selected || 'Sensor'}</span>
        )}
        <ChevronDown size={14} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && !loading && (
        <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-lg shadow-lg
                        border border-gray-200 py-1 z-50 max-h-64 overflow-y-auto">
          {sensors.length === 0 ? (
            <div className="px-4 py-3 text-xs text-gray-400 text-center">
              Sin sensores disponibles
            </div>
          ) : (
            sensors.map(s => (
              <button
                key={s}
                onClick={() => { onChange(s); setOpen(false); }}
                className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2
                  hover:bg-gray-50 transition-colors
                  ${selected === s
                    ? 'bg-blue-50 text-blue-700 font-semibold border-l-2 border-blue-500'
                    : 'text-gray-700'}`}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0
                  ${selected === s ? 'bg-blue-500' : 'bg-gray-300'}`} />
                {s}
                {selected === s && (
                  <span className="ml-auto text-xs text-blue-500 font-normal">activo</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

// ==========================================
// MOCK TOGGLE BUTTON
// ==========================================
const MockToggle = ({ onSensorAppear }) => {
  const MOCK_SENSOR = 's2';

  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tooltip, setTooltip] = useState('');

  // Al montar, consultar si ya hay un mock activo
  useEffect(() => {
    api.getMockStatus()
      .then(res => {
        const info = res?.mocks?.[MOCK_SENSOR];
        if (info?.running) setRunning(true);
      })
      .catch(() => {});
  }, []);

  const handleToggle = async () => {
    setLoading(true);
    setTooltip('');
    try {
      if (running) {
        await api.stopMock(MOCK_SENSOR);
        setRunning(false);
        setTooltip(`Simulador ${MOCK_SENSOR} detenido`);
      } else {
        await api.startMock(MOCK_SENSOR);
        setRunning(true);
        setTooltip(`Simulador ${MOCK_SENSOR} iniciado — datos en ~10 s`);
        // Refrescar lista de sensores tras el primer ciclo de publicación
        setTimeout(() => onSensorAppear?.(), 12000);
      }
    } catch {
      setTooltip('Error al controlar el simulador');
    } finally {
      setLoading(false);
      setTimeout(() => setTooltip(''), 4000);
    }
  };

  return (
    <div className="relative flex items-center">
      <button
        onClick={handleToggle}
        disabled={loading}
        title={running
          ? `Detener simulador ${MOCK_SENSOR}`
          : `Iniciar simulador ${MOCK_SENSOR}`}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold
          transition-all disabled:opacity-50 disabled:cursor-not-allowed
          ${running
            ? 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100'
            : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-purple-50 hover:border-purple-300 hover:text-purple-700'
          }`}
      >
        {loading ? (
          <Loader2 size={13} className="animate-spin" />
        ) : running ? (
          <CircleStop size={13} />
        ) : (
          <FlaskConical size={13} />
        )}
        <span className="hidden sm:inline">
          Mock {MOCK_SENSOR}
        </span>
        {running && !loading && (
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
        )}
      </button>

      {tooltip && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-1.5
                        bg-gray-800 text-white text-xs rounded-lg shadow-lg whitespace-nowrap
                        pointer-events-none z-50">
          {tooltip}
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-800 rotate-45" />
        </div>
      )}
    </div>
  );
};

// ==========================================
// APP PRINCIPAL
// ==========================================
const App = () => {
  const [user, setUser]         = useState(getStoredUser);
  const [authView, setAuthView] = useState('login');
  const [activeView, setActiveView] = useState('Latest');
  const [openMenu, setOpenMenu]     = useState(null);
  const navRef = useRef(null);

  const [sensors, setSensors]               = useState([]);
  const [selectedSensor, setSelectedSensor] = useState(
    () => localStorage.getItem('sfa_selected_sensor') || 's1'
  );
  const [loadingSensors, setLoadingSensors] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      if (navRef.current && !navRef.current.contains(e.target)) setOpenMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const refreshSensors = useCallback(() => {
    if (!user) return;
    setLoadingSensors(true);
    api.getSensors()
      .then(res => {
        const list = res?.sensors ?? [];
        setSensors(list);
        if (list.length > 0 && !list.includes(selectedSensor)) {
          setSelectedSensor(list[0]);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingSensors(false));
  }, [user, selectedSensor]);

  useEffect(() => { refreshSensors(); }, [user]);

  const handleSensorChange = (s) => {
    setSelectedSensor(s);
    localStorage.setItem('sfa_selected_sensor', s);
  };

  const handleLogin = (userData) => { setUser(userData); setAuthView('login'); };
  const handleLogout = () => {
    localStorage.removeItem('sfa_token');
    localStorage.removeItem('sfa_user');
    setUser(null);
    setActiveView('Latest');
    setSensors([]);
  };

  if (!user) {
    if (authView === 'register')
      return <RegisterView onLogin={handleLogin} onBack={() => setAuthView('login')} />;
    if (authView === 'forgot')
      return <ForgotPasswordView onBack={() => setAuthView('login')} />;
    return (
      <LoginView
        onLogin={handleLogin}
        onRegister={() => setAuthView('register')}
        onForgot={() => setAuthView('forgot')}
      />
    );
  }

  const renderContent = () => {
    const props = { sensorId: selectedSensor };
    switch (activeView) {
      case 'Latest':     return <LatestView     {...props} />;
      case 'Status':     return <StatusView     {...props} onNavigate={setActiveView} />;
      case 'History':    return <HistoryView    {...props} />;
      case 'AlertRules': return <AlertRulesView {...props} />;
      case 'Weather':    return <WeatherView    {...props} />;
      default:           return <LatestView     {...props} />;
    }
  };

  const menuStructure = [
    {
      title: 'Recientes', icon: <Wifi size={18} />,
      items: [{ label: 'Últimos Datos', id: 'Latest', icon: <Radio size={16} /> }],
    },
    {
      title: 'Estado', icon: <Cpu size={18} />,
      items: [{ label: 'Variables', id: 'Status', icon: <Server size={16} /> }],
    },
    {
      title: 'Historial', icon: <FileCode size={18} />,
      items: [{ label: 'Historial', id: 'History', icon: <Info size={16} /> }],
    },
    {
      title: 'Alertas', icon: <Bell size={18} />,
      items: [{ label: 'Configurar umbrales', id: 'AlertRules', icon: <Settings2 size={16} /> }],
    },
    {
      title: 'Clima', icon: <Sun size={18} />,
      items: [{ label: 'Predicción del tiempo', id: 'Weather', icon: <Sun size={16} /> }],
    },
  ];

  const activeItem = menuStructure.flatMap(m => m.items).find(i => i.id === activeView);

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900 flex flex-col w-full">

      {/* NAVBAR */}
      <nav ref={navRef} className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50 w-full">
        <div className="w-full px-6">
          <div className="flex justify-between h-16">

            {/* Logo + menú */}
            <div className="flex items-center">
              <div className="flex-shrink-0 flex items-center text-blue-600 font-bold text-xl tracking-tight mr-8">
                <LayoutDashboard className="mr-2" size={24} />
                SFA Dashboard
              </div>

              <div className="hidden md:flex md:space-x-4 h-full items-center">
                {menuStructure.map((menu, index) => (
                  <div key={index} className="relative h-full flex items-center">
                    <button
                      onClick={() => setOpenMenu(openMenu === index ? null : index)}
                      className={`inline-flex items-center px-3 py-2 border border-transparent
                        text-sm font-medium rounded-md transition-colors
                        ${openMenu === index
                          ? 'text-blue-600 bg-blue-50'
                          : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'}`}
                    >
                      {menu.icon}
                      <span className="ml-2">{menu.title}</span>
                      <ChevronDown size={14} className={`ml-1 transition-transform duration-200
                        ${openMenu === index ? 'rotate-180' : ''}`} />
                    </button>

                    {openMenu === index && (
                      <div className="absolute top-14 left-0 w-56 bg-white rounded-md shadow-lg
                                      ring-1 ring-black ring-opacity-5 py-1 z-50">
                        {menu.items.map(item => (
                          <button
                            key={item.id}
                            onClick={() => { setActiveView(item.id); setOpenMenu(null); }}
                            className={`w-full text-left px-4 py-3 text-sm flex items-center
                              hover:bg-gray-50 transition-colors
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

            {/* Zona derecha */}
            <div className="flex items-center gap-2">

              {/* Mock toggle */}
              <MockToggle onSensorAppear={refreshSensors} />

              <div className="w-px h-6 bg-gray-200 mx-1" />

              {/* Sensor selector */}
              <SensorSelector
                sensors={sensors}
                selected={selectedSensor}
                onChange={handleSensorChange}
                loading={loadingSensors}
              />

              {/* Badge conexión */}
              <span className="px-3 py-1 rounded-full bg-green-100 text-green-800 text-xs
                               font-semibold border border-green-200 items-center gap-2
                               hidden lg:flex">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                Connected
              </span>

              {/* Badge usuario */}
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg
                              bg-gray-50 border border-gray-200">
                <UserCircle2 size={16} className="text-gray-400" />
                <span className="text-sm text-gray-700 font-medium max-w-[100px] truncate">
                  {user.name}
                </span>
              </div>

              {/* Logout */}
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

      {/* CONTENIDO */}
      <main className="flex-1 w-full max-w-none px-6 py-6">
        <div className="mb-6 border-b border-gray-200 pb-2 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            {activeItem?.icon}
            {activeItem?.label || 'Dashboard'}
          </h2>
          <span className="text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200
                           px-3 py-1 rounded-full flex items-center gap-1.5">
            <Activity size={11} />
            Sensor: <span className="font-bold ml-1">{selectedSensor}</span>
          </span>
        </div>

        <div className="w-full">{renderContent()}</div>
      </main>
    </div>
  );
};

export default App;