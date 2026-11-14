import fs from 'node:fs/promises'
import path from 'node:path'
import { expect } from 'chai'
import {
  api,
  clearDatabase,
  expectError,
  createUser,
  createDriver,
  createProduct,
  createOrder,
  createDelivery,
  NONEXISTENT_ID
} from './helpers.js'

// Los tests suben archivos a la carpeta temporal que fija tests/setup.js (nunca a uploads/)
const UPLOADS_DIR = process.env.UPLOADS_DIR

// Archivos de prueba en memoria: no hace falta tenerlos en el repo
const pdf = { buffer: Buffer.from('%PDF-1.4 documento de prueba'), filename: 'dni.pdf', contentType: 'application/pdf' }
const png = { buffer: Buffer.from('PNG imagen de prueba'), filename: 'licencia.png', contentType: 'image/png' }
const txt = { buffer: Buffer.from('texto plano'), filename: 'notas.txt', contentType: 'text/plain' }
const tooBig = { buffer: Buffer.alloc(6 * 1024 * 1024, 65), filename: 'grande.pdf', contentType: 'application/pdf' } // 6 MB

const attach = (req, field, file) =>
  req.attach(field, file.buffer, { filename: file.filename, contentType: file.contentType })

// Cuenta los archivos que hay en la carpeta de uploads (para verificar que no quedan huérfanos)
const countFiles = async () => {
  const entries = await fs.readdir(UPLOADS_DIR, { recursive: true, withFileTypes: true }).catch(() => [])
  return entries.filter((entry) => entry.isFile()).length
}

const fileExists = (filePath) => fs.access(filePath).then(() => true, () => false)

