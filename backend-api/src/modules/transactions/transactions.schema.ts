import { TransactionType } from '../../lib/prisma-client.js'
import { z } from 'zod'

const periodEnum = z.enum(['DAILY', 'WEEKLY', 'MONTHLY'])

export const createTransactionSchema = z.object({
  trxType: z.nativeEnum(TransactionType),
  itemId: z.string().uuid(),
  fromLocationId: z.string().uuid().optional(),
  toLocationId: z.string().uuid().optional(),
  qty: z.coerce.number(),
  reason: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().min(1).optional(),
  ),
})

export const listTransactionsQuerySchema = z
  .object({
    period: periodEnum.optional(),
    trxType: z.nativeEnum(TransactionType).optional(),
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
