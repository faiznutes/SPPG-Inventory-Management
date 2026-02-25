import type { NextFunction, Request, Response } from 'express'
import { ApiError } from '../utils/api-error.js'

export function requireRole(allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ApiError(401, 'AUTH_REQUIRED', 'Autentikasi dibutuhkan.'))
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new ApiError(403, 'FORBIDDEN', 'Akses tidak diizinkan untuk role ini.'))
    }

    return next()
  }
}
