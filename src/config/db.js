import mongoose from 'mongoose'
import { DB_CONNECTION_STATES } from '../constants/index.js'

export const connectDB = async (uri) => {
  await mongoose.connect(uri)
}

// Estado actual de la conexión (lo usa el health check), sin exponer la URI
export const getDbState = () => DB_CONNECTION_STATES[mongoose.connection.readyState] ?? 'unknown'
