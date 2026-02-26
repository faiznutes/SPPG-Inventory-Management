import { z } from 'zod'

export const createTenantSchema = z.object({
  name: z.string().min(3),
  code: z
    .string()
    .min(3)
    .regex(/^[a-z0-9-]+$/),
})

export const createTenantUserSchema = z.object({
  name: z.string().min(2),
  username: z.string().min(3),
  email: z.string().email().optional(),
  role: z.enum(['TENANT_ADMIN', 'KOORD_DAPUR', 'KOORD_KEBERSIHAN', 'KOORD_LAPANGAN', 'STAFF']),
  password: z.string().min(6),
})

export const addTenantLocationSchema = z.object({
  name: z.string().min(2),
  description: z.string().max(255).optional(),
})
