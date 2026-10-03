import config from './config/index.js'
import app from './app.js'
import { connectDB } from './config/db.js'

const start = async () => {
  try {
    await connectDB(config.mongoUri)
    // TEMPORAL: en PE4 se reemplaza por el logger de Winston
    console.info('Conexión a MongoDB establecida')

    app.listen(config.port, () => {
      console.info(`Servidor ShipNow escuchando en el puerto ${config.port}`)
    })
  } catch (error) {
    console.error('No se pudo iniciar el servidor:', error.message)
    process.exit(1) // sin base de datos la API no arranca
  }
}

start()