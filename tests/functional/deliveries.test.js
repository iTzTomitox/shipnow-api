import { expect } from 'chai'
import {
  api,
  clearDatabase,
  expectError,
  createUser,
  createDriver,
  createProduct,
  createOrder,
  createDelivery,
  NONEXISTENT_ID
} from './helpers.js'

describe('Funcional: /api/deliveries', () => {
  let customer
  let driver
  let order

  // Base vacía + cliente, repartidor y un pedido created, creados para cada test
  beforeEach(async () => {
    await clearDatabase()
    customer = await createUser()
    driver = await createDriver()
    const product = await createProduct()
    order = await createOrder({ customer, product })
  })

  describe('POST /api/deliveries', () => {
    it('crea la entrega del pedido en pending y sin repartidor', async () => {
      const res = await api().post('/api/deliveries').send({ order: order._id })
      expect(res.status).to.equal(201)
      expect(res.body.payload).to.include({ order: order._id, driver: null, status: 'pending' })
      expect(res.body.payload._id).to.match(/^[0-9a-f]{24}$/)
    })

    it('sin order → 400 VALIDATION_ERROR', async () => {
      const res = await api().post('/api/deliveries').send({})
      expectError(res, 'VALIDATION_ERROR')
    })

    it('pedido inexistente → 404 ORDER_NOT_FOUND', async () => {
      const res = await api().post('/api/deliveries').send({ order: NONEXISTENT_ID })
      expectError(res, 'ORDER_NOT_FOUND')
    })

    it('pedido cancelado → 409 ORDER_NOT_DELIVERABLE', async () => {
      await api().patch(`/api/orders/${order._id}/status`).send({ status: 'cancelled' })
      const res = await api().post('/api/deliveries').send({ order: order._id })
      expectError(res, 'ORDER_NOT_DELIVERABLE')
    })

    it('segunda entrega para el mismo pedido → 409 DELIVERY_ALREADY_EXISTS', async () => {
      await createDelivery(order)
      const res = await api().post('/api/deliveries').send({ order: order._id })
      expectError(res, 'DELIVERY_ALREADY_EXISTS')
    })

    it('peticiones simultáneas para el mismo pedido: solo una crea, el resto 409 (índice único)', async () => {
      const responses = await Promise.all(
        Array.from({ length: 5 }, () => api().post('/api/deliveries').send({ order: order._id }))
      )
      expect(responses.filter((r) => r.status === 201)).to.have.lengthOf(1)
      for (const res of responses.filter((r) => r.status !== 201)) {
        expect(res.status).to.equal(409)
        expect(['DELIVERY_ALREADY_EXISTS', 'DUPLICATE_RESOURCE']).to.include(res.body.error)
      }
    })
  })

  describe('GET /api/deliveries', () => {
    it('lista las entregas con el resumen del pedido', async () => {
      await createDelivery(order)
      const res = await api().get('/api/deliveries')
      expect(res.status).to.equal(200)
      expect(res.body.payload).to.have.lengthOf(1)
      expect(res.body.payload[0].order).to.include({ _id: order._id, status: 'created' })
      expect(res.body.payload[0]).to.include({ status: 'pending', driver: null })
    })

    it('filtra por estado (?status=pending)', async () => {
      await createDelivery(order)
      const pending = await api().get('/api/deliveries?status=pending')
      const assigned = await api().get('/api/deliveries?status=assigned')
      expect(pending.body.payload).to.have.lengthOf(1)
      expect(assigned.body.payload).to.have.lengthOf(0)
    })

    it('estado inválido en el filtro → 400 INVALID_DELIVERY_STATUS', async () => {
      const res = await api().get('/api/deliveries?status=lost')
      expectError(res, 'INVALID_DELIVERY_STATUS')
    })
  })

  describe('GET /api/deliveries/:did', () => {
    it('devuelve la entrega', async () => {
      const delivery = await createDelivery(order)
      const res = await api().get(`/api/deliveries/${delivery._id}`)
      expect(res.status).to.equal(200)
      expect(res.body.payload).to.include({ _id: delivery._id, status: 'pending' })
    })

    it('entrega inexistente → 404 DELIVERY_NOT_FOUND', async () => {
      const res = await api().get(`/api/deliveries/${NONEXISTENT_ID}`)
      expectError(res, 'DELIVERY_NOT_FOUND')
    })
  })

  describe('PATCH /api/deliveries/:did/assign', () => {
    it('asigna el repartidor: la entrega y el pedido pasan a assigned', async () => {
      const delivery = await createDelivery(order)
      const res = await api().patch(`/api/deliveries/${delivery._id}/assign`).send({ driver: driver._id })

      expect(res.status).to.equal(200)
      expect(res.body.payload.status).to.equal('assigned')
      expect(res.body.payload.driver).to.include({ _id: driver._id, email: driver.email })
      expect(res.body.payload.order).to.include({ _id: order._id, status: 'assigned' })

      // El pedido quedó sincronizado en la base
      const orderRes = await api().get(`/api/orders/${order._id}`)
      expect(orderRes.body.payload.status).to.equal('assigned')
    })

    it('sin driver → 400 VALIDATION_ERROR', async () => {
      const delivery = await createDelivery(order)
      const res = await api().patch(`/api/deliveries/${delivery._id}/assign`).send({})
      expectError(res, 'VALIDATION_ERROR')
    })

    it('usuario sin rol driver → 400 VALIDATION_ERROR (y el pedido sigue created)', async () => {
      const delivery = await createDelivery(order)
      const res = await api().patch(`/api/deliveries/${delivery._id}/assign`).send({ driver: customer._id })
      expectError(res, 'VALIDATION_ERROR')

      const orderRes = await api().get(`/api/orders/${order._id}`)
      expect(orderRes.body.payload.status).to.equal('created')
    })

    it('repartidor inexistente → 404 USER_NOT_FOUND', async () => {
      const delivery = await createDelivery(order)
      const res = await api().patch(`/api/deliveries/${delivery._id}/assign`).send({ driver: NONEXISTENT_ID })
      expectError(res, 'USER_NOT_FOUND')
    })

    it('entrega inexistente → 404 DELIVERY_NOT_FOUND', async () => {
      const res = await api().patch(`/api/deliveries/${NONEXISTENT_ID}/assign`).send({ driver: driver._id })
      expectError(res, 'DELIVERY_NOT_FOUND')
    })

    it('entrega ya asignada → 409 DELIVERY_ALREADY_ASSIGNED', async () => {
      const delivery = await createDelivery(order)
      await api().patch(`/api/deliveries/${delivery._id}/assign`).send({ driver: driver._id })
      const res = await api().patch(`/api/deliveries/${delivery._id}/assign`).send({ driver: driver._id })
      expectError(res, 'DELIVERY_ALREADY_ASSIGNED')
    })

    it('pedido cancelado después de crear la entrega → 409 ORDER_NOT_DELIVERABLE', async () => {
      const delivery = await createDelivery(order)
      await api().patch(`/api/orders/${order._id}/status`).send({ status: 'cancelled' })
      const res = await api().patch(`/api/deliveries/${delivery._id}/assign`).send({ driver: driver._id })
      expectError(res, 'ORDER_NOT_DELIVERABLE')
    })
  })
})
