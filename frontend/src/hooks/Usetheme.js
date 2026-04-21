/**
 * useTheme.js
 * -----------
 * Hook para gestionar el tema claro/oscuro.
 * Persiste en localStorage y aplica la clase 'dark' al <html>.
 *
 * Colocar en: frontend/src/hooks/useTheme.js
 */

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'sfa_theme';

const getInitialTheme = () => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  // Detectar preferencia del sistema
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const useTheme = () => {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark');
  const isDark  = theme === 'dark';

  return { theme, isDark, toggle, setTheme };
};

export default useTheme;