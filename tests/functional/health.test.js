import { expect } from 'chai'
import { api, expectError } from './helpers.js'
import { healthService } from '../../src/services/health.service.js'

describe('Funcional: /api/health', () => {
  it('responde 200 con el estado de la API, sin datos sensibles', async () => {
    const res = await api().get('/api/health')

    expect(res.status).to.equal(200)
    expect(res.body.status).to.equal('success')
    // Exactamente estos campos: nada de URIs, credenciales ni versiones
    expect(res.body.payload).to.have.all.keys('status', 'environment', 'uptime', 'timestamp', 'database')
    expect(res.body.payload).to.include({ status: 'ok', environment: 'test', database: 'connected' })
    expect(res.body.payload.uptime).to.be.a('number').and.at.least(0)
    expect(new Date(res.body.payload.timestamp).toISOString()).to.equal(res.body.payload.timestamp)
  })

  it('sin conexión a MongoDB responde 503 SERVICE_UNAVAILABLE', async () => {
    // Se reemplaza la dependencia inyectada para simular la base caída
    const original = healthService.getDbState
    healthService.getDbState = () => 'disconnected'
    try {
      const res = await api().get('/api/health')
      expectError(res, 'SERVICE_UNAVAILABLE')
      expect(res.body.details).to.equal('database: disconnected')
    } finally {
      healthService.getDbState = original
    }
  })
})
