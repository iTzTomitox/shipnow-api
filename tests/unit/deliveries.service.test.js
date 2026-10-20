import { expect } from 'chai'
import DeliveriesService from '../../src/services/deliveries.service.js'
import { DELIVERY_STATUS, ORDER_STATUS, USER_ROLES } from '../../src/constants/index.js'

const ORDERS = {
  o1: { _id: 'o1', status: ORDER_STATUS.CREATED },
  o2: { _id: 'o2', status: ORDER_STATUS.CANCELLED }
}
const USERS = {
  d1: { _id: 'd1', role: USER_ROLES.DRIVER },
  u1: { _id: 'u1', role: USER_ROLES.USER }
}
const DELIVERIES = {
  dlv1: { _id: 'dlv1', status: DELIVERY_STATUS.PENDING, order: { _id: 'o1', status: ORDER_STATUS.CREATED } },
  dlv2: { _id: 'dlv2', status: DELIVERY_STATUS.ASSIGNED, order: { _id: 'o1', status: ORDER_STATUS.ASSIGNED } }
}

// existingDelivery: lo que devuelve findByOrder (para "ya tiene entrega")
// orderUpdate: resultado de ordersRepository.updateStatus en el paso 1 ('ok' | 'null')
// deliveryUpdate: resultado de updateIf en el paso 2 ('ok' | 'null' | 'throw')
const createService = ({ existingDelivery = null, orderUpdate = 'ok', deliveryUpdate = 'ok' } = {}) => {
  const calls = { orderUpdates: [] }

  const deliveriesRepository = {
    findAll: async (args) => { calls.findAll = args; return [] },
    findById: async (id) => DELIVERIES[id] ?? null,
    findByOrder: async () => existingDelivery,
    create: async (data) => { calls.create = data; return { _id: 'new', ...data } },
    updateIf: async (id, expected, changes) => {
      calls.updateIf = { id, expected, changes }
      if (deliveryUpdate === 'throw') throw new Error('connection lost')
      return deliveryUpdate === 'null' ? null : { _id: id, ...changes }
    }
  }
  const ordersRepository = {
    findById: async (id) => ORDERS[id] ?? null,
    updateStatus: async (id, from, to) => {
      calls.orderUpdates.push({ id, from, to })
      // Solo el primer cambio (paso 1) puede fallar; la compensación siempre funciona
      if (orderUpdate === 'null' && calls.orderUpdates.length === 1) return null
      return { _id: id, status: to }
    }
  }
  const usersRepository = { findById: async (id) => USERS[id] ?? null }

  const service = new DeliveriesService({ deliveriesRepository, ordersRepository, usersRepository })
  return { service, calls }
}

