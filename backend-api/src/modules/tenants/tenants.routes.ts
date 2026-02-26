import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.js'
import { requireRole } from '../../middleware/role.js'
import {
  addTenantLocationSchema,
  createTenantSchema,
  createTenantUserSchema,
  updateTenantTelegramSettingsSchema,
  updateTenantLocationSchema,
  updateTenantUserSchema,
} from './tenants.schema.js'
import {
  addTenantLocation,
  addTenantUser,
  createTenant,
  deleteTenant,
  getTenantTelegramSettings,
  getTenantDetail,
  listTenants,
  updateTenantTelegramSettings,
  updateTenantLocation,
  updateTenantUser,
} from './tenants.service.js'

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

tenantsRouter.delete('/:tenantId', async (req, res, next) => {
  try {
    const data = await deleteTenant(req.user!.id, req.params.tenantId)
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
