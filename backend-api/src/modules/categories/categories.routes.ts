import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.js'
import { requireRole } from '../../middleware/role.js'
import {
  bulkCategoryActionSchema,
  createCategorySchema,
  listCategoriesQuerySchema,
  updateCategorySchema,
  updateCategoryStatusSchema,
} from './categories.schema.js'
import {
  bulkCategoryAction,
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
  updateCategoryStatus,
} from './categories.service.js'

const categoriesRouter = Router()

categoriesRouter.use(requireAuth)

categoriesRouter.get('/', async (req, res, next) => {
  try {
    const query = listCategoriesQuerySchema.parse(req.query)
    const data = await listCategories(query)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

categoriesRouter.post('/', requireRole(['SUPER_ADMIN', 'ADMIN']), async (req, res, next) => {
  try {
    const body = createCategorySchema.parse(req.body)
    const data = await createCategory(req.user!.id, body)
    return res.status(201).json(data)
  } catch (error) {
    return next(error)
  }
})

categoriesRouter.patch('/:id', requireRole(['SUPER_ADMIN', 'ADMIN']), async (req, res, next) => {
  try {
    const body = updateCategorySchema.parse(req.body)
    const data = await updateCategory(req.user!.id, String(req.params.id), body)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

categoriesRouter.delete('/:id', requireRole(['SUPER_ADMIN', 'ADMIN']), async (req, res, next) => {
  try {
    const data = await deleteCategory(req.user!.id, String(req.params.id))
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

categoriesRouter.patch('/:id/status', requireRole(['SUPER_ADMIN', 'ADMIN']), async (req, res, next) => {
  try {
    const body = updateCategoryStatusSchema.parse(req.body)
    const data = await updateCategoryStatus(req.user!.id, String(req.params.id), body.isActive)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

categoriesRouter.post('/bulk/action', requireRole(['SUPER_ADMIN', 'ADMIN']), async (req, res, next) => {
  try {
    const body = bulkCategoryActionSchema.parse(req.body)
    const data = await bulkCategoryAction(req.user!.id, body.ids, body.action, body.payload)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

export { categoriesRouter }
