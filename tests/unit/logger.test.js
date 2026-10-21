import { expect } from 'chai'
import { resolveLoggerOptions, createLogger } from '../../src/config/logger.js'
import { LOG_LEVELS } from '../../src/constants/index.js'

describe('logger', () => {
  describe('resolveLoggerOptions', () => {
    it('development: desde debug, con consola y los dos archivos', () => {
      const options = resolveLoggerOptions({ nodeEnv: 'development', logLevel: 'debug' })
      expect(options).to.deep.equal({
        level: 'debug',
        silent: false,
        console: true,
        files: [
          { name: 'error', level: 'error' },
          { name: 'combined', level: 'info' }
        ]
      })
    })

    it('production: desde info y SIN consola', () => {
      const options = resolveLoggerOptions({ nodeEnv: 'production', logLevel: 'info' })
      expect(options.level).to.equal('info')
      expect(options.console).to.equal(false)
      expect(options.files).to.have.lengthOf(2)
    })

    it('test: silencioso, sin consola ni archivos', () => {
      const options = resolveLoggerOptions({ nodeEnv: 'test', logLevel: 'debug' })
      expect(options).to.include({ silent: true, console: false })
      expect(options.files).to.be.empty
    })

    it('error.log solo recibe error y fatal (los dos niveles más importantes)', () => {
      const { files } = resolveLoggerOptions({ nodeEnv: 'production', logLevel: 'info' })
      const errorFile = files.find((f) => f.name === 'error')
      const included = Object.keys(LOG_LEVELS).filter((l) => LOG_LEVELS[l] <= LOG_LEVELS[errorFile.level])
      expect(included).to.have.members(['fatal', 'error'])
    })
  })

  describe('createLogger', () => {
    it('expone un método por cada nivel', () => {
      const logger = createLogger({ nodeEnv: 'test', logLevel: 'debug' })
      for (const level of Object.keys(LOG_LEVELS)) {
        expect(logger[level], level).to.be.a('function')
      }
    })
  })
})