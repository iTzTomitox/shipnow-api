import mongoose from 'mongoose'
import { DOCUMENT_TYPES } from '../constants/index.js'

// Metadatos de un archivo subido. El archivo vive en disco: en MongoDB solo
// se guarda dónde está y qué es. Lo reutilizan User (documents) y Order (proof).
const fileMetadataSchema = new mongoose.Schema(
  {
    originalName: { type: String, required: true },
    fileName: { type: String, required: true },
    path: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true, min: 0 }, // bytes
    type: { type: String, enum: Object.values(DOCUMENT_TYPES), required: true },
    uploadedAt: { type: Date, default: Date.now }
  },
  { _id: false } // no se consultan sueltos
)

export default fileMetadataSchema