import { z } from 'zod'

export const loginSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
})

export const refreshSchema = z.object({
  refreshToken: z.string().optional(),
})

export const selectTenantSchema = z.object({
  tenantId: z.string().min(1),
})

export const selectLocationSchema = z.object({
  locationId: z.string().uuid(),
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(6),
  newPassword: z.string().min(8),
})
