import config from './config/index.js'
import logger from './config/logger.js'
import app from './app.js'
import { connectDB, disconnectDB } from './config/db.js'

const SHUTDOWN_TIMEOUT_MS = 10000 // si algo se cuelga al cerrar, se fuerza la salida

// Registra una falla crítica y termina el proceso recién cuando el logger
// terminó de escribir (si saliéramos de inmediato, el log podría perderse)
const exitWithFatal = (message, error) => {
  logger.fatal(`${message}: ${error?.message ?? error}`)
  logger.on('finish', () => process.exit(1))
  logger.end()
  setTimeout(() => process.exit(1), 3000).unref() // seguridad: no esperar para siempre
}

// Errores que nadie capturó: el proceso queda en estado incierto
process.on('unhandledRejection', (reason) => exitWithFatal('Promesa rechazada sin manejar', reason))
process.on('uncaughtException', (error) => exitWithFatal('Excepción no capturada', error))

// Apagado ordenado: docker stop manda SIGTERM, y Ctrl+C manda SIGINT.
// Deja de aceptar conexiones, espera a que terminen las requests en curso,
// cierra MongoDB y recién ahí termina el proceso (sin cortar respuestas a la mitad)
let shuttingDown = false
const shutdown = (server) => async (signal) => {
  if (shuttingDown) return // un segundo Ctrl+C no reinicia el cierre
  shuttingDown = true
  logger.info(`${signal} recibido: cerrando el servidor`)
  setTimeout(() => {
    logger.error('El cierre tardó demasiado, se fuerza la salida')
    process.exit(1)
  }, SHUTDOWN_TIMEOUT_MS).unref()

  server.close(async () => {
    try {
      await disconnectDB()
      logger.info('Servidor y conexión a MongoDB cerrados')
      logger.on('finish', () => process.exit(0))
      logger.end()
    } catch (error) {
      exitWithFatal('Error al cerrar la conexión con MongoDB', error)
    }
  })
}

const start = async () => {
  try {
    await connectDB(config.mongoUri)
    logger.info('Conexión a MongoDB establecida')

    const server = app.listen(config.port, () => {
      logger.info(`Servidor ShipNow escuchando en el puerto ${config.port} (${config.nodeEnv})`)
    })
    process.on('SIGTERM', shutdown(server))
    process.on('SIGINT', shutdown(server))
  } catch (error) {
    // Sin base de datos la API no arranca
    exitWithFatal('Error al conectar con MongoDB, la API no puede arrancar', error)
  }
}

start()