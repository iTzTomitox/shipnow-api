import mongoose from 'mongoose'
import UserModel from '../models/user.model.js'

const PROJECTION = '-__v' // nunca exponemos el campo interno de versión
const DEFAULT_SORT = { createdAt: -1 } // más nuevos primero

export default class UsersRepository {
  // Inyección de dependencias: recibe el modelo por constructor
  constructor(model) {
    this.model = model
  }

  // Filtro opcional por rol; el service decide si lo usa
  async findAll({ role } = {}) {
    const filter = role ? { role } : {}
    return this.model.find(filter, PROJECTION).sort(DEFAULT_SORT).lean()
  }

  async findById(id) {
    // id con formato inválido: devolvemos null en vez de un CastError
    if (!mongoose.isValidObjectId(id)) return null
    return this.model.findById(id, PROJECTION).lean()
  }

  // Normaliza igual que el modelo para que la búsqueda coincida
  async findByEmail(email) {
    return this.model.findOne({ email: email.trim().toLowerCase() }, PROJECTION).lean()
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
export const usersRepository = new UsersRepository(UserModel)