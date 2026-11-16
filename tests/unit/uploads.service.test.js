import { expect } from 'chai'
import UsersService from '../../src/services/users.service.js'
import OrdersService from '../../src/services/orders.service.js'
import { buildFileMetadata } from '../../src/utils/files.js'
import { DOCUMENT_TYPES, ORDER_STATUS, USER_ROLES } from '../../src/constants/index.js'
import { catchError } from './helpers.js'

// Tests unitarios de la carga de archivos: a qué carpeta va cada archivo, qué
// metadatos se guardan y, sobre todo, que ningún rechazo deje archivos huérfanos.
// Se usa un fileStorage falso: no se toca el disco.

// Archivo tal como lo deja Multer en req.file (ya guardado en disco)
const uploadedFile = (overrides = {}) => ({
  originalname: 'dni.pdf',
  mimetype: 'application/pdf',
  size: 1234,
  path: 'uploads/documents/123-abc.pdf',
  ...overrides
})

// fileStorage falso: anota qué se borró y qué se movió
const createFakeFiles = () => {
  const files = { removed: [], moved: [] }
  files.removeFile = async (filePath) => { files.removed.push(filePath) }
  files.moveFile = async (filePath, folder) => {
    files.moved.push({ filePath, folder })
    return `uploads/${folder}/123-abc.pdf`
  }
  return files
}

it('buildFileMetadata arma los metadatos que se guardan en MongoDB (nunca el archivo)', () => {
  const meta = buildFileMetadata(uploadedFile(), DOCUMENT_TYPES.USER_DOCUMENT)
  expect(meta).to.include({
    originalName: 'dni.pdf',
    fileName: '123-abc.pdf',
    path: 'uploads/documents/123-abc.pdf',
    mimeType: 'application/pdf',
    size: 1234,
    type: 'user_document'
  })
  expect(meta.uploadedAt).to.be.instanceOf(Date)
})

describe('UsersService.addDocument', () => {
  const USERS = { u1: { _id: 'u1', role: USER_ROLES.USER }, d1: { _id: 'd1', role: USER_ROLES.DRIVER } }

  const createService = () => {
    const calls = {}
    const repository = {
      findById: async (id) => USERS[id] ?? null,
      addDocument: async (id, document) => {
        calls.addDocument = document
        return { _id: id, documents: [document] }
      }
    }
    const files = createFakeFiles()
    return { service: new UsersService(repository, files), calls, files }
  }

  it('sin type guarda un user_document donde lo dejó Multer, sin mover nada', async () => {
    const { service, calls, files } = createService()
    await service.addDocument('u1', uploadedFile(), undefined)
    expect(calls.addDocument).to.include({ type: 'user_document', path: 'uploads/documents/123-abc.pdf' })
    expect(files.moved).to.be.empty
  })

  it('licencia de un repartidor: se mueve a licenses/ y se guarda la ruta nueva', async () => {
    const { service, calls, files } = createService()
    await service.addDocument('d1', uploadedFile(), DOCUMENT_TYPES.DRIVER_LICENSE)
    expect(files.moved).to.deep.equal([{ filePath: 'uploads/documents/123-abc.pdf', folder: 'licenses' }])
    expect(calls.addDocument).to.include({ type: 'driver_license', path: 'uploads/licenses/123-abc.pdf' })
  })

  it('cada rechazo borra el archivo subido (no quedan huérfanos)', async () => {
    const rejections = [
      ['u1', 'pasaporte', 'INVALID_DOCUMENT_TYPE'],
      ['u1', DOCUMENT_TYPES.DELIVERY_PROOF, 'INVALID_DOCUMENT_TYPE'], // es de pedidos
      ['u1', DOCUMENT_TYPES.DRIVER_LICENSE, 'INVALID_DOCUMENT_TYPE'], // no es repartidor
      ['nope', undefined, 'USER_NOT_FOUND']
    ]
    for (const [userId, type, code] of rejections) {
      const { service, files } = createService()
      const error = await catchError(() => service.addDocument(userId, uploadedFile(), type))
      expect(error.code, `${userId} ${type}`).to.equal(code)
      expect(files.removed, `${userId} ${type}`).to.deep.equal(['uploads/documents/123-abc.pdf'])
    }
  })
})

describe('OrdersService.addProof', () => {
  // orderStatus y previousProof definen el pedido "o1" guardado
  const createService = ({ orderStatus = ORDER_STATUS.IN_TRANSIT, previousProof = null, setProofResult } = {}) => {
    const calls = {}
    const ordersRepository = {
      findById: async (id) => (id === 'o1' ? { _id: 'o1', status: orderStatus, proof: previousProof } : null),
      setProof: async (id, from, proof, to) => {
        calls.setProof = { id, from, proof, to }
        return setProofResult !== undefined ? setProofResult : { _id: id, status: to, proof }
      }
    }
    const files = createFakeFiles()
    return { service: new OrdersService({ ordersRepository, files }), calls, files }
  }

  const proofFile = () => uploadedFile({ originalname: 'firma.jpg', mimetype: 'image/jpeg', path: 'uploads/proofs/999-xyz.jpg' })

  it('pedido in_transit: guarda el comprobante y lo pasa a delivered con escritura condicional', async () => {
    const { service, calls, files } = createService({ orderStatus: ORDER_STATUS.IN_TRANSIT })
    const updated = await service.addProof('o1', proofFile())
    expect(calls.setProof).to.include({ id: 'o1', from: 'in_transit', to: 'delivered' })
    expect(calls.setProof.proof).to.include({ type: 'delivery_proof', path: 'uploads/proofs/999-xyz.jpg' })
    expect(updated.status).to.equal('delivered')
    expect(files.removed).to.be.empty
  })

  it('pedido delivered con comprobante previo: lo reemplaza y borra el archivo anterior', async () => {
    const { service, files } = createService({ orderStatus: ORDER_STATUS.DELIVERED, previousProof: { path: 'uploads/proofs/viejo.jpg' } })
    await service.addProof('o1', proofFile())
    expect(files.removed).to.deep.equal(['uploads/proofs/viejo.jpg'])
  })

  it('cada rechazo borra el archivo subido (estado no válido, pedido inexistente, carrera)', async () => {
    const rejections = [
      ...[ORDER_STATUS.CREATED, ORDER_STATUS.ASSIGNED, ORDER_STATUS.PICKED_UP, ORDER_STATUS.CANCELLED]
        .map((orderStatus) => [{ orderStatus }, 'o1', 'ORDER_NOT_DELIVERABLE']),
      [{}, 'nope', 'ORDER_NOT_FOUND'],
      [{ setProofResult: null }, 'o1', 'INVALID_STATUS_TRANSITION'] // el estado cambió en el medio
    ]
    for (const [options, orderId, code] of rejections) {
      const { service, files } = createService(options)
      const error = await catchError(() => service.addProof(orderId, proofFile()))
      expect(error.code, JSON.stringify(options)).to.equal(code)
      expect(files.removed, JSON.stringify(options)).to.deep.equal(['uploads/proofs/999-xyz.jpg'])
    }
  })
})
