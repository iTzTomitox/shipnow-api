import { expect } from 'chai'
import AppError from '../../src/errors/AppError.js'
import { ERRORS, ERROR_CODES } from '../../src/errors/errorDictionary.js'

describe('errors', () => {
  describe('diccionario', () => {
    it('cada código tiene statusCode HTTP de error (4xx/5xx) y un mensaje', () => {
      for (const code of ERROR_CODES) {
        const { statusCode, message } = ERRORS[code]
        expect(statusCode, code).to.be.within(400, 599)
        expect(message, code).to.be.a('string').and.not.be.empty
      }
    })

    it('está congelado', () => {
      expect(Object.isFrozen(ERRORS)).to.equal(true)
    })

    it('incluye los casos que pide la consigna', () => {
      expect(ERROR_CODES).to.include.members([
        'USER_NOT_FOUND',
        'ORDER_NOT_FOUND',
        'INVALID_ORDER_STATUS',
        'INVALID_MOCK_AMOUNT',
        'ROUTE_NOT_FOUND',
        'INTERNAL_SERVER_ERROR'
      ])
    })
  })

  describe('AppError', () => {
    it('toma statusCode y message del diccionario', () => {
      const error = new AppError('ORDER_NOT_FOUND')
      expect(error.code).to.equal('ORDER_NOT_FOUND')
      expect(error.statusCode).to.equal(404)
      expect(error.message).to.equal(ERRORS.ORDER_NOT_FOUND.message)
    })

    it('es un Error real (instanceof Error) y guarda details', () => {
      const error = new AppError('VALIDATION_ERROR', 'price inválido')
      expect(error).to.be.instanceOf(Error)
      expect(error.details).to.equal('price inválido')
    })

    it('falla en el momento con un código inexistente', () => {
      expect(() => new AppError('ORDER_NOT_FOUN')).to.throw(/Código de error desconocido/)
    })
  })
})