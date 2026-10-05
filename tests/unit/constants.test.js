import { expect } from 'chai'
import {
  USER_ROLES,
  PRODUCT_STATUS,
  ORDER_STATUS,
  ORDER_TRANSITIONS,
  DELIVERY_PRIORITY,
  DELIVERY_STATUS
} from '../../src/constants/index.js'

describe('constants', () => {
  it('USER_ROLES tiene exactamente admin, user y driver', () => {
    expect(Object.values(USER_ROLES)).to.have.members(['admin', 'user', 'driver'])
  })

  it('PRODUCT_STATUS tiene available y out_of_stock', () => {
    expect(Object.values(PRODUCT_STATUS)).to.have.members(['available', 'out_of_stock'])
  })

  it('las constantes están congeladas', () => {
    for (const constant of [USER_ROLES, PRODUCT_STATUS, ORDER_STATUS, DELIVERY_PRIORITY, DELIVERY_STATUS]) {
      expect(Object.isFrozen(constant)).to.equal(true)
    }
  })

  it('ORDER_TRANSITIONS define transiciones para todos los estados del pedido', () => {
    expect(Object.keys(ORDER_TRANSITIONS)).to.have.members(Object.values(ORDER_STATUS))
  })

  it('DELIVERED y CANCELLED son estados finales', () => {
    expect(ORDER_TRANSITIONS[ORDER_STATUS.DELIVERED]).to.be.empty
    expect(ORDER_TRANSITIONS[ORDER_STATUS.CANCELLED]).to.be.empty
  })

  it('solo se puede cancelar antes de que el pedido sea retirado', () => {
    expect(ORDER_TRANSITIONS[ORDER_STATUS.CREATED]).to.include(ORDER_STATUS.CANCELLED)
    expect(ORDER_TRANSITIONS[ORDER_STATUS.ASSIGNED]).to.include(ORDER_STATUS.CANCELLED)
    expect(ORDER_TRANSITIONS[ORDER_STATUS.PICKED_UP]).to.not.include(ORDER_STATUS.CANCELLED)
  })
})