import { expect } from 'chai'
import OrdersService, { calculateOrderTotal } from '../../src/services/orders.service.js'
import { ORDER_STATUS, PRODUCT_STATUS, USER_ROLES, DELIVERY_PRIORITY } from '../../src/constants/index.js'
import { catchError } from './helpers.js'

// Tests unitarios de las reglas de pedidos que no se ven completas por HTTP:
// qué se guarda exactamente, la escritura condicional y la concurrencia.
// Las validaciones y los errores por HTTP están en tests/functional/orders.test.js.

const USERS = { u1: { _id: 'u1', role: USER_ROLES.USER } }
const PRODUCTS = {
  p1: { _id: 'p1', name: 'Caja chica', price: 1000, status: PRODUCT_STATUS.AVAILABLE }
}

// orderStatus: estado del pedido "o1" guardado; updateStatusResult: simula la escritura condicional
const createService = ({ orderStatus = ORDER_STATUS.CREATED, updateStatusResult } = {}) => {
  const calls = {}
  const ordersRepository = {
    findById: async (id) => (id === 'o1' ? { _id: 'o1', status: orderStatus } : null),
    create: async (data) => { calls.create = data; return { _id: 'o1', ...data } },
    updateStatus: async (id, from, to) => {
      calls.updateStatus = { id, from, to }
      return updateStatusResult !== undefined ? updateStatusResult : { _id: id, status: to }
    }
  }
  const usersRepository = { findById: async (id) => USERS[id] ?? null }
  const productsRepository = { findById: async (id) => PRODUCTS[id] ?? null }
  const service = new OrdersService({ ordersRepository, usersRepository, productsRepository })
  return { service, calls }
}

describe('OrdersService', () => {
  it('create: guarda snapshot del producto, total calculado, estado created y prioridad normal (ignora lo que manda el cliente)', async () => {
    const { service, calls } = createService()
    await service.create({
      customer: 'u1',
      items: [{ product: 'p1', quantity: 2, price: 1 }],
      deliveryAddress: 'Av. Siempre Viva 742',
      total: 1,
      status: ORDER_STATUS.DELIVERED
    })

    expect(calls.create).to.deep.equal({
      customer: 'u1',
      items: [{ product: 'p1', name: 'Caja chica', quantity: 2, price: 1000 }],
      deliveryAddress: 'Av. Siempre Viva 742',
      priority: DELIVERY_PRIORITY.NORMAL,
      total: 2000,
      status: ORDER_STATUS.CREATED
    })
  })

  it('updateStatus: una transición válida escribe condicionada al estado actual', async () => {
    const { service, calls } = createService({ orderStatus: ORDER_STATUS.CREATED })
    const updated = await service.updateStatus('o1', ORDER_STATUS.CANCELLED)
    expect(calls.updateStatus).to.deep.equal({ id: 'o1', from: 'created', to: 'cancelled' })
    expect(updated.status).to.equal(ORDER_STATUS.CANCELLED)
  })

  it('updateStatus: rechaza saltos, estados finales y assigned sin escribir nada', async () => {
    const cases = [
      [ORDER_STATUS.CREATED, ORDER_STATUS.DELIVERED], // salto no permitido
      [ORDER_STATUS.DELIVERED, ORDER_STATUS.CANCELLED], // desde un estado final
      [ORDER_STATUS.CREATED, ORDER_STATUS.ASSIGNED] // assigned solo se alcanza asignando repartidor
    ]
    for (const [from, to] of cases) {
      const { service, calls } = createService({ orderStatus: from })
      const error = await catchError(() => service.updateStatus('o1', to))
      expect(error.code, `${from} → ${to}`).to.equal('INVALID_STATUS_TRANSITION')
      expect(calls.updateStatus, `${from} → ${to}`).to.equal(undefined)
    }
  })

  it('updateStatus: si otra request cambió el estado en el medio → INVALID_STATUS_TRANSITION', async () => {
    const { service } = createService({ orderStatus: ORDER_STATUS.CREATED, updateStatusResult: null })
    const error = await catchError(() => service.updateStatus('o1', ORDER_STATUS.CANCELLED))
    expect(error.code).to.equal('INVALID_STATUS_TRANSITION')
  })

  it('calculateOrderTotal suma precio × cantidad', () => {
    expect(calculateOrderTotal([{ price: 100, quantity: 2 }, { price: 50, quantity: 3 }])).to.equal(350)
  })
})
