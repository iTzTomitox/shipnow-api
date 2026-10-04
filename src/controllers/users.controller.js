import { usersService } from '../services/users.service.js'

export const getUsers = async (req, res, next) => {
  try {
    // filtro opcional: /api/users?role=driver
    const users = await usersService.getAll({ role: req.query.role })
    res.status(200).json({ status: 'success', payload: users })
  } catch (error) {
    next(error)
  }
}

export const getUserById = async (req, res, next) => {
  try {
    const user = await usersService.getById(req.params.uid)
    res.status(200).json({ status: 'success', payload: user })
  } catch (error) {
    next(error)
  }
}

export const createUser = async (req, res, next) => {
  try {
    const user = await usersService.create(req.body)
    res.status(201).json({ status: 'success', payload: user })
  } catch (error) {
    next(error)
  }
}

export const updateUser = async (req, res, next) => {
  try {
    const user = await usersService.update(req.params.uid, req.body)
    res.status(200).json({ status: 'success', payload: user })
  } catch (error) {
    next(error)
  }
}

export const deleteUser = async (req, res, next) => {
  try {
    const user = await usersService.delete(req.params.uid)
    res.status(200).json({ status: 'success', payload: user })
  } catch (error) {
    next(error)
  }
}