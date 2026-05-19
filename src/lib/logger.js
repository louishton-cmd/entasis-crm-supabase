// src/lib/logger.js
// Logger minimaliste qui silence les `debug`/`info` en production
// tout en laissant passer `warn` et `error` (utiles pour Sentry, debug
// utilisateur, monitoring).
//
// Pourquoi : 13 `console.log` étaient présents en prod (auth flows,
// fetch profile, realtime…) — ils polluent la console utilisateur,
// peuvent leak des IDs/emails dans les screenshots de support, et
// alourdissent légèrement le bundle.
//
// Usage :
//   import { logger } from '@/lib/logger'
//   logger.debug('[Auth] getSession: found user', userId)   // silent in prod
//   logger.warn('[Profile] fetch failed', err)              // always logs
//   logger.error('[App] crash', err)                        // always logs

const isDev = import.meta.env?.DEV ?? false

export const logger = {
  debug: isDev ? console.log.bind(console) : () => {},
  info: isDev ? console.info.bind(console) : () => {},
  warn: console.warn.bind(console),
  error: console.error.bind(console),
}
