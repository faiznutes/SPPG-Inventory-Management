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
