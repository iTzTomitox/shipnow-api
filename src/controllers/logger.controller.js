import logger from '../config/logger.js'
import { LOG_LEVELS } from '../constants/index.js'

// Herramienta interna (no es funcionalidad de negocio): genera un log en cada nivel
// para verificar consola, combined.log y error.log.
export const testLogger = (req, res) => {
  const levels = Object.keys(LOG_LEVELS)
  for (const level of levels) {
    logger[level](`Log de prueba de nivel ${level}`)
  }
  res.status(200).json({
    status: 'success',
    payload: { message: 'Logs de prueba generados en todos los niveles', levels }
  })
}