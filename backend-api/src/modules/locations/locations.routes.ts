import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.js'
import { requireRole } from '../../middleware/role.js'
import { createLocationSchema } from './locations.schema.js'
import { createLocation, listLocations } from './locations.service.js'

const locationsRouter = Router()

locationsRouter.use(requireAuth)

locationsRouter.get('/', async (_req, res, next) => {
  try {
    const data = await listLocations()
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

locationsRouter.post('/', requireRole(['SUPER_ADMIN', 'ADMIN']), async (req, res, next) => {
  try {
    const body = createLocationSchema.parse(req.body)
    const data = await createLocation(body)
    return res.status(201).json(data)
  } catch (error) {
    return next(error)
  }
})

export { locationsRouter }
