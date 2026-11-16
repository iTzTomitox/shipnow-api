import { expect } from 'chai'
import { api, clearDatabase, expectError, createUser, createDriver, NONEXISTENT_ID } from './helpers.js'

describe('Funcional: /api/users', () => {
  // Cada test arranca con la base vacía y crea sus propios datos
  beforeEach(clearDatabase)

  describe('GET /api/users', () => {
    it('lista los usuarios con su estructura (sin campos internos) y filtra por rol', async () => {
      await createUser({ firstName: 'Ana' })
      const driver = await createDriver({ firstName: 'Luis' })

      const all = await api().get('/api/users')
      expect(all.status).to.equal(200)
      expect(all.body.status).to.equal('success')
      expect(all.body.payload).to.be.an('array').with.lengthOf(2)
      for (const user of all.body.payload) {
        expect(user).to.include.all.keys('_id', 'firstName', 'lastName', 'email', 'role', 'createdAt')
        expect(user).to.not.have.property('__v')
      }

      const drivers = await api().get('/api/users?role=driver')
      expect(drivers.body.payload).to.have.lengthOf(1)
      expect(drivers.body.payload[0]).to.include({ _id: driver._id, role: 'driver' })
    })

    it('rol inválido en el filtro → 400 INVALID_USER_ROLE', async () => {
      const res = await api().get('/api/users?role=superadmin')
      expectError(res, 'INVALID_USER_ROLE')
    })
  })

  describe('POST /api/users', () => {
    it('crea un usuario con rol user por defecto, email normalizado y solo los campos permitidos', async () => {
      const res = await api()
        .post('/api/users')
        .send({ firstName: 'Ana', lastName: 'Pérez', email: '  Ana@Test.COM ', isVip: true })

      expect(res.status).to.equal(201)
      expect(res.body.payload).to.include({ firstName: 'Ana', lastName: 'Pérez', email: 'ana@test.com', role: 'user' })
      expect(res.body.payload._id).to.match(/^[0-9a-f]{24}$/)
      expect(res.body.payload).to.not.have.property('isVip') // lista blanca
    })

    it('datos incompletos → 400 VALIDATION_ERROR; rol inexistente → 400 INVALID_USER_ROLE', async () => {
      const incomplete = await api().post('/api/users').send({ firstName: 'Ana', lastName: 'Pérez' })
      expectError(incomplete, 'VALIDATION_ERROR')
      expect(incomplete.body.details).to.match(/email/)

      const badRole = await api()
        .post('/api/users')
        .send({ firstName: 'Ana', lastName: 'Pérez', email: 'ana@test.com', role: 'superadmin' })
      expectError(badRole, 'INVALID_USER_ROLE')
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
      // Llegan "a la vez": pueden pasar la validación del service antes de que exista el usuario,
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

    it('usuario inexistente o id con formato inválido → 404 USER_NOT_FOUND', async () => {
      expectError(await api().get(`/api/users/${NONEXISTENT_ID}`), 'USER_NOT_FOUND')
      expectError(await api().get('/api/users/123'), 'USER_NOT_FOUND')
    })
  })

  describe('PUT /api/users/:uid', () => {
    it('actualiza los campos enviados', async () => {
      const user = await createUser()
      const res = await api().put(`/api/users/${user._id}`).send({ role: 'driver' })
      expect(res.status).to.equal(200)
      expect(res.body.payload).to.include({ _id: user._id, role: 'driver' })
    })

    it('rol inexistente → 400 INVALID_USER_ROLE; sin campos válidos → 400 VALIDATION_ERROR', async () => {
      const user = await createUser()
      expectError(await api().put(`/api/users/${user._id}`).send({ role: 'superadmin' }), 'INVALID_USER_ROLE')
      expectError(await api().put(`/api/users/${user._id}`).send({ password: 'x' }), 'VALIDATION_ERROR')
    })

    it('email de otro usuario → 409 USER_ALREADY_EXISTS', async () => {
      await createUser({ email: 'ocupado@test.com' })
      const user = await createUser()
      const res = await api().put(`/api/users/${user._id}`).send({ email: 'ocupado@test.com' })
      expectError(res, 'USER_ALREADY_EXISTS')
    })

    it('usuario inexistente → 404 USER_NOT_FOUND', async () => {
      const res = await api().put(`/api/users/${NONEXISTENT_ID}`).send({ firstName: 'Eva' })
      expectError(res, 'USER_NOT_FOUND')
    })
  })

  describe('DELETE /api/users/:uid', () => {
    it('elimina el usuario; después ya no existe, y borrarlo de nuevo → 404 USER_NOT_FOUND', async () => {
      const user = await createUser()
      const res = await api().delete(`/api/users/${user._id}`)
      expect(res.status).to.equal(200)
      expect(res.body.payload._id).to.equal(user._id)

      expectError(await api().get(`/api/users/${user._id}`), 'USER_NOT_FOUND')
      expectError(await api().delete(`/api/users/${user._id}`), 'USER_NOT_FOUND')
    })
  })
})
