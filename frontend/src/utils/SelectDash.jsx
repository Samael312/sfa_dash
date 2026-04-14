// components/SelectDash.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Eye, EyeOff, Minimize2 } from 'lucide-react';

/**
 * Modes:
 * - show: render normal
 * - min: render header only (collapsed)
 * - hide: do not render section
 */
const MODES = [
  { id: 'show', label: 'Mostrar', icon: Eye },
  { id: 'min', label: 'Minimizar', icon: Minimize2 },
  { id: 'hide', label: 'Ocultar', icon: EyeOff },
];

const safeParse = (v) => {
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};

const SelectDash = ({
  storageKey = 'dashboard:sections',
  headerTitle = 'Visualizaciones',
  sections = [],
}) => {
  const defaultState = useMemo(() => {
    const m = {};
    sections.forEach((s) => {
      m[s.id] = s.defaultMode || 'show';
    });
    return m;
  }, [sections]);

  const [modeById, setModeById] = useState(defaultState);
  const [panelOpen, setPanelOpen] = useState(false);

  // load persisted
  useEffect(() => {
    const raw = localStorage.getItem(storageKey);
    const parsed = safeParse(raw);
    if (!parsed || typeof parsed !== 'object') return;

    // only keep known ids
    const next = { ...defaultState };
    Object.keys(parsed).forEach((k) => {
      if (k in next && ['show', 'min', 'hide'].includes(parsed[k])) next[k] = parsed[k];
    });
    setModeById(next);
  }, [storageKey, defaultState]);

  // persist
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(modeById));
  }, [storageKey, modeById]);

  const setMode = (id, mode) => {
    setModeById((p) => ({ ...p, [id]: mode }));
  };

  const visibleCount = useMemo(
    () => sections.filter((s) => (modeById[s.id] || 'show') !== 'hide').length,
    [sections, modeById]
  );

  return (
    <div className="bg-white rounded shadow-sm border border-gray-200 w-full overflow-hidden">
      {/* Header / Selector */}
      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPanelOpen((v) => !v)}
            className="p-1 rounded hover:bg-gray-100"
            title="Configurar secciones"
          >
            {panelOpen ? <ChevronDown size={18} className="text-gray-500" /> : <ChevronRight size={18} className="text-gray-500" />}
          </button>
          <div>
            <div className="text-sm font-bold text-gray-700">{headerTitle}</div>
            <div className="text-xs text-gray-500">{visibleCount}/{sections.length} visibles</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-xs font-bold px-3 py-1.5 rounded border border-gray-200 bg-white hover:bg-gray-50"
            onClick={() => setModeById(defaultState)}
          >
            Restaurar
          </button>
          <button
            type="button"
            className="text-xs font-bold px-3 py-1.5 rounded border border-gray-200 bg-white hover:bg-gray-50"
            onClick={() => {
              const next = {};
              sections.forEach((s) => (next[s.id] = 'show'));
              setModeById(next);
            }}
          >
            Mostrar todo
          </button>
          <button
            type="button"
            className="text-xs font-bold px-3 py-1.5 rounded border border-gray-200 bg-white hover:bg-gray-50"
            onClick={() => {
              const next = {};
              sections.forEach((s) => (next[s.id] = 'hide'));
              setModeById(next);
            }}
          >
            Ocultar todo
          </button>
        </div>
      </div>

      {/* Panel */}
      {panelOpen && (
        <div className="p-5 border-b border-gray-100">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sections.map((s) => {
              const mode = modeById[s.id] || 'show';
              return (
                <div key={s.id} className="border border-gray-200 rounded-lg p-3 bg-white">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-bold text-gray-700 truncate" title={s.title}>
                      {s.title}
                    </div>

                    <div className="flex items-center gap-1">
                      {MODES.map((m) => {
                        const Icon = m.icon;
                        const active = mode === m.id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setMode(s.id, m.id)}
                            className={`px-2 py-1 rounded border text-xs font-bold flex items-center gap-1
                              ${active ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                            title={m.label}
                          >
                            <Icon size={14} />
                            <span className="hidden sm:inline">{m.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sections */}
      <div className="p-5 space-y-6">
        {sections.map((s) => {
          const mode = modeById[s.id] || 'show';
          if (mode === 'hide') return null;

          if (mode === 'min') {
            return (
              <div key={s.id} className="border border-gray-200 rounded-lg bg-white">
                <div className="px-4 py-3 flex items-center justify-between">
                  <div className="font-bold text-gray-700">{s.title}</div>
                  <button
                    type="button"
                    className="text-xs font-bold px-3 py-1.5 rounded border border-gray-200 bg-white hover:bg-gray-50"
                    onClick={() => setMode(s.id, 'show')}
                  >
                    Expandir
                  </button>
                </div>
              </div>
            );
          }

          return <React.Fragment key={s.id}>{typeof s.render === 'function' ? s.render() : null}</React.Fragment>;
        })}
      </div>
    </div>
  );
};

export default SelectDash;