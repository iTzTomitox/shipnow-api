import express from 'express'
import productsRouter from './routes/products.router.js'
import { httpError } from './utils/httpError.js'

const app = express()

app.use(express.json())

app.use('/api/products', productsRouter)

app.use((req, res, next) => {
  next(httpError(404, `Ruta no encontrada: ${req.method} ${req.originalUrl}`))
})

app.use((err, req, res, next) => {
  const status = err.status ?? 500
  const message = status === 500 ? 'Error interno del servidor' : err.message
  res.status(status).json({ status: 'error', message })
})

export default app