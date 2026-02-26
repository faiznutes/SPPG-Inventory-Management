import { z } from 'zod'

export const createTenantSchema = z.object({
  name: z.string().min(3),
  code: z.string().min(3),
})

export const createTenantUserSchema = z.object({
  name: z.string().min(2),
  username: z.string().min(3),
  email: z.string().email().optional(),
  role: z.enum(['ADMIN', 'STAFF']),
  jabatan: z.string().min(2),
  canView: z.boolean().default(true),
  canEdit: z.boolean().default(false),
  password: z.string().min(6),
})

export const updateTenantUserSchema = z.object({
  name: z.string().min(2),
  username: z.string().min(3),
  email: z.string().email().optional(),
  role: z.enum(['ADMIN', 'STAFF']),
  jabatan: z.string().min(2),
  canView: z.boolean(),
  canEdit: z.boolean(),
  password: z.string().min(6).optional(),
})

export const addTenantLocationSchema = z.object({
  name: z.string().min(2),
  description: z.string().max(255).optional(),
})

export const updateTenantLocationSchema = z.object({
  name: z.string().min(2),
  description: z.string().max(255).optional(),
})
