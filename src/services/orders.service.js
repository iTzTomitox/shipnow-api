import {
  ORDER_STATUS,
  ORDER_TRANSITIONS,
  DELIVERY_PRIORITY,
  PRODUCT_STATUS,
  USER_ROLES,
  DOCUMENT_TYPES
} from '../constants/index.js'
import AppError from '../errors/AppError.js'
import { ordersRepository } from '../repositories/orders.repository.js'
import { usersRepository } from '../repositories/users.repository.js'
import { productsRepository } from '../repositories/products.repository.js'
import { deliveriesRepository } from '../repositories/deliveries.repository.js'
import logger from '../config/logger.js'
import { fileStorage, buildFileMetadata } from '../utils/files.js'
import { parsePagination, buildPaginationMeta } from '../utils/pagination.js'

const VALID_STATUSES = Object.values(ORDER_STATUS)
const VALID_PRIORITIES = Object.values(DELIVERY_PRIORITY)
const PROOF_STATUSES = [ORDER_STATUS.IN_TRANSIT, ORDER_STATUS.DELIVERED] // estados que admiten comprobante

export const calculateOrderTotal = (items) =>
  items.reduce((acc, item) => acc + item.price * item.quantity, 0)

const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== ''

const validateOrderInput = (data = {}) => {
  if (!isNonEmptyString(data.customer)) {
    throw new AppError('VALIDATION_ERROR', 'customer es obligatorio (id del usuario)')
  }

  if (!Array.isArray(data.items) || data.items.length === 0) {
    throw new AppError('ORDER_ITEMS_REQUIRED')
  }
  for (const item of data.items) {
    const validItem = item && isNonEmptyString(item.product) &&
      Number.isInteger(item.quantity) && item.quantity >= 1
    if (!validItem) {
      throw new AppError('ORDER_ITEMS_REQUIRED', 'Cada item necesita product (id) y quantity entera mayor o igual a 1')
    }
  }

  if (!isNonEmptyString(data.deliveryAddress)) {
    throw new AppError('VALIDATION_ERROR', 'deliveryAddress es obligatoria')
  }

  if (data.priority !== undefined && !VALID_PRIORITIES.includes(data.priority)) {
    throw new AppError('VALIDATION_ERROR', `priority inválida. Valores permitidos: ${VALID_PRIORITIES.join(', ')}`)
  }

  return {
    customer: data.customer,
    items: data.items.map(({ product, quantity }) => ({ product, quantity })),
    deliveryAddress: data.deliveryAddress.trim(),
    priority: data.priority ?? DELIVERY_PRIORITY.NORMAL
  }
}

const assertValidStatus = (status) => {
  if (!VALID_STATUSES.includes(status)) {
    throw new AppError('INVALID_ORDER_STATUS', `Valores permitidos: ${VALID_STATUSES.join(', ')}`)
  }
}

export default class OrdersService {
  constructor({ ordersRepository, usersRepository, productsRepository, deliveriesRepository, files = fileStorage }) {
    this.ordersRepository = ordersRepository
    this.usersRepository = usersRepository
    this.productsRepository = productsRepository
    this.deliveriesRepository = deliveriesRepository
    this.files = files
  }

  // Listado paginado, con filtro opcional por estado
  async getAll({ status, page, limit } = {}) {
    if (status !== undefined) assertValidStatus(status)
    const pagination = parsePagination({ page, limit })
    const { docs, total } = await this.ordersRepository.findAll({ status }, pagination)
    return { docs, pagination: buildPaginationMeta(pagination, total) }
  }

  async getById(id) {
    const order = await this.ordersRepository.findById(id)
    if (!order) throw new AppError('ORDER_NOT_FOUND')
    return order
  }

