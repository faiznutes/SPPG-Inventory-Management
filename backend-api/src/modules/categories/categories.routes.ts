import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.js'
import { requireRole } from '../../middleware/role.js'
import { createCategorySchema } from './categories.schema.js'
import { createCategory, listCategories } from './categories.service.js'

const categoriesRouter = Router()

categoriesRouter.use(requireAuth)

categoriesRouter.get('/', async (_req, res, next) => {
  try {
    const data = await listCategories()
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

categoriesRouter.post('/', requireRole(['SUPER_ADMIN', 'TENANT_ADMIN', 'ADMIN']), async (req, res, next) => {
  try {
    const body = createCategorySchema.parse(req.body)
    const data = await createCategory(body)
    return res.status(201).json(data)
  } catch (error) {
    return next(error)
  }
})

export { categoriesRouter }
