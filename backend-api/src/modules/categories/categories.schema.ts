import { ItemType } from '../../lib/prisma-client.js'
import { z } from 'zod'

export const createCategorySchema = z.object({
  name: z.string().min(2),
  type: z.nativeEnum(ItemType),
})

export const updateCategorySchema = z.object({
  name: z.string().min(2),
  type: z.nativeEnum(ItemType),
})
