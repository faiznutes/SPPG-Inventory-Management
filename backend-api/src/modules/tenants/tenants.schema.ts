import { z } from 'zod'

export const listTenantsQuerySchema = z.object({
  includeArchived: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
})

export const createTenantSchema = z.object({
  name: z.string().min(3),
  code: z.string().min(3),
})

export const updateTenantSchema = z.object({
  name: z.string().min(3),
  code: z.string().min(3),
})

export const updateTenantStatusSchema = z.object({
  isActive: z.boolean(),
})

export const bulkTenantActionSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
  action: z.enum(['DEACTIVATE', 'ACTIVATE', 'ARCHIVE', 'RESTORE']),
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

export const updateTenantTelegramSettingsSchema = z.object({
  botToken: z.string().min(20).optional(),
  chatId: z.string().min(2).optional(),
  isEnabled: z.boolean().default(false),
  sendOnChecklistExport: z.boolean().default(true),
})
