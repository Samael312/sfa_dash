import React, { useState, useEffect } from 'react';
import { Sun, Loader2, CloudSun, Edit2, Check, X, MapPin } from 'lucide-react';

const SolarForecast = () => {
  // Inicializamos con localStorage o valores por defecto
  const [lat, setLat] = useState(() => parseFloat(localStorage.getItem('solar_lat')) || 37.40);
  const [lon, setLon] = useState(() => parseFloat(localStorage.getItem('solar_lon')) || -4.48);
  
  // Estados de la UI
  const [isEditing, setIsEditing] = useState(false);
  const [tempLat, setTempLat] = useState(lat);
  const [tempLon, setTempLon] = useState(lon);
  
  // Datos de la API
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchForecast = async () => {
      setLoading(true);
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=shortwave_radiation&forecast_days=1&timezone=auto`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.error) throw new Error("Coordenadas inválidas");

        const currentHourIndex = new Date().getHours();
        const currentRad = data.hourly.shortwave_radiation[currentHourIndex];
        const peakRad = Math.max(...data.hourly.shortwave_radiation);
        
        setForecast({ current: currentRad, peak: peakRad });
      } catch (error) {
        console.error("Error cargando Open-Meteo", error);
        setForecast({ current: '---', peak: '---' });
      } finally {
        setLoading(false);
      }
    };

    fetchForecast();
  }, [lat, lon]);

  const handleSave = () => {
    setLat(tempLat);
    setLon(tempLon);
    localStorage.setItem('solar_lat', tempLat);
    localStorage.setItem('solar_lon', tempLon);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setTempLat(lat);
    setTempLon(lon);
    setIsEditing(false);
  };

  // --- VISTA DE EDICIÓN ---
  if (isEditing) {
    return (
      <div className="p-5 rounded-2xl border border-blue-200 shadow-sm bg-blue-50/50">
        <div className="flex justify-between items-center mb-3">
          <p className="text-[10px] font-black uppercase text-blue-700 tracking-widest flex items-center gap-1">
            <MapPin size={12} /> Ubicación
          </p>
        </div>
        
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-500 w-8">Lat:</span>
            <input 
              type="number" 
              step="any"
              value={tempLat} 
              onChange={(e) => setTempLat(parseFloat(e.target.value))}
              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-semibold focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-all"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-500 w-8">Lon:</span>
            <input 
              type="number" 
              step="any"
              value={tempLon} 
              onChange={(e) => setTempLon(parseFloat(e.target.value))}
              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-semibold focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-all"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={handleCancel} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
            <X size={16} />
          </button>
          <button onClick={handleSave} className="p-1.5 text-emerald-600 hover:bg-emerald-100 bg-emerald-50 rounded-lg transition-colors">
            <Check size={16} />
          </button>
        </div>
      </div>
    );
  }

  // --- VISTA PRINCIPAL (CARGANDO O MOSTRANDO DATOS) ---
  return (
    <div className="p-5 rounded-2xl border border-amber-100 shadow-sm transition-all hover:scale-[1.02] bg-gradient-to-br from-amber-50 to-orange-50/30 group relative">
      <div className="flex justify-between items-start mb-2">
        <p className="text-[10px] font-black uppercase text-amber-700/60 tracking-widest leading-tight">
          Radiación Open-Meteo
        </p>
        <button 
          onClick={() => setIsEditing(true)}
          className="text-amber-500/50 hover:text-amber-600 transition-colors opacity-0 group-hover:opacity-100 absolute top-4 right-4 bg-white/50 rounded-md p-1 backdrop-blur-sm"
          title="Editar ubicación"
        >
          <Edit2 size={14} />
        </button>
        <CloudSun size={18} className="text-amber-500 opacity-100 group-hover:opacity-0 transition-opacity" />
      </div>
      
      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="animate-spin text-amber-400" size={24} />
        </div>
      ) : (
        <>
          <div className="flex items-end gap-2 mt-1">
            <p className="text-2xl font-black text-amber-900 leading-none">
              {forecast?.current} <span className="text-sm font-bold text-amber-700/60">W/m²</span>
            </p>
          </div>
          
          <div className="mt-3 pt-3 border-t border-amber-200/50 flex justify-between items-center">
            <span className="text-xs font-bold text-amber-800/60 flex items-center gap-1">
              <Sun size={12} /> Pico de hoy:
            </span>
            <span className="text-xs font-black text-amber-900">{forecast?.peak} W/m²</span>
          </div>
        </>
      )}
    </div>
  );
};

export default SolarForecast;