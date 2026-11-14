import { Router } from 'express'
import {
  getOrders,
  getOrderById,
  createOrder,
  updateOrderStatus,
  getOrderTracking,
  addOrderProof
} from '../controllers/orders.controller.js'
import { uploadDeliveryProof } from '../middlewares/upload.middleware.js'

const router = Router()

router.get('/', getOrders)
router.get('/:oid', getOrderById)
router.get('/:oid/tracking', getOrderTracking)
router.post('/', createOrder)
router.patch('/:oid/status', updateOrderStatus)
router.post('/:oid/proof', uploadDeliveryProof, addOrderProof) // multipart/form-data, campo "proof"

export default router