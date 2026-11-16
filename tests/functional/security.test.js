import { expect } from 'chai'
import { api } from './helpers.js'

describe('Funcional: cabeceras de seguridad (helmet)', () => {
  it('se aplican a todas las respuestas: éxito, error, health y Swagger', async () => {
    for (const path of ['/api/products', '/api/noexiste', '/api/health', '/api/docs/']) {
      const res = await api().get(path)
      expect(res.headers['x-content-type-options'], path).to.equal('nosniff')
      expect(res.headers['x-frame-options'], path).to.equal('SAMEORIGIN')
      expect(res.headers, path).to.not.have.property('x-powered-by') // no revela que es Express
      // CSP activa, pero sin forzar HTTPS: la API puede servirse por HTTP (Docker en localhost)
      expect(res.headers['content-security-policy'], path).to.include("default-src 'self'")
      expect(res.headers['content-security-policy'], path).to.not.include('upgrade-insecure-requests')
    }
  })
})
