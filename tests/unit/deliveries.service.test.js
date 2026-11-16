import { expect } from 'chai'
import DeliveriesService from '../../src/services/deliveries.service.js'
import { DELIVERY_STATUS, ORDER_STATUS, USER_ROLES } from '../../src/constants/index.js'
import { catchError } from './helpers.js'

// Tests unitarios de la asignación de repartidor: el orden de las dos escrituras
// y la compensación, que no se pueden provocar de forma controlada por HTTP.
// Las validaciones y los errores por HTTP están en tests/functional/deliveries.test.js.

const DELIVERY = { _id: 'dlv1', status: DELIVERY_STATUS.PENDING, order: { _id: 'o1', status: ORDER_STATUS.CREATED } }
const DRIVER = { _id: 'd1', role: USER_ROLES.DRIVER }

// orderUpdate: resultado del paso 1, pedido created → assigned ('ok' | 'null')
// deliveryUpdate: resultado del paso 2, entrega pending → assigned ('ok' | 'null' | 'throw')
const createService = ({ orderUpdate = 'ok', deliveryUpdate = 'ok' } = {}) => {
  const calls = { orderUpdates: [] }
  const deliveriesRepository = {
    findById: async (id) => (id === 'dlv1' ? DELIVERY : null),
    updateIf: async (id, expected, changes) => {
      calls.updateIf = { id, expected, changes }
      if (deliveryUpdate === 'throw') throw new Error('connection lost')
      return deliveryUpdate === 'null' ? null : { _id: id, ...changes }
    }
  }
  const ordersRepository = {
    updateStatus: async (id, from, to) => {
      calls.orderUpdates.push({ id, from, to })
      // Solo el paso 1 puede fallar; la compensación siempre funciona
      if (orderUpdate === 'null' && calls.orderUpdates.length === 1) return null
      return { _id: id, status: to }
    }
  }
  const usersRepository = { findById: async (id) => (id === 'd1' ? DRIVER : null) }
  const service = new DeliveriesService({ deliveriesRepository, ordersRepository, usersRepository })
  return { service, calls }
}

const ROLLBACK = { id: 'o1', from: 'assigned', to: 'created' }

describe('DeliveriesService.assignDriver: escrituras y compensación', () => {
  it('caso feliz: primero el pedido (created → assigned), después la entrega (pending → assigned)', async () => {
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

  it('si el pedido ya no está created → ORDER_NOT_DELIVERABLE sin tocar la entrega', async () => {
    const { service, calls } = createService({ orderUpdate: 'null' })
    const error = await catchError(() => service.assignDriver('dlv1', 'd1'))
    expect(error.code).to.equal('ORDER_NOT_DELIVERABLE')
    expect(calls.updateIf).to.equal(undefined)
  })

  it('si otra request asignó la entrega en el medio → DELIVERY_ALREADY_ASSIGNED y compensa el pedido', async () => {
    const { service, calls } = createService({ deliveryUpdate: 'null' })
    const error = await catchError(() => service.assignDriver('dlv1', 'd1'))
    expect(error.code).to.equal('DELIVERY_ALREADY_ASSIGNED')
    expect(calls.orderUpdates[1]).to.deep.equal(ROLLBACK)
  })

  it('si la base falla al actualizar la entrega → compensa el pedido y propaga el error', async () => {
    const { service, calls } = createService({ deliveryUpdate: 'throw' })
    const error = await catchError(() => service.assignDriver('dlv1', 'd1'))
    expect(error.message).to.equal('connection lost')
    expect(calls.orderUpdates[1]).to.deep.equal(ROLLBACK)
  })
})
