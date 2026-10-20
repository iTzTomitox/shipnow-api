import { deliveriesService } from '../services/deliveries.service.js'

export const getDeliveries = async (req, res, next) => {
  try {
    // filtros opcionales: ?status=pending&driver=ID
    const { status, driver } = req.query
    const deliveries = await deliveriesService.getAll({ status, driver })
    res.status(200).json({ status: 'success', payload: deliveries })
  } catch (error) {
    next(error)
  }
}

export const getDeliveryById = async (req, res, next) => {
  try {
    const delivery = await deliveriesService.getById(req.params.did)
    res.status(200).json({ status: 'success', payload: delivery })
  } catch (error) {
    next(error)
  }
}

export const createDelivery = async (req, res, next) => {
  try {
    const delivery = await deliveriesService.create(req.body)
    res.status(201).json({ status: 'success', payload: delivery })
  } catch (error) {
    next(error)
  }
}

export const assignDriver = async (req, res, next) => {
  try {
    const delivery = await deliveriesService.assignDriver(req.params.did, req.body?.driver)
    res.status(200).json({ status: 'success', payload: delivery })
  } catch (error) {
    next(error)
  }
}