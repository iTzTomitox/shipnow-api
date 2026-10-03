import { PRODUCT_STATUS } from '../constants/index.js'
import { httpError } from '../utils/httpError.js'
import { productsRepository } from '../repositories/products.repository.js'

// Regla de negocio: el estado depende del stock, nunca lo decide el cliente
const statusFromStock = (stock) =>
  stock > 0 ? PRODUCT_STATUS.AVAILABLE : PRODUCT_STATUS.OUT_OF_STOCK

// Valida y arma una lista blanca: solo name, price y stock.
// partial = true (update): valida solo los campos que vinieron.
const validateProduct = (data = {}, { partial = false } = {}) => {
  const clean = {}

  if (!partial || data.name !== undefined) {
    if (typeof data.name !== 'string' || !data.name.trim()) {
      throw httpError(400, 'name es obligatorio y debe ser texto')
    }
    clean.name = data.name.trim()
  }

  if (!partial || data.price !== undefined) {
    if (typeof data.price !== 'number' || !Number.isFinite(data.price) || data.price < 0) {
      throw httpError(400, 'price debe ser un número mayor o igual a 0')
    }
    clean.price = data.price
  }

  if (!partial || data.stock !== undefined) {
    if (!Number.isInteger(data.stock) || data.stock < 0) {
      throw httpError(400, 'stock debe ser un entero mayor o igual a 0')
    }
    clean.stock = data.stock
  }

  return clean
}

export default class ProductsService {
  // Inyección de dependencias: recibe el repository por constructor
  constructor(repository) {
    this.repository = repository
  }

  async getAll({ includeOutOfStock = false } = {}) {
    if (includeOutOfStock) return this.repository.findAll()
    return this.repository.findAll({ status: PRODUCT_STATUS.AVAILABLE })
  }

  async getById(id) {
    const product = await this.repository.findById(id)
    if (!product) throw httpError(404, 'Producto no encontrado')
    return product
  }

  async create(data) {
    const product = validateProduct(data ?? {})
    return this.repository.create({ ...product, status: statusFromStock(product.stock) })
  }

  async update(id, data) {
    const changes = validateProduct(data ?? {}, { partial: true })
    if (Object.keys(changes).length === 0) {
      throw httpError(400, 'No hay campos válidos para actualizar (name, price, stock)')
    }
    // Si cambia el stock, recalculamos el estado
    if (changes.stock !== undefined) changes.status = statusFromStock(changes.stock)

    const updated = await this.repository.updateById(id, changes)
    if (!updated) throw httpError(404, 'Producto no encontrado')
    return updated
  }

  async delete(id) {
    const deleted = await this.repository.deleteById(id)
    if (!deleted) throw httpError(404, 'Producto no encontrado')
    return deleted
  }
}

export const productsService = new ProductsService(productsRepository)