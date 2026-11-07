import { expect } from 'chai'
import { api, expectError } from './helpers.js'

describe('Funcional: documentación y rutas', () => {
  it('GET /api/docs/ sirve Swagger UI (HTML)', async () => {
    const res = await api().get('/api/docs/')
    expect(res.status).to.equal(200)
    expect(res.headers['content-type']).to.match(/text\/html/)
    expect(res.text).to.include('swagger-ui')
  })

  it('GET /api/docs.json devuelve la especificación OpenAPI con los módulos documentados', async () => {
    const res = await api().get('/api/docs.json')
    expect(res.status).to.equal(200)
    expect(res.body.openapi).to.match(/^3\./)
    expect(res.body.info).to.include({ title: 'ShipNow API' })
    expect(res.body.paths).to.include.keys('/api/users', '/api/orders', '/api/deliveries', '/api/mocks/seed', '/api/loggerTest')
    expect(res.body.tags.map((tag) => tag.name)).to.include.members(['Users', 'Orders', 'Deliveries', 'Mocks', 'Logger'])
  })

  it('una ruta inexistente responde 404 ROUTE_NOT_FOUND con el formato de error', async () => {
    const res = await api().get('/api/noexiste')
    expectError(res, 'ROUTE_NOT_FOUND')
    expect(res.body.details).to.equal('GET /api/noexiste')
  })

  // Todos los endpoints que reciben body responden igual ante un JSON roto
  // (el error lo lanza express.json() antes de llegar a la ruta)
  const bodyEndpoints = [
    ['post', '/api/products'],
    ['put', '/api/products/6ac1b4f2a653ca2ad6719999'],
    ['post', '/api/users'],
    ['put', '/api/users/6ac1b4f2a653ca2ad6719999'],
    ['post', '/api/orders'],
    ['patch', '/api/orders/6ac1b4f2a653ca2ad6719999/status'],
    ['post', '/api/deliveries'],
    ['patch', '/api/deliveries/6ac1b4f2a653ca2ad6719999/assign'],
    ['post', '/api/mocks/seed']
  ]
  for (const [method, path] of bodyEndpoints) {
    it(`JSON mal formado en ${method.toUpperCase()} ${path} → 400 INVALID_JSON`, async () => {
      const res = await api()[method](path).set('Content-Type', 'application/json').send('{"name": ')
      expectError(res, 'INVALID_JSON')
    })
  }
})