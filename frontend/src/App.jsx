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
  Activity,
  Loader2,
  FlaskConical,
  CircleStop,
  Menu,
  X,
  Zap
} from 'lucide-react';

import LatestView from './views/LatestView';
import StatusView from './views/StatusView';
import HistoryView from './views/HistoryView';
import AlertRulesView from './views/Alertrulesview';
import LoginView from './views/LoginView';
import RegisterView from './views/RegisterView';
import ForgotPasswordView from './views/ForgotPasswordView';
import WeatherView from './views/WeatherView';
import { api } from './services/api';
import AlertNotifier from './utils/Alertnotifier';
import EnergyView   from './views/EnergyView';
import OverviewView from './views/OverviewView';

// ==========================================
// HELPERS DE SESIÓN
// ==========================================
const getStoredUser = () => {
  try {
    const token = localStorage.getItem('sfa_token');
    const raw = localStorage.getItem('sfa_user');
    if (!token || !raw) return null;
    const payload = JSON.parse(atob(token.split('.')[1]));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      localStorage.removeItem('sfa_token');
      localStorage.removeItem('sfa_user');
      return null;
    }
    return JSON.parse(raw);
  } catch { return null; }
};

// ==========================================
// COMPONENTE: MOCK TOGGLE (SIMULADOR)
// ==========================================
const MockToggle = ({ onSensorAppear }) => {
  const MOCK_SENSOR = 's2';
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tooltip, setTooltip] = useState('');

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
        setTooltip(`Simulador detenido`);
      } else {
        await api.startMock(MOCK_SENSOR);
        setRunning(true);
        setTooltip(`Iniciado (espera 10s)`);
        setTimeout(() => onSensorAppear?.(), 12000);
      }
    } catch {
      setTooltip('Error de control');
    } finally {
      setLoading(false);
      setTimeout(() => setTooltip(''), 3000);
    }
  };

  return (
    <div className="relative flex items-center">
      <button
        onClick={handleToggle}
        disabled={loading}
        className={`flex items-center gap-2 px-2 sm:px-3 py-2 rounded-xl border text-xs 
          transition-all disabled:opacity-50 shadow-sm
          ${running
            ? 'bg-amber-50 border-amber-200 text-amber-700'
            : 'bg-white border-gray-200 text-gray-500 hover:border-purple-300 hover:text-purple-600'
          }`}
      >
        {loading ? (
          <Loader2 size={14} className="animate-spin" />
        ) : running ? (
          <CircleStop size={14} className="text-amber-600" />
        ) : (
          <FlaskConical size={14} />
        )}
        <span className="hidden sm:inline">Mock {MOCK_SENSOR}</span>
        {running && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />}
      </button>

      {tooltip && (
        <div className="absolute top-full right-0 mt-2 px-3 py-1.5 bg-gray-900 text-white text-[10px] rounded-lg shadow-xl z-50 whitespace-nowrap animate-in fade-in zoom-in-95">
          {tooltip}
        </div>
      )}
    </div>
  );
};

