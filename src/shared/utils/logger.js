/**
 * Shared Utils - Logger
 * Système de logging coloré et structuré
 */

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  
  // Foreground
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m'
};

const LEVELS = {
  error: { color: 'red', priority: 0 },
  warn: { color: 'yellow', priority: 1 },
  info: { color: 'green', priority: 2 },
  debug: { color: 'gray', priority: 3 }
};

// Niveau de log minimum (configurable via LOG_LEVEL)
const minLevel = LEVELS[process.env.LOG_LEVEL?.toLowerCase()] || LEVELS.debug;

/**
 * Formate un timestamp
 */
function timestamp() {
  return new Date().toISOString().substring(11, 23);
}

/**
 * Colorise une chaîne
 */
function colorize(text, color) {
  if (process.env.NO_COLOR || !process.stdout.isTTY) {
    return text;
  }
  return `${COLORS[color] || ''}${text}${COLORS.reset}`;
}

/**
 * Crée une instance de logger avec un préfixe
 * @param {string} prefix - Préfixe pour identifier la source
 */
function create(prefix) {
  const log = (level, message, meta = {}) => {
    const levelConfig = LEVELS[level];
    if (!levelConfig || levelConfig.priority > minLevel.priority) {
      return;
    }
    
    const ts = colorize(timestamp(), 'dim');
    const lvl = colorize(level.toUpperCase().padEnd(5), levelConfig.color);
    const pfx = colorize(`[${prefix}]`, 'cyan');
    
    let output = `${ts} ${lvl} ${pfx} ${message}`;
    
    // Ajouter les métadonnées si présentes
    if (Object.keys(meta).length > 0) {
      const metaStr = Object.entries(meta)
        .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
        .join(' ');
      output += ` ${colorize(metaStr, 'dim')}`;
    }
    
    console.log(output);
  };
  
  return {
    error: (msg, meta) => log('error', msg, meta),
    warn: (msg, meta) => log('warn', msg, meta),
    info: (msg, meta) => log('info', msg, meta),
    debug: (msg, meta) => log('debug', msg, meta)
  };
}

// Instance par défaut
const defaultLogger = create('app');

export const logger = {
  create,
  // Méthodes directes pour usage simple
  error: defaultLogger.error,
  warn: defaultLogger.warn,
  info: defaultLogger.info,
  debug: defaultLogger.debug
};

// Alias pour createLogger (compatibilité avec toys_api)
export const createLogger = create;

