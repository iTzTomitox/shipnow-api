import mongoose from 'mongoose'
import ProductModel from '../models/product.model.js'

const PROJECTION = '-__v' // nunca exponemos el campo interno de versión
const DEFAULT_SORT = { createdAt: -1, _id: -1 } // más nuevos primero (_id desempata: páginas estables)

export default class ProductsRepository {
  // Inyección de dependencias: recibe el modelo por constructor
  constructor(model) {
    this.model = model
  }

  // Filtro opcional por status; el service decide si lo usa
  // Una página del listado + el total que cumple el filtro (las dos consultas en paralelo)
  async findAll({ status } = {}, { page = 1, limit = 10 } = {}) {
    const filter = status ? { status } : {}
    const [docs, total] = await Promise.all([
      this.model.find(filter, PROJECTION).sort(DEFAULT_SORT).skip((page - 1) * limit).limit(limit).lean(),
      this.model.countDocuments(filter)
    ])
    return { docs, total }
  }

  async findById(id) {
    // id con formato inválido: devolvemos null en vez de un CastError
    if (!mongoose.isValidObjectId(id)) return null
    return this.model.findById(id, PROJECTION).lean()
  }

  async create(data) {
    const created = await this.model.create(data)
    const { __v, ...plain } = created.toObject() // misma forma que .lean()
    return plain
  }

    async insertMany(docs) {
    const created = await this.model.insertMany(docs)
    return created.map((doc) => {
      const { __v, ...plain } = doc.toObject()
      return plain
    })
  }

  async updateById(id, data) {
    if (!mongoose.isValidObjectId(id)) return null
    return this.model
      .findByIdAndUpdate(id, data, { returnDocument: 'after', runValidators: true, projection: PROJECTION })
      .lean()
  }

  async deleteById(id) {
    if (!mongoose.isValidObjectId(id)) return null
    return this.model.findByIdAndDelete(id, { projection: PROJECTION }).lean()
  }
}

// Instancia lista para usar (la clase sigue exportada para los tests)
export const productsRepository = new ProductsRepository(ProductModel)