import type { NextFunction, Request, Response } from 'express'
import { Prisma } from '../lib/prisma-client.js'
import { ZodError } from 'zod'
import { ApiError } from '../utils/api-error.js'

export function notFoundHandler(_req: Request, res: Response) {
  return res.status(404).json({
    code: 'NOT_FOUND',
    message: 'Rute tidak ditemukan.',
  })
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      code: err.code,
      message: err.message,
      details: err.details,
    })
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Validasi request gagal.',
      details: err.flatten(),
    })
  }

  if (err instanceof Prisma.PrismaClientInitializationError) {
    return res.status(503).json({
      code: 'DATABASE_UNAVAILABLE',
      message: 'Koneksi database tidak tersedia.',
    })
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return res.status(400).json({
      code: 'DATABASE_REQUEST_ERROR',
      message: 'Request database gagal diproses.',
      details: {
        prismaCode: err.code,
        meta: err.meta,
      },
    })
  }

  return res.status(500).json({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Terjadi kesalahan pada server.',
  })
}
