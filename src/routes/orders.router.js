import { Router } from 'express'
import {
  getOrders,
  getOrderById,
  createOrder,
  updateOrderStatus,
  getOrderTracking
} from '../controllers/orders.controller.js'

const router = Router()

router.get('/', getOrders)
router.get('/:oid', getOrderById)
router.get('/:oid/tracking', getOrderTracking)
router.post('/', createOrder)
router.patch('/:oid/status', updateOrderStatus)

export default router