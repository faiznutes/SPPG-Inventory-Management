import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.js'
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
    const data = await listPurchaseRequests(query)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

purchaseRequestsRouter.post('/', async (req, res, next) => {
  try {
    const body = createPurchaseRequestSchema.parse(req.body)
    const data = await createPurchaseRequest(req.user!.id, body)
    return res.status(201).json(data)
  } catch (error) {
    return next(error)
  }
})

purchaseRequestsRouter.get('/:id', async (req, res, next) => {
  try {
    const data = await getPurchaseRequestDetail(req.params.id)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

purchaseRequestsRouter.post('/bulk/status', async (req, res, next) => {
  try {
    const body = bulkUpdatePurchaseRequestStatusSchema.parse(req.body)
    const data = await bulkUpdatePurchaseRequestStatus(body.ids, req.user!.id, body.status, body.notes)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

purchaseRequestsRouter.post('/:id/status', async (req, res, next) => {
  try {
    const body = updatePurchaseRequestStatusSchema.parse(req.body)
    const data = await updatePurchaseRequestStatus(req.params.id, req.user!.id, body.status, body.notes)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

export { purchaseRequestsRouter }
