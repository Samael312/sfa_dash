import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard,
  Wifi,
  WifiOff,
  Cpu,
  ChevronDown,
  Server,
  Radio,
  FileCode,
  Bell,
  Info,
  Settings2,
  AlertTriangle,
  CloudSun,
  Sun
} from 'lucide-react';

import LatestView     from './views/LatestView';
import StatusView     from './views/StatusView';
import HistoryView    from './views/HistoryView';
import AlertRulesView from './views/AlertRulesView';
import WeatherView     from './views/WeatherView';
import { api }        from './services/api';

// ==========================================
// CONSTANTES
// ==========================================
const STALE_THRESHOLD_MS    = 5 * 60 * 1000;
const NOTIFICATION_INTERVAL = 30_000;
const CONNECTION_INTERVAL   = 15_000;
const SENSOR_ID             = 'sensor1';

// ==========================================
// HOOK: estado de conexión basado en frescura de datos
// ==========================================
const useConnectionStatus = (sensorId) => {
  const [status, setStatus] = useState('connected');

  useEffect(() => {
    const check = async () => {
      try {
        const res = await api.getSFALatest(sensorId);
        if (!res?.timestamp) { setStatus('disconnected'); return; }
        const ageMs = Date.now() - new Date(res.timestamp).getTime();
        setStatus(ageMs > STALE_THRESHOLD_MS ? 'stale' : 'connected');
      } catch {
        setStatus('disconnected');
      }
    };
    check();
    const interval = setInterval(check, CONNECTION_INTERVAL);
    return () => clearInterval(interval);
  }, [sensorId]);

  return status;
};

// ==========================================
// HOOK: notificaciones push de alertas
// ==========================================
const useAlertNotifications = (sensorId) => {

  // Pedir permiso al montar
  useEffect(() => {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().then(perm => {
        console.log(`[SFA] Permiso de notificaciones: ${perm}`);
      });
    }
  }, []);

  // Evaluar alertas y disparar notificaciones
  useEffect(() => {
    if (!('Notification' in window)) return;

    const evaluate = async () => {
      // Leer permiso actual en cada ciclo (puede haber cambiado)
      if (Notification.permission !== 'granted') {
        console.warn('[SFA] Notificaciones no permitidas:', Notification.permission);
        return;
      }

      try {
        const res = await api.evaluateAlerts(sensorId);
        if (!res || res.new_alerts === 0) return;

        console.log(`[SFA] ${res.new_alerts} alerta(s) nueva(s)`);

        res.alerts.forEach(alert => {
          const levelLabel = alert.level === 'critical' ? '🔴 CRÍTICO' : '⚠️ Aviso';
          try {
            new Notification(`${levelLabel} — SFA Monitor`, {
              body:   alert.message,
              icon:   '/favicon.svg',
              tag:    `sfa-alert-${alert.variable}-${alert.id}`,
              silent: false,
            });
          } catch (e) {
            console.error('[SFA] Error al crear notificación:', e);
          }
        });
      } catch (e) {
        console.error('[SFA] Error al evaluar alertas:', e);
      }
    };

    // Primera evaluación con pequeño delay para dar tiempo al permiso
    const timeout  = setTimeout(evaluate, 2000);
    const interval = setInterval(evaluate, NOTIFICATION_INTERVAL);
    return () => { clearTimeout(timeout); clearInterval(interval); };
  }, [sensorId]);
};

// ==========================================
// COMPONENTE: badge de estado en navbar
// ==========================================
const ConnectionBadge = ({ status }) => {
  if (status === 'connected') return (
    <span className="px-3 py-1 rounded-full bg-green-100 text-green-800 text-xs font-semibold
                     border border-green-200 flex items-center gap-2">
      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
      SFA: Connected
    </span>
  );
  if (status === 'stale') return (
    <span className="px-3 py-1 rounded-full bg-yellow-100 text-yellow-800 text-xs font-semibold
                     border border-yellow-200 flex items-center gap-2">
      <AlertTriangle size={12} />
      Datos desactualizados
    </span>
  );
  return (
    <span className="px-3 py-1 rounded-full bg-red-100 text-red-800 text-xs font-semibold
                     border border-red-200 flex items-center gap-2">
      <WifiOff size={12} />
      Sin datos
    </span>
  );
};

// ==========================================
// COMPONENTE: banner bajo la navbar
// ==========================================
const ConnectionBanner = ({ status }) => {
  if (status === 'connected') return null;
  if (status === 'stale') return (
    <div className="w-full px-6 py-2 text-sm font-medium flex items-center gap-2
                    bg-yellow-50 border-b border-yellow-200 text-yellow-800">
      <AlertTriangle size={14} />
      Los datos tienen más de 5 minutos de antigüedad. Comprueba el simulador y el bridge.
    </div>
  );
  return (
    <div className="w-full px-6 py-2 text-sm font-medium flex items-center gap-2
                    bg-red-50 border-b border-red-200 text-red-800">
      <WifiOff size={14} />
      No se reciben datos del SFA. El simulador o el bridge pueden estar caídos.
    </div>
  );
};

// ==========================================
// COMPONENTE PRINCIPAL APP
// ==========================================
const App = () => {
  const [activeView, setActiveView] = useState('Latest');
  const [openMenu, setOpenMenu]     = useState(null);
  const navRef                      = useRef(null);

  const connectionStatus = useConnectionStatus(SENSOR_ID);
  useAlertNotifications(SENSOR_ID);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (navRef.current && !navRef.current.contains(event.target)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
      items: [{ label: 'Últimos Datos', id: 'Latest', icon: <Radio size={16} /> }]
    },
    {
      title: 'Estado',
      icon: <Cpu size={18} />,
      items: [{ label: 'Variables', id: 'Status', icon: <Server size={16} /> }]
    },
    {
      title: 'Historial',
      icon: <FileCode size={18} />,
      items: [{ label: 'Historial', id: 'History', icon: <Info size={16} /> }]
    },
    {
      title: 'Alertas',
      icon: <Bell size={18} />,
      items: [{ label: 'Configurar umbrales', id: 'AlertRules', icon: <Settings2 size={16} /> }]
    },
    {
      title: 'Meteorología',
      icon: <CloudSun size={18} />,
      items: [{ label: 'Previsión solar', id: 'Weather', icon: <Sun size={16} /> }]
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900 flex flex-col w-full">

      <nav ref={navRef} className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50 w-full">
        <div className="w-full px-6">
          <div className="flex justify-between h-16">

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
                        {menu.items.map((item) => (
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

            <div className="flex items-center">
              <ConnectionBadge status={connectionStatus} />
            </div>
          </div>
        </div>
      </nav>

      <ConnectionBanner status={connectionStatus} />

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