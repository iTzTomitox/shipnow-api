import { expect } from 'chai'
import { USER_ROLES, PRODUCT_STATUS } from '../../src/constants/index.js'

describe('constants', () => {
  it('USER_ROLES tiene exactamente admin, user y driver', () => {
    expect(Object.values(USER_ROLES)).to.have.members(['admin', 'user', 'driver'])
  })

  it('PRODUCT_STATUS tiene available y out_of_stock', () => {
    expect(Object.values(PRODUCT_STATUS)).to.have.members(['available', 'out_of_stock'])
  })

  it('las constantes están congeladas', () => {
    expect(Object.isFrozen(USER_ROLES)).to.equal(true)
    expect(Object.isFrozen(PRODUCT_STATUS)).to.equal(true)
  })
})