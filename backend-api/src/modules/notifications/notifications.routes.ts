import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.js'
import { listNotifications } from './notifications.service.js'

const notificationsRouter = Router()

notificationsRouter.use(requireAuth)

notificationsRouter.get('/', async (_req, res, next) => {
  try {
    const data = await listNotifications()
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

export { notificationsRouter }
