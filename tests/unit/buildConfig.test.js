import { expect } from 'chai'
import { buildConfig } from '../../src/config/buildConfig.js'

// env válido de base; cada test lo modifica según el caso
const validEnv = {
  PORT: '3000',
  MONGODB_URI: 'mongodb://localhost:27017/shipnow_test',
  NODE_ENV: 'test'
}

describe('buildConfig', () => {
  it('devuelve la config con PORT convertido a número', () => {
    const config = buildConfig(validEnv)
    expect(config).to.deep.equal({
      port: 3000,
      mongoUri: validEnv.MONGODB_URI,
      nodeEnv: 'test'
    })
  })

  it('devuelve un objeto congelado (inmutable)', () => {
    const config = buildConfig(validEnv)
    expect(Object.isFrozen(config)).to.equal(true)
  })

  it('lanza error si falta MONGODB_URI', () => {
    const env = { ...validEnv, MONGODB_URI: '' }
    expect(() => buildConfig(env)).to.throw(/MONGODB_URI/)
  })

  it('lista todas las variables faltantes juntas', () => {
    expect(() => buildConfig({})).to.throw(/PORT, MONGODB_URI, NODE_ENV/)
  })

  it('lanza error si PORT no es un entero positivo', () => {
    const env = { ...validEnv, PORT: 'abc' }
    expect(() => buildConfig(env)).to.throw(/PORT inválido/)
  })

  it('lanza error si NODE_ENV no es un entorno válido', () => {
    const env = { ...validEnv, NODE_ENV: 'staging' }
    expect(() => buildConfig(env)).to.throw(/NODE_ENV inválido/)
  })
})