import mongoose from 'mongoose'
import OrderModel from '../models/order.model.js'

const PROJECTION = '-__v' // nunca exponemos el campo interno de versión
const DEFAULT_SORT = { createdAt: -1 } // más nuevos primero
const CUSTOMER_FIELDS = 'firstName lastName email' // lo único que se expone del cliente

// Convierte un documento de Mongoose en objeto plano sin __v
const toPlain = (doc) => {
  const { __v, ...plain } = doc.toObject()
  return plain
}

export default class OrdersRepository {
  // Inyección de dependencias: recibe el modelo por constructor
  constructor(model) {
    this.model = model
  }

  // Filtros opcionales por estado y por cliente; el service decide cuáles usa
  async findAll({ status, customer } = {}) {
    if (customer && !mongoose.isValidObjectId(customer)) return []
    const filter = {}
    if (status) filter.status = status
    if (customer) filter.customer = customer
    return this.model
      .find(filter, PROJECTION)
      .sort(DEFAULT_SORT)
      .populate('customer', CUSTOMER_FIELDS)
      .lean()
  }

  async findById(id) {
    if (!mongoose.isValidObjectId(id)) return null
    return this.model.findById(id, PROJECTION).populate('customer', CUSTOMER_FIELDS).lean()
  }

  async create(data) {
    return toPlain(await this.model.create(data))
  }

  // Inserción en bloque (seed de mocks): una sola operación contra MongoDB
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
export const ordersRepository = new OrdersRepository(OrderModel)