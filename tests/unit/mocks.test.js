import { expect } from 'chai'
import { generateMockUser, generateMockUsers } from '../../src/mocks/users.mock.js'
import { generateMockProducts } from '../../src/mocks/products.mock.js'
import { generateMockOrder } from '../../src/mocks/orders.mock.js'
import { calculateOrderTotal } from '../../src/services/orders.service.js'
import { generateMockDelivery } from '../../src/mocks/deliveries.mock.js'
import {
  USER_ROLES,
  PRODUCT_STATUS,
  ORDER_STATUS,
  DELIVERY_STATUS,
  DELIVERY_PRIORITY
} from '../../src/constants/index.js'

// Los generadores son aleatorios: las propiedades que deben cumplirse SIEMPRE
// se verifican sobre muchas muestras.
const SAMPLE = 50

// Productos fijos para controlar qué puede elegir el generador de pedidos
const products = [
  { _id: 'p1', name: 'Caja chica', price: 1000, status: PRODUCT_STATUS.AVAILABLE },
  { _id: 'p2', name: 'Caja grande', price: 3000, status: PRODUCT_STATUS.OUT_OF_STOCK }
]

describe('Generadores de mocks', () => {
  it('usuarios: solo rol user o driver, emails válidos, en minúsculas y sin repetir', () => {
    const users = generateMockUsers(SAMPLE)
    for (const user of users) {
      expect([USER_ROLES.USER, USER_ROLES.DRIVER]).to.include(user.role)
      expect(user.email).to.match(/^[^\s@A-Z]+@shipnow\.test$/)
    }
    expect(new Set(users.map((u) => u.email)).size).to.equal(SAMPLE)
    expect(generateMockUser({ role: USER_ROLES.DRIVER }).role).to.equal(USER_ROLES.DRIVER)
  })

  it('productos: el status siempre es coherente con el stock', () => {
    for (const product of generateMockProducts(SAMPLE)) {
      expect(product.status).to.equal(product.stock > 0 ? PRODUCT_STATUS.AVAILABLE : PRODUCT_STATUS.OUT_OF_STOCK)
    }
  })

  it('pedidos: cliente recibido, solo productos con stock, snapshot y total calculado', () => {
    for (let i = 0; i < SAMPLE; i++) {
      const order = generateMockOrder({ customerId: 'u1', products })
      expect(order).to.include({ customer: 'u1', status: ORDER_STATUS.CREATED })
      expect(Object.values(DELIVERY_PRIORITY)).to.include(order.priority)
      for (const item of order.items) expect(item).to.include({ product: 'p1', name: 'Caja chica', price: 1000 })
      expect(order.total).to.equal(calculateOrderTotal(order.items))
    }
  })

  it('entregas: estado derivado del pedido y repartidor solo cuando corresponde', () => {
    const created = generateMockDelivery({ order: { _id: 'o1', status: ORDER_STATUS.CREATED }, driverId: 'd1' })
    expect(created).to.deep.equal({ order: 'o1', driver: null, status: DELIVERY_STATUS.PENDING })

    const inTransit = generateMockDelivery({ order: { _id: 'o1', status: ORDER_STATUS.IN_TRANSIT }, driverId: 'd1' })
    expect(inTransit).to.deep.equal({ order: 'o1', driver: 'd1', status: DELIVERY_STATUS.IN_TRANSIT })

    // Datos incoherentes: el generador se niega a crearlos
    expect(() => generateMockDelivery({ order: { _id: 'o1', status: ORDER_STATUS.CANCELLED }, driverId: 'd1' }))
      .to.throw(/no lleva entrega/)
    expect(() => generateMockDelivery({ order: { _id: 'o1', status: ORDER_STATUS.DELIVERED } }))
      .to.throw(/requiere un repartidor/)
  })
})
