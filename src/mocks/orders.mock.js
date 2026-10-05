import { fakerES as faker } from '@faker-js/faker'
import { ORDER_STATUS, DELIVERY_PRIORITY, PRODUCT_STATUS } from '../constants/index.js'

export const calculateOrderTotal = (items) =>
  items.reduce((acc, item) => acc + item.price * item.quantity, 0)

export const generateMockOrder = ({ customerId, products, status = ORDER_STATUS.CREATED }) => {
  // Preferimos productos con stock; si no hay ninguno, usamos todos
  const available = products.filter((p) => p.status === PRODUCT_STATUS.AVAILABLE)
  const pool = available.length > 0 ? available : products
  const chosen = faker.helpers.arrayElements(pool, { min: 1, max: Math.min(3, pool.length) })

  // Snapshot: copiamos nombre y precio al momento del pedido
  const items = chosen.map((product) => ({
    product: product._id,
    name: product.name,
    quantity: faker.number.int({ min: 1, max: 5 }),
    price: product.price
  }))

  return {
    customer: customerId,
    items,
    deliveryAddress: faker.location.streetAddress({ useFullAddress: true }),
    total: calculateOrderTotal(items),
    status,
    priority: faker.helpers.arrayElement(Object.values(DELIVERY_PRIORITY))
  }
}