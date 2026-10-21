import logger from '../config/logger.js'

// Registra cada petición HTTP al terminar: método, ruta, status y duración
export const requestLogger = (req, res, next) => {
  const start = process.hrtime.bigint() // reloj de alta precisión

  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6
    logger.http(`${req.method} ${req.originalUrl} ${res.statusCode} - ${ms.toFixed(1)} ms`)
  })

  next()
}