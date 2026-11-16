import express from 'express'
import helmet from 'helmet'
import config from './config/index.js'
import logger from './config/logger.js'
import productsRouter from './routes/products.router.js'
import usersRouter from './routes/users.router.js'
import ordersRouter from './routes/orders.router.js'
import deliveriesRouter from './routes/deliveries.router.js'
import mocksRouter from './routes/mocks.router.js'
import loggerRouter from './routes/logger.router.js'
import healthRouter from './routes/health.router.js'
import swaggerUi from 'swagger-ui-express'
import { swaggerSpecs } from './docs/swagger.config.js'
import { requestLogger } from './middlewares/requestLogger.middleware.js'
import { notFound } from './middlewares/notFound.middleware.js'
import { createErrorHandler } from './middlewares/errorHandler.middleware.js'
import { MAX_JSON_BODY_SIZE } from './constants/index.js'

const app = express()

// Cabeceras de seguridad HTTP (nosniff, frameguard, CSP, etc.). Primero, para que
// apliquen a todas las respuestas, incluidos los errores y el health check.
// upgrade-insecure-requests se desactiva: la API puede servirse por HTTP (por ejemplo
// en Docker en localhost) y forzar HTTPS rompería los recursos de Swagger UI
app.use(
  helmet({
    contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } }
  })
)

// Health check antes del request logger: Docker o el monitoreo lo consultan cada
// pocos segundos y llenarían los logs de ruido
app.use('/api/health', healthRouter)

app.use(requestLogger) // registra todas las demás peticiones
app.use(express.json({ limit: MAX_JSON_BODY_SIZE })) // límite explícito: bodies grandes → 413

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