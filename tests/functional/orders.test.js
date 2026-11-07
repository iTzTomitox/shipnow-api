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

  describe('POST /api/orders', () => {
    it('crea el pedido: snapshot del producto, total calculado, estado created y prioridad normal', async () => {
      const res = await api()
        .post('/api/orders')
        .send({
          customer: customer._id,
          items: [{ product: product._id, quantity: 3, price: 1 }], // el precio enviado se ignora
          deliveryAddress: 'Av. Siempre Viva 742',
          status: 'delivered' // el estado enviado se ignora
        })

      expect(res.status).to.equal(201)
      const order = res.body.payload
      expect(order).to.include({ customer: customer._id, total: 300, status: 'created', priority: 'normal' })
      expect(order.items).to.deep.equal([{ product: product._id, name: 'Caja test', quantity: 3, price: 100 }])
      expect(order._id).to.match(/^[0-9a-f]{24}$/)
    })

    it('respeta la prioridad enviada', async () => {
      const order = await createOrder({ customer, product, priority: 'high' })
      expect(order.priority).to.equal('high')
    })

    it('datos incompletos (sin deliveryAddress) → 400 VALIDATION_ERROR', async () => {
      const res = await api()
        .post('/api/orders')
        .send({ customer: customer._id, items: [{ product: product._id, quantity: 1 }] })
      expectError(res, 'VALIDATION_ERROR')
      expect(res.body.details).to.match(/deliveryAddress/)
    })

    it('sin items → 400 ORDER_ITEMS_REQUIRED', async () => {
      const res = await api()
        .post('/api/orders')
        .send({ customer: customer._id, items: [], deliveryAddress: 'Calle 1' })
      expectError(res, 'ORDER_ITEMS_REQUIRED')
    })

    it('prioridad inexistente → 400 VALIDATION_ERROR', async () => {
      const res = await api()
        .post('/api/orders')
        .send({ customer: customer._id, items: [{ product: product._id, quantity: 1 }], deliveryAddress: 'Calle 1', priority: 'urgent' })
      expectError(res, 'VALIDATION_ERROR')
    })

    it('un repartidor no puede ser cliente → 400 VALIDATION_ERROR', async () => {
      const driver = await createDriver()
      const res = await api()
        .post('/api/orders')
        .send({ customer: driver._id, items: [{ product: product._id, quantity: 1 }], deliveryAddress: 'Calle 1' })
      expectError(res, 'VALIDATION_ERROR')
    })

    it('cliente inexistente → 404 USER_NOT_FOUND', async () => {
      const res = await api()
        .post('/api/orders')
        .send({ customer: NONEXISTENT_ID, items: [{ product: product._id, quantity: 1 }], deliveryAddress: 'Calle 1' })
      expectError(res, 'USER_NOT_FOUND')
    })

    it('producto inexistente → 404 PRODUCT_NOT_FOUND', async () => {
      const res = await api()
        .post('/api/orders')
        .send({ customer: customer._id, items: [{ product: NONEXISTENT_ID, quantity: 1 }], deliveryAddress: 'Calle 1' })
      expectError(res, 'PRODUCT_NOT_FOUND')
    })

    it('producto sin stock → 409 PRODUCT_NOT_AVAILABLE', async () => {
      const noStock = await createProduct({ name: 'Agotado', stock: 0 })
      const res = await api()
        .post('/api/orders')
        .send({ customer: customer._id, items: [{ product: noStock._id, quantity: 1 }], deliveryAddress: 'Calle 1' })
      expectError(res, 'PRODUCT_NOT_AVAILABLE')
      expect(res.body.details).to.equal('Agotado')
    })
  })

  describe('GET /api/orders', () => {
    it('lista los pedidos con los datos del cliente', async () => {
      await createOrder({ customer, product })
      const res = await api().get('/api/orders')

      expect(res.status).to.equal(200)
      expect(res.body.payload).to.have.lengthOf(1)
      expect(res.body.payload[0].customer).to.include({ _id: customer._id, email: customer.email })
      expect(res.body.payload[0].customer).to.include.all.keys('firstName', 'lastName')
    })

    it('filtra por estado (?status=cancelled)', async () => {
      const toCancel = await createOrder({ customer, product })
      await createOrder({ customer, product })
      await api().patch(`/api/orders/${toCancel._id}/status`).send({ status: 'cancelled' })

      const res = await api().get('/api/orders?status=cancelled')
      expect(res.status).to.equal(200)
      expect(res.body.payload).to.have.lengthOf(1)
      expect(res.body.payload[0]._id).to.equal(toCancel._id)
    })

    it('estado inválido en el filtro → 400 INVALID_ORDER_STATUS', async () => {
      const res = await api().get('/api/orders?status=on_the_way')
      expectError(res, 'INVALID_ORDER_STATUS')
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

    it('pedido inexistente → 404 ORDER_NOT_FOUND', async () => {
      const res = await api().get(`/api/orders/${NONEXISTENT_ID}`)
      expectError(res, 'ORDER_NOT_FOUND')
    })

    it('id con formato inválido → 404 ORDER_NOT_FOUND', async () => {
      const res = await api().get('/api/orders/123')
      expectError(res, 'ORDER_NOT_FOUND')
    })
  })

  describe('PATCH /api/orders/:oid/status', () => {
    it('transición válida (created → cancelled)', async () => {
      const order = await createOrder({ customer, product })
      const res = await api().patch(`/api/orders/${order._id}/status`).send({ status: 'cancelled' })
      expect(res.status).to.equal(200)
      expect(res.body.payload).to.include({ _id: order._id, status: 'cancelled' })
    })

    it('estado que no existe → 400 INVALID_ORDER_STATUS', async () => {
      const order = await createOrder({ customer, product })
      const res = await api().patch(`/api/orders/${order._id}/status`).send({ status: 'on_the_way' })
      expectError(res, 'INVALID_ORDER_STATUS')
    })

    it('sin body → 400 INVALID_ORDER_STATUS', async () => {
      const order = await createOrder({ customer, product })
      const res = await api().patch(`/api/orders/${order._id}/status`)
      expectError(res, 'INVALID_ORDER_STATUS')
    })

    it('salto no permitido (created → delivered) → 409 INVALID_STATUS_TRANSITION', async () => {
      const order = await createOrder({ customer, product })
      const res = await api().patch(`/api/orders/${order._id}/status`).send({ status: 'delivered' })
      expectError(res, 'INVALID_STATUS_TRANSITION')
    })

    it('assigned por este endpoint → 409 INVALID_STATUS_TRANSITION', async () => {
      const order = await createOrder({ customer, product })
      const res = await api().patch(`/api/orders/${order._id}/status`).send({ status: 'assigned' })
      expectError(res, 'INVALID_STATUS_TRANSITION')
      expect(res.body.details).to.match(/assign/)
    })

    it('desde un estado final (cancelled → created) → 409 INVALID_STATUS_TRANSITION', async () => {
      const order = await createOrder({ customer, product })
      await api().patch(`/api/orders/${order._id}/status`).send({ status: 'cancelled' })
      const res = await api().patch(`/api/orders/${order._id}/status`).send({ status: 'created' })
      expectError(res, 'INVALID_STATUS_TRANSITION')
    })

    it('pedido inexistente → 404 ORDER_NOT_FOUND', async () => {
      const res = await api().patch(`/api/orders/${NONEXISTENT_ID}/status`).send({ status: 'cancelled' })
      expectError(res, 'ORDER_NOT_FOUND')
    })
  })

  describe('GET /api/orders/:oid/tracking', () => {
    it('pedido sin entrega → delivery null', async () => {
      const order = await createOrder({ customer, product })
      const res = await api().get(`/api/orders/${order._id}/tracking`)
      expect(res.status).to.equal(200)
      expect(res.body.payload.order).to.include({ _id: order._id, status: 'created' })
      expect(res.body.payload.delivery).to.equal(null)
    })

    it('pedido inexistente → 404 ORDER_NOT_FOUND', async () => {
      const res = await api().get(`/api/orders/${NONEXISTENT_ID}/tracking`)
      expectError(res, 'ORDER_NOT_FOUND')
    })
  })
})
