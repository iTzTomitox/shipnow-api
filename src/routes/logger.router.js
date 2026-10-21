import { Router } from 'express'
import { testLogger } from '../controllers/logger.controller.js'

const router = Router()

router.get('/loggerTest', testLogger)

export default router