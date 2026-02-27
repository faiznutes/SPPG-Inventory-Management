import type { Prisma as PrismaType } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { ApiError } from '../../utils/api-error.js'
import type { ListAuditLogsQuery } from './audit-logs.schema.js'

type SessionUser = {
  id: string
  role: string
  tenantId?: string
  isSuperAdmin?: boolean
}

type DiffChange = {
  field: string
  before: unknown
  after: unknown
}

const REDACT_KEYS = ['password', 'token', 'secret', 'apiKey', 'botToken', 'refresh', 'access']

function startOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function endOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(23, 59, 59, 999)
  return next
}

function lowerFirst(value: string) {
  return value.length ? `${value[0].toLowerCase()}${value.slice(1)}` : value
}

function shouldRedact(key: string) {
  const lowered = key.toLowerCase()
  return REDACT_KEYS.some((item) => lowered.includes(item.toLowerCase()))
}

function sanitizeValue(value: unknown, keyHint = ''): unknown {
  if (value === null || value === undefined) return value
  if (shouldRedact(keyHint)) return '[REDACTED]'

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, keyHint))
  }

  if (typeof value === 'object') {
    const output: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      output[key] = sanitizeValue(item, key)
    }
    return output
  }

  return value
}

function normalizeDiff(diffJson: PrismaType.JsonValue | null): DiffChange[] {
  if (!diffJson || typeof diffJson !== 'object' || Array.isArray(diffJson)) {
    return []
  }

  const source = diffJson as Record<string, unknown>
  const changes: DiffChange[] = []
  const consumed = new Set<string>()

  for (const key of Object.keys(source)) {
    if (!key.startsWith('old') || key.length <= 3) continue

    const suffix = key.slice(3)
    const oldValue = source[key]
    const newKey = `new${suffix}`
    if (!(newKey in source)) continue

    changes.push({
      field: lowerFirst(suffix),
      before: sanitizeValue(oldValue, key),
      after: sanitizeValue(source[newKey], newKey),
    })
    consumed.add(key)
    consumed.add(newKey)
  }

  for (const [key, value] of Object.entries(source)) {
    if (consumed.has(key) || key.startsWith('new')) continue

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const maybePair = value as Record<string, unknown>
      if ('before' in maybePair || 'after' in maybePair) {
        changes.push({
          field: key,
          before: sanitizeValue(maybePair.before, key),
          after: sanitizeValue(maybePair.after, key),
        })
        continue
      }
    }

    changes.push({
      field: key,
      before: null,
      after: sanitizeValue(value, key),
    })
  }

  return changes
}

function resolveSummary(entityType: string, action: string, diff: DiffChange[]) {
  if (!diff.length) return `${entityType} ${action}`
  const first = diff[0]
  return `${entityType} ${action} (${first.field})`
}

function resolveTenantFilter(user: SessionUser, query: ListAuditLogsQuery) {
  if (user.role === 'SUPER_ADMIN' || user.isSuperAdmin) {
    return query.tenantId || undefined
  }

  if (user.role !== 'ADMIN') {
    throw new ApiError(403, 'FORBIDDEN', 'Akses audit log hanya untuk ADMIN dan SUPER_ADMIN.')
  }

  if (!user.tenantId) {
    throw new ApiError(400, 'TENANT_CONTEXT_REQUIRED', 'Tenant aktif tidak ditemukan pada sesi pengguna.')
  }

  return user.tenantId
}

function toAuditLogWhere(query: ListAuditLogsQuery, tenantId: string | undefined) {
  const now = new Date()
  const from = query.from ? new Date(query.from) : startOfDay(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000))
  const to = query.to ? new Date(query.to) : endOfDay(now)

  const where: PrismaType.AuditLogWhereInput = {
    createdAt: {
      gte: from,
      lte: to,
    },
    ...(tenantId
      ? {
          tenantId,
        }
      : {}),
    ...(query.entityType
      ? {
          entityType: query.entityType,
        }
      : {}),
    ...(query.entityId
      ? {
          entityId: query.entityId,
        }
      : {}),
    ...(query.action
      ? {
          action: query.action,
        }
      : {}),
    ...(query.actorUserId
      ? {
          actorUserId: query.actorUserId,
        }
      : {}),
  }

  return where
}

function resolveDateRange(query: ListAuditLogsQuery) {
  const now = new Date()
  const from = query.from ? new Date(query.from) : startOfDay(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000))
  const to = query.to ? new Date(query.to) : endOfDay(now)
  return { from, to }
}

function toCsvCell(value: unknown) {
  const raw = value === null || value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value)
  const escaped = raw.replaceAll('"', '""')
  return `"${escaped}"`
}

function toCsvLine(values: unknown[]) {
  return values.map((value) => toCsvCell(value)).join(',')
}

