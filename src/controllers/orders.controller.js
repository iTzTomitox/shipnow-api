import { ordersService } from '../services/orders.service.js'

export const getOrders = async (req, res, next) => {
  try {
    // filtro opcional: /api/orders?status=created
    const orders = await ordersService.getAll({ status: req.query.status })
    res.status(200).json({ status: 'success', payload: orders })
  } catch (error) {
    next(error)
  }
}

export const getOrderById = async (req, res, next) => {
  try {
    const order = await ordersService.getById(req.params.oid)
    res.status(200).json({ status: 'success', payload: order })
  } catch (error) {
    next(error)
  }
}

export const createOrder = async (req, res, next) => {
  try {
    const order = await ordersService.create(req.body)
    res.status(201).json({ status: 'success', payload: order })
  } catch (error) {
    next(error)
  }
}

export const updateOrderStatus = async (req, res, next) => {
  try {
    // req.body puede faltar (Express 5): el ?. evita un TypeError
    const order = await ordersService.updateStatus(req.params.oid, req.body?.status)
    res.status(200).json({ status: 'success', payload: order })
  } catch (error) {
    next(error)
  }
}

export const getOrderTracking = async (req, res, next) => {
  try {
    const tracking = await ordersService.getTracking(req.params.oid)
    res.status(200).json({ status: 'success', payload: tracking })
  } catch (error) {
    next(error)
  }
}