import { healthService } from '../services/health.service.js'

// 200 si la API y la base responden; si no, el error handler responde 503
export const getHealth = (req, res, next) => {
  try {
    res.status(200).json({ status: 'success', payload: healthService.check() })
  } catch (error) {
    next(error)
  }
}