describe('Funcional: carga de archivos', () => {
  // Base y carpeta de uploads vacías antes de cada test
  beforeEach(async () => {
    await clearDatabase()
    await fs.rm(UPLOADS_DIR, { recursive: true, force: true })
  })

  describe('POST /api/users/:uid/documents', () => {
    it('sube un PDF: guarda los metadatos en el usuario y el archivo en documents/', async () => {
      const user = await createUser()
      const res = await attach(api().post(`/api/users/${user._id}/documents`), 'document', pdf)

      expect(res.status).to.equal(200)
      expect(res.body.status).to.equal('success')
      expect(res.body.payload.documents).to.have.lengthOf(1)
      const doc = res.body.payload.documents[0]
      expect(doc).to.include({
        originalName: 'dni.pdf',
        mimeType: 'application/pdf',
        size: pdf.buffer.length,
        type: 'user_document'
      })
      expect(doc).to.include.all.keys('fileName', 'path', 'uploadedAt')
      expect(doc.fileName).to.not.equal('dni.pdf') // nombre generado por el servidor
      expect(doc.path).to.include('/documents/')
      expect(await fileExists(doc.path)).to.equal(true) // el archivo está en disco
    })

    it('varios documentos se acumulan en la lista del usuario', async () => {
      const user = await createUser()
      await attach(api().post(`/api/users/${user._id}/documents`), 'document', pdf)
      const res = await attach(api().post(`/api/users/${user._id}/documents`), 'document', png)
      expect(res.status).to.equal(200)
      expect(res.body.payload.documents).to.have.lengthOf(2)
    })

    it('licencia de un repartidor: se guarda en licenses/', async () => {
      const driver = await createDriver()
      const res = await attach(api().post(`/api/users/${driver._id}/documents`), 'document', png)
        .field('type', 'driver_license')

      expect(res.status).to.equal(200)
      const doc = res.body.payload.documents[0]
      expect(doc).to.include({ type: 'driver_license', mimeType: 'image/png' })
      expect(doc.path).to.include('/licenses/')
      expect(await fileExists(doc.path)).to.equal(true)
    })

    it('sin archivo → 400 FILE_REQUIRED', async () => {
      const user = await createUser()
      const res = await api().post(`/api/users/${user._id}/documents`).field('type', 'user_document')
      expectError(res, 'FILE_REQUIRED')
    })

    it('formato no permitido (.txt) → 400 INVALID_FILE_TYPE y no guarda nada', async () => {
      const user = await createUser()
      const res = await attach(api().post(`/api/users/${user._id}/documents`), 'document', txt)
      expectError(res, 'INVALID_FILE_TYPE')
      expect(await countFiles()).to.equal(0)
    })

    it('archivo de más de 5 MB → 413 FILE_TOO_LARGE y no guarda nada', async () => {
      const user = await createUser()
      const res = await attach(api().post(`/api/users/${user._id}/documents`), 'document', tooBig)
      expectError(res, 'FILE_TOO_LARGE')
      expect(await countFiles()).to.equal(0)
    })

    it('archivo en un campo distinto de "document" → 400 UNEXPECTED_FILE_FIELD', async () => {
      const user = await createUser()
      const res = await attach(api().post(`/api/users/${user._id}/documents`), 'archivo', pdf)
      expectError(res, 'UNEXPECTED_FILE_FIELD')
      expect(res.body.details).to.equal('Campo recibido: archivo')
    })

    it('tipo de documento inválido → 400 INVALID_DOCUMENT_TYPE y borra el archivo subido', async () => {
      const user = await createUser()
      const res = await attach(api().post(`/api/users/${user._id}/documents`), 'document', pdf)
        .field('type', 'pasaporte')
      expectError(res, 'INVALID_DOCUMENT_TYPE')
      expect(await countFiles()).to.equal(0)
    })

    it('licencia para un usuario que no es repartidor → 400 INVALID_DOCUMENT_TYPE y borra el archivo', async () => {
      const user = await createUser()
      const res = await attach(api().post(`/api/users/${user._id}/documents`), 'document', pdf)
        .field('type', 'driver_license')
      expectError(res, 'INVALID_DOCUMENT_TYPE')
      expect(await countFiles()).to.equal(0)
    })

    it('usuario inexistente → 404 USER_NOT_FOUND y borra el archivo subido', async () => {
      const res = await attach(api().post(`/api/users/${NONEXISTENT_ID}/documents`), 'document', pdf)
      expectError(res, 'USER_NOT_FOUND')
      expect(await countFiles()).to.equal(0)
    })
  })

  describe('POST /api/orders/:oid/proof', () => {
    let customer
    let driver
    let order

    // Lleva el pedido hasta in_transit por el flujo real: entrega → asignar → retirar → en camino
    const moveToInTransit = async () => {
      const delivery = await createDelivery(order)
      await api().patch(`/api/deliveries/${delivery._id}/assign`).send({ driver: driver._id })
      await api().patch(`/api/orders/${order._id}/status`).send({ status: 'picked_up' })
      await api().patch(`/api/orders/${order._id}/status`).send({ status: 'in_transit' })
    }

    beforeEach(async () => {
      customer = await createUser()
      driver = await createDriver()
      const product = await createProduct()
      order = await createOrder({ customer, product })
    })

    it('pedido in_transit: guarda el comprobante en proofs/ y el pedido pasa a delivered', async () => {
      await moveToInTransit()
      const res = await attach(api().post(`/api/orders/${order._id}/proof`), 'proof', png)

      expect(res.status).to.equal(200)
      expect(res.body.payload.status).to.equal('delivered')
      expect(res.body.payload.proof).to.include({ originalName: 'licencia.png', type: 'delivery_proof', mimeType: 'image/png' })
      expect(res.body.payload.proof.path).to.include('/proofs/')
      expect(await fileExists(res.body.payload.proof.path)).to.equal(true)

      // El cambio de estado se ve en el tracking
      const tracking = await api().get(`/api/orders/${order._id}/tracking`)
      expect(tracking.body.payload.order.status).to.equal('delivered')
    })

    it('pedido delivered: reemplaza el comprobante y borra el archivo anterior', async () => {
      await moveToInTransit()
      const first = await attach(api().post(`/api/orders/${order._id}/proof`), 'proof', png)
      const oldPath = first.body.payload.proof.path

      const second = await attach(api().post(`/api/orders/${order._id}/proof`), 'proof', pdf)
      expect(second.status).to.equal(200)
      expect(second.body.payload.proof.mimeType).to.equal('application/pdf')
      expect(await fileExists(oldPath)).to.equal(false)
      expect(await fileExists(second.body.payload.proof.path)).to.equal(true)
      expect(await countFiles()).to.equal(1)
    })

    it('subidas simultáneas: el pedido queda delivered con UN comprobante y sin archivos huérfanos', async () => {
      await moveToInTransit()
      // Llegan "a la vez": la que pierde la escritura condicional responde
      // INVALID_STATUS_TRANSITION (o reemplaza, si leyó el pedido ya entregado)
      const responses = await Promise.all(
        Array.from({ length: 4 }, () => attach(api().post(`/api/orders/${order._id}/proof`), 'proof', png))
      )

      expect(responses.some((r) => r.status === 200)).to.equal(true)
      for (const res of responses.filter((r) => r.status !== 200)) {
        expect(res.status).to.equal(409)
        expect(res.body.error).to.equal('INVALID_STATUS_TRANSITION')
      }
      const saved = await api().get(`/api/orders/${order._id}`)
      expect(saved.body.payload.status).to.equal('delivered')
      expect(await fileExists(saved.body.payload.proof.path)).to.equal(true)
      expect(await countFiles()).to.equal(1) // solo el comprobante vigente
    })

    it('pedido created → 409 ORDER_NOT_DELIVERABLE y borra el archivo subido', async () => {
      const res = await attach(api().post(`/api/orders/${order._id}/proof`), 'proof', png)
      expectError(res, 'ORDER_NOT_DELIVERABLE')
      expect(await countFiles()).to.equal(0)
    })

    it('pedido inexistente → 404 ORDER_NOT_FOUND y borra el archivo subido', async () => {
      const res = await attach(api().post(`/api/orders/${NONEXISTENT_ID}/proof`), 'proof', png)
      expectError(res, 'ORDER_NOT_FOUND')
      expect(await countFiles()).to.equal(0)
    })

    it('sin archivo → 400 FILE_REQUIRED', async () => {
      const res = await api().post(`/api/orders/${order._id}/proof`).field('nota', 'sin archivo')
      expectError(res, 'FILE_REQUIRED')
    })

    it('formato no permitido → 400 INVALID_FILE_TYPE', async () => {
      await moveToInTransit()
      const res = await attach(api().post(`/api/orders/${order._id}/proof`), 'proof', txt)
      expectError(res, 'INVALID_FILE_TYPE')
    })

    it('archivo en el campo "document" → 400 UNEXPECTED_FILE_FIELD', async () => {
      const res = await attach(api().post(`/api/orders/${order._id}/proof`), 'document', pdf)
      expectError(res, 'UNEXPECTED_FILE_FIELD')
    })

    it('archivo de más de 5 MB → 413 FILE_TOO_LARGE', async () => {
      await moveToInTransit()
      const res = await attach(api().post(`/api/orders/${order._id}/proof`), 'proof', tooBig)
      expectError(res, 'FILE_TOO_LARGE')
      expect(await countFiles()).to.equal(0)
    })
  })

  // Comprueba que path.join no rompa el formato de las rutas guardadas
  it('las rutas guardadas usan "/" en cualquier sistema operativo', async () => {
    const user = await createUser()
    const res = await attach(api().post(`/api/users/${user._id}/documents`), 'document', pdf)
    expect(res.body.payload.documents[0].path).to.not.include(path.win32.sep)
  })
})
