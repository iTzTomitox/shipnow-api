export const USER_ROLES = Object.freeze({
  ADMIN: 'admin',
  USER: 'user',
  DRIVER: 'driver'
})

export const PRODUCT_STATUS = Object.freeze({
  AVAILABLE: 'available',
  OUT_OF_STOCK: 'out_of_stock'
})

export const ORDER_STATUS = Object.freeze({
  CREATED: 'created',
  ASSIGNED: 'assigned',
  PICKED_UP: 'picked_up',
  IN_TRANSIT: 'in_transit',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled'
})

// Transiciones válidas: estado actual → estados a los que puede pasar.
// DELIVERED y CANCELLED son finales (lista vacía).
export const ORDER_TRANSITIONS = Object.freeze({
  [ORDER_STATUS.CREATED]: Object.freeze([ORDER_STATUS.ASSIGNED, ORDER_STATUS.CANCELLED]),
  [ORDER_STATUS.ASSIGNED]: Object.freeze([ORDER_STATUS.PICKED_UP, ORDER_STATUS.CANCELLED]),
  [ORDER_STATUS.PICKED_UP]: Object.freeze([ORDER_STATUS.IN_TRANSIT]),
  [ORDER_STATUS.IN_TRANSIT]: Object.freeze([ORDER_STATUS.DELIVERED]),
  [ORDER_STATUS.DELIVERED]: Object.freeze([]),
  [ORDER_STATUS.CANCELLED]: Object.freeze([])
})

export const DELIVERY_PRIORITY = Object.freeze({
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high'
})

export const DELIVERY_STATUS = Object.freeze({
  PENDING: 'pending',
  ASSIGNED: 'assigned',
  IN_TRANSIT: 'in_transit',
  DELIVERED: 'delivered'
})

// Límite de registros por pedido de mocks (evita llenar la base por accidente)
export const MAX_MOCK_ITEMS = 100