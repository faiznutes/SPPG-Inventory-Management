import { Router } from 'express'
import { changePasswordSchema, loginSchema, refreshSchema, selectTenantSchema } from './auth.schema.js'
import { changePassword, ensureAdminSeed, login, logout, me, myTenants, refresh, selectTenant } from './auth.service.js'
import { requireAuth } from '../../middleware/auth.js'
import { env } from '../../config/env.js'

const authRouter = Router()

function getRefreshCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.COOKIE_SECURE,
    maxAge: env.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
  }
}

authRouter.post('/login', async (req, res, next) => {
  try {
    await ensureAdminSeed()
    const body = loginSchema.parse(req.body)
    const data = await login(body)

    res.cookie('refreshToken', data.refreshToken, getRefreshCookieOptions())

    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

authRouter.post('/refresh', async (req, res, next) => {
  try {
    const body = refreshSchema.parse(req.body ?? {})
    const refreshToken = body.refreshToken || req.cookies.refreshToken
    const data = await refresh(refreshToken)

    res.cookie('refreshToken', data.refreshToken, getRefreshCookieOptions())

    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

authRouter.post('/logout', async (req, res, next) => {
  try {
    const refreshToken = req.body?.refreshToken || req.cookies.refreshToken
    await logout(refreshToken)
    res.clearCookie('refreshToken')

    return res.json({
      code: 'LOGOUT_OK',
      message: 'Logout berhasil.',
    })
  } catch (error) {
    return next(error)
  }
})

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const data = await me(req.user!.id)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

authRouter.get('/tenants', requireAuth, async (req, res, next) => {
  try {
    const data = await myTenants(req.user!.id)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

authRouter.post('/tenant/select', requireAuth, async (req, res, next) => {
  try {
    const body = selectTenantSchema.parse(req.body)
    const data = await selectTenant(req.user!.id, body.tenantId)

    res.cookie('refreshToken', data.refreshToken, getRefreshCookieOptions())

    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

authRouter.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const body = changePasswordSchema.parse(req.body)
    const data = await changePassword(req.user!.id, body.currentPassword, body.newPassword)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

export { authRouter }