// ==========================================
// COMPONENTE: SENSOR SELECTOR
// ==========================================
const SensorSelector = ({ sensors, selected, onChange, loading }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(v => !v);
        }}
        disabled={loading}
        className="flex items-center gap-2 px-2 sm:px-3 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-all text-sm font-medium text-gray-700 shadow-sm min-w-[70px] sm:min-w-[90px]"
      >
        <Activity size={16} className="text-blue-500 flex-shrink-0" />
        <span className="truncate">{loading ? '...' : selected}</span>
        <ChevronDown size={14} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-[100] animate-in fade-in slide-in-from-top-2">
          {sensors.map(s => (
            <button
              key={s}
              onClick={() => { onChange(s); setOpen(false); }}
              className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 hover:bg-blue-50 transition-colors ${selected === s ? 'text-blue-700 font-semibold bg-blue-50/50' : 'text-gray-600'}`}
            >
              <div className={`w-2 h-2 rounded-full ${selected === s ? 'bg-blue-500' : 'bg-gray-200'}`} />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ==========================================
// COMPONENTE PRINCIPAL: APP
// ==========================================
const App = () => {
  const [user, setUser] = useState(getStoredUser);
  const [authView, setAuthView] = useState('login');
  const [activeView, setActiveView] = useState('Overview');
  const [openMenu, setOpenMenu] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sensors, setSensors] = useState([]);
  const [selectedSensor, setSelectedSensor] = useState(() => localStorage.getItem('sfa_selected_sensor') || 's1');
  const [loadingSensors, setLoadingSensors] = useState(false);

  const refreshSensors = useCallback(() => {
    if (!user) return;
    setLoadingSensors(true);
    api.getSensors()
      .then(res => {
        const list = res?.sensors ?? [];
        setSensors(list);
        if (list.length > 0 && !list.includes(selectedSensor)) setSelectedSensor(list[0]);
      })
      .finally(() => setLoadingSensors(false));
  }, [user, selectedSensor]);

  useEffect(() => { refreshSensors(); }, [user, refreshSensors]);

  const handleLogout = () => {
    localStorage.removeItem('sfa_token');
    localStorage.removeItem('sfa_user');
    setUser(null);
    setActiveView('Overview');
  };

  if (!user) {
    if (authView === 'register') return <RegisterView onLogin={setUser} onBack={() => setAuthView('login')} />;
    if (authView === 'forgot') return <ForgotPasswordView onBack={() => setAuthView('login')} />;
    return <LoginView onLogin={setUser} onRegister={() => setAuthView('register')} onForgot={() => setAuthView('forgot')} />;
  }

  const menuStructure = [
    { title: 'Resumen', icon: <LayoutDashboard size={18} />, items: [{ label: 'Panel General', id: 'Overview', icon: <Activity size={16} /> }] },
    { title: 'Monitor', icon: <Wifi size={18} />, items: [{ label: 'Últimos Datos', id: 'Latest', icon: <Radio size={16} /> }] },
    { title: 'Variables', icon: <Cpu size={18} />, items: [{ label: 'Detalle Sensores', id: 'Status', icon: <Server size={16} /> }] },
    { title: 'Historial', icon: <FileCode size={18} />, items: [{ label: 'Logs Históricos', id: 'History', icon: <Info size={16} /> }] },
    { title: 'Alertas', icon: <Bell size={18} />, items: [{ label: 'Umbrales', id: 'AlertRules', icon: <Settings2 size={16} /> }] },
    { title: 'Energía', icon: <Zap size={18} />, items: [{ label: 'Análisis Energético', id: 'Energy', icon: <Zap size={16} /> }] },
    { title: 'Clima', icon: <Sun size={18} />, items: [{ label: 'Predicción', id: 'Weather', icon: <Sun size={16} /> }] },
  ];

  const activeItem = menuStructure.flatMap(m => m.items).find(i => i.id === activeView);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col w-full pb-20 md:pb-0">
      
      {/* NAVBAR */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-[100] w-full shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          
          <div className="flex items-center gap-2 sm:gap-4">
            <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 -ml-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
              <Menu size={24} />
            </button>
            <div className="flex items-center text-blue-600 font-black text-xl tracking-tighter">
              <Zap className="mr-1 sm:mr-2" size={22} fill="currentColor" />
              SFA<span className="text-gray-400 font-light ml-1 hidden xs:inline">Dash</span>
            </div>

            {/* Desktop Menu */}
            <div className="hidden md:flex ml-6 space-x-1">
              {menuStructure.map((menu, idx) => (
                <div key={idx} className="relative">
                  <button
                    onClick={() => setOpenMenu(openMenu === idx ? null : idx)}
                    className={`flex items-center px-3 py-2 text-sm font-medium rounded-xl transition-all ${openMenu === idx ? 'text-blue-600 bg-blue-50' : 'text-gray-500 hover:bg-gray-50'}`}
                  >
                    {menu.title} <ChevronDown size={14} className="ml-1" />
                  </button>
                  {openMenu === idx && (
                    <div className="absolute top-12 left-0 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 animate-in slide-in-from-top-2">
                      {menu.items.map(item => (
                        <button
                          key={item.id}
                          onClick={() => { setActiveView(item.id); setOpenMenu(null); }}
                          className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 hover:bg-blue-50 transition-colors ${activeView === item.id ? 'text-blue-700 font-medium' : 'text-gray-600'}`}
                        >
                          {item.icon} {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-4">
            <MockToggle onSensorAppear={refreshSensors} />
            <SensorSelector 
              sensors={sensors} 
              selected={selectedSensor} 
              onChange={(s) => { setSelectedSensor(s); localStorage.setItem('sfa_selected_sensor', s); }} 
              loading={loadingSensors} 
            />
            <button 
              onClick={handleLogout} 
              title="Cerrar sesión"
              className="flex p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </nav>

      {/* MOBILE SIDEBAR */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-[110] md:hidden">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)} />
          <div className="absolute top-0 left-0 bottom-0 w-72 bg-white shadow-2xl flex flex-col animate-in slide-in-from-left duration-300">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-blue-600 text-white font-black text-xl tracking-tight">
              SFA DASHBOARD
              <button onClick={() => setIsSidebarOpen(false)} className="hover:bg-blue-700 p-1 rounded-lg transition-colors"><X size={24} /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {menuStructure.map((sec, idx) => (
                <div key={idx}>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-4 mb-2">{sec.title}</p>
                  {sec.items.map(i => (
                    <button
                      key={i.id}
                      onClick={() => { setActiveView(i.id); setIsSidebarOpen(false); }}
                      className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeView === i.id ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                      {i.icon} {i.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-gray-100 bg-gray-50 mt-auto">
              <button
                onClick={() => { handleLogout(); setIsSidebarOpen(false); }}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-red-600 bg-red-100 hover:bg-red-200 transition-all"
              >
                <LogOut size={18} /> Cerrar Sesión
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MAIN CONTENT */}
      <main className="flex-1 w-full px-4 sm:px-6 py-8 max-w-7xl mx-auto">
        <header className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-blue-600 mb-1 font-black text-[10px] uppercase tracking-widest">
              {activeItem?.icon} {activeItem?.label}
            </div>
            <h2 className="text-3xl font-black text-slate-800 tracking-tight">Panel de Control</h2>
          </div>
          <div className="bg-white px-4 py-2 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
             <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
             <span className="text-xs font-medium text-slate-400">SENSOR CONECTADO:</span>
             <span className="text-xs font-black text-blue-600 uppercase">{selectedSensor}</span>
          </div>
        </header>

        <section className="animate-in fade-in duration-500">
          {activeView === 'Overview'  && <OverviewView  sensorId={selectedSensor} />}
          {activeView === 'Latest'    && <LatestView    sensorId={selectedSensor} />}
          {activeView === 'Status'    && <StatusView    sensorId={selectedSensor} onNavigate={setActiveView} />}
          {activeView === 'History'   && <HistoryView   sensorId={selectedSensor} />}
          {activeView === 'Energy'    && <EnergyView    sensorId={selectedSensor} />}
          {activeView === 'AlertRules'&& <AlertRulesView sensorId={selectedSensor} />}
          {activeView === 'Weather'   && <WeatherView   sensorId={selectedSensor} />}
        </section>
      </main>

      {/* MOBILE BOTTOM NAV */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t
        border-gray-200 p-2 flex justify-around items-center z-50
        shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] pb-safe">
        {menuStructure.slice(0, 5).map((m) => (
          <button
            key={m.items[0].id}
            onClick={() => setActiveView(m.items[0].id)}
            className={`flex flex-col items-center p-2 rounded-xl transition-all
              ${activeView === m.items[0].id ? 'text-blue-600 bg-blue-50' : 'text-gray-400'}`}>
            {m.icon}
            <span className="text-[9px] font-medium mt-1 uppercase tracking-tighter">
              {m.title}
            </span>
          </button>
        ))}
      </nav>
      
      <AlertNotifier sensorId={selectedSensor} />
    </div>
  );
};

export default App;