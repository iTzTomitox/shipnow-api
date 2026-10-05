import { expect } from 'chai'
import { generateMockUser, generateMockUsers } from '../../src/mocks/users.mock.js'
import { generateMockProducts } from '../../src/mocks/products.mock.js'
import { generateMockOrder, calculateOrderTotal } from '../../src/mocks/orders.mock.js'
import { generateMockDelivery } from '../../src/mocks/deliveries.mock.js'
import {
  USER_ROLES,
  PRODUCT_STATUS,
  ORDER_STATUS,
  DELIVERY_STATUS,
  DELIVERY_PRIORITY
} from '../../src/constants/index.js'

const SAMPLE = 50 // muestras para propiedades que deben cumplirse siempre

// Productos fijos para controlar qué puede elegir el generador de pedidos
const products = [
  { _id: 'p1', name: 'Caja chica', price: 1000, status: PRODUCT_STATUS.AVAILABLE },
  { _id: 'p2', name: 'Caja grande', price: 3000, status: PRODUCT_STATUS.OUT_OF_STOCK }
]

describe('mocks', () => {
  describe('users', () => {
    it('genera solo roles USER o DRIVER (nunca ADMIN)', () => {
      for (const user of generateMockUsers(SAMPLE)) {
        expect([USER_ROLES.USER, USER_ROLES.DRIVER]).to.include(user.role)
      }
    })

    it('genera emails válidos, en minúsculas y sin repetir', () => {
      const emails = generateMockUsers(SAMPLE).map((user) => user.email)
      for (const email of emails) {
        expect(email).to.match(/^[^\s@A-Z]+@shipnow\.test$/)
      }
      expect(new Set(emails).size).to.equal(SAMPLE)
    })

    it('respeta el rol pedido explícitamente', () => {
      expect(generateMockUser({ role: USER_ROLES.DRIVER }).role).to.equal(USER_ROLES.DRIVER)
    })
  })

  describe('products', () => {
    it('el status siempre es coherente con el stock', () => {
      for (const product of generateMockProducts(SAMPLE)) {
        const expected = product.stock > 0 ? PRODUCT_STATUS.AVAILABLE : PRODUCT_STATUS.OUT_OF_STOCK
        expect(product.status).to.equal(expected)
      }
    })
  })

    describe('orders', () => {
    it('asocia el pedido al cliente recibido, con estado CREATED por defecto', () => {
      const order = generateMockOrder({ customerId: 'u1', products })
      expect(order.customer).to.equal('u1')
      expect(order.status).to.equal(ORDER_STATUS.CREATED)
      expect(Object.values(DELIVERY_PRIORITY)).to.include(order.priority)
    })

    it('usa solo productos con stock cuando existen', () => {
      for (let i = 0; i < SAMPLE; i++) {
        const order = generateMockOrder({ customerId: 'u1', products })
        for (const item of order.items) expect(item.product).to.equal('p1')
      }
    })

    it('copia nombre y precio del producto y calcula bien el total', () => {
      const order = generateMockOrder({ customerId: 'u1', products })
      const [item] = order.items
      expect(item).to.include({ name: 'Caja chica', price: 1000 })
      expect(order.total).to.equal(calculateOrderTotal(order.items))
    })

    it('calculateOrderTotal suma precio × cantidad', () => {
      const items = [{ price: 100, quantity: 2 }, { price: 50, quantity: 3 }]
      expect(calculateOrderTotal(items)).to.equal(350)
    })
  })

  describe('deliveries', () => {
    it('pedido CREATED → entrega PENDING sin repartidor', () => {
      const order = { _id: 'o1', status: ORDER_STATUS.CREATED }
      const delivery = generateMockDelivery({ order, driverId: 'd1' })
      expect(delivery).to.deep.equal({ order: 'o1', driver: null, status: DELIVERY_STATUS.PENDING })
    })

    it('pedido IN_TRANSIT → entrega IN_TRANSIT con repartidor', () => {
      const order = { _id: 'o1', status: ORDER_STATUS.IN_TRANSIT }
      const delivery = generateMockDelivery({ order, driverId: 'd1' })
      expect(delivery).to.deep.equal({ order: 'o1', driver: 'd1', status: DELIVERY_STATUS.IN_TRANSIT })
    })

    it('un pedido CANCELLED no lleva entrega', () => {
      const order = { _id: 'o1', status: ORDER_STATUS.CANCELLED }
      expect(() => generateMockDelivery({ order, driverId: 'd1' })).to.throw(/no lleva entrega/)
    })

    it('una entrega que no es PENDING exige repartidor', () => {
      const order = { _id: 'o1', status: ORDER_STATUS.DELIVERED }
      expect(() => generateMockDelivery({ order })).to.throw(/requiere un repartidor/)
    })
  })
})