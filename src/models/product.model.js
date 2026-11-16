import mongoose from 'mongoose'
import { PRODUCT_STATUS } from '../constants/index.js'

// Solo esquema: sin lógica de negocio
const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: Object.values(PRODUCT_STATUS), // valores salen de las constantes
      required: true
    }
  },
  { timestamps: true } // agrega createdAt y updatedAt
)

// Índices de los listados: filtro + orden de la paginación (más nuevos primero).
// MongoDB encuentra la página sin recorrer la colección entera ni ordenar en memoria
productSchema.index({ status: 1, createdAt: -1, _id: -1 }) // GET /api/products (filtra por status available)

const ProductModel = mongoose.model('Product', productSchema)

export default ProductModel