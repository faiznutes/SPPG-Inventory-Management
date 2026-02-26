import type { NextFunction, Request, Response } from 'express'
import { ApiError } from '../utils/api-error.js'
import { verifyAccessToken } from '../utils/token.js'

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    return next(new ApiError(401, 'AUTH_REQUIRED', 'Token akses tidak ditemukan.'))
  }

  try {
    const token = authHeader.replace('Bearer ', '')
    const payload = verifyAccessToken(token)
    req.user = {
      id: payload.sub,
      role: payload.role,
      username: payload.username,
      tenantId: payload.tenantId,
      isSuperAdmin: payload.isSuperAdmin || payload.role === 'SUPER_ADMIN',
    }
    return next()
  } catch {
    return next(new ApiError(401, 'AUTH_INVALID', 'Token akses tidak valid atau kedaluwarsa.'))
  }
}
