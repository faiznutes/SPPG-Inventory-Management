import { PurchaseRequestStatus } from '../../lib/prisma-client.js'
import { z } from 'zod'

const periodEnum = z.enum(['DAILY', 'WEEKLY', 'MONTHLY'])

export const createPurchaseRequestSchema = z.object({
  notes: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().optional(),
  ),
  items: z
    .array(
      z.object({
        itemId: z.string().uuid().optional(),
        itemName: z.string().trim().min(2),
        qty: z.coerce.number().positive(),
        unitPrice: z.coerce.number().nonnegative(),
      }),
    )
    .min(1),
})

export const updatePurchaseRequestStatusSchema = z.object({
  status: z.nativeEnum(PurchaseRequestStatus),
  notes: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().optional(),
  ),
})

export const bulkUpdatePurchaseRequestStatusSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
  status: z.nativeEnum(PurchaseRequestStatus),
  notes: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().optional(),
  ),
})

export const listPurchaseRequestsQuerySchema = z
  .object({
    period: periodEnum.optional(),
    from: z
      .string()
      .datetime({ offset: true })
      .optional(),
    to: z
      .string()
      .datetime({ offset: true })
      .optional(),
  })
  .refine((value) => !(value.from && value.to) || new Date(value.from) <= new Date(value.to), {
    message: 'Rentang tanggal tidak valid.',
    path: ['to'],
  })
