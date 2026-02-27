import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.js'
import { getDashboardSummary, getLowStockRows } from './dashboard.service.js'

const dashboardRouter = Router()

dashboardRouter.use(requireAuth)

dashboardRouter.get('/summary', async (_req, res, next) => {
  try {
    const data = await getDashboardSummary(_req.user?.tenantId, _req.user?.activeLocationId)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

dashboardRouter.get('/low-stock', async (_req, res, next) => {
  try {
    const data = await getLowStockRows(_req.user?.tenantId, _req.user?.activeLocationId)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

export { dashboardRouter }
