import { Router } from 'express'
import {
  getMockUsers,
  getMockProducts,
  getMockOrders,
  seedMocks
} from '../controllers/mocks.controller.js'

const router = Router()

router.get('/users', getMockUsers)
router.get('/mockingusers', getMockUsers)

router.get('/products', getMockProducts)
router.get('/mockingproducts', getMockProducts)

router.get('/orders', getMockOrders)
router.get('/mockingorders', getMockOrders)

router.post('/seed', seedMocks)
router.post('/generateData', seedMocks)

export default router