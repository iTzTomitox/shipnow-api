import mongoose from 'mongoose'
import request from 'supertest'
import { expect } from 'chai'
import app from '../../src/app.js'
import { ERRORS } from '../../src/errors/errorDictionary.js'

export const api = () => request(app)

export const clearDatabase = async () => {
  const collections = Object.values(mongoose.connection.collections)
  await Promise.all(collections.map((collection) => collection.deleteMany({})))
}

export const expectError = (res, code) => {
  expect(ERRORS[code], `código ${code} en el diccionario`).to.exist
  expect(res.status).to.equal(ERRORS[code].statusCode)
  expect(res.body).to.include({ status: 'error', error: code, message: ERRORS[code].message })
}