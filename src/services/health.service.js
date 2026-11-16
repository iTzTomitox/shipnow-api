import config from '../config/index.js'
import { getDbState } from '../config/db.js'
import AppError from '../errors/AppError.js'

// Estado de salud de la API. Solo informa datos no sensibles: nada de URIs,
// credenciales, versiones de dependencias ni rutas del servidor.
export default class HealthService {
  // Inyección de dependencias: entorno, estado de la base, uptime y reloj
  constructor({ nodeEnv, getDbState, getUptime = process.uptime, now = () => new Date() }) {
    this.nodeEnv = nodeEnv
    this.getDbState = getDbState
    this.getUptime = getUptime
    this.now = now
  }

  // La API está sana solo si puede hablar con MongoDB: sin base no puede atender nada
  check() {
    const database = this.getDbState()
    if (database !== 'connected') {
      throw new AppError('SERVICE_UNAVAILABLE', `database: ${database}`)
    }
    return {
      status: 'ok',
      environment: this.nodeEnv,
      uptime: Math.floor(this.getUptime()), // segundos desde que arrancó el proceso
      timestamp: this.now().toISOString(),
      database
    }
  }
}

// Instancia lista para usar (la clase sigue exportada para los tests)
export const healthService = new HealthService({ nodeEnv: config.nodeEnv, getDbState })
