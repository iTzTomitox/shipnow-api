import mongoose from 'mongoose'
import DeliveryModel from '../models/delivery.model.js'

const PROJECTION = '-__v' // nunca exponemos el campo interno de versión
const DEFAULT_SORT = { createdAt: -1 } // más nuevas primero
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
  async findAll({ status, driver } = {}) {
    if (driver && !mongoose.isValidObjectId(driver)) return []
    const filter = {}
    if (status) filter.status = status
    if (driver) filter.driver = driver
    return this.model
      .find(filter, PROJECTION)
      .sort(DEFAULT_SORT)
      .populate('order', ORDER_FIELDS)
      .populate('driver', DRIVER_FIELDS)
      .lean()
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
    return this.model.findOne({ order: orderId }, PROJECTION).lean()
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
}

// Instancia lista para usar (la clase sigue exportada para los tests)
export const deliveriesRepository = new DeliveriesRepository(DeliveryModel)