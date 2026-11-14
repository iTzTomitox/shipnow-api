import mongoose from 'mongoose'
import { USER_ROLES } from '../constants/index.js'
import fileMetadataSchema from './fileMetadata.schema.js'

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    role: {
      type: String,
      enum: Object.values(USER_ROLES), 
      default: USER_ROLES.USER
        },
    documents: { type: [fileMetadataSchema], default: [] } // documentos subidos (solo metadatos)
  },
  { timestamps: true }
)

const UserModel = mongoose.model('User', userSchema)

export default UserModel