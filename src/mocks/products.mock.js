import { fakerES as faker } from '@faker-js/faker'
import { statusFromStock } from '../services/products.service.js'

const OUT_OF_STOCK_RATIO = 0.15 // ~15% sin stock, para tener ambos estados

// Producto simulado con la forma del modelo Product
export const generateMockProduct = () => {
  const stock = faker.datatype.boolean(OUT_OF_STOCK_RATIO)
    ? 0
    : faker.number.int({ min: 1, max: 50 })

  return {
    name: faker.commerce.productName(),
    price: faker.number.int({ min: 500, max: 20000 }),
    stock,
    status: statusFromStock(stock)
  }
}

export const generateMockProducts = (qty) => Array.from({ length: qty }, generateMockProduct)