  async create(data) {
    const input = validateOrderInput(data ?? {})

    const customer = await this.usersRepository.findById(input.customer)
    if (!customer) throw new AppError('USER_NOT_FOUND', `customer ${input.customer}`)
    if (customer.role !== USER_ROLES.USER) {
      throw new AppError('VALIDATION_ERROR', 'customer debe ser un usuario con rol user')
    }

    const products = await Promise.all(
      input.items.map((item) => this.productsRepository.findById(item.product))
    )

    const items = input.items.map((item, i) => {
      const product = products[i]
      if (!product) throw new AppError('PRODUCT_NOT_FOUND', `product ${item.product}`)
      if (product.status !== PRODUCT_STATUS.AVAILABLE) {
        throw new AppError('PRODUCT_NOT_AVAILABLE', product.name)
      }
      return { product: product._id, name: product.name, quantity: item.quantity, price: product.price }
    })

    const created = await this.ordersRepository.create({
      customer: customer._id,
      items,
      deliveryAddress: input.deliveryAddress,
      priority: input.priority,
      total: calculateOrderTotal(items),
      status: ORDER_STATUS.CREATED 
    })
        logger.info(`Pedido creado ${created._id}`, {
      customer: String(customer._id),
      items: items.length,
      total: created.total
    })
    return created
  }

  async updateStatus(id, newStatus) {
    assertValidStatus(newStatus) 

    const order = await this.getById(id) 
    
    // ASSIGNED solo se alcanza asignando repartidor: deja pedido y entrega coherentes
    if (newStatus === ORDER_STATUS.ASSIGNED) {
      throw new AppError('INVALID_STATUS_TRANSITION', 'Para pasar a assigned usá PATCH /api/deliveries/:did/assign')
    }

    const allowed = ORDER_TRANSITIONS[order.status]
    if (!allowed.includes(newStatus)) {
      const options = allowed.length > 0 ? allowed.join(', ') : 'ninguno (estado final)'
      throw new AppError('INVALID_STATUS_TRANSITION', `De "${order.status}" solo puede pasar a: ${options}`)
    }

    const updated = await this.ordersRepository.updateStatus(id, order.status, newStatus)
    if (!updated) {
      throw new AppError('INVALID_STATUS_TRANSITION', 'El estado del pedido cambió mientras se procesaba la solicitud')
    }
    logger.info(`Pedido ${id}: ${order.status} → ${newStatus}`)
    return updated
  }

  // Seguimiento del pedido: estado actual + entrega (si existe) con su repartidor
  async getTracking(id) {
    const order = await this.getById(id) // inexistente → ORDER_NOT_FOUND
    const delivery = await this.deliveriesRepository.findByOrder(order._id)
    return {
      order: {
        _id: order._id,
        status: order.status,
        priority: order.priority,
        deliveryAddress: order.deliveryAddress,
        total: order.total,
        updatedAt: order.updatedAt
      },
      delivery: delivery
        ? { _id: delivery._id, status: delivery.status, driver: delivery.driver, updatedAt: delivery.updatedAt }
        : null
    }
  }
  
  // Comprobante de entrega: solo con el pedido in_transit (pasa a delivered) o
  // delivered (reemplaza al anterior). Si algo falla, el archivo subido se borra.
  async addProof(id, file) {
    if (!file) throw new AppError('FILE_REQUIRED', 'Campo de archivo esperado: proof')

    try {
      const order = await this.getById(id) // inexistente → ORDER_NOT_FOUND
      if (!PROOF_STATUSES.includes(order.status)) {
        throw new AppError('ORDER_NOT_DELIVERABLE', `El comprobante se carga con el pedido in_transit o delivered (está ${order.status})`)
      }

      // Escritura condicional: guarda el comprobante y deja el pedido en delivered
      const proof = buildFileMetadata(file, DOCUMENT_TYPES.DELIVERY_PROOF)
      const updated = await this.ordersRepository.setProof(id, order.status, proof, ORDER_STATUS.DELIVERED)
      if (!updated) {
        throw new AppError('INVALID_STATUS_TRANSITION', 'El estado del pedido cambió mientras se procesaba la solicitud')
      }

      // Si había un comprobante anterior, su archivo ya no lo referencia nadie
      if (order.proof?.path) await this.files.removeFile(order.proof.path)
      logger.info(`Comprobante cargado para el pedido ${id} (${order.status} → ${updated.status})`)
      return updated
    } catch (error) {
      await this.files.removeFile(file.path) // limpieza: el archivo no quedó asociado a nada
      throw error
    }
  }
}


export const ordersService = new OrdersService({
  ordersRepository,
  usersRepository,
  productsRepository,
  deliveriesRepository
})