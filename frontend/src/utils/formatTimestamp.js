/**
 * formatTimestamp.js
 * ------------------
 * Utilidades para formatear timestamps en UTC,
 * evitando la conversión automática a hora local del navegador.
 *
 * El backend almacena y devuelve todos los timestamps en UTC.
 * Sin estas funciones, new Date(ts).toLocaleTimeString() aplica
 * la zona horaria local del navegador (ej: UTC+2 en España en verano),
 * provocando un desfase de +2h en la visualización.
 *
 * Colocar en: frontend/src/utils/formatTimestamp.js
 */

const UTC_LOCALE = 'es-ES';

/**
 * Formatea un timestamp mostrando solo la hora (HH:MM) en UTC.
 * Uso típico: ejes X de gráficas con ventana <= 24h.
 *
 * @param {string|Date} ts - ISO string o Date
 * @returns {string} "HH:MM"
 */
export const fmtTime = (ts) =>
  new Date(ts).toLocaleTimeString(UTC_LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });

/**
 * Formatea un timestamp mostrando hora y segundos (HH:MM:SS) en UTC.
 *
 * @param {string|Date} ts
 * @returns {string} "HH:MM:SS"
 */
export const fmtTimeSec = (ts) =>
  new Date(ts).toLocaleTimeString(UTC_LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC',
  });

/**
 * Formatea un timestamp con fecha corta y hora (DD MMM HH:MM) en UTC.
 * Uso típico: ejes X de gráficas con ventana > 24h.
 *
 * @param {string|Date} ts
 * @returns {string} "DD MMM HH:MM"
 */
export const fmtDateTime = (ts) =>
  new Date(ts).toLocaleString(UTC_LOCALE, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });

/**
 * Formatea un timestamp completo con fecha y hora en UTC.
 * Uso típico: tooltips, historial de alertas.
 *
 * @param {string|Date} ts
 * @returns {string} "DD MMM HH:MM"
 */
export const fmtFull = (ts) =>
  new Date(ts).toLocaleString(UTC_LOCALE, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });

/**
 * Elige entre fmtTime y fmtDateTime según la ventana temporal.
 * Conveniente para los ejes X de Chart.js.
 *
 * @param {string|Date} ts
 * @param {number} hours - ventana temporal en horas
 * @returns {string}
 */
export const fmtAxis = (ts, hours) =>
  hours > 24 ? fmtDateTime(ts) : fmtTime(ts);