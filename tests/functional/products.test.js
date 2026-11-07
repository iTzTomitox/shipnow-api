import { expect } from 'chai'
import { api, clearDatabase, expectError, createProduct, NONEXISTENT_ID } from './helpers.js'

describe('Funcional: /api/products', () => {
  beforeEach(clearDatabase)

  describe('GET /api/products', () => {
    it('por defecto lista solo los productos con stock', async () => {
      await createProduct({ name: 'Con stock', stock: 5 })
      await createProduct({ name: 'Sin stock', stock: 0 })

      const res = await api().get('/api/products')

      expect(res.status).to.equal(200)
      expect(res.body.payload).to.have.lengthOf(1)
      expect(res.body.payload[0]).to.include({ name: 'Con stock', status: 'available' })
      expect(res.body.payload[0]).to.include.all.keys('_id', 'name', 'price', 'stock', 'status')
    })

    it('con ?includeOutOfStock=true incluye los productos sin stock', async () => {
      await createProduct({ stock: 5 })
      await createProduct({ stock: 0 })
      const res = await api().get('/api/products?includeOutOfStock=true')
      expect(res.status).to.equal(200)
      expect(res.body.payload.map((p) => p.status)).to.have.members(['available', 'out_of_stock'])
    })
  })

  describe('POST /api/products', () => {
    it('crea el producto y calcula el status a partir del stock (ignora el status enviado)', async () => {
      const res = await api().post('/api/products').send({ name: 'Caja', price: 1500, stock: 0, status: 'available' })
      expect(res.status).to.equal(201)
      expect(res.body.payload).to.include({ name: 'Caja', price: 1500, stock: 0, status: 'out_of_stock' })
    })

    it('precio negativo → 400 VALIDATION_ERROR', async () => {
      const res = await api().post('/api/products').send({ name: 'Caja', price: -10, stock: 1 })
      expectError(res, 'VALIDATION_ERROR')
      expect(res.body.details).to.match(/price/)
    })

    it('datos incompletos (sin name) → 400 VALIDATION_ERROR', async () => {
      const res = await api().post('/api/products').send({ price: 10, stock: 1 })
      expectError(res, 'VALIDATION_ERROR')
    })
  })

  describe('GET /api/products/:pid', () => {
    it('devuelve el producto', async () => {
      const product = await createProduct({ name: 'Caja grande' })
      const res = await api().get(`/api/products/${product._id}`)
      expect(res.status).to.equal(200)
      expect(res.body.payload).to.include({ _id: product._id, name: 'Caja grande' })
    })

    it('producto inexistente → 404 PRODUCT_NOT_FOUND', async () => {
      const res = await api().get(`/api/products/${NONEXISTENT_ID}`)
      expectError(res, 'PRODUCT_NOT_FOUND')
    })
  })

  describe('PUT /api/products/:pid', () => {
    it('al cambiar el stock recalcula el status', async () => {
      const product = await createProduct({ stock: 0 })
      const res = await api().put(`/api/products/${product._id}`).send({ stock: 5 })
      expect(res.status).to.equal(200)
      expect(res.body.payload).to.include({ stock: 5, status: 'available' })
    })

    it('stock decimal → 400 VALIDATION_ERROR', async () => {
      const product = await createProduct()
      const res = await api().put(`/api/products/${product._id}`).send({ stock: 1.5 })
      expectError(res, 'VALIDATION_ERROR')
      expect(res.body.details).to.match(/stock/)
    })

    it('producto inexistente → 404 PRODUCT_NOT_FOUND', async () => {
      const res = await api().put(`/api/products/${NONEXISTENT_ID}`).send({ price: 5 })
      expectError(res, 'PRODUCT_NOT_FOUND')
    })
  })

  describe('DELETE /api/products/:pid', () => {
    it('elimina el producto', async () => {
      const product = await createProduct()
      const res = await api().delete(`/api/products/${product._id}`)
      expect(res.status).to.equal(200)
      expect(res.body.payload._id).to.equal(product._id)
    })

    it('producto inexistente → 404 PRODUCT_NOT_FOUND', async () => {
      const res = await api().delete(`/api/products/${NONEXISTENT_ID}`)
      expectError(res, 'PRODUCT_NOT_FOUND')
    })
  })
})
