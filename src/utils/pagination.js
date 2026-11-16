import AppError from '../errors/AppError.js'
import { PAGINATION } from '../constants/index.js'

// Entero positivo desde la query string ("2" → 2). Sin valor → el valor por defecto.
const parsePositiveInt = (value, field, defaultValue, max = Infinity) => {
  if (value === undefined || value === '') return defaultValue
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1 || number > max) {
    const range = max === Infinity ? 'mayor o igual a 1' : `entre 1 y ${max}`
    throw new AppError('VALIDATION_ERROR', `${field} debe ser un entero ${range}`)
  }
  return number
}

// Valida ?page y ?limit. El tope de limit evita que un cliente pida la colección entera.
export const parsePagination = ({ page, limit } = {}) => ({
  page: parsePositiveInt(page, 'page', PAGINATION.DEFAULT_PAGE),
  limit: parsePositiveInt(limit, 'limit', PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT)
})

// Metadatos que acompañan a cada listado paginado
export const buildPaginationMeta = ({ page, limit }, total) => {
  const totalPages = Math.max(1, Math.ceil(total / limit))
  return { page, limit, total, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 }
}
