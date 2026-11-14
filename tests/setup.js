// Se ejecuta ANTES de toda la suite (lo carga .mocharc.json).
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

// Entorno de testing fijado antes de que la app lea el .env:
// dotenv no pisa variables ya definidas, así los tests NUNCA usan la base de desarrollo.
process.env.NODE_ENV = 'test'
process.env.PORT ??= '3001'
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/shipnow_test'

// Los archivos que suben los tests van a una carpeta temporal del sistema, nunca a uploads/
const TEST_UPLOADS_DIR = path.join(os.tmpdir(), 'shipnow-test-uploads')
process.env.UPLOADS_DIR = TEST_UPLOADS_DIR

// Datos del MongoDB de testing en el mismo disco que el proyecto (dentro de node_modules,
// ignorado por git): los tests no dependen del espacio libre en la carpeta temporal del sistema.
// MongoDB se niega a crear índices con menos de 500 MB libres.
const TEST_DB_PATH = path.resolve('node_modules', '.cache', 'mongodb-memory-server', `test-db-${process.pid}`)

let mongoServer

// Root hooks: corren UNA sola vez para toda la suite.
// Los tests funcionales usan un MongoDB real pero temporal, en memoria.
export const mochaHooks = {
  async beforeAll() {
    this.timeout(120000) // la primera vez descarga el binario de MongoDB
    await fs.rm(TEST_UPLOADS_DIR, { recursive: true, force: true }) // arranca limpia
    await fs.mkdir(TEST_DB_PATH, { recursive: true })

    mongoServer = await MongoMemoryServer.create({ instance: { dbPath: TEST_DB_PATH } })
    await mongoose.connect(mongoServer.getUri())

    // Crea los índices (email único, una entrega por pedido) ANTES de los tests.
    // Si MongoDB no puede crearlos, la suite corta acá con el motivo real,
    // en vez de fallar después en tests de concurrencia.
    await mongoose.syncIndexes()
  },

  async afterAll() {
    await mongoose.disconnect()
    await mongoServer?.stop({ doCleanup: true, force: true })
    await fs.rm(TEST_DB_PATH, { recursive: true, force: true }) // no deja datos de prueba
    await fs.rm(TEST_UPLOADS_DIR, { recursive: true, force: true }) // no deja archivos de prueba
  }
}