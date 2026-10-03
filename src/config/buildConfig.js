const REQUIRED_VARS = ['PORT', 'MONGODB_URI', 'NODE_ENV']
const VALID_ENVS = ['development', 'test', 'production']

export const buildConfig = (env) => {
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

  return Object.freeze({
    port,
    mongoUri: env.MONGODB_URI,
    nodeEnv: env.NODE_ENV
  })
}