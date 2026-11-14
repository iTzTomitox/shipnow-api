import { Router } from 'express'
import { uploadUserDocument } from '../middlewares/upload.middleware.js'
import {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  addUserDocument
} from '../controllers/users.controller.js'

const router = Router()

router.get('/', getUsers)
router.get('/:uid', getUserById)
router.post('/', createUser)
router.put('/:uid', updateUser)
router.delete('/:uid', deleteUser)
router.post('/:uid/documents', uploadUserDocument, addUserDocument) // multipart/form-data, campo "document"

export default router