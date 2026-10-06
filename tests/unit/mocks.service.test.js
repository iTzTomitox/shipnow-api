import { expect } from 'chai'
import MocksService from '../../src/services/mocks.service.js'
import { USER_ROLES, ORDER_STATUS, DELIVERY_STATUS } from '../../src/constants/index.js'

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

const catchError = async (fn) => {
  try {
    await fn()
  } catch (error) {
    return error
  }
  throw new Error('Se esperaba que lanzara un error')
}

describe('MocksService', () => {
  describe('GET (sin guardar)', () => {
    it('getMockUsers devuelve 5 usuarios por defecto', () => {
      const { service } = createService()
      expect(service.getMockUsers()).to.have.lengthOf(5)
    })

    it('acepta qty como texto de query string ("3")', () => {
      const { service } = createService()
      expect(service.getMockUsers('3')).to.have.lengthOf(3)
    })

    for (const invalid of ['muchos', '-1', '101', '2.5', '']) {
      it(`rechaza qty inválido "${invalid}" con 400`, async () => {
        const { service } = createService()
        const error = await catchError(() => service.getMockUsers(invalid))
        expect(error.status).to.equal(400)
      })
    }

    it('getMockOrders genera items que referencian ids con formato ObjectId', () => {
      const { service } = createService()
      for (const order of service.getMockOrders(3)) {
        expect(order.customer).to.match(/^[0-9a-f]{24}$/)
        for (const item of order.items) expect(item.product).to.match(/^[0-9a-f]{24}$/)
      }
    })
  })

  describe('seedUsers (?qty=N)', () => {
    it('inserta N usuarios y responde como el ejemplo de la consigna', async () => {
      const { service, repos } = createService()
      const result = await service.seedUsers('4')
      expect(result).to.deep.equal({ insertados: 4, coleccion: 'users' })
      expect(repos.usersRepository.inserted).to.have.lengthOf(4)
    })

    it('rechaza qty 0 con 400', async () => {
      const { service } = createService()
      const error = await catchError(() => service.seedUsers('0'))
      expect(error.status).to.equal(400)
    })
  })

    describe('seed (body por colección)', () => {
    it('rechaza un body sin cantidades con 400', async () => {
      const { service } = createService()
      const error = await catchError(() => service.seed(undefined))
      expect(error.status).to.equal(400)
    })

    it('rechaza orders sin users o products con 400', async () => {
      const { service } = createService()
      const error = await catchError(() => service.seed({ users: 5, orders: 3 }))
      expect(error.status).to.equal(400)
    })

    it('rechaza más deliveries que orders con 400', async () => {
      const { service } = createService()
      const body = { users: 5, products: 3, orders: 2, deliveries: 3 }
      const error = await catchError(() => service.seed(body))
      expect(error.status).to.equal(400)
    })

    it('inserta las cantidades pedidas y devuelve el resumen', async () => {
      const { service } = createService({ userRoles: [USER_ROLES.USER, USER_ROLES.DRIVER] })
      const result = await service.seed({ users: 6, products: 4, orders: 5, deliveries: 3 })
      expect(result).to.deep.equal({ insertados: { users: 6, products: 4, orders: 5, deliveries: 3 } })
    })

    it('respeta las relaciones: pedido → cliente USER, item → producto insertado', async () => {
      const { service, repos } = createService({ userRoles: [USER_ROLES.USER, USER_ROLES.DRIVER] })
      await service.seed({ users: 6, products: 4, orders: 5 })
      const customerIds = repos.usersRepository.inserted
        .filter((u) => u.role === USER_ROLES.USER).map((u) => u._id)
      const productIds = repos.productsRepository.inserted.map((p) => p._id)
      for (const order of repos.ordersRepository.inserted) {
        expect(customerIds).to.include(order.customer)
        for (const item of order.items) expect(productIds).to.include(item.product)
      }
    })

    it('entregas coherentes: pedido insertado + repartidor con rol DRIVER', async () => {
      const { service, repos } = createService({ userRoles: [USER_ROLES.USER, USER_ROLES.DRIVER] })
      await service.seed({ users: 6, products: 4, orders: 5, deliveries: 5 })
      const orderIds = repos.ordersRepository.inserted.map((o) => o._id)
      const driverIds = repos.usersRepository.inserted
        .filter((u) => u.role === USER_ROLES.DRIVER).map((u) => u._id)
      for (const delivery of repos.deliveriesRepository.inserted) {
        expect(orderIds).to.include(delivery.order)
        expect(driverIds).to.include(delivery.driver)
      }
    })

    it('pedidos sin entrega quedan solo CREATED o CANCELLED', async () => {
      const { service, repos } = createService({ userRoles: [USER_ROLES.USER, USER_ROLES.DRIVER] })
      await service.seed({ users: 6, products: 4, orders: 10, deliveries: 2 })
      for (const order of repos.ordersRepository.inserted.slice(2)) {
        expect([ORDER_STATUS.CREATED, ORDER_STATUS.CANCELLED]).to.include(order.status)
      }
    })

    it('sin repartidores, las entregas quedan PENDING y sin driver', async () => {
      const { service, repos } = createService({ userRoles: [USER_ROLES.USER] })
      await service.seed({ users: 3, products: 2, orders: 3, deliveries: 3 })
      for (const delivery of repos.deliveriesRepository.inserted) {
        expect(delivery.status).to.equal(DELIVERY_STATUS.PENDING)
        expect(delivery.driver).to.equal(null)
      }
    })
  })
})