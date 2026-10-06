import { fakerES as faker } from '@faker-js/faker'

export const generateMockId = () => faker.database.mongodbObjectId()