const catchError = async (fn) => {
  try {
    await fn()
  } catch (error) {
    return error
  }
  throw new Error('Se esperaba que lanzara un error')
}
describe('DeliveriesService', () => {
  describe('getAll / getById', () => {
    it('getAll con status inválido → INVALID_DELIVERY_STATUS', async () => {
      const { service } = createService()
      const error = await catchError(() => service.getAll({ status: 'lost' }))
      expect(error.code).to.equal('INVALID_DELIVERY_STATUS')
    })

    it('getById inexistente → DELIVERY_NOT_FOUND', async () => {
      const { service } = createService()
      const error = await catchError(() => service.getById('nope'))
      expect(error.code).to.equal('DELIVERY_NOT_FOUND')
    })
  })

  describe('create', () => {
    it('sin order → VALIDATION_ERROR', async () => {
      const { service } = createService()
      const error = await catchError(() => service.create({}))
      expect(error.code).to.equal('VALIDATION_ERROR')
    })

    it('pedido inexistente → ORDER_NOT_FOUND', async () => {
      const { service } = createService()
      const error = await catchError(() => service.create({ order: 'nope' }))
      expect(error.code).to.equal('ORDER_NOT_FOUND')
    })

    it('pedido cancelado → ORDER_NOT_DELIVERABLE', async () => {
      const { service } = createService()
      const error = await catchError(() => service.create({ order: 'o2' }))
      expect(error.code).to.equal('ORDER_NOT_DELIVERABLE')
    })

    it('pedido que ya tiene entrega → DELIVERY_ALREADY_EXISTS', async () => {
      const { service } = createService({ existingDelivery: { _id: 'dlv1' } })
      const error = await catchError(() => service.create({ order: 'o1' }))
      expect(error.code).to.equal('DELIVERY_ALREADY_EXISTS')
    })

    it('pedido created sin entrega → crea la entrega PENDING sin repartidor', async () => {
      const { service, calls } = createService()
      await service.create({ order: 'o1' })
      expect(calls.create).to.deep.equal({ order: 'o1', driver: null, status: DELIVERY_STATUS.PENDING })
    })
  })
    describe('assignDriver: validaciones', () => {
    it('sin driver → VALIDATION_ERROR', async () => {
      const { service } = createService()
      const error = await catchError(() => service.assignDriver('dlv1'))
      expect(error.code).to.equal('VALIDATION_ERROR')
    })

    it('entrega que no está PENDING → DELIVERY_ALREADY_ASSIGNED', async () => {
      const { service } = createService()
      const error = await catchError(() => service.assignDriver('dlv2', 'd1'))
      expect(error.code).to.equal('DELIVERY_ALREADY_ASSIGNED')
    })

    it('repartidor inexistente → USER_NOT_FOUND', async () => {
      const { service } = createService()
      const error = await catchError(() => service.assignDriver('dlv1', 'nope'))
      expect(error.code).to.equal('USER_NOT_FOUND')
    })

    it('usuario sin rol driver → VALIDATION_ERROR', async () => {
      const { service } = createService()
      const error = await catchError(() => service.assignDriver('dlv1', 'u1'))
      expect(error.code).to.equal('VALIDATION_ERROR')
    })
  })

  describe('assignDriver: escrituras y compensación', () => {
    it('caso feliz: pedido created → assigned y entrega pending → assigned con el repartidor', async () => {
      const { service, calls } = createService()
      const updated = await service.assignDriver('dlv1', 'd1')
      expect(calls.orderUpdates).to.deep.equal([{ id: 'o1', from: 'created', to: 'assigned' }])
      expect(calls.updateIf).to.deep.equal({
        id: 'dlv1',
        expected: DELIVERY_STATUS.PENDING,
        changes: { driver: 'd1', status: DELIVERY_STATUS.ASSIGNED }
      })
      expect(updated.status).to.equal(DELIVERY_STATUS.ASSIGNED)
    })

    it('si el pedido ya no está created → ORDER_NOT_DELIVERABLE y no toca la entrega', async () => {
      const { service, calls } = createService({ orderUpdate: 'null' })
      const error = await catchError(() => service.assignDriver('dlv1', 'd1'))
      expect(error.code).to.equal('ORDER_NOT_DELIVERABLE')
      expect(calls.updateIf).to.equal(undefined)
    })

    it('si otra request asignó la entrega en el medio → compensa el pedido', async () => {
      const { service, calls } = createService({ deliveryUpdate: 'null' })
      const error = await catchError(() => service.assignDriver('dlv1', 'd1'))
      expect(error.code).to.equal('DELIVERY_ALREADY_ASSIGNED')
      expect(calls.orderUpdates[1]).to.deep.equal({ id: 'o1', from: 'assigned', to: 'created' })
    })

    it('si la base falla al actualizar la entrega → compensa el pedido y propaga el error', async () => {
      const { service, calls } = createService({ deliveryUpdate: 'throw' })
      const error = await catchError(() => service.assignDriver('dlv1', 'd1'))
      expect(error.message).to.equal('connection lost')
      expect(calls.orderUpdates[1]).to.deep.equal({ id: 'o1', from: 'assigned', to: 'created' })
    })
  })
})