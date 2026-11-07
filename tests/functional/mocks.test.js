import { expect } from 'chai'
import { api, clearDatabase, expectError } from './helpers.js'

const OBJECT_ID = /^[0-9a-f]{24}$/

describe('Funcional: /api/mocks', () => {
  beforeEach(clearDatabase)

  describe('GET (datos simulados que NO se guardan)', () => {
    it('GET /api/mocks/users?qty=3 devuelve 3 usuarios válidos y no los guarda', async () => {
      const res = await api().get('/api/mocks/users?qty=3')

      expect(res.status).to.equal(200)
      expect(res.body.payload).to.have.lengthOf(3)
      for (const user of res.body.payload) {
        expect(user).to.include.all.keys('firstName', 'lastName', 'email', 'role')
        expect(['user', 'driver']).to.include(user.role)
        expect(user).to.not.have.property('_id') // no se guardó
      }

      const saved = await api().get('/api/users')
      expect(saved.body.payload).to.have.lengthOf(0)
    })

    it('el alias /api/mocks/mockingusers responde igual (5 por defecto)', async () => {
      const res = await api().get('/api/mocks/mockingusers')
      expect(res.status).to.equal(200)
      expect(res.body.payload).to.have.lengthOf(5)
    })

    it('GET /api/mocks/products: status coherente con el stock', async () => {
      const res = await api().get('/api/mocks/products?qty=10')
      expect(res.status).to.equal(200)
      for (const product of res.body.payload) {
        expect(product.status).to.equal(product.stock > 0 ? 'available' : 'out_of_stock')
      }
    })

    it('GET /api/mocks/orders: items que referencian productos y total calculado', async () => {
      const res = await api().get('/api/mocks/orders?qty=2')
      expect(res.status).to.equal(200)
      for (const order of res.body.payload) {
        expect(order.customer).to.match(OBJECT_ID)
        expect(order.status).to.equal('created')
        const total = order.items.reduce((acc, item) => acc + item.price * item.quantity, 0)
        expect(order.total).to.equal(total)
        for (const item of order.items) expect(item.product).to.match(OBJECT_ID)
      }
    })

    it('GET /api/mocks/deliveries: pending sin repartidor, el resto con repartidor', async () => {
      const res = await api().get('/api/mocks/deliveries?qty=20')
      expect(res.status).to.equal(200)
      for (const delivery of res.body.payload) {
        expect(delivery.order).to.match(OBJECT_ID)
        if (delivery.status === 'pending') expect(delivery.driver).to.equal(null)
        else expect(delivery.driver).to.match(OBJECT_ID)
      }
    })

    for (const qty of ['muchos', '-1', '101', '2.5']) {
      it(`qty inválido (${qty}) → 400 INVALID_MOCK_AMOUNT`, async () => {
        const res = await api().get(`/api/mocks/users?qty=${qty}`)
        expectError(res, 'INVALID_MOCK_AMOUNT')
      })
    }

    // Cada ruta de vista previa y su alias del temario: 200 con qty válido y 400 con qty inválido
    const previewRoutes = [
      '/api/mocks/users', '/api/mocks/mockingusers',
      '/api/mocks/products', '/api/mocks/mockingproducts',
      '/api/mocks/orders', '/api/mocks/mockingorders',
      '/api/mocks/deliveries', '/api/mocks/mockingdeliveries'
    ]
    for (const route of previewRoutes) {
      it(`GET ${route}?qty=2 → 200 con 2 elementos; qty=-1 → 400 INVALID_MOCK_AMOUNT`, async () => {
        const ok = await api().get(`${route}?qty=2`)
        expect(ok.status).to.equal(200)
        expect(ok.body.payload).to.have.lengthOf(2)

        const invalid = await api().get(`${route}?qty=-1`)
        expectError(invalid, 'INVALID_MOCK_AMOUNT')
      })
    }
  })

  describe('POST /api/mocks/seed (inserta en MongoDB)', () => {
    it('con ?qty=4 inserta 4 usuarios y responde como el ejemplo de la consigna', async () => {
      const res = await api().post('/api/mocks/seed?qty=4')

      expect(res.status).to.equal(201)
      expect(res.body.payload).to.deep.equal({ insertados: 4, coleccion: 'users' })

      const saved = await api().get('/api/users')
      expect(saved.body.payload).to.have.lengthOf(4)
    })

    it('con body inserta las 4 colecciones respetando las relaciones', async () => {
      const res = await api()
        .post('/api/mocks/seed')
        .send({ users: 10, products: 4, orders: 6, deliveries: 3 })

      expect(res.status).to.equal(201)
      expect(res.body.payload).to.deep.equal({ insertados: { users: 10, products: 4, orders: 6, deliveries: 3 } })

      // Cada pedido pertenece a un usuario insertado con rol user
      const users = (await api().get('/api/users')).body.payload
      const customerIds = users.filter((u) => u.role === 'user').map((u) => u._id)
      const orders = (await api().get('/api/orders')).body.payload
      expect(orders).to.have.lengthOf(6)
      for (const order of orders) expect(customerIds).to.include(order.customer._id)

      // Cada entrega pertenece a un pedido insertado
      const orderIds = orders.map((o) => o._id)
      const deliveries = (await api().get('/api/deliveries')).body.payload
      expect(deliveries).to.have.lengthOf(3)
      for (const delivery of deliveries) expect(orderIds).to.include(delivery.order._id)
    })

    it('el alias /api/mocks/generateData también inserta', async () => {
      const res = await api().post('/api/mocks/generateData').send({ users: 2 })
      expect(res.status).to.equal(201)
      expect(res.body.payload.insertados.users).to.equal(2)
    })

    it('el alias /api/mocks/generateData valida igual → 400 INVALID_MOCK_AMOUNT', async () => {
      const res = await api().post('/api/mocks/generateData').send({ users: 500 })
      expectError(res, 'INVALID_MOCK_AMOUNT')
    })

    it('cantidad que no es número → 400 INVALID_MOCK_AMOUNT', async () => {
      const res = await api().post('/api/mocks/seed').send({ users: 'muchos' })
      expectError(res, 'INVALID_MOCK_AMOUNT')
    })

    it('cantidad negativa → 400 INVALID_MOCK_AMOUNT', async () => {
      const res = await api().post('/api/mocks/seed').send({ users: -5 })
      expectError(res, 'INVALID_MOCK_AMOUNT')
    })

    it('body vacío (ninguna cantidad mayor a 0) → 400 INVALID_MOCK_AMOUNT', async () => {
      const res = await api().post('/api/mocks/seed').send({})
      expectError(res, 'INVALID_MOCK_AMOUNT')
    })

    it('más entregas que pedidos → 400 INVALID_MOCK_AMOUNT y no inserta nada', async () => {
      const res = await api()
        .post('/api/mocks/seed')
        .send({ users: 3, products: 2, orders: 2, deliveries: 5 })
      expectError(res, 'INVALID_MOCK_AMOUNT')

      const saved = await api().get('/api/users')
      expect(saved.body.payload).to.have.lengthOf(0)
    })
  })
})
