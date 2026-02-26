import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.js'
import { requireRole } from '../../middleware/role.js'
import { addTenantLocationSchema, createTenantSchema, createTenantUserSchema } from './tenants.schema.js'
import { addTenantLocation, addTenantUser, createTenant, getTenantDetail, listTenants } from './tenants.service.js'

const tenantsRouter = Router()

tenantsRouter.use(requireAuth, requireRole(['SUPER_ADMIN']))

tenantsRouter.get('/', async (_req, res, next) => {
  try {
    const data = await listTenants()
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

tenantsRouter.post('/', async (req, res, next) => {
  try {
    const body = createTenantSchema.parse(req.body)
    const data = await createTenant(req.user!.id, body)
    return res.status(201).json(data)
  } catch (error) {
    return next(error)
  }
})

tenantsRouter.get('/:tenantId', async (req, res, next) => {
  try {
    const data = await getTenantDetail(req.params.tenantId)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

tenantsRouter.post('/:tenantId/users', async (req, res, next) => {
  try {
    const body = createTenantUserSchema.parse(req.body)
    const data = await addTenantUser(req.user!.id, req.params.tenantId, body)
    return res.status(201).json(data)
  } catch (error) {
    return next(error)
  }
})

tenantsRouter.post('/:tenantId/locations', async (req, res, next) => {
  try {
    const body = addTenantLocationSchema.parse(req.body)
    const data = await addTenantLocation(req.user!.id, req.params.tenantId, body)
    return res.status(201).json(data)
  } catch (error) {
    return next(error)
  }
})

export { tenantsRouter }
