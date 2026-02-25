import { PurchaseRequestStatus } from '../../lib/prisma-client.js'
import { z } from 'zod'

export const createPurchaseRequestSchema = z.object({
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        itemId: z.string().uuid().optional(),
        itemName: z.string().min(2),
        qty: z.coerce.number().positive(),
        unitPrice: z.coerce.number().nonnegative(),
      }),
    )
    .min(1),
})

export const updatePurchaseRequestStatusSchema = z.object({
  status: z.nativeEnum(PurchaseRequestStatus),
  notes: z.string().optional(),
})
