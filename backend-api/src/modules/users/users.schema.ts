import { UserRole } from '@prisma/client'
import { z } from 'zod'

export const createUserSchema = z.object({
  name: z.string().min(2),
  username: z.string().min(3),
  email: z.string().email().optional(),
  role: z.nativeEnum(UserRole),
  password: z.string().min(6),
})

export const updateUserStatusSchema = z.object({
  isActive: z.boolean(),
})
