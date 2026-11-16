import { expect } from 'chai'
import { api, clearDatabase, expectError } from './helpers.js'

const OBJECT_ID = /^[0-9a-f]{24}$/

// Rutas de vista previa y sus alias del temario (responden igual)
const PREVIEW_ROUTES = [
  '/api/mocks/users', '/api/mocks/mockingusers',
  '/api/mocks/products', '/api/mocks/mockingproducts',
  '/api/mocks/orders', '/api/mocks/mockingorders',
  '/api/mocks/deliveries', '/api/mocks/mockingdeliveries'
]

describe('Funcional: /api/mocks', () => {
  beforeEach(clearDatabase)

  it('GET de vista previa: genera la cantidad pedida (5 por defecto) y NO guarda nada', async () => {
    for (const route of PREVIEW_ROUTES) {
      const res = await api().get(`${route}?qty=2`)
      expect(res.status, route).to.equal(200)
      expect(res.body.payload, route).to.have.lengthOf(2)
    }
    expect((await api().get('/api/mocks/mockingusers')).body.payload).to.have.lengthOf(5)

    const saved = await api().get('/api/users')
    expect(saved.body.payload).to.have.lengthOf(0)
  })

  it('GET de vista previa: los datos respetan la forma y las reglas de los modelos', async () => {
    const users = (await api().get('/api/mocks/users?qty=10')).body.payload
    for (const user of users) {
      expect(user).to.include.all.keys('firstName', 'lastName', 'email', 'role')
      expect(['user', 'driver']).to.include(user.role)
    }

    for (const product of (await api().get('/api/mocks/products?qty=10')).body.payload) {
      expect(product.status).to.equal(product.stock > 0 ? 'available' : 'out_of_stock')
    }

    for (const order of (await api().get('/api/mocks/orders?qty=5')).body.payload) {
      expect(order.customer).to.match(OBJECT_ID)
      expect(order.total).to.equal(order.items.reduce((acc, item) => acc + item.price * item.quantity, 0))
    }

    for (const delivery of (await api().get('/api/mocks/deliveries?qty=20')).body.payload) {
      if (delivery.status === 'pending') expect(delivery.driver).to.equal(null)
      else expect(delivery.driver).to.match(OBJECT_ID)
    }
  })

  it('qty inválido (texto, negativo, decimal, mayor a 100) → 400 INVALID_MOCK_AMOUNT en todas las rutas', async () => {
    for (const route of PREVIEW_ROUTES) {
      for (const qty of ['muchos', '-1', '2.5', '101']) {
        expectError(await api().get(`${route}?qty=${qty}`), 'INVALID_MOCK_AMOUNT')
      }
    }
  })

  it('POST /api/mocks/seed?qty=4 inserta 4 usuarios y responde como el ejemplo de la consigna', async () => {
    const res = await api().post('/api/mocks/seed?qty=4')
    expect(res.status).to.equal(201)
    expect(res.body.payload).to.deep.equal({ insertados: 4, coleccion: 'users' })
    expect((await api().get('/api/users')).body.payload).to.have.lengthOf(4)
  })

  it('POST /api/mocks/seed con body inserta las 4 colecciones respetando las relaciones', async () => {
    const res = await api().post('/api/mocks/seed').send({ users: 10, products: 4, orders: 6, deliveries: 3 })
    expect(res.status).to.equal(201)
    expect(res.body.payload).to.deep.equal({ insertados: { users: 10, products: 4, orders: 6, deliveries: 3 } })

    // Cada pedido pertenece a un usuario insertado con rol user
    const users = (await api().get('/api/users')).body.payload
    const customerIds = users.filter((u) => u.role === 'user').map((u) => u._id)
    const orders = (await api().get('/api/orders')).body.payload
    expect(orders).to.have.lengthOf(6)
    for (const order of orders) expect(customerIds).to.include(order.customer._id)

    // Cada entrega pertenece a un pedido insertado
    const deliveries = (await api().get('/api/deliveries')).body.payload
    expect(deliveries).to.have.lengthOf(3)
    for (const delivery of deliveries) expect(orders.map((o) => o._id)).to.include(delivery.order._id)
  })

  it('el alias /api/mocks/generateData inserta y valida igual que /seed', async () => {
    const ok = await api().post('/api/mocks/generateData').send({ users: 2 })
    expect(ok.status).to.equal(201)
    expect(ok.body.payload.insertados.users).to.equal(2)

    expectError(await api().post('/api/mocks/generateData').send({ users: 500 }), 'INVALID_MOCK_AMOUNT')
  })

  it('cantidades inválidas en el seed → 400 INVALID_MOCK_AMOUNT y no inserta nada', async () => {
    const invalidBodies = [
      { users: 'muchos' },
      { users: -5 },
      {}, // ninguna cantidad mayor a 0
      { users: 3, products: 2, orders: 2, deliveries: 5 } // más entregas que pedidos
    ]
    for (const body of invalidBodies) {
      expectError(await api().post('/api/mocks/seed').send(body), 'INVALID_MOCK_AMOUNT')
    }
    expect((await api().get('/api/users')).body.payload).to.have.lengthOf(0)
  })
})
