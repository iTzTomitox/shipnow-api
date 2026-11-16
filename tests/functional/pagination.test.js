import { expect } from 'chai'
import { api, clearDatabase, expectError, createProduct } from './helpers.js'

// Listados paginados: ninguno devuelve la colección completa sin control
const LIST_ENDPOINTS = ['/api/products', '/api/users', '/api/orders', '/api/deliveries']

describe('Funcional: paginación de los listados', () => {
  beforeEach(clearDatabase)

  it('devuelve una página con sus metadatos (10 por defecto) y recorre las páginas sin repetir', async () => {
    for (let i = 1; i <= 25; i++) await createProduct({ name: `Producto ${i}` })

    const first = await api().get('/api/products')
    expect(first.status).to.equal(200)
    expect(first.body.payload).to.have.lengthOf(10)
    expect(first.body.pagination).to.deep.equal({
      page: 1, limit: 10, total: 25, totalPages: 3, hasNextPage: true, hasPrevPage: false
    })

    const last = await api().get('/api/products?page=3&limit=10')
    expect(last.body.payload).to.have.lengthOf(5)
    expect(last.body.pagination).to.include({ page: 3, hasNextPage: false, hasPrevPage: true })

    // Las tres páginas juntas tienen los 25 productos, sin repetidos (orden estable)
    const second = await api().get('/api/products?page=2')
    const ids = [...first.body.payload, ...second.body.payload, ...last.body.payload].map((p) => p._id)
    expect(new Set(ids).size).to.equal(25)
  })

  it('se combina con los filtros: el total cuenta solo lo que cumple el filtro', async () => {
    for (let i = 0; i < 3; i++) await createProduct({ stock: 5 })
    for (let i = 0; i < 2; i++) await createProduct({ stock: 0 })

    const available = await api().get('/api/products?limit=2')
    expect(available.body.pagination).to.include({ total: 3, totalPages: 2 })

    const all = await api().get('/api/products?includeOutOfStock=true&limit=2')
    expect(all.body.pagination).to.include({ total: 5, totalPages: 3 })
  })

  it('page o limit inválidos → 400 VALIDATION_ERROR en todos los listados', async () => {
    for (const endpoint of LIST_ENDPOINTS) {
      for (const query of ['page=0', 'page=abc', 'limit=0', 'limit=101', 'limit=2.5']) {
        const res = await api().get(`${endpoint}?${query}`)
        expectError(res, 'VALIDATION_ERROR')
        expect(res.body.details, `${endpoint}?${query}`).to.match(/page|limit/)
      }
    }
  })

  it('todos los listados responden con pagination', async () => {
    for (const endpoint of LIST_ENDPOINTS) {
      const res = await api().get(endpoint)
      expect(res.status, endpoint).to.equal(200)
      expect(res.body.payload, endpoint).to.be.an('array')
      expect(res.body.pagination, endpoint).to.include.all.keys('page', 'limit', 'total', 'totalPages', 'hasNextPage', 'hasPrevPage')
    }
  })
})
