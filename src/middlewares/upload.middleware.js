import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import multer from 'multer'
import config from '../config/index.js'
import AppError from '../errors/AppError.js'
import { ALLOWED_FILE_TYPES, MAX_FILE_SIZE_MB, UPLOAD_FOLDERS, DOCUMENT_TYPES } from '../constants/index.js'

// Carpeta de destino según el tipo de documento (se crea si no existe)
export const uploadFolder = (documentType) => {
  const folder = path.join(config.uploadsDir, UPLOAD_FOLDERS[documentType])
  fs.mkdirSync(folder, { recursive: true })
  return folder
}

const createUploader = (documentType) =>
  multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadFolder(documentType)),
      // Nombre generado por nosotros (nunca el del cliente): fecha + id aleatorio + extensión según el formato
      filename: (req, file, cb) =>
        cb(null, `${Date.now()}-${crypto.randomUUID()}${ALLOWED_FILE_TYPES[file.mimetype]}`)
    }),
    // Se decide ANTES de guardar: un formato no permitido nunca llega al disco
    fileFilter: (req, file, cb) => {
      if (ALLOWED_FILE_TYPES[file.mimetype]) return cb(null, true)
      cb(new AppError('INVALID_FILE_TYPE', `Formato recibido: ${file.mimetype}`))
    },
    limits: {
      fileSize: MAX_FILE_SIZE_MB * 1024 * 1024, // se corta mientras se recibe
      files: 1
    }
  })

// Un middleware por endpoint: el nombre del campo de archivo es parte del contrato de la API
export const uploadUserDocument = createUploader(DOCUMENT_TYPES.USER_DOCUMENT).single('document')
export const uploadDeliveryProof = createUploader(DOCUMENT_TYPES.DELIVERY_PROOF).single('proof')