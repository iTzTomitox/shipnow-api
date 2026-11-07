import { expect } from 'chai'
import { api } from './helpers.js'

describe('Funcional: /api/loggerTest', () => {
  it('genera logs en todos los niveles y lo informa', async () => {
    const res = await api().get('/api/loggerTest')

    expect(res.status).to.equal(200)
    expect(res.body.status).to.equal('success')
    expect(res.body.payload.message).to.be.a('string').and.not.be.empty
    expect(res.body.payload.levels).to.deep.equal(['fatal', 'error', 'warning', 'info', 'http', 'debug'])
  })
})
