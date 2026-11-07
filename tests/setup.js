import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
o.
process.env.NODE_ENV = 'test'
process.env.PORT ??= '3001'
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/shipnow_test'

let mongoServer

export const mochaHooks = {
  async beforeAll() {
    this.timeout(120000) // la primera vez descarga el binario de MongoDB
    mongoServer = await MongoMemoryServer.create()
    await mongoose.connect(mongoServer.getUri())
  },

  async afterAll() {
    await mongoose.disconnect()
    await mongoServer?.stop()
  }
}