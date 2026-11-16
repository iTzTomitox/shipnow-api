import { expect } from 'chai'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const run = promisify(execFile)

// app.js decide qué montar al importarse (según config.nodeEnv), y la suite ya la importó en
// modo test. Por eso se levanta en un proceso aparte con NODE_ENV=production y se le hacen
// las requests desde adentro (no hace falta base: ninguna de estas rutas consulta MongoDB).

// Rutas absolutas: el proceso corre en otra carpeta (ver CWD)
const SUPERTEST = import.meta.resolve('supertest')
const APP = import.meta.resolve('../../src/app.js')

// En producción el logger escribe en ./logs: el proceso corre en una carpeta de caché
// para no crear logs dentro del proyecto
const CWD = path.resolve('node_modules/.cache/shipnow-production-test')

const SCRIPT = `
  const { default: request } = await import('${SUPERTEST}')
  const { default: app } = await import('${APP}')
  const get = async (path) => {
    const res = await request(app).get(path)
    return { status: res.status, body: res.body }
  }
  const result = {
    mocks: await get('/api/mocks/users'),
    loggerTest: await get('/api/loggerTest'),
    docs: await get('/api/docs.json')
  }
  process.stdout.write(JSON.stringify(result))
`

describe('Funcional: modo producción', () => {
  let result

  before(async () => {
    const env = { ...process.env, NODE_ENV: 'production', PORT: '8080', MONGODB_URI: 'mongodb://localhost/no-se-usa', LOG_LEVEL: 'fatal' }
    mkdirSync(CWD, { recursive: true })
    const { stdout } = await run(process.execPath, ['--input-type=module', '-e', SCRIPT], { env, cwd: CWD })
    result = JSON.parse(stdout.slice(stdout.indexOf('{"mocks"'))) // ignora cualquier línea de log previa
  })

  it('no monta las herramientas internas: mocks y loggerTest responden 404, sin details', () => {
    for (const res of [result.mocks, result.loggerTest]) {
      expect(res.status).to.equal(404)
      expect(res.body).to.include({ status: 'error', error: 'ROUTE_NOT_FOUND' })
      expect(res.body).to.not.have.property('details') // en producción no se exponen detalles
    }
  })

  it('Swagger documenta el negocio y el health check, pero no las herramientas internas', () => {
    const { paths, tags } = result.docs.body
    expect(paths).to.include.keys('/api/health', '/api/users', '/api/orders')
    expect(Object.keys(paths).filter((p) => p.includes('mocks') || p.includes('loggerTest'))).to.be.empty
    const tagNames = tags.map((tag) => tag.name)
    expect(tagNames).to.not.include('Mocks')
    expect(tagNames).to.not.include('Logger')
  })
})
