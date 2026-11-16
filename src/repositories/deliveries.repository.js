import mongoose from 'mongoose'
import DeliveryModel from '../models/delivery.model.js'

const PROJECTION = '-__v' // nunca exponemos el campo interno de versión
const DEFAULT_SORT = { createdAt: -1, _id: -1 } // más nuevas primero (_id desempata: páginas estables)
const ORDER_FIELDS = 'status total deliveryAddress priority' // resumen del pedido
const DRIVER_FIELDS = 'firstName lastName email' // lo único que se expone del repartidor

const toPlain = (doc) => {
  const { __v, ...plain } = doc.toObject()
  return plain
}

export default class DeliveriesRepository {
  // Inyección de dependencias: recibe el modelo por constructor
  constructor(model) {
    this.model = model
  }

  // Filtros opcionales por estado y por repartidor
  // Una página del listado + el total que cumple el filtro (las dos consultas en paralelo)
  async findAll({ status, driver } = {}, { page = 1, limit = 10 } = {}) {
    if (driver && !mongoose.isValidObjectId(driver)) return { docs: [], total: 0 }
    const filter = {}
    if (status) filter.status = status
    if (driver) filter.driver = driver
    const [docs, total] = await Promise.all([
      this.model
        .find(filter, PROJECTION)
        .sort(DEFAULT_SORT)
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('order', ORDER_FIELDS)
        .populate('driver', DRIVER_FIELDS)
        .lean(),
      this.model.countDocuments(filter)
    ])
    return { docs, total }
  }

  async findById(id) {
    if (!mongoose.isValidObjectId(id)) return null
    return this.model
      .findById(id, PROJECTION)
      .populate('order', ORDER_FIELDS)
      .populate('driver', DRIVER_FIELDS)
      .lean()
  }

  async findByOrder(orderId) {
    if (!mongoose.isValidObjectId(orderId)) return null
    return this.model.findOne({ order: orderId }, PROJECTION).populate('driver', DRIVER_FIELDS).lean()
  }

  async create(data) {
    return toPlain(await this.model.create(data))
  }

  async insertMany(docs) {
    const created = await this.model.insertMany(docs)
    return created.map(toPlain)
  }

  async updateById(id, data) {
    if (!mongoose.isValidObjectId(id)) return null
    return this.model
      .findByIdAndUpdate(id, data, { returnDocument: 'after', runValidators: true, projection: PROJECTION })
      .lean()
  }
  // Actualización condicional: solo si la entrega sigue en `expectedStatus`.
  // Evita que dos requests asignen la misma entrega a la vez.
  async updateIf(id, expectedStatus, changes) {
    if (!mongoose.isValidObjectId(id)) return null
    return this.model
      .findOneAndUpdate(
        { _id: id, status: expectedStatus },
        changes,
        { returnDocument: 'after', runValidators: true, projection: PROJECTION }
      )
      .populate('order', ORDER_FIELDS)
      .populate('driver', DRIVER_FIELDS)
      .lean()
  }
}

// Instancia lista para usar (la clase sigue exportada para los tests)
export const deliveriesRepository = new DeliveriesRepository(DeliveryModel)