function formatAuditLogRow(
  row: {
    id: string
    createdAt: Date
    tenantId: string | null
    actorUserId: string
    entityType: string
    entityId: string
    action: string
    diffJson: PrismaType.JsonValue | null
  },
  actorMap: Map<string, { id: string; name: string; username: string }>,
  tenantMap: Map<string, { id: string; name: string; code: string }>,
) {
  const diff = normalizeDiff(row.diffJson)
  const actor = actorMap.get(row.actorUserId)
  const tenant = row.tenantId ? tenantMap.get(row.tenantId) : null

  return {
    id: row.id,
    createdAt: row.createdAt,
    tenant: tenant
      ? {
          id: tenant.id,
          name: tenant.name,
          code: tenant.code,
        }
      : null,
    actor: {
      id: row.actorUserId,
      name: actor?.name || null,
      username: actor?.username || null,
    },
    entityType: row.entityType,
    entityId: row.entityId,
    action: row.action,
    summary: resolveSummary(row.entityType, row.action, diff),
    diff,
    rawDiff: sanitizeValue(row.diffJson),
  }
}

export async function listAuditLogs(query: ListAuditLogsQuery, user: SessionUser) {
  const tenantId = resolveTenantFilter(user, query)
  const skip = (query.page - 1) * query.pageSize
  const orderBy = query.sort === 'createdAt:asc' ? 'asc' : 'desc'
  const where = toAuditLogWhere(query, tenantId)

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: {
        createdAt: orderBy,
      },
      skip,
      take: query.pageSize,
    }),
    prisma.auditLog.count({ where }),
  ])

  const actorIds = [...new Set(rows.map((row) => row.actorUserId))]
  const tenantIds = [...new Set(rows.map((row) => row.tenantId).filter((value): value is string => Boolean(value)))]

  const [actors, tenants] = await Promise.all([
    actorIds.length
      ? prisma.user.findMany({
          where: {
            id: {
              in: actorIds,
            },
          },
          select: {
            id: true,
            name: true,
            username: true,
          },
        })
      : [],
    tenantIds.length
      ? prisma.tenant.findMany({
          where: {
            id: {
              in: tenantIds,
            },
          },
          select: {
            id: true,
            name: true,
            code: true,
          },
        })
      : [],
  ])

  const actorMap = new Map(actors.map((actor) => [actor.id, actor]))
  const tenantMap = new Map(tenants.map((tenant) => [tenant.id, tenant]))

  return {
    data: rows.map((row) => formatAuditLogRow(row, actorMap, tenantMap)),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
    },
  }
}

export async function exportAuditLogsCsv(query: ListAuditLogsQuery, user: SessionUser) {
  const tenantId = resolveTenantFilter(user, query)
  const { from, to } = resolveDateRange(query)
  const maxRangeMs = 31 * 24 * 60 * 60 * 1000

  if (to.getTime() - from.getTime() > maxRangeMs) {
    throw new ApiError(400, 'AUDIT_EXPORT_RANGE_EXCEEDED', 'Rentang export maksimal 31 hari.')
  }

  const where = toAuditLogWhere(query, tenantId)

  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: {
      createdAt: 'desc',
    },
    take: 5000,
  })

  const actorIds = [...new Set(rows.map((row) => row.actorUserId))]
  const tenantIds = [...new Set(rows.map((row) => row.tenantId).filter((value): value is string => Boolean(value)))]

  const [actors, tenants] = await Promise.all([
    actorIds.length
      ? prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true, username: true },
        })
      : [],
    tenantIds.length
      ? prisma.tenant.findMany({
          where: { id: { in: tenantIds } },
          select: { id: true, name: true, code: true },
        })
      : [],
  ])

  const actorMap = new Map(actors.map((actor) => [actor.id, actor]))
  const tenantMap = new Map(tenants.map((tenant) => [tenant.id, tenant]))

  const lines = [
    toCsvLine([
      'createdAt',
      'actorName',
      'actorUsername',
      'tenantName',
      'tenantCode',
      'entityType',
      'entityId',
      'action',
      'summary',
      'diff',
    ]),
  ]

  for (const row of rows) {
    const formatted = formatAuditLogRow(row, actorMap, tenantMap)
    lines.push(
      toCsvLine([
        row.createdAt.toISOString(),
        formatted.actor.name,
        formatted.actor.username,
        formatted.tenant?.name || '',
        formatted.tenant?.code || '',
        row.entityType,
        row.entityId,
        row.action,
        formatted.summary,
        formatted.diff,
      ]),
    )
  }

  return lines.join('\n')
}

export async function getAuditLogDetail(id: string, user: SessionUser) {
  const tenantId = resolveTenantFilter(user, {
    page: 1,
    pageSize: 1,
    sort: 'createdAt:desc',
  })

  const row = await prisma.auditLog.findUnique({
    where: { id },
  })

  if (!row) {
    throw new ApiError(404, 'AUDIT_LOG_NOT_FOUND', 'Audit log tidak ditemukan.')
  }

  if (tenantId && row.tenantId !== tenantId) {
    throw new ApiError(404, 'AUDIT_LOG_NOT_FOUND', 'Audit log tidak ditemukan.')
  }

  const [actor, tenant] = await Promise.all([
    prisma.user.findUnique({
      where: { id: row.actorUserId },
      select: { id: true, name: true, username: true },
    }),
    row.tenantId
      ? prisma.tenant.findUnique({
          where: { id: row.tenantId },
          select: { id: true, name: true, code: true },
        })
      : Promise.resolve(null),
  ])

  const actorMap = new Map(actor ? [[actor.id, actor]] : [])
  const tenantMap = new Map(tenant ? [[tenant.id, tenant]] : [])
  return formatAuditLogRow(row, actorMap, tenantMap)
}
