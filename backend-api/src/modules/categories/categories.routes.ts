import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.js'
import { requireRole } from '../../middleware/role.js'
import { createCategorySchema, updateCategorySchema } from './categories.schema.js'
import { createCategory, deleteCategory, listCategories, updateCategory } from './categories.service.js'

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
    const data = await createCategory(req.user!.id, body)
    return res.status(201).json(data)
  } catch (error) {
    return next(error)
  }
})

categoriesRouter.patch('/:id', requireRole(['SUPER_ADMIN', 'TENANT_ADMIN', 'ADMIN']), async (req, res, next) => {
  try {
    const body = updateCategorySchema.parse(req.body)
    const data = await updateCategory(req.user!.id, String(req.params.id), body)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

categoriesRouter.delete('/:id', requireRole(['SUPER_ADMIN', 'TENANT_ADMIN', 'ADMIN']), async (req, res, next) => {
  try {
    const data = await deleteCategory(req.user!.id, String(req.params.id))
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

export { categoriesRouter }
