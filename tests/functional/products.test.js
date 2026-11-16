import { expect } from 'chai'
import { api, clearDatabase, expectError, createProduct, NONEXISTENT_ID } from './helpers.js'

describe('Funcional: /api/products', () => {
  beforeEach(clearDatabase)

  it('GET lista solo los productos con stock; con ?includeOutOfStock=true incluye todos', async () => {
    await createProduct({ name: 'Con stock', stock: 5 })
    await createProduct({ name: 'Sin stock', stock: 0 })

    const available = await api().get('/api/products')
    expect(available.status).to.equal(200)
    expect(available.body.payload).to.have.lengthOf(1)
    expect(available.body.payload[0]).to.include({ name: 'Con stock', status: 'available' })
    expect(available.body.payload[0]).to.include.all.keys('_id', 'name', 'price', 'stock', 'status')

    const all = await api().get('/api/products?includeOutOfStock=true')
    expect(all.body.payload.map((p) => p.status)).to.have.members(['available', 'out_of_stock'])
  })

  it('POST crea el producto y calcula el status a partir del stock (ignora el status enviado)', async () => {
    const res = await api().post('/api/products').send({ name: 'Caja', price: 1500, stock: 0, status: 'available' })
    expect(res.status).to.equal(201)
    expect(res.body.payload).to.include({ name: 'Caja', price: 1500, stock: 0, status: 'out_of_stock' })
  })

  it('POST con precio negativo o sin name → 400 VALIDATION_ERROR', async () => {
    const negative = await api().post('/api/products').send({ name: 'Caja', price: -10, stock: 1 })
    expectError(negative, 'VALIDATION_ERROR')
    expect(negative.body.details).to.match(/price/)

    expectError(await api().post('/api/products').send({ price: 10, stock: 1 }), 'VALIDATION_ERROR')
  })

  it('GET /:pid devuelve el producto', async () => {
    const product = await createProduct({ name: 'Caja grande' })
    const res = await api().get(`/api/products/${product._id}`)
    expect(res.status).to.equal(200)
    expect(res.body.payload).to.include({ _id: product._id, name: 'Caja grande' })
  })

  it('PUT al cambiar el stock recalcula el status; stock decimal → 400 VALIDATION_ERROR', async () => {
    const product = await createProduct({ stock: 0 })
    const res = await api().put(`/api/products/${product._id}`).send({ stock: 5 })
    expect(res.status).to.equal(200)
    expect(res.body.payload).to.include({ stock: 5, status: 'available' })

    const invalid = await api().put(`/api/products/${product._id}`).send({ stock: 1.5 })
    expectError(invalid, 'VALIDATION_ERROR')
    expect(invalid.body.details).to.match(/stock/)
  })

  it('DELETE elimina el producto', async () => {
    const product = await createProduct()
    const res = await api().delete(`/api/products/${product._id}`)
    expect(res.status).to.equal(200)
    expect(res.body.payload._id).to.equal(product._id)
  })

  it('producto inexistente → 404 PRODUCT_NOT_FOUND en GET, PUT y DELETE', async () => {
    expectError(await api().get(`/api/products/${NONEXISTENT_ID}`), 'PRODUCT_NOT_FOUND')
    expectError(await api().put(`/api/products/${NONEXISTENT_ID}`).send({ price: 5 }), 'PRODUCT_NOT_FOUND')
    expectError(await api().delete(`/api/products/${NONEXISTENT_ID}`), 'PRODUCT_NOT_FOUND')
  })
})
