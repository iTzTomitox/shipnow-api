import { LOG_LEVELS } from '../constants/index.js'

// Función pura: recibe un objeto env y devuelve la config validada.
// No lee process.env, así se puede testear con objetos falsos.
const REQUIRED_VARS = ['PORT', 'MONGODB_URI', 'NODE_ENV']
const VALID_ENVS = ['development', 'test', 'production']
const VALID_LOG_LEVELS = Object.keys(LOG_LEVELS)

export const buildConfig = (env) => {
  // Fail fast: juntamos TODAS las que faltan para avisar de una vez
  const missing = REQUIRED_VARS.filter((key) => !env[key] || !env[key].trim())
  if (missing.length > 0) {
    throw new Error(
      `Faltan variables de entorno críticas: ${missing.join(', ')}. ` +
        'Revisá tu archivo .env (el modelo está en .env.example)'
    )
  }

  const port = Number(env.PORT)
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`PORT inválido: "${env.PORT}". Debe ser un entero positivo`)
  }

  if (!VALID_ENVS.includes(env.NODE_ENV)) {
    throw new Error(
      `NODE_ENV inválido: "${env.NODE_ENV}". Valores válidos: ${VALID_ENVS.join(', ')}`
    )
  }

  // LOG_LEVEL es opcional: por defecto más detalle fuera de producción
  const logLevel = env.LOG_LEVEL?.trim() || (env.NODE_ENV === 'production' ? 'info' : 'debug')
  if (!VALID_LOG_LEVELS.includes(logLevel)) {
    throw new Error(
      `LOG_LEVEL inválido: "${env.LOG_LEVEL}". Valores válidos: ${VALID_LOG_LEVELS.join(', ')}`
    )
  }

  // Object.freeze: nadie puede modificar la config en runtime
  return Object.freeze({
    port,
    mongoUri: env.MONGODB_URI,
    nodeEnv: env.NODE_ENV,
    logLevel
  })
}