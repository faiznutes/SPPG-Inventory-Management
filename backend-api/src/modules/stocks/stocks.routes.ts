import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.js'
import { listStocks } from './stocks.service.js'

const stocksRouter = Router()

stocksRouter.use(requireAuth)

stocksRouter.get('/', async (_req, res, next) => {
  try {
    const data = await listStocks(_req.user?.tenantId)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

export { stocksRouter }
