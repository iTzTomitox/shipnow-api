import AppError from '../errors/AppError.js'

// Traduce cualquier error a un AppError del diccionario
export const toAppError = (err) => {
  if (err instanceof AppError) return err

  // JSON mal formado en el body (lo lanza express.json)
  if (err.type === 'entity.parse.failed') return new AppError('INVALID_JSON')

  // Validación del esquema de Mongoose (red de seguridad: el service valida antes)
  if (err.name === 'ValidationError' && err.errors) {
    const details = Object.values(err.errors).map((e) => e.message).join('; ')
    return new AppError('VALIDATION_ERROR', details)
  }

  // Índice único violado en MongoDB (ej.: mismo email en dos requests simultáneas)
  if (err.code === 11000) {
    const fields = Object.keys(err.keyValue ?? {}).join(', ')
    return new AppError('DUPLICATE_RESOURCE', `Valor duplicado en: ${fields}`)
  }

  // MongoDB caído o inaccesible (MongoServerError, MongooseServerSelectionError, ...)
  if (err.name?.startsWith('Mongo')) return new AppError('DATABASE_ERROR', err.message)

  // Cualquier otra cosa es inesperada
  return new AppError('INTERNAL_SERVER_ERROR', err.message)
}

// Criterio de logging: errores esperados (4xx) → warning;
// inesperados del servidor (5xx) → error, con el stack para poder investigarlos.
const logError = (logger, appError, originalError, req) => {
  const where = `${req.method} ${req.originalUrl}`
  if (appError.statusCode >= 500) {
    logger.error(`${appError.code} en ${where}: ${originalError.message}\n${originalError.stack}`)
  } else {
    const meta = appError.details ? { details: appError.details } : {}
    logger.warning(`${appError.code} en ${where}`, meta)
  }
}

// Fabrica el middleware global. exposeDetails = false en producción:
// nunca mostramos detalles internos (mensajes de Mongo, errores de código) al cliente.
// El logger se inyecta: en los tests se reemplaza por uno falso.
export const createErrorHandler = ({ exposeDetails, logger }) => (err, req, res, next) => {
  // Si ya se empezó a enviar la respuesta, Express debe cerrar la conexión
  if (res.headersSent) return next(err)

  const appError = toAppError(err)
  logError(logger, appError, err, req) // el logger complementa, no reemplaza, la respuesta

  const body = { status: 'error', error: appError.code, message: appError.message }
  if (exposeDetails && appError.details) body.details = appError.details

  res.status(appError.statusCode).json(body)
}