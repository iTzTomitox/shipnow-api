import { fakerES as faker } from '@faker-js/faker'
import { USER_ROLES, ORDER_STATUS, MAX_MOCK_ITEMS } from '../constants/index.js'
import { httpError } from '../utils/httpError.js'
import { generateMockId } from '../mocks/id.mock.js'
import { generateMockUsers } from '../mocks/users.mock.js'
import { generateMockProducts } from '../mocks/products.mock.js'
import { generateMockOrder } from '../mocks/orders.mock.js'
import { generateMockDelivery } from '../mocks/deliveries.mock.js'
import { usersRepository } from '../repositories/users.repository.js'
import { productsRepository } from '../repositories/products.repository.js'
import { ordersRepository } from '../repositories/orders.repository.js'
import { deliveriesRepository } from '../repositories/deliveries.repository.js'

const DEFAULT_QTY = 5 // cantidad por defecto en los GET sin ?qty
const PRODUCTS_FOR_MOCK_ORDERS = 5 // catálogo simulado para GET de pedidos

// Estados de pedido según tenga o no entrega (coherencia pedido entrega)
const STATUSES_WITH_DRIVER = [
  ORDER_STATUS.ASSIGNED,
  ORDER_STATUS.PICKED_UP,
  ORDER_STATUS.IN_TRANSIT,
  ORDER_STATUS.DELIVERED
]
const STATUSES_WITHOUT_DELIVERY = [ORDER_STATUS.CREATED, ORDER_STATUS.CANCELLED]

// Valida una cantidad: entero entre 0 y MAX_MOCK_ITEMS (acepta "5" de query string)
const parseQty = (value, field, { defaultValue = 0 } = {}) => {
  if (value === undefined) return defaultValue
  const isNumberLike = typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')
  const qty = Number(value)
  if (!isNumberLike || !Number.isInteger(qty) || qty < 0 || qty > MAX_MOCK_ITEMS) {
    throw httpError(400, `${field} debe ser un número entero entre 0 y ${MAX_MOCK_ITEMS}`)
  }
  return qty
}

// Reglas de un seed completo: algo para generar y relaciones posibles
const validateSeedCounts = ({ users, products, orders, deliveries }) => {
  if (users + products + orders + deliveries === 0) {
    throw httpError(400, 'Indicá al menos una cantidad mayor a 0 (users, products, orders, deliveries)')
  }
  if (orders > 0 && (users === 0 || products === 0)) {
    throw httpError(400, 'Para generar orders hacen falta users y products en el mismo seed')
  }
  if (deliveries > orders) {
    throw httpError(400, 'deliveries no puede superar a orders (cada entrega pertenece a un pedido)')
  }
}

const withMockIds = (items) => items.map((item) => ({ _id: generateMockId(), ...item }))

export default class MocksService {
  // Inyección de dependencias: los cuatro repositories en un objeto con nombre
  constructor({ usersRepository, productsRepository, ordersRepository, deliveriesRepository }) {
    this.usersRepository = usersRepository
    this.productsRepository = productsRepository
    this.ordersRepository = ordersRepository
    this.deliveriesRepository = deliveriesRepository
  }

  getMockUsers(qty) {
    return generateMockUsers(parseQty(qty, 'qty', { defaultValue: DEFAULT_QTY }))
  }

  getMockProducts(qty) {
    return generateMockProducts(parseQty(qty, 'qty', { defaultValue: DEFAULT_QTY }))
  }

  getMockOrders(qty) {
    const count = parseQty(qty, 'qty', { defaultValue: DEFAULT_QTY })
    // Catálogo simulado con ids válidos para que los items tengan referencia
    const products = withMockIds(generateMockProducts(PRODUCTS_FOR_MOCK_ORDERS))
    return Array.from({ length: count }, () =>
      generateMockOrder({ customerId: generateMockId(), products })
    )
  }

  async seedUsers(qty) {
    const count = parseQty(qty, 'qty')
    if (count === 0) throw httpError(400, 'qty debe ser mayor a 0')
    const inserted = await this.usersRepository.insertMany(generateMockUsers(count))
    return { insertados: inserted.length, coleccion: 'users' }
  }

    // Seed completo: inserta en orden usuarios → productos → pedidos → entregas
  async seed(body) {
    const data = body ?? {}
    const counts = {
      users: parseQty(data.users, 'users'),
      products: parseQty(data.products, 'products'),
      orders: parseQty(data.orders, 'orders'),
      deliveries: parseQty(data.deliveries, 'deliveries')
    }
    validateSeedCounts(counts)

    const users = counts.users > 0
      ? await this.usersRepository.insertMany(generateMockUsers(counts.users))
      : []
    const products = counts.products > 0
      ? await this.productsRepository.insertMany(generateMockProducts(counts.products))
      : []

    // Clientes = rol USER (si no hay, cualquiera); repartidores = rol DRIVER
    const customers = users.filter((u) => u.role === USER_ROLES.USER)
    const customerPool = customers.length > 0 ? customers : users
    const drivers = users.filter((u) => u.role === USER_ROLES.DRIVER)

    // Los primeros `deliveries` pedidos llevan entrega; el estado se elige en consecuencia
    const mockOrders = Array.from({ length: counts.orders }, (_, i) => {
      const hasDelivery = i < counts.deliveries
      const statusPool = hasDelivery
        ? (drivers.length > 0 ? STATUSES_WITH_DRIVER : [ORDER_STATUS.CREATED])
        : STATUSES_WITHOUT_DELIVERY
      return generateMockOrder({
        customerId: faker.helpers.arrayElement(customerPool)._id,
        products,
        status: faker.helpers.arrayElement(statusPool)
      })
    })
    const orders = counts.orders > 0 ? await this.ordersRepository.insertMany(mockOrders) : []

    const mockDeliveries = orders.slice(0, counts.deliveries).map((order) =>
      generateMockDelivery({
        order,
        driverId: drivers.length > 0 ? faker.helpers.arrayElement(drivers)._id : null
      })
    )
    const deliveries = mockDeliveries.length > 0
      ? await this.deliveriesRepository.insertMany(mockDeliveries)
      : []

    return {
      insertados: {
        users: users.length,
        products: products.length,
        orders: orders.length,
        deliveries: deliveries.length
      }
    }
  }
}

export const mocksService = new MocksService({
  usersRepository,
  productsRepository,
  ordersRepository,
  deliveriesRepository
})