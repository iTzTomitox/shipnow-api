import express from 'express'
import config from './config/index.js'
import logger from './config/logger.js'
import productsRouter from './routes/products.router.js'
import usersRouter from './routes/users.router.js'
import ordersRouter from './routes/orders.router.js'
import deliveriesRouter from './routes/deliveries.router.js'
import mocksRouter from './routes/mocks.router.js'
import loggerRouter from './routes/logger.router.js'
import swaggerUi from 'swagger-ui-express'
import { swaggerSpecs } from './docs/swagger.config.js'
import { requestLogger } from './middlewares/requestLogger.middleware.js'
import { notFound } from './middlewares/notFound.middleware.js'
import { createErrorHandler } from './middlewares/errorHandler.middleware.js'

const app = express()
app.use(requestLogger) // primero: registra todas las peticiones
app.use(express.json())

app.use('/api/products', productsRouter)
app.use('/api/orders', ordersRouter)
app.use('/api/users', usersRouter)
app.use('/api/deliveries', deliveriesRouter)

// Documentación interactiva (OpenAPI). Disponible en todos los entornos.
app.get('/api/docs.json', (req, res) => res.json(swaggerSpecs)) // especificación cruda
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs))

// Herramientas internas: no se exponen en producción
if (config.nodeEnv !== 'production') {
  app.use('/api/mocks', mocksRouter)
  app.use('/api', loggerRouter) // GET /api/loggerTest
}

app.use(notFound)

app.use(createErrorHandler({ exposeDetails: config.nodeEnv !== 'production', logger }))

export default app