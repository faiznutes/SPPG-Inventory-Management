import { z } from 'zod'

export const createLocationSchema = z.object({
  name: z.string().min(2),
  description: z.string().max(255).optional(),
})
