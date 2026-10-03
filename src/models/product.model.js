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

const ProductModel = mongoose.model('Product', productSchema)

export default ProductModel