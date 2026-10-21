import config from './config/index.js'
import logger from './config/logger.js'
import app from './app.js'
import { connectDB } from './config/db.js'

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

const start = async () => {
  try {
    await connectDB(config.mongoUri)
    logger.info('Conexión a MongoDB establecida')

    app.listen(config.port, () => {
      logger.info(`Servidor ShipNow escuchando en el puerto ${config.port} (${config.nodeEnv})`)
    })
  } catch (error) {
    // Sin base de datos la API no arranca
    exitWithFatal('Error al conectar con MongoDB, la API no puede arrancar', error)
  }
}

start()