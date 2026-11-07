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

  it('un JSON mal formado responde 400 INVALID_JSON', async () => {
    const res = await api()
      .post('/api/products')
      .set('Content-Type', 'application/json')
      .send('{"name": ')
    expectError(res, 'INVALID_JSON')
  })
})