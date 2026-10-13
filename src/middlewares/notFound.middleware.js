import AppError from '../errors/AppError.js'

// Ninguna ruta respondió: derivamos un ROUTE_NOT_FOUND al middleware global
export const notFound = (req, res, next) => {
  next(new AppError('ROUTE_NOT_FOUND', `${req.method} ${req.originalUrl}`))
}