import { expect } from 'chai'
import { api, clearDatabase, expectError, createUser, createDriver, NONEXISTENT_ID } from './helpers.js'

describe('Funcional: /api/users', () => {
  // Cada test arranca con la base vacía y crea sus propios datos
  beforeEach(clearDatabase)

  describe('GET /api/users', () => {
    it('lista los usuarios con su estructura (sin campos internos)', async () => {
      await createUser({ firstName: 'Ana' })
      await createDriver({ firstName: 'Luis' })

      const res = await api().get('/api/users')

      expect(res.status).to.equal(200)
      expect(res.body.status).to.equal('success')
      expect(res.body.payload).to.be.an('array').with.lengthOf(2)
      for (const user of res.body.payload) {
        expect(user).to.include.all.keys('_id', 'firstName', 'lastName', 'email', 'role', 'createdAt')
        expect(user).to.not.have.property('__v')
      }
    })

    it('filtra por rol (?role=driver)', async () => {
      await createUser()
      const driver = await createDriver()

      const res = await api().get('/api/users?role=driver')

      expect(res.status).to.equal(200)
      expect(res.body.payload).to.have.lengthOf(1)
      expect(res.body.payload[0]).to.include({ _id: driver._id, role: 'driver' })
    })

    it('rol inválido en el filtro → 400 INVALID_USER_ROLE', async () => {
      const res = await api().get('/api/users?role=superadmin')
      expectError(res, 'INVALID_USER_ROLE')
    })
  })

  describe('POST /api/users', () => {
    it('crea un usuario con rol user por defecto y email normalizado', async () => {
      const res = await api()
        .post('/api/users')
        .send({ firstName: 'Ana', lastName: 'Pérez', email: '  Ana@Test.COM ', isVip: true })

      expect(res.status).to.equal(201)
      expect(res.body.status).to.equal('success')
      expect(res.body.payload).to.include({ firstName: 'Ana', lastName: 'Pérez', email: 'ana@test.com', role: 'user' })
      expect(res.body.payload._id).to.match(/^[0-9a-f]{24}$/)
      expect(res.body.payload).to.not.have.property('isVip') // lista blanca
    })

    it('datos incompletos (sin email) → 400 VALIDATION_ERROR con details', async () => {
      const res = await api().post('/api/users').send({ firstName: 'Ana', lastName: 'Pérez' })
      expectError(res, 'VALIDATION_ERROR')
      expect(res.body.details).to.match(/email/)
    })

    it('rol inexistente → 400 INVALID_USER_ROLE', async () => {
      const res = await api()
        .post('/api/users')
        .send({ firstName: 'Ana', lastName: 'Pérez', email: 'ana@test.com', role: 'superadmin' })
      expectError(res, 'INVALID_USER_ROLE')
    })

    it('email repetido → 409 USER_ALREADY_EXISTS', async () => {
      await createUser({ email: 'repetido@test.com' })
      const res = await api()
        .post('/api/users')
        .send({ firstName: 'Otra', lastName: 'Persona', email: 'REPETIDO@test.com' })
      expectError(res, 'USER_ALREADY_EXISTS')
    })

    it('peticiones simultáneas con el mismo email: solo una crea, el resto 409 (índice único)', async () => {
      const body = { firstName: 'Ana', lastName: 'Pérez', email: 'carrera@test.com' }
      // Las 5 llegan "a la vez": pueden pasar la validación del service antes de que exista el usuario,
      // y ahí el índice único de MongoDB es la red de seguridad (DUPLICATE_RESOURCE)
      const responses = await Promise.all(Array.from({ length: 5 }, () => api().post('/api/users').send(body)))

      expect(responses.filter((r) => r.status === 201)).to.have.lengthOf(1)
      for (const res of responses.filter((r) => r.status !== 201)) {
        expect(res.status).to.equal(409)
        expect(['USER_ALREADY_EXISTS', 'DUPLICATE_RESOURCE']).to.include(res.body.error)
      }
      const saved = await api().get('/api/users')
      expect(saved.body.payload).to.have.lengthOf(1)
    })
  })

  describe('GET /api/users/:uid', () => {
    it('devuelve el usuario', async () => {
      const user = await createUser({ firstName: 'Eva' })
      const res = await api().get(`/api/users/${user._id}`)
      expect(res.status).to.equal(200)
      expect(res.body.payload).to.include({ _id: user._id, firstName: 'Eva' })
    })

    it('usuario inexistente → 404 USER_NOT_FOUND', async () => {
      const res = await api().get(`/api/users/${NONEXISTENT_ID}`)
      expectError(res, 'USER_NOT_FOUND')
    })

    it('id con formato inválido → 404 USER_NOT_FOUND', async () => {
      const res = await api().get('/api/users/123')
      expectError(res, 'USER_NOT_FOUND')
    })
  })

  describe('PUT /api/users/:uid', () => {
    it('actualiza los campos enviados', async () => {
      const user = await createUser()
      const res = await api().put(`/api/users/${user._id}`).send({ role: 'driver' })
      expect(res.status).to.equal(200)
      expect(res.body.payload).to.include({ _id: user._id, role: 'driver' })
    })

    it('email de otro usuario → 409 USER_ALREADY_EXISTS', async () => {
      await createUser({ email: 'ocupado@test.com' })
      const user = await createUser()
      const res = await api().put(`/api/users/${user._id}`).send({ email: 'ocupado@test.com' })
      expectError(res, 'USER_ALREADY_EXISTS')
    })

    it('rol inexistente → 400 INVALID_USER_ROLE', async () => {
      const user = await createUser()
      const res = await api().put(`/api/users/${user._id}`).send({ role: 'superadmin' })
      expectError(res, 'INVALID_USER_ROLE')
    })

    it('sin campos válidos → 400 VALIDATION_ERROR', async () => {
      const user = await createUser()
      const res = await api().put(`/api/users/${user._id}`).send({ password: 'x' })
      expectError(res, 'VALIDATION_ERROR')
    })

    it('usuario inexistente → 404 USER_NOT_FOUND', async () => {
      const res = await api().put(`/api/users/${NONEXISTENT_ID}`).send({ firstName: 'Eva' })
      expectError(res, 'USER_NOT_FOUND')
    })
  })

  describe('DELETE /api/users/:uid', () => {
    it('elimina el usuario y después ya no existe', async () => {
      const user = await createUser()
      const res = await api().delete(`/api/users/${user._id}`)
      expect(res.status).to.equal(200)
      expect(res.body.payload._id).to.equal(user._id)

      const after = await api().get(`/api/users/${user._id}`)
      expectError(after, 'USER_NOT_FOUND')
    })

    it('usuario inexistente → 404 USER_NOT_FOUND', async () => {
      const res = await api().delete(`/api/users/${NONEXISTENT_ID}`)
      expectError(res, 'USER_NOT_FOUND')
    })
  })
})
