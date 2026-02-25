import { Router } from 'express'
import { loginSchema, refreshSchema } from './auth.schema.js'
import { ensureAdminSeed, login, logout, me, refresh } from './auth.service.js'
import { requireAuth } from '../../middleware/auth.js'

const authRouter = Router()

authRouter.post('/login', async (req, res, next) => {
  try {
    await ensureAdminSeed()
    const body = loginSchema.parse(req.body)
    const data = await login(body)

    res.cookie('refreshToken', data.refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })

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

    res.cookie('refreshToken', data.refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })

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

export { authRouter }
