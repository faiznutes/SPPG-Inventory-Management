import { ItemType } from '../../lib/prisma-client.js'
import { z } from 'zod'

export const createItemSchema = z.object({
  name: z.string().min(2),
  sku: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  type: z.nativeEnum(ItemType),
  unit: z.string().min(1),
  minStock: z.coerce.number().min(0).default(0),
  reorderQty: z.coerce.number().min(0).optional(),
})

export const bulkItemActionSchema = z
  .object({
    ids: z.array(z.string().uuid()).min(1),
    action: z.enum(['ACTIVATE', 'DEACTIVATE', 'DELETE', 'UPDATE']),
    payload: z
      .object({
        categoryId: z.string().uuid().nullable().optional(),
        minStock: z.coerce.number().min(0).optional(),
        reorderQty: z.coerce.number().min(0).nullable().optional(),
        unit: z.string().min(1).optional(),
        type: z.nativeEnum(ItemType).optional(),
      })
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.action === 'UPDATE') {
      if (!value.payload) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Payload update wajib diisi untuk bulk update item.',
          path: ['payload'],
        })
        return
      }

      const hasAnyField =
        value.payload.categoryId !== undefined ||
        value.payload.minStock !== undefined ||
        value.payload.reorderQty !== undefined ||
        value.payload.unit !== undefined ||
        value.payload.type !== undefined

      if (!hasAnyField) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Pilih minimal satu field yang ingin diupdate.',
          path: ['payload'],
        })
      }
    }
  })
