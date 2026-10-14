import {
  ORDER_STATUS,
  ORDER_TRANSITIONS,
  DELIVERY_PRIORITY,
  PRODUCT_STATUS,
  USER_ROLES
} from '../constants/index.js'
import AppError from '../errors/AppError.js'
import { ordersRepository } from '../repositories/orders.repository.js'
import { usersRepository } from '../repositories/users.repository.js'
import { productsRepository } from '../repositories/products.repository.js'

const VALID_STATUSES = Object.values(ORDER_STATUS)
const VALID_PRIORITIES = Object.values(DELIVERY_PRIORITY)

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
  constructor({ ordersRepository, usersRepository, productsRepository }) {
    this.ordersRepository = ordersRepository
    this.usersRepository = usersRepository
    this.productsRepository = productsRepository
  }

  async getAll({ status } = {}) {
    if (status !== undefined) assertValidStatus(status)
    return this.ordersRepository.findAll({ status })
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

    return this.ordersRepository.create({
      customer: customer._id,
      items,
      deliveryAddress: input.deliveryAddress,
      priority: input.priority,
      total: calculateOrderTotal(items),
      status: ORDER_STATUS.CREATED 
    })
  }

  async updateStatus(id, newStatus) {
    assertValidStatus(newStatus) 

    const order = await this.getById(id) 

    const allowed = ORDER_TRANSITIONS[order.status]
    if (!allowed.includes(newStatus)) {
      const options = allowed.length > 0 ? allowed.join(', ') : 'ninguno (estado final)'
      throw new AppError('INVALID_STATUS_TRANSITION', `De "${order.status}" solo puede pasar a: ${options}`)
    }

    const updated = await this.ordersRepository.updateStatus(id, order.status, newStatus)
    if (!updated) {
      throw new AppError('INVALID_STATUS_TRANSITION', 'El estado del pedido cambió mientras se procesaba la solicitud')
    }
    return updated
  }
}


export const ordersService = new OrdersService({
  ordersRepository,
  usersRepository,
  productsRepository
})