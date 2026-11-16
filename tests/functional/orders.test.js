import { expect } from 'chai'
import {
  api,
  clearDatabase,
  expectError,
  createUser,
  createDriver,
  createProduct,
  createOrder,
  NONEXISTENT_ID
} from './helpers.js'

describe('Funcional: /api/orders', () => {
  let customer
  let product

  // Base vacía + un cliente y un producto con stock, creados para cada test
  beforeEach(async () => {
    await clearDatabase()
    customer = await createUser()
    product = await createProduct({ name: 'Caja test', price: 100, stock: 10 })
  })

  const orderBody = (overrides = {}) => ({
    customer: customer._id,
    items: [{ product: product._id, quantity: 1 }],
    deliveryAddress: 'Calle 1',
    ...overrides
  })

  describe('POST /api/orders', () => {
    it('crea el pedido: snapshot del producto, total calculado, estado created y prioridad', async () => {
      const res = await api()
        .post('/api/orders')
        .send(orderBody({
          items: [{ product: product._id, quantity: 3, price: 1 }], // el precio enviado se ignora
          status: 'delivered' // el estado enviado se ignora
        }))

      expect(res.status).to.equal(201)
      const order = res.body.payload
      expect(order).to.include({ customer: customer._id, total: 300, status: 'created', priority: 'normal' })
      expect(order.items).to.deep.equal([{ product: product._id, name: 'Caja test', quantity: 3, price: 100 }])

      const high = await createOrder({ customer, product, priority: 'high' })
      expect(high.priority).to.equal('high')
    })

    it('datos inválidos → 400 (VALIDATION_ERROR u ORDER_ITEMS_REQUIRED, con el motivo en details)', async () => {
      const driver = await createDriver()
      const noAddress = await api().post('/api/orders').send(orderBody({ deliveryAddress: undefined }))
      expectError(noAddress, 'VALIDATION_ERROR')
      expect(noAddress.body.details).to.match(/deliveryAddress/)

      expectError(await api().post('/api/orders').send(orderBody({ priority: 'urgent' })), 'VALIDATION_ERROR')
      expectError(await api().post('/api/orders').send(orderBody({ customer: driver._id })), 'VALIDATION_ERROR') // un repartidor no es cliente
      expectError(await api().post('/api/orders').send(orderBody({ items: [] })), 'ORDER_ITEMS_REQUIRED')
    })

    it('cliente o producto inexistente → 404 USER_NOT_FOUND / PRODUCT_NOT_FOUND', async () => {
      expectError(await api().post('/api/orders').send(orderBody({ customer: NONEXISTENT_ID })), 'USER_NOT_FOUND')
      expectError(
        await api().post('/api/orders').send(orderBody({ items: [{ product: NONEXISTENT_ID, quantity: 1 }] })),
        'PRODUCT_NOT_FOUND'
      )
    })

    it('producto sin stock → 409 PRODUCT_NOT_AVAILABLE', async () => {
      const noStock = await createProduct({ name: 'Agotado', stock: 0 })
      const res = await api().post('/api/orders').send(orderBody({ items: [{ product: noStock._id, quantity: 1 }] }))
      expectError(res, 'PRODUCT_NOT_AVAILABLE')
      expect(res.body.details).to.equal('Agotado')
    })
  })

  describe('GET /api/orders', () => {
    it('lista los pedidos con los datos del cliente y filtra por estado', async () => {
      const toCancel = await createOrder({ customer, product })
      await createOrder({ customer, product })
      await api().patch(`/api/orders/${toCancel._id}/status`).send({ status: 'cancelled' })

      const all = await api().get('/api/orders')
      expect(all.status).to.equal(200)
      expect(all.body.payload).to.have.lengthOf(2)
      expect(all.body.payload[0].customer).to.include({ _id: customer._id, email: customer.email })
      expect(all.body.payload[0].customer).to.include.all.keys('firstName', 'lastName')

      const cancelled = await api().get('/api/orders?status=cancelled')
      expect(cancelled.body.payload).to.have.lengthOf(1)
      expect(cancelled.body.payload[0]._id).to.equal(toCancel._id)
    })

    it('estado inválido en el filtro → 400 INVALID_ORDER_STATUS', async () => {
      expectError(await api().get('/api/orders?status=on_the_way'), 'INVALID_ORDER_STATUS')
    })
  })

  describe('GET /api/orders/:oid', () => {
    it('devuelve el pedido por id, con los datos del cliente', async () => {
      const order = await createOrder({ customer, product })
      const res = await api().get(`/api/orders/${order._id}`)
      expect(res.status).to.equal(200)
      expect(res.body.payload).to.include({ _id: order._id, total: 200, status: 'created' })
      expect(res.body.payload.customer._id).to.equal(customer._id)
    })

    it('pedido inexistente o id con formato inválido → 404 ORDER_NOT_FOUND', async () => {
      expectError(await api().get(`/api/orders/${NONEXISTENT_ID}`), 'ORDER_NOT_FOUND')
      expectError(await api().get('/api/orders/123'), 'ORDER_NOT_FOUND')
    })
  })

  describe('PATCH /api/orders/:oid/status', () => {
    it('transición válida (created → cancelled)', async () => {
      const order = await createOrder({ customer, product })
      const res = await api().patch(`/api/orders/${order._id}/status`).send({ status: 'cancelled' })
      expect(res.status).to.equal(200)
      expect(res.body.payload).to.include({ _id: order._id, status: 'cancelled' })
    })

    it('estado que no existe o sin body → 400 INVALID_ORDER_STATUS', async () => {
      const order = await createOrder({ customer, product })
      expectError(await api().patch(`/api/orders/${order._id}/status`).send({ status: 'on_the_way' }), 'INVALID_ORDER_STATUS')
      expectError(await api().patch(`/api/orders/${order._id}/status`), 'INVALID_ORDER_STATUS')
    })

    it('transiciones no permitidas → 409 INVALID_STATUS_TRANSITION (salto, assigned y estado final)', async () => {
      const order = await createOrder({ customer, product })
      expectError(await api().patch(`/api/orders/${order._id}/status`).send({ status: 'delivered' }), 'INVALID_STATUS_TRANSITION')

      const assigned = await api().patch(`/api/orders/${order._id}/status`).send({ status: 'assigned' })
      expectError(assigned, 'INVALID_STATUS_TRANSITION')
      expect(assigned.body.details).to.match(/assign/) // indica qué endpoint usar

      await api().patch(`/api/orders/${order._id}/status`).send({ status: 'cancelled' })
      expectError(await api().patch(`/api/orders/${order._id}/status`).send({ status: 'created' }), 'INVALID_STATUS_TRANSITION')
    })

    it('pedido inexistente → 404 ORDER_NOT_FOUND', async () => {
      const res = await api().patch(`/api/orders/${NONEXISTENT_ID}/status`).send({ status: 'cancelled' })
      expectError(res, 'ORDER_NOT_FOUND')
    })
  })

  describe('GET /api/orders/:oid/tracking', () => {
    it('pedido sin entrega → delivery null; pedido inexistente → 404 ORDER_NOT_FOUND', async () => {
      const order = await createOrder({ customer, product })
      const res = await api().get(`/api/orders/${order._id}/tracking`)
      expect(res.status).to.equal(200)
      expect(res.body.payload.order).to.include({ _id: order._id, status: 'created' })
      expect(res.body.payload.delivery).to.equal(null)

      expectError(await api().get(`/api/orders/${NONEXISTENT_ID}/tracking`), 'ORDER_NOT_FOUND')
    })
  })
})
