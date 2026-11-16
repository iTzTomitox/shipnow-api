import mongoose from 'mongoose'
import OrderModel from '../models/order.model.js'

const PROJECTION = '-__v' // nunca exponemos el campo interno de versión
const DEFAULT_SORT = { createdAt: -1, _id: -1 } // más nuevos primero (_id desempata: páginas estables)
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

  // Filtros opcionales por estado y por cliente; el service decide cuáles usa.
  // Devuelve una página ({ docs }) y el total de documentos que cumplen el filtro
  async findAll({ status, customer } = {}, { page = 1, limit = 10 } = {}) {
    if (customer && !mongoose.isValidObjectId(customer)) return { docs: [], total: 0 }
    const filter = {}
    if (status) filter.status = status
    if (customer) filter.customer = customer
    const [docs, total] = await Promise.all([
      this.model
        .find(filter, PROJECTION)
        .sort(DEFAULT_SORT)
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('customer', CUSTOMER_FIELDS)
        .lean(),
      this.model.countDocuments(filter)
    ])
    return { docs, total }
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
  // Cambio de estado condicional: solo actualiza si el pedido sigue en `fromStatus`.
  // Evita que dos requests simultáneas apliquen transiciones incompatibles.
  async updateStatus(id, fromStatus, toStatus) {
    if (!mongoose.isValidObjectId(id)) return null
    return this.model
      .findOneAndUpdate(
        { _id: id, status: fromStatus },
        { status: toStatus },
        { returnDocument: 'after', projection: PROJECTION }
      )
      .populate('customer', CUSTOMER_FIELDS)
      .lean()
  }
  
  // Guarda el comprobante solo si el pedido sigue en `fromStatus`, y en la misma
  // operación lo pasa a `toStatus` (escritura condicional y atómica)
  async setProof(id, fromStatus, proof, toStatus) {
    if (!mongoose.isValidObjectId(id)) return null
    return this.model
      .findOneAndUpdate(
        { _id: id, status: fromStatus },
        { $set: { proof, status: toStatus } },
        { returnDocument: 'after', runValidators: true, projection: PROJECTION }
      )
      .populate('customer', CUSTOMER_FIELDS)
      .lean()
  } 
}

// Instancia lista para usar (la clase sigue exportada para los tests)
export const ordersRepository = new OrdersRepository(OrderModel)