import { USER_ROLES, DOCUMENT_TYPES, UPLOAD_FOLDERS } from '../constants/index.js'
import AppError from '../errors/AppError.js'
import { usersRepository } from '../repositories/users.repository.js'
import { fileStorage, buildFileMetadata } from '../utils/files.js'
import logger from '../config/logger.js'

// Tipos de documento que se pueden cargar a un usuario (delivery_proof es de pedidos)
const USER_DOCUMENT_TYPES = [DOCUMENT_TYPES.USER_DOCUMENT, DOCUMENT_TYPES.DRIVER_LICENSE]

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
        throw new AppError('VALIDATION_ERROR', `${field} es obligatorio y debe ser texto`)
      }
      clean[field] = data[field].trim()
    }
  }

  if (!partial || data.email !== undefined) {
    if (typeof data.email !== 'string' || !EMAIL_REGEX.test(data.email.trim())) {
      throw new AppError('VALIDATION_ERROR', 'email es obligatorio y debe tener un formato válido')
    }
    clean.email = data.email.trim().toLowerCase()
  }

  // role es opcional también al crear (por defecto USER)
  if (data.role !== undefined) {
    if (!VALID_ROLES.includes(data.role)) {
      throw new AppError('INVALID_USER_ROLE', `Valores permitidos: ${VALID_ROLES.join(', ')}`)
    }
    clean.role = data.role
  }

  return clean
}

export default class UsersService {
  // Inyección de dependencias: recibe el repository por constructor
  constructor(repository, files = fileStorage) {
    this.repository = repository
    this.files = files
  }

  async getAll({ role } = {}) {
    if (role !== undefined && !VALID_ROLES.includes(role)) {
      throw new AppError('INVALID_USER_ROLE', `Valores permitidos: ${VALID_ROLES.join(', ')}`)
    }
    return this.repository.findAll({ role })
  }

  async getById(id) {
    const user = await this.repository.findById(id)
    if (!user) throw new AppError('USER_NOT_FOUND')
    return user
  }

  async create(data) {
    const user = validateUser(data ?? {})
    const existing = await this.repository.findByEmail(user.email)
    if (existing) throw new AppError('USER_ALREADY_EXISTS')
    return this.repository.create({ ...user, role: user.role ?? USER_ROLES.USER })
  }

  async update(id, data) {
    const changes = validateUser(data ?? {}, { partial: true })
    if (Object.keys(changes).length === 0) {
      throw new AppError('VALIDATION_ERROR', 'No hay campos válidos para actualizar (firstName, lastName, email, role)')
    }
    // Conflicto solo si el email pertenece a OTRO usuario
    if (changes.email) {
      const existing = await this.repository.findByEmail(changes.email)
      if (existing && String(existing._id) !== String(id)) {
        throw new AppError('USER_ALREADY_EXISTS')
      }
    }
    const updated = await this.repository.updateById(id, changes)
    if (!updated) throw new AppError('USER_NOT_FOUND')
    return updated
  }

  async delete(id) {
    const deleted = await this.repository.deleteById(id)
    if (!deleted) throw new AppError('USER_NOT_FOUND')
    return deleted
  }
  
  // Agrega un documento al usuario. Si algo falla después de que Multer guardó
  // el archivo, se borra del disco: ningún request fallido deja archivos huérfanos.
  async addDocument(id, file, type) {
    if (!file) throw new AppError('FILE_REQUIRED', 'Campo de archivo esperado: document')

    let filePath = file.path
    try {
      const documentType = type || DOCUMENT_TYPES.USER_DOCUMENT
      if (!USER_DOCUMENT_TYPES.includes(documentType)) {
        throw new AppError('INVALID_DOCUMENT_TYPE', `Valores permitidos: ${USER_DOCUMENT_TYPES.join(', ')}`)
      }

      const user = await this.repository.findById(id)
      if (!user) throw new AppError('USER_NOT_FOUND')
      if (documentType === DOCUMENT_TYPES.DRIVER_LICENSE && user.role !== USER_ROLES.DRIVER) {
        throw new AppError('INVALID_DOCUMENT_TYPE', 'Solo un usuario con rol driver puede cargar una licencia')
      }

      // Multer guardó en documents/; las licencias van a su propia carpeta
      if (documentType === DOCUMENT_TYPES.DRIVER_LICENSE) {
        filePath = await this.files.moveFile(file.path, UPLOAD_FOLDERS[documentType])
      }

      const updated = await this.repository.addDocument(id, buildFileMetadata(file, documentType, filePath))
      if (!updated) throw new AppError('USER_NOT_FOUND') // borrado entre la búsqueda y la escritura
      logger.info(`Documento ${documentType} cargado para el usuario ${id}`, { size: file.size })
      return updated
    } catch (error) {
      await this.files.removeFile(filePath) // limpieza: el archivo no quedó asociado a nada
      throw error
    }
  }
}

// Instancia lista para usar (la clase sigue exportada para los tests)
export const usersService = new UsersService(usersRepository, fileStorage)