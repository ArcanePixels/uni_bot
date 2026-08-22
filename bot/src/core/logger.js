const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[process.env.LOG_LEVEL ?? 'info'] ?? LEVELS.info;

function emit(level, scope, msg, extra) {
  if (LEVELS[level] < threshold) return;
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] (${scope}) ${msg}`;
  const stream = LEVELS[level] >= LEVELS.warn ? console.error : console.log;
  extra === undefined ? stream(line) : stream(line, extra);
}

export function createLogger(scope) {
  return {
    debug: (m, e) => emit('debug', scope, m, e),
    info: (m, e) => emit('info', scope, m, e),
    warn: (m, e) => emit('warn', scope, m, e),
    error: (m, e) => emit('error', scope, m, e),
  };
}
