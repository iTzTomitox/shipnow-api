import { expect } from 'chai'
import UsersService from '../../src/services/users.service.js'
import { USER_ROLES } from '../../src/constants/index.js'

// Repository falso: anota las llamadas en `calls` y devuelve datos fijos
const createFakeRepo = (overrides = {}) => {
  const calls = {}
  return {
    calls,
    findAll: async (args) => { calls.findAll = args; return [] },
    findById: async () => null,
    findByEmail: async () => null, // por defecto el email está libre
    create: async (data) => { calls.create = data; return { _id: 'u1', ...data } },
    updateById: async (id, data) => { calls.updateById = data; return { _id: id, ...data } },
    deleteById: async () => null,
    ...overrides
  }
}

const catchError = async (fn) => {
  try {
    await fn()
  } catch (error) {
    return error
  }
  throw new Error('Se esperaba que lanzara un error')
}

const validUser = { firstName: 'Ana', lastName: 'Pérez', email: 'ana@test.com' }

describe('UsersService', () => {
  describe('getAll', () => {
    it('pasa el filtro de rol al repository', async () => {
      const repo = createFakeRepo()
      await new UsersService(repo).getAll({ role: USER_ROLES.DRIVER })
      expect(repo.calls.findAll).to.deep.equal({ role: USER_ROLES.DRIVER })
    })

    it('rechaza un rol inválido en el filtro con 400', async () => {
      const service = new UsersService(createFakeRepo())
      const error = await catchError(() => service.getAll({ role: 'superadmin' }))
      expect(error.status).to.equal(400)
    })
  })

  describe('getById', () => {
    it('lanza 404 si el usuario no existe', async () => {
      const error = await catchError(() => new UsersService(createFakeRepo()).getById('x'))
      expect(error.status).to.equal(404)
    })
  })

  describe('create', () => {
    it('asigna rol USER por defecto', async () => {
      const repo = createFakeRepo()
      await new UsersService(repo).create(validUser)
      expect(repo.calls.create.role).to.equal(USER_ROLES.USER)
    })

    it('normaliza el email a minúsculas y sin espacios', async () => {
      const repo = createFakeRepo()
      await new UsersService(repo).create({ ...validUser, email: '  Ana@Test.COM ' })
      expect(repo.calls.create.email).to.equal('ana@test.com')
    })

        it('descarta campos que no están en la lista blanca', async () => {
      const repo = createFakeRepo()
      await new UsersService(repo).create({ ...validUser, password: '1234', isVip: true })
      expect(repo.calls.create).to.have.all.keys('firstName', 'lastName', 'email', 'role')
    })

    it('rechaza email con formato inválido con 400', async () => {
      const service = new UsersService(createFakeRepo())
      const error = await catchError(() => service.create({ ...validUser, email: 'ana.com' }))
      expect(error.status).to.equal(400)
    })

    it('rechaza un rol inválido con 400', async () => {
      const service = new UsersService(createFakeRepo())
      const error = await catchError(() => service.create({ ...validUser, role: 'superadmin' }))
      expect(error.status).to.equal(400)
    })

    it('rechaza email repetido con 409', async () => {
      const repo = createFakeRepo({ findByEmail: async () => ({ _id: 'otro' }) })
      const error = await catchError(() => new UsersService(repo).create(validUser))
      expect(error.status).to.equal(409)
    })
  })

  describe('update', () => {
    it('rechaza 409 si el email pertenece a OTRO usuario', async () => {
      const repo = createFakeRepo({ findByEmail: async () => ({ _id: 'otro' }) })
      const error = await catchError(() =>
        new UsersService(repo).update('u1', { email: 'ana@test.com' })
      )
      expect(error.status).to.equal(409)
    })

    it('permite actualizar con su propio email', async () => {
      const repo = createFakeRepo({ findByEmail: async () => ({ _id: 'u1' }) })
      const updated = await new UsersService(repo).update('u1', { email: 'ana@test.com' })
      expect(updated.email).to.equal('ana@test.com')
    })

    it('rechaza un update sin campos válidos con 400', async () => {
      const service = new UsersService(createFakeRepo())
      const error = await catchError(() => service.update('u1', { password: 'x' }))
      expect(error.status).to.equal(400)
    })

    it('lanza 404 si el usuario a actualizar no existe', async () => {
      const repo = createFakeRepo({ updateById: async () => null })
      const error = await catchError(() => new UsersService(repo).update('u1', { firstName: 'Eva' }))
      expect(error.status).to.equal(404)
    })
  })

  describe('delete', () => {
    it('lanza 404 si el usuario a borrar no existe', async () => {
      const error = await catchError(() => new UsersService(createFakeRepo()).delete('x'))
      expect(error.status).to.equal(404)
    })
  })
})