import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.js'
import { requireRole } from '../../middleware/role.js'
import {
  bulkUpdatePurchaseRequestStatusSchema,
  createPurchaseRequestSchema,
  listPurchaseRequestsQuerySchema,
  updatePurchaseRequestStatusSchema,
} from './purchase-requests.schema.js'
import {
  bulkUpdatePurchaseRequestStatus,
  createPurchaseRequest,
  getPurchaseRequestDetail,
  listPurchaseRequests,
  updatePurchaseRequestStatus,
} from './purchase-requests.service.js'

const purchaseRequestsRouter = Router()

purchaseRequestsRouter.use(requireAuth)

purchaseRequestsRouter.get('/', async (req, res, next) => {
  try {
    const query = listPurchaseRequestsQuerySchema.parse(req.query)
    const data = await listPurchaseRequests(query, req.user?.tenantId)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

purchaseRequestsRouter.post('/', async (req, res, next) => {
  try {
    const body = createPurchaseRequestSchema.parse(req.body)
    const data = await createPurchaseRequest(req.user!.id, body, req.user?.tenantId)
    return res.status(201).json(data)
  } catch (error) {
    return next(error)
  }
})

purchaseRequestsRouter.get('/:id', async (req, res, next) => {
  try {
    const data = await getPurchaseRequestDetail(String(req.params.id), req.user?.tenantId)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

purchaseRequestsRouter.post('/bulk/status', requireRole(['SUPER_ADMIN', 'ADMIN']), async (req, res, next) => {
  try {
    const body = bulkUpdatePurchaseRequestStatusSchema.parse(req.body)
    const data = await bulkUpdatePurchaseRequestStatus(body.ids, req.user!.id, req.user!.tenantId, body.status, body.notes)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

purchaseRequestsRouter.post('/:id/status', requireRole(['SUPER_ADMIN', 'ADMIN']), async (req, res, next) => {
  try {
    const body = updatePurchaseRequestStatusSchema.parse(req.body)
    const data = await updatePurchaseRequestStatus(String(req.params.id), req.user!.id, req.user!.tenantId, body.status, body.notes)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

export { purchaseRequestsRouter }
