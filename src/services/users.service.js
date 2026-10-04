import { USER_ROLES } from '../constants/index.js'
import { httpError } from '../utils/httpError.js'
import { usersRepository } from '../repositories/users.repository.js'

const VALID_ROLES = Object.values(USER_ROLES)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/ // algo@algo.algo, sin espacios

const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== ''

// Valida y arma una lista blanca: solo firstName, lastName, email y role.
// partial = true (update): valida solo los campos que vinieron.
const validateUser = (data = {}, { partial = false } = {}) => {
  const clean = {}

  for (const field of ['firstName', 'lastName']) {
    if (!partial || data[field] !== undefined) {
      if (!isNonEmptyString(data[field])) {
        throw httpError(400, `${field} es obligatorio y debe ser texto`)
      }
      clean[field] = data[field].trim()
    }
  }

  if (!partial || data.email !== undefined) {
    if (typeof data.email !== 'string' || !EMAIL_REGEX.test(data.email.trim())) {
      throw httpError(400, 'email es obligatorio y debe tener un formato válido')
    }
    clean.email = data.email.trim().toLowerCase()
  }

  // role es opcional también al crear (por defecto USER)
  if (data.role !== undefined) {
    if (!VALID_ROLES.includes(data.role)) {
      throw httpError(400, `role inválido. Valores permitidos: ${VALID_ROLES.join(', ')}`)
    }
    clean.role = data.role
  }

  return clean
}

export default class UsersService {
  // Inyección de dependencias: recibe el repository por constructor
  constructor(repository) {
    this.repository = repository
  }

  async getAll({ role } = {}) {
    if (role !== undefined && !VALID_ROLES.includes(role)) {
      throw httpError(400, `role inválido. Valores permitidos: ${VALID_ROLES.join(', ')}`)
    }
    return this.repository.findAll({ role })
  }

  async getById(id) {
    const user = await this.repository.findById(id)
    if (!user) throw httpError(404, 'Usuario no encontrado')
    return user
  }

  async create(data) {
    const user = validateUser(data ?? {})
    const existing = await this.repository.findByEmail(user.email)
    if (existing) throw httpError(409, 'Ya existe un usuario con ese email')
    return this.repository.create({ ...user, role: user.role ?? USER_ROLES.USER })
  }

  async update(id, data) {
    const changes = validateUser(data ?? {}, { partial: true })
    if (Object.keys(changes).length === 0) {
      throw httpError(400, 'No hay campos válidos para actualizar (firstName, lastName, email, role)')
    }
    // Conflicto solo si el email pertenece a OTRO usuario
    if (changes.email) {
      const existing = await this.repository.findByEmail(changes.email)
      if (existing && String(existing._id) !== String(id)) {
        throw httpError(409, 'Ya existe un usuario con ese email')
      }
    }
    const updated = await this.repository.updateById(id, changes)
    if (!updated) throw httpError(404, 'Usuario no encontrado')
    return updated
  }

  async delete(id) {
    const deleted = await this.repository.deleteById(id)
    if (!deleted) throw httpError(404, 'Usuario no encontrado')
    return deleted
  }
}

// Instancia lista para usar (la clase sigue exportada para los tests)
export const usersService = new UsersService(usersRepository)