import { NextFunction, Request, Response, Router } from 'express'
import { requireAuth } from '../../middleware/auth.js'
import { requireRole } from '../../middleware/role.js'
import { prisma } from '../../lib/prisma.js'
import { ApiError } from '../../utils/api-error.js'
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

function requireTenantPermission(mode: 'view' | 'edit') {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const user = req.user
      if (!user) throw new ApiError(401, 'AUTH_REQUIRED', 'Autentikasi dibutuhkan.')

      if (user.role === 'SUPER_ADMIN') {
        return next()
      }

      if (!user.tenantId) {
        throw new ApiError(400, 'TENANT_CONTEXT_REQUIRED', 'Tenant aktif tidak ditemukan pada sesi pengguna.')
      }

      const membership = await prisma.tenantMembership.findFirst({
        where: {
          userId: user.id,
          tenantId: user.tenantId,
        },
        select: {
          canView: true,
          canEdit: true,
        },
      })

      if (!membership) {
        throw new ApiError(403, 'FORBIDDEN', 'Akses tidak tersedia untuk tenant aktif ini.')
      }

      if (mode === 'view' && !membership.canView) {
        throw new ApiError(403, 'FORBIDDEN', 'Akses lihat PR tidak diizinkan untuk akun ini.')
      }

      if (mode === 'edit' && !membership.canEdit) {
        throw new ApiError(403, 'FORBIDDEN', 'Akses edit PR tidak diizinkan untuk akun ini.')
      }

      return next()
    } catch (error) {
      return next(error)
    }
  }
}

purchaseRequestsRouter.use(requireAuth)
purchaseRequestsRouter.use(requireRole(['SUPER_ADMIN', 'ADMIN', 'STAFF']))
purchaseRequestsRouter.use(requireTenantPermission('view'))

purchaseRequestsRouter.get('/', async (req, res, next) => {
  try {
    const query = listPurchaseRequestsQuerySchema.parse(req.query)
    const data = await listPurchaseRequests(query, req.user?.tenantId)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

purchaseRequestsRouter.post('/', requireTenantPermission('edit'), async (req, res, next) => {
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

purchaseRequestsRouter.post('/bulk/status', requireRole(['SUPER_ADMIN', 'ADMIN']), requireTenantPermission('edit'), async (req, res, next) => {
  try {
    const body = bulkUpdatePurchaseRequestStatusSchema.parse(req.body)
    const data = await bulkUpdatePurchaseRequestStatus(body.ids, req.user!.id, req.user!.tenantId, body.status, body.notes)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

purchaseRequestsRouter.post('/:id/status', requireRole(['SUPER_ADMIN', 'ADMIN']), requireTenantPermission('edit'), async (req, res, next) => {
  try {
    const body = updatePurchaseRequestStatusSchema.parse(req.body)
    const data = await updatePurchaseRequestStatus(String(req.params.id), req.user!.id, req.user!.tenantId, body.status, body.notes)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

export { purchaseRequestsRouter }
