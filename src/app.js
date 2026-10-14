import express from 'express'
import config from './config/index.js'
import productsRouter from './routes/products.router.js'
import usersRouter from './routes/users.router.js'
import ordersRouter from './routes/orders.router.js'
import mocksRouter from './routes/mocks.router.js'
import { notFound } from './middlewares/notFound.middleware.js'
import { createErrorHandler } from './middlewares/errorHandler.middleware.js'

const app = express()

app.use(express.json())

app.use('/api/products', productsRouter)
app.use('/api/orders', ordersRouter)
app.use('/api/users', usersRouter)

if (config.nodeEnv !== 'production') {
  app.use('/api/mocks', mocksRouter)
}

app.use(notFound)

app.use(createErrorHandler({ exposeDetails: config.nodeEnv !== 'production' }))

export default app