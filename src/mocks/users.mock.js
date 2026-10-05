import { fakerES as faker } from '@faker-js/faker'
import { USER_ROLES } from '../constants/index.js'

const DRIVER_RATIO = 0.3 // ~30% de los usuarios generados son repartidores

// Usuario simulado con la forma del modelo User. No genera admins a propósito.
export const generateMockUser = ({ role } = {}) => {
  const firstName = faker.person.firstName()
  const lastName = faker.person.lastName()
  // Sufijo aleatorio: evita emails repetidos (el modelo exige email único)
  const suffix = faker.string.alphanumeric(5).toLowerCase()
  const email = faker.internet
    .email({ firstName, lastName, provider: 'shipnow.test' })
    .toLowerCase()
    .replace('@', `.${suffix}@`)

  return {
    firstName,
    lastName,
    email,
    role: role ?? (faker.datatype.boolean(DRIVER_RATIO) ? USER_ROLES.DRIVER : USER_ROLES.USER)
  }
}

export const generateMockUsers = (qty) => Array.from({ length: qty }, () => generateMockUser())