import { expect } from 'chai'
import ProductsService from '../../src/services/products.service.js'
import { PRODUCT_STATUS } from '../../src/constants/index.js'

// Repository falso: anota las llamadas en `calls` y devuelve datos fijos.
// `overrides` permite cambiar un método puntual en cada test.
const createFakeRepo = (overrides = {}) => {
  const calls = {}
  return {
    calls,
    findAll: async (args) => { calls.findAll = args; return [] },
    findById: async () => null,
    create: async (data) => { calls.create = data; return { _id: 'p1', ...data } },
    updateById: async (id, data) => { calls.updateById = data; return { _id: id, ...data } },
    deleteById: async () => null,
    ...overrides
  }
}

// Ejecuta fn y devuelve el error que lanza; si no lanza, el test falla
const catchError = async (fn) => {
  try {
    await fn()
  } catch (error) {
    return error
  }
  throw new Error('Se esperaba que lanzara un error')
}

describe('ProductsService', () => {
  describe('getAll', () => {
    it('por defecto pide solo productos AVAILABLE', async () => {
      const repo = createFakeRepo()
      await new ProductsService(repo).getAll()
      expect(repo.calls.findAll).to.deep.equal({ status: PRODUCT_STATUS.AVAILABLE })
    })

    it('con includeOutOfStock no filtra por status', async () => {
      const repo = createFakeRepo()
      await new ProductsService(repo).getAll({ includeOutOfStock: true })
      expect(repo.calls.findAll).to.equal(undefined)
    })
  })

  describe('getById', () => {
    it('lanza 404 si el producto no existe', async () => {
      const error = await catchError(() => new ProductsService(createFakeRepo()).getById('x'))
      expect(error.status).to.equal(404)
    })
  })

    describe('create', () => {
    it('con stock > 0 guarda status AVAILABLE', async () => {
      const repo = createFakeRepo()
      await new ProductsService(repo).create({ name: 'Caja', price: 100, stock: 5 })
      expect(repo.calls.create.status).to.equal(PRODUCT_STATUS.AVAILABLE)
    })

    it('con stock 0 guarda status OUT_OF_STOCK', async () => {
      const repo = createFakeRepo()
      await new ProductsService(repo).create({ name: 'Caja', price: 100, stock: 0 })
      expect(repo.calls.create.status).to.equal(PRODUCT_STATUS.OUT_OF_STOCK)
    })

    it('ignora status y campos extra enviados por el cliente (lista blanca)', async () => {
      const repo = createFakeRepo()
      const body = { name: 'Caja', price: 100, stock: 0, status: 'available', hack: true }
      await new ProductsService(repo).create(body)
      expect(repo.calls.create).to.deep.equal({
        name: 'Caja', price: 100, stock: 0, status: PRODUCT_STATUS.OUT_OF_STOCK
      })
    })

    it('rechaza price negativo con 400', async () => {
      const service = new ProductsService(createFakeRepo())
      const error = await catchError(() => service.create({ name: 'Caja', price: -1, stock: 1 }))
      expect(error.status).to.equal(400)
    })

    it('rechaza stock decimal con 400', async () => {
      const service = new ProductsService(createFakeRepo())
      const error = await catchError(() => service.create({ name: 'Caja', price: 10, stock: 1.5 }))
      expect(error.status).to.equal(400)
    })

    it('rechaza body vacío con 400', async () => {
      const error = await catchError(() => new ProductsService(createFakeRepo()).create(undefined))
      expect(error.status).to.equal(400)
    })
  })

  describe('update', () => {
    it('recalcula el status si cambia el stock', async () => {
      const repo = createFakeRepo()
      await new ProductsService(repo).update('p1', { stock: 0 })
      expect(repo.calls.updateById.status).to.equal(PRODUCT_STATUS.OUT_OF_STOCK)
    })

    it('rechaza un update sin campos válidos con 400', async () => {
      const service = new ProductsService(createFakeRepo())
      const error = await catchError(() => service.update('p1', { status: 'available' }))
      expect(error.status).to.equal(400)
    })

    it('lanza 404 si el producto a actualizar no existe', async () => {
      const repo = createFakeRepo({ updateById: async () => null })
      const error = await catchError(() => new ProductsService(repo).update('p1', { price: 5 }))
      expect(error.status).to.equal(404)
    })
  })

  describe('delete', () => {
    it('lanza 404 si el producto a borrar no existe', async () => {
      const error = await catchError(() => new ProductsService(createFakeRepo()).delete('x'))
      expect(error.status).to.equal(404)
    })
  })
})