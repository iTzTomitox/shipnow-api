import { ORDER_STATUS, DELIVERY_STATUS } from '../constants/index.js'

// Estado de la entrega derivado del estado del pedido (CANCELLED no lleva entrega)
export const DELIVERY_STATUS_BY_ORDER = Object.freeze({
  [ORDER_STATUS.CREATED]: DELIVERY_STATUS.PENDING,
  [ORDER_STATUS.ASSIGNED]: DELIVERY_STATUS.ASSIGNED,
  [ORDER_STATUS.PICKED_UP]: DELIVERY_STATUS.ASSIGNED,
  [ORDER_STATUS.IN_TRANSIT]: DELIVERY_STATUS.IN_TRANSIT,
  [ORDER_STATUS.DELIVERED]: DELIVERY_STATUS.DELIVERED
})

// Entrega simulada coherente: PENDING sin repartidor, el resto con repartidor
export const generateMockDelivery = ({ order, driverId = null }) => {
  const status = DELIVERY_STATUS_BY_ORDER[order.status]
  if (!status) {
    throw new Error(`Un pedido en estado "${order.status}" no lleva entrega`)
  }
  if (status !== DELIVERY_STATUS.PENDING && !driverId) {
    throw new Error(`Una entrega en estado "${status}" requiere un repartidor`)
  }

  return {
    order: order._id,
    driver: status === DELIVERY_STATUS.PENDING ? null : driverId,
    status
  }
}