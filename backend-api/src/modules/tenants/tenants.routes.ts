import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.js'
import { requireRole } from '../../middleware/role.js'
import {
  addTenantLocationSchema,
  bulkTenantUserActionSchema,
  bulkTenantActionSchema,
  createTenantSchema,
  createTenantUserSchema,
  listTenantsQuerySchema,
  updateTenantSchema,
  updateTenantStatusSchema,
  updateTenantTelegramSettingsSchema,
  updateTenantLocationSchema,
  updateTenantUserSchema,
} from './tenants.schema.js'
import {
  addTenantLocation,
  addTenantUser,
  bulkTenantUserAction,
  bulkTenantAction,
  createTenant,
  deleteTenant,
  getTenantTelegramSettings,
  getTenantDetail,
  listTenants,
  reactivateTenant,
  restoreTenant,
  updateTenant,
  updateTenantStatus,
  updateTenantTelegramSettings,
  updateTenantLocation,
  updateTenantUser,
} from './tenants.service.js'

const tenantsRouter = Router()

tenantsRouter.use(requireAuth, requireRole(['SUPER_ADMIN']))

tenantsRouter.get('/', async (req, res, next) => {
  try {
    const query = listTenantsQuerySchema.parse(req.query)
    const data = await listTenants(query)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

tenantsRouter.patch('/:tenantId/status', async (req, res, next) => {
  try {
    const body = updateTenantStatusSchema.parse(req.body)
    const data = await updateTenantStatus(req.user!.id, req.params.tenantId, body.isActive)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

tenantsRouter.post('/bulk/action', async (req, res, next) => {
  try {
    const body = bulkTenantActionSchema.parse(req.body)
    const data = await bulkTenantAction(req.user!.id, body.ids, body.action)
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

tenantsRouter.patch('/:tenantId', async (req, res, next) => {
  try {
    const body = updateTenantSchema.parse(req.body)
    const data = await updateTenant(req.user!.id, req.params.tenantId, body)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

tenantsRouter.delete('/:tenantId', async (req, res, next) => {
  try {
    const data = await deleteTenant(req.user!.id, req.params.tenantId)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

tenantsRouter.post('/:tenantId/reactivate', async (req, res, next) => {
  try {
    const data = await reactivateTenant(req.user!.id, req.params.tenantId)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

tenantsRouter.post('/:tenantId/restore', async (req, res, next) => {
  try {
    const data = await restoreTenant(req.user!.id, req.params.tenantId)
    return res.json(data)
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

tenantsRouter.post('/:tenantId/users/bulk/action', async (req, res, next) => {
  try {
    const body = bulkTenantUserActionSchema.parse(req.body)
    const data = await bulkTenantUserAction(req.user!.id, req.params.tenantId, body.userIds, body.action)
    return res.json(data)
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

tenantsRouter.patch('/:tenantId/users/:userId', async (req, res, next) => {
  try {
    const body = updateTenantUserSchema.parse(req.body)
    const data = await updateTenantUser(req.user!.id, req.params.tenantId, req.params.userId, body)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

tenantsRouter.patch('/:tenantId/locations/:locationId', async (req, res, next) => {
  try {
    const body = updateTenantLocationSchema.parse(req.body)
    const data = await updateTenantLocation(req.user!.id, req.params.tenantId, req.params.locationId, body)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

tenantsRouter.get('/:tenantId/telegram-settings', async (req, res, next) => {
  try {
    const data = await getTenantTelegramSettings(req.params.tenantId)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

tenantsRouter.put('/:tenantId/telegram-settings', async (req, res, next) => {
  try {
    const body = updateTenantTelegramSettingsSchema.parse(req.body)
    const data = await updateTenantTelegramSettings(req.user!.id, req.params.tenantId, body)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

export { tenantsRouter }
