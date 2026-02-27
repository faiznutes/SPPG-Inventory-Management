import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.js'
import { requireRole } from '../../middleware/role.js'
import { bulkItemActionSchema, createItemSchema, listItemsQuerySchema } from './items.schema.js'
import { bulkItemAction, createItem, listItems } from './items.service.js'

const itemsRouter = Router()

itemsRouter.use(requireAuth)

itemsRouter.get('/', async (req, res, next) => {
  try {
    const query = listItemsQuerySchema.parse(req.query)
    const includeInactive = query.includeInactive === 'true'
    const data = await listItems(req.user!.tenantId, req.user!.isSuperAdmin === true, includeInactive)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

itemsRouter.post('/', requireRole(['SUPER_ADMIN', 'ADMIN', 'STAFF']), async (req, res, next) => {
  try {
    const body = createItemSchema.parse(req.body)
    const data = await createItem(body, req.user!.id, req.user!.tenantId)
    return res.status(201).json(data)
  } catch (error) {
    return next(error)
  }
})

itemsRouter.post('/bulk/action', requireRole(['SUPER_ADMIN', 'ADMIN', 'STAFF']), async (req, res, next) => {
  try {
    const body = bulkItemActionSchema.parse(req.body)
    const data = await bulkItemAction(req.user!.id, req.user!.tenantId, body.ids, body.action, body.payload)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

export { itemsRouter }
