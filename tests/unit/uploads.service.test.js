import { expect } from 'chai'
import UsersService from '../../src/services/users.service.js'
import OrdersService from '../../src/services/orders.service.js'
import { buildFileMetadata } from '../../src/utils/files.js'
import { DOCUMENT_TYPES, ORDER_STATUS, USER_ROLES } from '../../src/constants/index.js'

// Archivo tal como lo deja Multer en req.file (ya guardado en disco)
const uploadedFile = (overrides = {}) => ({
  originalname: 'dni.pdf',
  mimetype: 'application/pdf',
  size: 1234,
  path: 'uploads/documents/123-abc.pdf',
  ...overrides
})

// fileStorage falso: anota qué se borró y qué se movió, sin tocar el disco
const createFakeFiles = () => {
  const files = { removed: [], moved: [] }
  files.removeFile = async (filePath) => { files.removed.push(filePath) }
  files.moveFile = async (filePath, folder) => {
    files.moved.push({ filePath, folder })
    return `uploads/${folder}/123-abc.pdf`
  }
  return files
}

const catchError = async (fn) => {
  try {
    await fn()
  } catch (error) {
    return error
  }
  throw new Error('Se esperaba que lanzara un error')
}

describe('buildFileMetadata', () => {
  it('arma los metadatos que se guardan en MongoDB (nunca el archivo)', () => {
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
})

describe('UsersService.addDocument', () => {
  const USERS = {
    u1: { _id: 'u1', role: USER_ROLES.USER },
    d1: { _id: 'd1', role: USER_ROLES.DRIVER }
  }

  const createService = () => {
    const calls = {}
    const repository = {
      findById: async (id) => USERS[id] ?? null,
      addDocument: async (id, document) => {
        calls.addDocument = { id, document }
        return { _id: id, documents: [document] }
      }
    }
    const files = createFakeFiles()
    return { service: new UsersService(repository, files), calls, files }
  }

  it('sin archivo → FILE_REQUIRED (no hay nada que borrar)', async () => {
    const { service, files } = createService()
    const error = await catchError(() => service.addDocument('u1', undefined, undefined))
    expect(error.code).to.equal('FILE_REQUIRED')
    expect(files.removed).to.be.empty
  })

  it('sin type guarda un user_document en documents/', async () => {
    const { service, calls, files } = createService()
    await service.addDocument('u1', uploadedFile(), undefined)
    expect(calls.addDocument.document).to.include({ type: 'user_document', path: 'uploads/documents/123-abc.pdf' })
    expect(files.moved).to.be.empty
    expect(files.removed).to.be.empty
  })

  it('licencia de un repartidor: se mueve a licenses/ y se guarda la ruta nueva', async () => {
    const { service, calls, files } = createService()
    await service.addDocument('d1', uploadedFile(), DOCUMENT_TYPES.DRIVER_LICENSE)
    expect(files.moved).to.deep.equal([{ filePath: 'uploads/documents/123-abc.pdf', folder: 'licenses' }])
    expect(calls.addDocument.document).to.include({
      type: 'driver_license',
      path: 'uploads/licenses/123-abc.pdf',
      fileName: '123-abc.pdf'
    })
  })

  it('tipo de documento inválido → INVALID_DOCUMENT_TYPE y borra el archivo subido', async () => {
    const { service, files } = createService()
    const error = await catchError(() => service.addDocument('u1', uploadedFile(), 'pasaporte'))
    expect(error.code).to.equal('INVALID_DOCUMENT_TYPE')
    expect(files.removed).to.deep.equal(['uploads/documents/123-abc.pdf'])
  })

  it('delivery_proof no es un documento de usuario → INVALID_DOCUMENT_TYPE', async () => {
    const { service } = createService()
    const error = await catchError(() => service.addDocument('u1', uploadedFile(), DOCUMENT_TYPES.DELIVERY_PROOF))
    expect(error.code).to.equal('INVALID_DOCUMENT_TYPE')
  })

  it('licencia para un usuario que no es repartidor → INVALID_DOCUMENT_TYPE y borra el archivo', async () => {
    const { service, files } = createService()
    const error = await catchError(() => service.addDocument('u1', uploadedFile(), DOCUMENT_TYPES.DRIVER_LICENSE))
    expect(error.code).to.equal('INVALID_DOCUMENT_TYPE')
    expect(files.removed).to.deep.equal(['uploads/documents/123-abc.pdf'])
  })

  it('usuario inexistente → USER_NOT_FOUND y borra el archivo', async () => {
    const { service, files } = createService()
    const error = await catchError(() => service.addDocument('nope', uploadedFile(), undefined))
    expect(error.code).to.equal('USER_NOT_FOUND')
    expect(files.removed).to.deep.equal(['uploads/documents/123-abc.pdf'])
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
    const service = new OrdersService({ ordersRepository, files })
    return { service, calls, files }
  }

  const proofFile = () => uploadedFile({ originalname: 'firma.jpg', mimetype: 'image/jpeg', path: 'uploads/proofs/999-xyz.jpg' })

  it('sin archivo → FILE_REQUIRED', async () => {
    const { service } = createService()
    const error = await catchError(() => service.addProof('o1', undefined))
    expect(error.code).to.equal('FILE_REQUIRED')
  })

  it('pedido in_transit: guarda el comprobante y lo pasa a delivered (escritura condicional)', async () => {
    const { service, calls, files } = createService({ orderStatus: ORDER_STATUS.IN_TRANSIT })
    const updated = await service.addProof('o1', proofFile())
    expect(calls.setProof).to.include({ id: 'o1', from: 'in_transit', to: 'delivered' })
    expect(calls.setProof.proof).to.include({ type: 'delivery_proof', path: 'uploads/proofs/999-xyz.jpg' })
    expect(updated.status).to.equal('delivered')
    expect(files.removed).to.be.empty
  })

  it('pedido delivered con comprobante previo: lo reemplaza y borra el archivo anterior', async () => {
    const previousProof = { path: 'uploads/proofs/viejo.jpg' }
    const { service, calls, files } = createService({ orderStatus: ORDER_STATUS.DELIVERED, previousProof })
    await service.addProof('o1', proofFile())
    expect(calls.setProof).to.include({ from: 'delivered', to: 'delivered' })
    expect(files.removed).to.deep.equal(['uploads/proofs/viejo.jpg'])
  })

  for (const status of [ORDER_STATUS.CREATED, ORDER_STATUS.ASSIGNED, ORDER_STATUS.PICKED_UP, ORDER_STATUS.CANCELLED]) {
    it(`pedido ${status} → ORDER_NOT_DELIVERABLE y borra el archivo subido`, async () => {
      const { service, files } = createService({ orderStatus: status })
      const error = await catchError(() => service.addProof('o1', proofFile()))
      expect(error.code).to.equal('ORDER_NOT_DELIVERABLE')
      expect(files.removed).to.deep.equal(['uploads/proofs/999-xyz.jpg'])
    })
  }

  it('pedido inexistente → ORDER_NOT_FOUND y borra el archivo subido', async () => {
    const { service, files } = createService()
    const error = await catchError(() => service.addProof('nope', proofFile()))
    expect(error.code).to.equal('ORDER_NOT_FOUND')
    expect(files.removed).to.deep.equal(['uploads/proofs/999-xyz.jpg'])
  })

  it('si el estado cambió en el medio → INVALID_STATUS_TRANSITION y borra el archivo subido', async () => {
    const { service, files } = createService({ setProofResult: null })
    const error = await catchError(() => service.addProof('o1', proofFile()))
    expect(error.code).to.equal('INVALID_STATUS_TRANSITION')
    expect(files.removed).to.deep.equal(['uploads/proofs/999-xyz.jpg'])
  })
})
