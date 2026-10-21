import { expect } from 'chai'
import AppError from '../../src/errors/AppError.js'
import { createErrorHandler } from '../../src/middlewares/errorHandler.middleware.js'
import { notFound } from '../../src/middlewares/notFound.middleware.js'

// res falso: guarda status y body para inspeccionarlos
const createFakeRes = () => ({
  headersSent: false,
  status(code) { this.statusCode = code; return this },
  json(body) { this.body = body; return this }
})

// logger falso: anota cada llamada con su nivel para poder inspeccionarla
const createFakeLogger = () => {
  const calls = []
  const record = (level) => (message, meta) => calls.push({ level, message, meta })
  return { calls, warning: record('warning'), error: record('error') }
}

const devHandler = createErrorHandler({ exposeDetails: true, logger: createFakeLogger() })
const prodHandler = createErrorHandler({ exposeDetails: false, logger: createFakeLogger() })

// req mínimo: el middleware usa method y originalUrl para el log
const fakeReq = { method: 'GET', originalUrl: '/api/test' }

const run = (handler, err) => {
  const res = createFakeRes()
  handler(err, fakeReq, res, () => {})
  return res
}

describe('middlewares', () => {
  describe('errorHandler', () => {
    it('responde un AppError con el formato uniforme y details en desarrollo', () => {
      const res = run(devHandler, new AppError('ORDER_NOT_FOUND', 'id 123'))
      expect(res.statusCode).to.equal(404)
      expect(res.body).to.deep.equal({
        status: 'error',
        error: 'ORDER_NOT_FOUND',
        message: 'No se encontró el pedido solicitado',
        details: 'id 123'
      })
    })

    it('en producción oculta details', () => {
      const res = run(prodHandler, new AppError('ORDER_NOT_FOUND', 'id 123'))
      expect(res.body).to.not.have.property('details')
    })

    it('un error inesperado responde 500 sin exponer el mensaje interno en producción', () => {
      const res = run(prodHandler, new TypeError('x is undefined'))
      expect(res.statusCode).to.equal(500)
      expect(res.body).to.deep.equal({
        status: 'error',
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Error interno del servidor'
      })
    })

    it('JSON mal formado → 400 INVALID_JSON', () => {
      const err = Object.assign(new SyntaxError('Unexpected token'), { type: 'entity.parse.failed' })
      const res = run(devHandler, err)
      expect(res.statusCode).to.equal(400)
      expect(res.body.error).to.equal('INVALID_JSON')
    })

    it('índice único de MongoDB (11000) → 409 DUPLICATE_RESOURCE', () => {
      const err = Object.assign(new Error('E11000'), { code: 11000, keyValue: { email: 'a@b.com' } })
      const res = run(devHandler, err)
      expect(res.statusCode).to.equal(409)
      expect(res.body.error).to.equal('DUPLICATE_RESOURCE')
    })

    it('MongoDB inaccesible → 500 DATABASE_ERROR', () => {
      const err = Object.assign(new Error('connection refused'), { name: 'MongoNetworkError' })
      const res = run(devHandler, err)
      expect(res.statusCode).to.equal(500)
      expect(res.body.error).to.equal('DATABASE_ERROR')
    })
    
    it('registra los errores esperados (4xx) como warning, con details', () => {
      const logger = createFakeLogger()
      run(createErrorHandler({ exposeDetails: true, logger }), new AppError('ORDER_NOT_FOUND', 'id 123'))
      expect(logger.calls).to.have.lengthOf(1)
      expect(logger.calls[0].level).to.equal('warning')
      expect(logger.calls[0].message).to.equal('ORDER_NOT_FOUND en GET /api/test')
      expect(logger.calls[0].meta).to.deep.equal({ details: 'id 123' })
    })

    it('registra los errores inesperados (5xx) como error, con el stack', () => {
      const logger = createFakeLogger()
      run(createErrorHandler({ exposeDetails: false, logger }), new TypeError('x is undefined'))
      expect(logger.calls[0].level).to.equal('error')
      expect(logger.calls[0].message).to.match(/INTERNAL_SERVER_ERROR en GET \/api\/test: x is undefined/)
      expect(logger.calls[0].message).to.include('TypeError') // el stack viaja en el log
    })
  })

  describe('notFound', () => {
    it('deriva ROUTE_NOT_FOUND con método y ruta en details', () => {
      let received
      notFound({ method: 'GET', originalUrl: '/api/noexiste' }, {}, (err) => { received = err })
      expect(received.code).to.equal('ROUTE_NOT_FOUND')
      expect(received.details).to.equal('GET /api/noexiste')
    })
  })
})