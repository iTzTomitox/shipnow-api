import { Router } from 'express'
import {
  getDeliveries,
  getDeliveryById,
  createDelivery,
  assignDriver
} from '../controllers/deliveries.controller.js'

const router = Router()

router.get('/', getDeliveries)
router.get('/:did', getDeliveryById)
router.post('/', createDelivery)
router.patch('/:did/assign', assignDriver)

export default router