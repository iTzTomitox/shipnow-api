import { ERRORS } from './errorDictionary.js'

// Error esperado del dominio. Se lanza desde los services:
//   throw new AppError('ORDER_NOT_FOUND')
//   throw new AppError('VALIDATION_ERROR', 'price debe ser mayor o igual a 0')
// El middleware global lo transforma en la respuesta HTTP.
export default class AppError extends Error {
  constructor(code, details) {
    const definition = ERRORS[code]
    // Código inexistente = bug de programación: falla en el momento, no en silencio
    if (!definition) {
      throw new Error(`Código de error desconocido: "${code}". Definilo en errorDictionary.js`)
    }

    super(definition.message)
    this.name = 'AppError'
    this.code = code
    this.statusCode = definition.statusCode
    this.details = details // opcional: detalle del caso concreto
  }
}