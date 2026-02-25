import { TransactionType } from '@prisma/client'
import { z } from 'zod'

export const createTransactionSchema = z.object({
  trxType: z.nativeEnum(TransactionType),
  itemId: z.string().uuid(),
  fromLocationId: z.string().uuid().optional(),
  toLocationId: z.string().uuid().optional(),
  qty: z.coerce.number(),
  reason: z.string().min(1).optional(),
})
