import mongoose from 'mongoose'
import request from 'supertest'
import { expect } from 'chai'
import app from '../../src/app.js'
import { ERRORS } from '../../src/errors/errorDictionary.js'

// Cliente HTTP de la app sin abrir puerto: api().get('/api/users')
export const api = () => request(app)

// Vacía todas las colecciones (conserva los índices: email único, una entrega por pedido)
export const clearDatabase = async () => {
  const collections = Object.values(mongoose.connection.collections)
  await Promise.all(collections.map((collection) => collection.deleteMany({})))
}

// Verifica el formato de error del middleware global contra el diccionario:
// status HTTP, status "error", código interno y su mensaje exacto
export const expectError = (res, code) => {
  expect(ERRORS[code], `código ${code} en el diccionario`).to.exist
  expect(res.status).to.equal(ERRORS[code].statusCode)
  expect(res.body).to.include({ status: 'error', error: code, message: ERRORS[code].message })
}

// Id con formato válido que no existe en la base (para probar los 404)
export const NONEXISTENT_ID = '6ac1b4f2a653ca2ad6719999'

// ---------- Fábricas de datos controlados (se crean por la API, como un cliente real) ----------

let sequence = 0
const nextEmail = (prefix) => `${prefix}.${Date.now()}.${++sequence}@test.com`

export const createUser = async (overrides = {}) => {
  const body = { firstName: 'Ana', lastName: 'Test', email: nextEmail('user'), ...overrides }
  const res = await api().post('/api/users').send(body)
  expect(res.status, JSON.stringify(res.body)).to.equal(201)
  return res.body.payload
}

export const createDriver = (overrides = {}) =>
  createUser({ firstName: 'Luis', email: nextEmail('driver'), role: 'driver', ...overrides })

export const createProduct = async (overrides = {}) => {
  const body = { name: 'Caja test', price: 100, stock: 10, ...overrides }
  const res = await api().post('/api/products').send(body)
  expect(res.status, JSON.stringify(res.body)).to.equal(201)
  return res.body.payload
}

export const createOrder = async ({ customer, product, quantity = 2, ...overrides }) => {
  const body = {
    customer: customer._id,
    items: [{ product: product._id, quantity }],
    deliveryAddress: 'Calle Test 123',
    ...overrides
  }
  const res = await api().post('/api/orders').send(body)
  expect(res.status, JSON.stringify(res.body)).to.equal(201)
  return res.body.payload
}

export const createDelivery = async (order) => {
  const res = await api().post('/api/deliveries').send({ order: order._id })
  expect(res.status, JSON.stringify(res.body)).to.equal(201)
  return res.body.payload
}
