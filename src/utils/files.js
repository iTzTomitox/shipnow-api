import fs from 'node:fs/promises'
import path from 'node:path'
import logger from '../config/logger.js'

// Ruta con "/" siempre, igual en Windows que en Linux/Docker
const toPosix = (filePath) => filePath.split(path.sep).join('/')

// Metadatos que se guardan en MongoDB (el archivo queda en disco)
export const buildFileMetadata = (file, type, filePath = file.path) => ({
  originalName: file.originalname,
  fileName: path.basename(filePath),
  path: toPosix(filePath),
  mimeType: file.mimetype,
  size: file.size,
  type,
  uploadedAt: new Date()
})

// Borra un archivo sin cortar el flujo si falla (si ya no existe, no es un problema)
const removeFile = async (filePath) => {
  if (!filePath) return
  try {
    await fs.unlink(filePath)
  } catch (error) {
    if (error.code !== 'ENOENT') logger.warning(`No se pudo borrar ${filePath}: ${error.message}`)
  }
}

// Mueve un archivo a una carpeta hermana (ej.: uploads/documents → uploads/licenses)
const moveFile = async (filePath, folderName) => {
  const targetDir = path.join(path.dirname(path.dirname(filePath)), folderName)
  await fs.mkdir(targetDir, { recursive: true })
  const target = path.join(targetDir, path.basename(filePath))
  await fs.rename(filePath, target)
  return target
}

// Operaciones de disco agrupadas: los services las reciben por inyección
// (en los tests se reemplazan por dobles que no tocan el disco)
export const fileStorage = Object.freeze({ removeFile, moveFile })