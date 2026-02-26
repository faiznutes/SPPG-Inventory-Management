import { ItemType } from '../../lib/prisma-client.js'
import { z } from 'zod'

export const listCategoriesQuerySchema = z.object({
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
})

export const createCategorySchema = z.object({
  name: z.string().min(2),
  type: z.nativeEnum(ItemType),
})

export const updateCategorySchema = z.object({
  name: z.string().min(2),
  type: z.nativeEnum(ItemType),
})

export const updateCategoryStatusSchema = z.object({
  isActive: z.boolean(),
})

export const bulkCategoryActionSchema = z
  .object({
    ids: z.array(z.string().uuid()).min(1),
    action: z.enum(['ACTIVATE', 'DEACTIVATE', 'DELETE', 'UPDATE']),
    payload: z
      .object({
        name: z.string().min(2).optional(),
        type: z.nativeEnum(ItemType).optional(),
      })
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.action === 'UPDATE') {
      if (!value.payload || (!value.payload.name && !value.payload.type)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Untuk bulk update kategori, isi minimal nama atau tipe.',
          path: ['payload'],
        })
      }
    }
  })
