import { mocksService } from '../services/mocks.service.js'

export const getMockUsers = (req, res, next) => {
  try {
    res.status(200).json({ status: 'success', payload: mocksService.getMockUsers(req.query.qty) })
  } catch (error) {
    next(error)
  }
}

export const getMockProducts = (req, res, next) => {
  try {
    res.status(200).json({ status: 'success', payload: mocksService.getMockProducts(req.query.qty) })
  } catch (error) {
    next(error)
  }
}

export const getMockOrders = (req, res, next) => {
  try {
    res.status(200).json({ status: 'success', payload: mocksService.getMockOrders(req.query.qty) })
  } catch (error) {
    next(error)
  }
}

export const seedMocks = async (req, res, next) => {
  try {
    const result = req.query.qty !== undefined
      ? await mocksService.seedUsers(req.query.qty)
      : await mocksService.seed(req.body)
    res.status(201).json({ status: 'success', payload: result })
  } catch (error) {
    next(error)
  }
}