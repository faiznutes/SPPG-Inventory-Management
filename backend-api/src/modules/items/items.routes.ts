import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.js'
import { requireRole } from '../../middleware/role.js'
import { bulkItemActionSchema, createItemSchema } from './items.schema.js'
import { bulkItemAction, createItem, listItems } from './items.service.js'

const itemsRouter = Router()

itemsRouter.use(requireAuth)

itemsRouter.get('/', async (_req, res, next) => {
  try {
    const data = await listItems()
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

itemsRouter.post('/', requireRole(['SUPER_ADMIN', 'ADMIN']), async (req, res, next) => {
  try {
    const body = createItemSchema.parse(req.body)
    const data = await createItem(body, req.user!.id)
    return res.status(201).json(data)
  } catch (error) {
    return next(error)
  }
})

itemsRouter.post('/bulk/action', requireRole(['SUPER_ADMIN', 'ADMIN']), async (req, res, next) => {
  try {
    const body = bulkItemActionSchema.parse(req.body)
    const data = await bulkItemAction(req.user!.id, body.ids, body.action, body.payload)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

export { itemsRouter }
