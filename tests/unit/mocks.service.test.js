import { expect } from 'chai'
import MocksService from '../../src/services/mocks.service.js'
import { USER_ROLES, ORDER_STATUS, DELIVERY_STATUS } from '../../src/constants/index.js'
import { catchError } from './helpers.js'

// Tests unitarios del seed: el orden de inserción, las relaciones entre entidades y la
// falla de MongoDB, verificados sobre repositories falsos (sin base de datos).
// El comportamiento HTTP de los mocks está en tests/functional/mocks.test.js.

// Repository falso: insertMany asigna _id y guarda lo insertado en `inserted`.
// `roles` (solo usuarios) fuerza los roles en ciclo para controlar el escenario.
const createFakeRepo = (prefix, { roles } = {}) => {
  const repo = { inserted: [] }
  repo.insertMany = async (docs) => {
    const created = docs.map((doc, i) => ({
      ...doc,
      _id: `${prefix}${repo.inserted.length + i}`,
      ...(roles ? { role: roles[i % roles.length] } : {})
    }))
    repo.inserted.push(...created)
    return created
  }
  return repo
}

const createService = ({ userRoles } = {}) => {
  const repos = {
    usersRepository: createFakeRepo('u', { roles: userRoles }),
    productsRepository: createFakeRepo('p'),
    ordersRepository: createFakeRepo('o'),
    deliveriesRepository: createFakeRepo('d')
  }
  return { service: new MocksService(repos), repos }
}

const BOTH_ROLES = [USER_ROLES.USER, USER_ROLES.DRIVER]

describe('MocksService', () => {
  it('qty: 5 por defecto, acepta texto de query string y rechaza valores inválidos', async () => {
    const { service } = createService()
    expect(service.getMockUsers()).to.have.lengthOf(5)
    expect(service.getMockUsers('3')).to.have.lengthOf(3)

    for (const invalid of ['muchos', '-1', '101', '2.5', '']) {
      const error = await catchError(() => service.getMockUsers(invalid))
      expect(error.code, `qty="${invalid}"`).to.equal('INVALID_MOCK_AMOUNT')
    }
  })

  it('seed: rechaza combinaciones imposibles antes de insertar', async () => {
    const { service, repos } = createService()
    const invalidBodies = [
      undefined, // nada para generar
      { users: 5, orders: 3 }, // pedidos sin productos
      { users: 5, products: 3, orders: 2, deliveries: 3 } // más entregas que pedidos
    ]
    for (const body of invalidBodies) {
      const error = await catchError(() => service.seed(body))
      expect(error.code, JSON.stringify(body)).to.equal('INVALID_MOCK_AMOUNT')
    }
    expect(repos.usersRepository.inserted).to.be.empty
  })

  it('seed: respeta las relaciones (pedido → cliente user, item → producto, entrega → pedido + repartidor driver)', async () => {
    const { service, repos } = createService({ userRoles: BOTH_ROLES })
    const result = await service.seed({ users: 6, products: 4, orders: 10, deliveries: 3 })
    expect(result).to.deep.equal({ insertados: { users: 6, products: 4, orders: 10, deliveries: 3 } })

    const users = repos.usersRepository.inserted
    const customerIds = users.filter((u) => u.role === USER_ROLES.USER).map((u) => u._id)
    const driverIds = users.filter((u) => u.role === USER_ROLES.DRIVER).map((u) => u._id)
    const productIds = repos.productsRepository.inserted.map((p) => p._id)
    const orders = repos.ordersRepository.inserted

    for (const order of orders) {
      expect(customerIds).to.include(order.customer)
      for (const item of order.items) expect(productIds).to.include(item.product)
    }
    // Los primeros 3 pedidos llevan entrega con repartidor; el resto queda created o cancelled
    for (const delivery of repos.deliveriesRepository.inserted) {
      expect(orders.map((o) => o._id)).to.include(delivery.order)
      expect(driverIds).to.include(delivery.driver)
    }
    for (const order of orders.slice(3)) {
      expect([ORDER_STATUS.CREATED, ORDER_STATUS.CANCELLED]).to.include(order.status)
    }
  })

  it('seed sin repartidores: las entregas quedan pending y sin driver', async () => {
    const { service, repos } = createService({ userRoles: [USER_ROLES.USER] })
    await service.seed({ users: 3, products: 2, orders: 3, deliveries: 3 })
    for (const delivery of repos.deliveriesRepository.inserted) {
      expect(delivery).to.include({ status: DELIVERY_STATUS.PENDING, driver: null })
    }
  })

  it('seedUsers (?qty=N) responde con la forma del ejemplo de la consigna', async () => {
    const { service } = createService()
    expect(await service.seedUsers('4')).to.deep.equal({ insertados: 4, coleccion: 'users' })
    const error = await catchError(() => service.seedUsers('0'))
    expect(error.code).to.equal('INVALID_MOCK_AMOUNT')
  })

  it('si MongoDB falla durante la carga → MOCK_GENERATION_ERROR con el motivo', async () => {
    const { service, repos } = createService()
    repos.productsRepository.insertMany = async () => { throw new Error('connection lost') }
    const error = await catchError(() => service.seed({ users: 2, products: 2 }))
    expect(error.code).to.equal('MOCK_GENERATION_ERROR')
    expect(error.details).to.match(/connection lost/)
  })
})
