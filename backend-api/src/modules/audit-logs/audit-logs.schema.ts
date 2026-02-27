import { z } from 'zod'

const sortSchema = z.enum(['createdAt:desc', 'createdAt:asc'])

export const listAuditLogsQuerySchema = z
  .object({
    from: z
      .string()
      .datetime({ offset: true })
      .optional(),
    to: z
      .string()
      .datetime({ offset: true })
      .optional(),
    tenantId: z.string().uuid().optional(),
    entityType: z.string().trim().min(1).optional(),
    entityId: z.string().trim().min(1).optional(),
    action: z.string().trim().min(1).optional(),
    actorUserId: z.string().uuid().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    sort: sortSchema.default('createdAt:desc'),
  })
  .refine((value) => !(value.from && value.to) || new Date(value.from) <= new Date(value.to), {
    message: 'Rentang tanggal tidak valid.',
    path: ['to'],
  })

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>
