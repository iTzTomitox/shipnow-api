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

let mongoServer

// Root hooks: corren UNA sola vez para toda la suite.
// Los tests funcionales usan un MongoDB real pero temporal, en memoria.
export const mochaHooks = {
  async beforeAll() {
    this.timeout(120000) // la primera vez descarga el binario de MongoDB
    await fs.rm(TEST_UPLOADS_DIR, { recursive: true, force: true }) // arranca limpia
    mongoServer = await MongoMemoryServer.create()
    await mongoose.connect(mongoServer.getUri())
  },

  async afterAll() {
    await mongoose.disconnect()
    await mongoServer?.stop()
    await fs.rm(TEST_UPLOADS_DIR, { recursive: true, force: true }) // no deja archivos de prueba
  }
}