import { NextFunction, Request, Response, Router } from 'express'
import { requireAuth } from '../../middleware/auth.js'
import { requireRole } from '../../middleware/role.js'
import { prisma } from '../../lib/prisma.js'
import { ApiError } from '../../utils/api-error.js'
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

function requireTenantPermission(mode: 'view' | 'edit') {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const user = req.user
      if (!user) throw new ApiError(401, 'AUTH_REQUIRED', 'Autentikasi dibutuhkan.')

      if (user.role === 'SUPER_ADMIN') return next()

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
        throw new ApiError(403, 'FORBIDDEN', 'Akses lihat kategori tidak diizinkan.')
      }

      if (mode === 'edit' && !membership.canEdit) {
        throw new ApiError(403, 'FORBIDDEN', 'Akses edit kategori tidak diizinkan.')
      }

      return next()
    } catch (error) {
      return next(error)
    }
  }
}

categoriesRouter.use(requireAuth)
categoriesRouter.use(requireTenantPermission('view'))

categoriesRouter.get('/', async (req, res, next) => {
  try {
    const query = listCategoriesQuerySchema.parse(req.query)
    const data = await listCategories(query, req.user?.tenantId)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

categoriesRouter.post('/', requireRole(['SUPER_ADMIN', 'ADMIN']), requireTenantPermission('edit'), async (req, res, next) => {
  try {
    const body = createCategorySchema.parse(req.body)
    const data = await createCategory(req.user!.id, req.user!.tenantId, body)
    return res.status(201).json(data)
  } catch (error) {
    return next(error)
  }
})

categoriesRouter.patch('/:id', requireRole(['SUPER_ADMIN', 'ADMIN']), requireTenantPermission('edit'), async (req, res, next) => {
  try {
    const body = updateCategorySchema.parse(req.body)
    const data = await updateCategory(req.user!.id, req.user!.tenantId, String(req.params.id), body)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

categoriesRouter.delete('/:id', requireRole(['SUPER_ADMIN', 'ADMIN']), requireTenantPermission('edit'), async (req, res, next) => {
  try {
    const data = await deleteCategory(req.user!.id, req.user!.tenantId, String(req.params.id))
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

categoriesRouter.patch('/:id/status', requireRole(['SUPER_ADMIN', 'ADMIN']), requireTenantPermission('edit'), async (req, res, next) => {
  try {
    const body = updateCategoryStatusSchema.parse(req.body)
    const data = await updateCategoryStatus(req.user!.id, req.user!.tenantId, String(req.params.id), body.isActive)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

categoriesRouter.post('/bulk/action', requireRole(['SUPER_ADMIN', 'ADMIN']), requireTenantPermission('edit'), async (req, res, next) => {
  try {
    const body = bulkCategoryActionSchema.parse(req.body)
    const data = await bulkCategoryAction(req.user!.id, req.user!.tenantId, body.ids, body.action, body.payload)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

export { categoriesRouter }
