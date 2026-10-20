import { expect } from 'chai'
import OrdersService, { calculateOrderTotal } from '../../src/services/orders.service.js'
import { ORDER_STATUS, PRODUCT_STATUS, USER_ROLES, DELIVERY_PRIORITY } from '../../src/constants/index.js'

// Datos fijos que los repositories falsos "tienen guardados"
const USERS = {
  u1: { _id: 'u1', role: USER_ROLES.USER },
  d1: { _id: 'd1', role: USER_ROLES.DRIVER }
}
const PRODUCTS = {
  p1: { _id: 'p1', name: 'Caja chica', price: 1000, status: PRODUCT_STATUS.AVAILABLE },
  p2: { _id: 'p2', name: 'Caja grande', price: 3000, status: PRODUCT_STATUS.OUT_OF_STOCK }
}

// orderStatus: estado del pedido "o1" guardado (para probar transiciones)
const createService = ({ orderStatus = ORDER_STATUS.CREATED, updateStatusResult, delivery = null } = {}) => {
  const calls = {}
  const ordersRepository = {
    findAll: async (args) => { calls.findAll = args; return [] },
    findById: async (id) => (id === 'o1' ? { _id: 'o1', status: orderStatus } : null),
    create: async (data) => { calls.create = data; return { _id: 'o1', ...data } },
    updateStatus: async (id, from, to) => {
      calls.updateStatus = { id, from, to }
      return updateStatusResult !== undefined ? updateStatusResult : { _id: id, status: to }
    }
  }
  const usersRepository = { findById: async (id) => USERS[id] ?? null }
  const productsRepository = { findById: async (id) => PRODUCTS[id] ?? null }
  const deliveriesRepository = { findByOrder: async () => delivery }
  const service = new OrdersService({ ordersRepository, usersRepository, productsRepository, deliveriesRepository })
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

const validOrder = {
  customer: 'u1',
  items: [{ product: 'p1', quantity: 2 }],
  deliveryAddress: 'Av. Siempre Viva 742'
}

describe('OrdersService', () => {
  describe('create: validación de forma', () => {
    const cases = [
      ['sin customer', { ...validOrder, customer: undefined }, 'VALIDATION_ERROR'],
      ['sin items', { ...validOrder, items: [] }, 'ORDER_ITEMS_REQUIRED'],
      ['item con quantity 0', { ...validOrder, items: [{ product: 'p1', quantity: 0 }] }, 'ORDER_ITEMS_REQUIRED'],
      ['item sin product', { ...validOrder, items: [{ quantity: 1 }] }, 'ORDER_ITEMS_REQUIRED'],
      ['sin deliveryAddress', { ...validOrder, deliveryAddress: '  ' }, 'VALIDATION_ERROR'],
      ['priority inválida', { ...validOrder, priority: 'urgent' }, 'VALIDATION_ERROR']
    ]
    for (const [title, body, code] of cases) {
      it(`${title} → ${code}`, async () => {
        const { service } = createService()
        const error = await catchError(() => service.create(body))
        expect(error.code).to.equal(code)
      })
    }
  })

  describe('create: existencia de cliente y productos', () => {
    it('cliente inexistente → USER_NOT_FOUND', async () => {
      const { service } = createService()
      const error = await catchError(() => service.create({ ...validOrder, customer: 'nope' }))
      expect(error.code).to.equal('USER_NOT_FOUND')
    })

    it('cliente con rol driver → VALIDATION_ERROR', async () => {
      const { service } = createService()
      const error = await catchError(() => service.create({ ...validOrder, customer: 'd1' }))
      expect(error.code).to.equal('VALIDATION_ERROR')
    })

    it('producto inexistente → PRODUCT_NOT_FOUND', async () => {
      const { service } = createService()
      const body = { ...validOrder, items: [{ product: 'nope', quantity: 1 }] }
      const error = await catchError(() => service.create(body))
      expect(error.code).to.equal('PRODUCT_NOT_FOUND')
    })

    it('producto sin stock → PRODUCT_NOT_AVAILABLE', async () => {
      const { service } = createService()
      const body = { ...validOrder, items: [{ product: 'p2', quantity: 1 }] }
      const error = await catchError(() => service.create(body))
      expect(error.code).to.equal('PRODUCT_NOT_AVAILABLE')
    })
  })

  describe('create: pedido válido', () => {
    it('copia nombre y precio, calcula total y fija estado CREATED y prioridad NORMAL', async () => {
      const { service, calls } = createService()
      await service.create(validOrder)
      expect(calls.create).to.deep.equal({
        customer: 'u1',
        items: [{ product: 'p1', name: 'Caja chica', quantity: 2, price: 1000 }],
        deliveryAddress: 'Av. Siempre Viva 742',
        priority: DELIVERY_PRIORITY.NORMAL,
        total: 2000,
        status: ORDER_STATUS.CREATED
      })
    })

    it('ignora precio, total y estado enviados por el cliente', async () => {
      const { service, calls } = createService()
      const body = {
        ...validOrder,
        items: [{ product: 'p1', quantity: 1, price: 1 }],
        total: 1,
        status: ORDER_STATUS.DELIVERED
      }
      await service.create(body)
      expect(calls.create.items[0].price).to.equal(1000)
      expect(calls.create.total).to.equal(1000)
      expect(calls.create.status).to.equal(ORDER_STATUS.CREATED)
    })
  })

    describe('getAll / getById', () => {
    it('getAll con status inválido → INVALID_ORDER_STATUS', async () => {
      const { service } = createService()
      const error = await catchError(() => service.getAll({ status: 'on_the_way' }))
      expect(error.code).to.equal('INVALID_ORDER_STATUS')
    })

    it('getById inexistente → ORDER_NOT_FOUND', async () => {
      const { service } = createService()
      const error = await catchError(() => service.getById('nope'))
      expect(error.code).to.equal('ORDER_NOT_FOUND')
    })
  })

  describe('updateStatus', () => {
    it('estado que no existe ("on_the_way") → INVALID_ORDER_STATUS', async () => {
      const { service } = createService()
      const error = await catchError(() => service.updateStatus('o1', 'on_the_way'))
      expect(error.code).to.equal('INVALID_ORDER_STATUS')
    })

    it('pedido inexistente → ORDER_NOT_FOUND', async () => {
      const { service } = createService()
      const error = await catchError(() => service.updateStatus('nope', ORDER_STATUS.ASSIGNED))
      expect(error.code).to.equal('ORDER_NOT_FOUND')
    })

    it('salto no permitido (created → delivered) → INVALID_STATUS_TRANSITION', async () => {
      const { service } = createService({ orderStatus: ORDER_STATUS.CREATED })
      const error = await catchError(() => service.updateStatus('o1', ORDER_STATUS.DELIVERED))
      expect(error.code).to.equal('INVALID_STATUS_TRANSITION')
    })

    it('desde un estado final (delivered → cancelled) → INVALID_STATUS_TRANSITION', async () => {
      const { service } = createService({ orderStatus: ORDER_STATUS.DELIVERED })
      const error = await catchError(() => service.updateStatus('o1', ORDER_STATUS.CANCELLED))
      expect(error.code).to.equal('INVALID_STATUS_TRANSITION')
      expect(error.details).to.match(/estado final/)
    })

    
    it('pasar a assigned por este endpoint → INVALID_STATUS_TRANSITION (se asigna con el repartidor)', async () => {
      const { service, calls } = createService({ orderStatus: ORDER_STATUS.CREATED })
      const error = await catchError(() => service.updateStatus('o1', ORDER_STATUS.ASSIGNED))
      expect(error.code).to.equal('INVALID_STATUS_TRANSITION')
      expect(calls.updateStatus).to.equal(undefined)
    })

    it('transición válida: escribe condicionado al estado actual', async () => {
      const { service, calls } = createService({ orderStatus: ORDER_STATUS.CREATED })
      const updated = await service.updateStatus('o1', ORDER_STATUS.CANCELLED)
      expect(calls.updateStatus).to.deep.equal({ id: 'o1', from: 'created', to: 'cancelled' })
      expect(updated.status).to.equal(ORDER_STATUS.CANCELLED)
    })

    it('si otra request cambió el estado en el medio → INVALID_STATUS_TRANSITION', async () => {
      const { service } = createService({ orderStatus: ORDER_STATUS.CREATED, updateStatusResult: null })
      const error = await catchError(() => service.updateStatus('o1', ORDER_STATUS.CANCELLED))
      expect(error.code).to.equal('INVALID_STATUS_TRANSITION')
    })
  })
  
  describe('getTracking', () => {
    it('pedido inexistente → ORDER_NOT_FOUND', async () => {
      const { service } = createService()
      const error = await catchError(() => service.getTracking('nope'))
      expect(error.code).to.equal('ORDER_NOT_FOUND')
    })

    it('pedido sin entrega → delivery null', async () => {
      const { service } = createService()
      const tracking = await service.getTracking('o1')
      expect(tracking.order).to.include({ _id: 'o1', status: ORDER_STATUS.CREATED })
      expect(tracking.delivery).to.equal(null)
    })

    it('pedido con entrega → incluye estado y repartidor', async () => {
      const delivery = { _id: 'dlv1', status: 'assigned', driver: { _id: 'd1', firstName: 'Luis' }, updatedAt: 'x' }
      const { service } = createService({ delivery })
      const tracking = await service.getTracking('o1')
      expect(tracking.delivery).to.deep.equal(delivery)
    })
  })

  describe('calculateOrderTotal', () => {
    it('suma precio × cantidad', () => {
      expect(calculateOrderTotal([{ price: 100, quantity: 2 }, { price: 50, quantity: 3 }])).to.equal(350)
    })
  })
})