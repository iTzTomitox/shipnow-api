import mongoose from 'mongoose'
import { DELIVERY_STATUS } from '../constants/index.js'

const { ObjectId } = mongoose.Schema.Types

const deliverySchema = new mongoose.Schema(
  {
    // unique: un pedido tiene UNA sola entrega
    order: { type: ObjectId, ref: 'Order', required: true, unique: true },
    driver: { type: ObjectId, ref: 'User', default: null }, // null = sin repartidor
    status: {
      type: String,
      enum: Object.values(DELIVERY_STATUS),
      default: DELIVERY_STATUS.PENDING
    }
  },
  { timestamps: true }
)

const DeliveryModel = mongoose.model('Delivery', deliverySchema)

export default DeliveryModel