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
    it('sube documentos: metadatos en el usuario, archivo en documents/ y la lista se acumula', async () => {
      const user = await createUser()
      const res = await attach(api().post(`/api/users/${user._id}/documents`), 'document', pdf)

      expect(res.status).to.equal(200)
      const doc = res.body.payload.documents[0]
      expect(doc).to.include({ originalName: 'dni.pdf', mimeType: 'application/pdf', size: pdf.buffer.length, type: 'user_document' })
      expect(doc).to.include.all.keys('fileName', 'path', 'uploadedAt')
      expect(doc.fileName).to.not.equal('dni.pdf') // nombre generado por el servidor
      expect(doc.path).to.include('/documents/').and.not.include(path.win32.sep) // ruta con "/" en cualquier SO
      expect(await fileExists(doc.path)).to.equal(true)

      const second = await attach(api().post(`/api/users/${user._id}/documents`), 'document', png)
      expect(second.body.payload.documents).to.have.lengthOf(2)
    })

    it('licencia de un repartidor: se guarda en licenses/', async () => {
      const driver = await createDriver()
      const res = await attach(api().post(`/api/users/${driver._id}/documents`), 'document', png).field('type', 'driver_license')

      expect(res.status).to.equal(200)
      const doc = res.body.payload.documents[0]
      expect(doc).to.include({ type: 'driver_license', mimeType: 'image/png' })
      expect(doc.path).to.include('/licenses/')
      expect(await fileExists(doc.path)).to.equal(true)
    })

    it('archivos inválidos (falta, formato, tamaño, campo) → error y no se guarda nada', async () => {
      const user = await createUser()
      const url = `/api/users/${user._id}/documents`

      expectError(await api().post(`/api/users/${user._id}/documents`).field('type', 'user_document'), 'FILE_REQUIRED')
      expectError(await attach(api().post(url), 'document', txt), 'INVALID_FILE_TYPE')
      expectError(await attach(api().post(url), 'document', tooBig), 'FILE_TOO_LARGE')
      const wrongField = await attach(api().post(`/api/users/${user._id}/documents`), 'archivo', pdf)
      expectError(wrongField, 'UNEXPECTED_FILE_FIELD')
      expect(wrongField.body.details).to.equal('Campo recibido: archivo')

      expect(await countFiles()).to.equal(0)
    })

    it('tipo inválido, licencia para un no-repartidor o usuario inexistente → error y el archivo subido se borra', async () => {
      const user = await createUser()
      expectError(await attach(api().post(`/api/users/${user._id}/documents`), 'document', pdf).field('type', 'pasaporte'), 'INVALID_DOCUMENT_TYPE')
      expectError(await attach(api().post(`/api/users/${user._id}/documents`), 'document', pdf).field('type', 'driver_license'), 'INVALID_DOCUMENT_TYPE')
      expectError(await attach(api().post(`/api/users/${NONEXISTENT_ID}/documents`), 'document', pdf), 'USER_NOT_FOUND')

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

      const tracking = await api().get(`/api/orders/${order._id}/tracking`)
      expect(tracking.body.payload.order.status).to.equal('delivered')
    })

    it('pedido delivered: reemplaza el comprobante y borra el archivo anterior', async () => {
      await moveToInTransit()
      const first = await attach(api().post(`/api/orders/${order._id}/proof`), 'proof', png)
      const second = await attach(api().post(`/api/orders/${order._id}/proof`), 'proof', pdf)

      expect(second.status).to.equal(200)
      expect(second.body.payload.proof.mimeType).to.equal('application/pdf')
      expect(await fileExists(first.body.payload.proof.path)).to.equal(false)
      expect(await countFiles()).to.equal(1)
    })

    it('subidas simultáneas: el pedido queda delivered con UN comprobante y sin archivos huérfanos', async () => {
      await moveToInTransit()
      // La que pierde la escritura condicional responde INVALID_STATUS_TRANSITION
      // (o reemplaza, si leyó el pedido ya entregado)
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
      expect(await countFiles()).to.equal(1) // solo el comprobante vigente
    })

    it('pedido created → 409 ORDER_NOT_DELIVERABLE; pedido inexistente → 404 ORDER_NOT_FOUND; el archivo se borra', async () => {
      expectError(await attach(api().post(`/api/orders/${order._id}/proof`), 'proof', png), 'ORDER_NOT_DELIVERABLE')
      expectError(await attach(api().post(`/api/orders/${NONEXISTENT_ID}/proof`), 'proof', png), 'ORDER_NOT_FOUND')
      expect(await countFiles()).to.equal(0)
    })

    it('archivos inválidos (falta, formato, tamaño, campo) → error y no se guarda nada', async () => {
      await moveToInTransit()
      expectError(await api().post(`/api/orders/${order._id}/proof`).field('nota', 'sin archivo'), 'FILE_REQUIRED')
      expectError(await attach(api().post(`/api/orders/${order._id}/proof`), 'proof', txt), 'INVALID_FILE_TYPE')
      expectError(await attach(api().post(`/api/orders/${order._id}/proof`), 'proof', tooBig), 'FILE_TOO_LARGE')
      expectError(await attach(api().post(`/api/orders/${order._id}/proof`), 'document', pdf), 'UNEXPECTED_FILE_FIELD')
      expect(await countFiles()).to.equal(0)
    })
  })
})
