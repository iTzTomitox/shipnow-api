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

// Índices de los listados: filtro + orden de la paginación (más nuevos primero).
// MongoDB encuentra la página sin recorrer la colección entera ni ordenar en memoria
deliverySchema.index({ status: 1, createdAt: -1, _id: -1 }) // GET /api/deliveries?status=pending
deliverySchema.index({ driver: 1, createdAt: -1, _id: -1 }) // GET /api/deliveries?driver=ID

const DeliveryModel = mongoose.model('Delivery', deliverySchema)

export default DeliveryModel