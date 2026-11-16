import mongoose from 'mongoose'
import { ORDER_STATUS, DELIVERY_PRIORITY } from '../constants/index.js'
import fileMetadataSchema from './fileMetadata.schema.js'

const { ObjectId } = mongoose.Schema.Types

const itemSchema = new mongoose.Schema(
  {
    product: { type: ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 }
  },
  { _id: false } // los items no necesitan id propio
)

const orderSchema = new mongoose.Schema(
  {
    customer: { type: ObjectId, ref: 'User', required: true },
    items: {
      type: [itemSchema],
      validate: {
        validator: (items) => items.length > 0,
        message: 'El pedido debe tener al menos un item'
      }
    },
    deliveryAddress: { type: String, required: true, trim: true },
    total: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: Object.values(ORDER_STATUS),
      default: ORDER_STATUS.CREATED
    },
    priority: {
      type: String,
      enum: Object.values(DELIVERY_PRIORITY),
      default: DELIVERY_PRIORITY.NORMAL
        },
    proof: { type: fileMetadataSchema, default: null } // comprobante de entrega (solo metadatos)
  },
  { timestamps: true }
)

// Índices de los listados: filtro + orden de la paginación (más nuevos primero).
// MongoDB encuentra la página sin recorrer la colección entera ni ordenar en memoria
orderSchema.index({ status: 1, createdAt: -1, _id: -1 }) // GET /api/orders?status=created

const OrderModel = mongoose.model('Order', orderSchema)

export default OrderModel