import { DELIVERY_STATUS, ORDER_STATUS, USER_ROLES } from '../constants/index.js'
import AppError from '../errors/AppError.js'
import { deliveriesRepository } from '../repositories/deliveries.repository.js'
import { ordersRepository } from '../repositories/orders.repository.js'
import { usersRepository } from '../repositories/users.repository.js'
import logger from '../config/logger.js'

const VALID_STATUSES = Object.values(DELIVERY_STATUS)

const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== ''

export default class DeliveriesService {
  // Inyección de dependencias: entregas, pedidos (para sincronizar estado) y usuarios
  constructor({ deliveriesRepository, ordersRepository, usersRepository }) {
    this.deliveriesRepository = deliveriesRepository
    this.ordersRepository = ordersRepository
    this.usersRepository = usersRepository
  }

  async getAll({ status, driver } = {}) {
    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      throw new AppError('INVALID_DELIVERY_STATUS', `Valores permitidos: ${VALID_STATUSES.join(', ')}`)
    }
    return this.deliveriesRepository.findAll({ status, driver })
  }

  async getById(id) {
    const delivery = await this.deliveriesRepository.findById(id)
    if (!delivery) throw new AppError('DELIVERY_NOT_FOUND')
    return delivery
  }

  // Crea la entrega de un pedido: nace PENDING y sin repartidor
  async create(data) {
    const orderId = data?.order
    if (!isNonEmptyString(orderId)) {
      throw new AppError('VALIDATION_ERROR', 'order es obligatorio (id del pedido)')
    }

    const order = await this.ordersRepository.findById(orderId)
    if (!order) throw new AppError('ORDER_NOT_FOUND')
    if (order.status !== ORDER_STATUS.CREATED) {
      throw new AppError('ORDER_NOT_DELIVERABLE', `El pedido está ${order.status}; solo se crea la entrega de un pedido created`)
    }

    const existing = await this.deliveriesRepository.findByOrder(orderId)
    if (existing) throw new AppError('DELIVERY_ALREADY_EXISTS')

    const created = await this.deliveriesRepository.create({
      order: order._id,
      driver: null,
      status: DELIVERY_STATUS.PENDING
      
    })
    logger.warning(`Pedido ${order._id} sin repartidor asignado (entrega ${created._id} en pending)`)
    return created
  }

    // Asigna repartidor: pedido CREATED → ASSIGNED y entrega PENDING → ASSIGNED
  async assignDriver(id, driverId) {
    if (!isNonEmptyString(driverId)) {
      throw new AppError('VALIDATION_ERROR', 'driver es obligatorio (id del repartidor)')
    }

    const delivery = await this.getById(id)
    if (delivery.status !== DELIVERY_STATUS.PENDING) throw new AppError('DELIVERY_ALREADY_ASSIGNED')
    if (!delivery.order) throw new AppError('ORDER_NOT_FOUND', 'La entrega no tiene un pedido asociado')

    const driver = await this.usersRepository.findById(driverId)
    if (!driver) throw new AppError('USER_NOT_FOUND', `driver ${driverId}`)
    if (driver.role !== USER_ROLES.DRIVER) {
      throw new AppError('VALIDATION_ERROR', 'driver debe ser un usuario con rol driver')
    }

    const orderId = delivery.order._id

    // 1) Pedido CREATED → ASSIGNED (condicional): si falla, no se tocó nada
    const order = await this.ordersRepository.updateStatus(orderId, ORDER_STATUS.CREATED, ORDER_STATUS.ASSIGNED)
    if (!order) throw new AppError('ORDER_NOT_DELIVERABLE', 'El pedido ya no está en estado created')

    // Compensación: si el paso 2 no se completa, el pedido vuelve a CREATED
    const rollbackOrder = () =>
      this.ordersRepository.updateStatus(orderId, ORDER_STATUS.ASSIGNED, ORDER_STATUS.CREATED)

    // 2) Entrega PENDING → ASSIGNED con repartidor (condicional)
    let updated
    try {
      updated = await this.deliveriesRepository.updateIf(id, DELIVERY_STATUS.PENDING, {
        driver: driver._id,
        status: DELIVERY_STATUS.ASSIGNED
      })
    } catch (error) {
      logger.warning(`Compensación: falló la asignación de la entrega ${id}; el pedido ${orderId} vuelve a created`)
      await rollbackOrder()
      throw error // el middleware lo traduce (ej.: DATABASE_ERROR)
    }

    if (!updated) {
      logger.warning(`Compensación: la entrega ${id} ya estaba asignada; el pedido ${orderId} vuelve a created`)
      await rollbackOrder() // otra request asignó la entrega en el medio
      throw new AppError('DELIVERY_ALREADY_ASSIGNED')
    }
    logger.info(`Repartidor ${driver._id} asignado a la entrega ${id} (pedido ${orderId} → assigned)`)
    return updated
  }
}

// Instancia lista para usar (la clase sigue exportada para los tests)
export const deliveriesService = new DeliveriesService({
  deliveriesRepository,
  ordersRepository,
  usersRepository
})