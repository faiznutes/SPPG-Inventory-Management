import { PurchaseRequestStatus } from '../../lib/prisma-client.js'
import type { PurchaseRequestStatus as PurchaseRequestStatusType } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { ApiError } from '../../utils/api-error.js'
import { fromTenantScopedItemName, tenantItemSuffix } from '../../utils/item-scope.js'

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

type CreatePurchaseRequestInput = {
  notes?: string
  items: Array<{
    itemId?: string
    itemName: string
    qty: number
    unitPrice: number
  }>
}

type PurchaseRequestPeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY'

type ListPurchaseRequestsQuery = {
  period?: PurchaseRequestPeriod
  from?: string
  to?: string
}

let purchaseRequestTenantColumnCache: boolean | null = null

async function hasPurchaseRequestTenantColumn() {
  if (purchaseRequestTenantColumnCache !== null) return purchaseRequestTenantColumnCache

  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'purchase_requests'
        AND column_name = 'tenant_id'
    ) AS "exists"
  `

  purchaseRequestTenantColumnCache = Boolean(rows[0]?.exists)
  return purchaseRequestTenantColumnCache
}

async function resolveTenantUserScope(tenantId?: string) {
  if (!tenantId) {
    throw new ApiError(400, 'TENANT_CONTEXT_REQUIRED', 'Tenant aktif tidak ditemukan pada sesi pengguna.')
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      code: true,
      isActive: true,
    },
  })

  if (!tenant || !tenant.isActive) {
    throw new ApiError(403, 'FORBIDDEN', 'Tenant tidak aktif atau tidak ditemukan.')
  }

  const rows = await prisma.tenantMembership.findMany({
    where: {
      tenantId: tenant.id,
    },
    select: {
      userId: true,
    },
  })

  return {
    tenant,
    userIds: rows.map((row) => row.userId),
  }
}

function toPrNumber(sequence: number) {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const seq = String(sequence).padStart(4, '0')
  return `PR-${yyyy}${mm}${dd}-${seq}`
}

function totalOf(items: Array<{ qty: number; unitPrice: number }>) {
  return items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0)
}

export async function listPurchaseRequests(query: ListPurchaseRequestsQuery = {}, tenantId?: string) {
  const scope = await resolveTenantUserScope(tenantId)
  const hasTenantColumn = await hasPurchaseRequestTenantColumn()
  const range = resolveRange(query)
  const rows = await prisma.purchaseRequest.findMany({
    where: {
      ...(hasTenantColumn
        ? {
            tenantId: scope.tenant.id,
          }
        : {
            requestedBy: {
              in: scope.userIds,
            },
          }),
      ...(range
        ? {
            createdAt: {
              gte: range.from,
              lte: range.to,
            },
          }
        : {}),
    },
    include: {
      items: true,
      requester: {
        select: {
          id: true,
          name: true,
          username: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return rows.map((row) => ({
    id: row.id,
    prNumber: row.prNumber,
    status: row.status,
    notes: row.notes,
    requestedBy: row.requester,
    createdAt: row.createdAt,
    totalAmount: totalOf(
      row.items.map((item) => ({
        qty: Number(item.qty),
        unitPrice: Number(item.unitPrice),
      })),
    ),
  }))
}

function resolveRange(query: ListPurchaseRequestsQuery): { from: Date; to: Date } | null {
  if (query.from || query.to) {
    const now = new Date()
    return {
      from: query.from ? new Date(query.from) : startOfDay(now),
      to: query.to ? new Date(query.to) : endOfDay(now),
    }
  }

  if (!query.period) return null

  const now = new Date()
  if (query.period === 'DAILY') {
    return {
      from: startOfDay(now),
      to: endOfDay(now),
    }
  }

  if (query.period === 'WEEKLY') {
    const mondayOffset = (now.getDay() + 6) % 7
    const monday = new Date(now)
    monday.setDate(now.getDate() - mondayOffset)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)

    return {
      from: startOfDay(monday),
      to: endOfDay(sunday),
    }
  }

  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return {
    from: startOfDay(startMonth),
    to: endOfDay(endMonth),
  }
}

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

export async function createPurchaseRequest(userId: string, input: CreatePurchaseRequestInput, tenantId?: string) {
  const scope = await resolveTenantUserScope(tenantId)
  const hasTenantColumn = await hasPurchaseRequestTenantColumn()
  if (!scope.userIds.includes(userId)) {
    throw new ApiError(403, 'FORBIDDEN', 'User tidak terdaftar pada tenant aktif ini.')
  }

  const requestedItemIds = [...new Set(input.items.map((item) => item.itemId).filter(Boolean) as string[])]
  const tenantSuffix = tenantItemSuffix(scope.tenant.id)
  const tenantItems = requestedItemIds.length
    ? await prisma.item.findMany({
        where: {
          id: {
            in: requestedItemIds,
          },
          name: {
            endsWith: tenantSuffix,
          },
        },
        select: {
          id: true,
          name: true,
          isActive: true,
        },
      })
    : []

  const tenantItemMap = new Map(tenantItems.map((item) => [item.id, item]))
  for (const itemId of requestedItemIds) {
    if (!tenantItemMap.has(itemId)) {
      throw new ApiError(403, 'FORBIDDEN', 'Item pada PR tidak tersedia untuk tenant aktif ini.')
    }
  }

  const inactiveTenantItem = tenantItems.find((item) => !item.isActive)
  if (inactiveTenantItem) {
    throw new ApiError(400, 'ITEM_INACTIVE', 'Item nonaktif tidak dapat diajukan pada PR.')
  }

  const total = await prisma.purchaseRequest.count()
  const prNumber = toPrNumber(total + 1)

  const created = await prisma.$transaction(async (tx) => {
    let prId = ''
    let prStatus: PurchaseRequestStatusType = PurchaseRequestStatus.DRAFT
    let prNotes: string | null = input.notes || null
    let prCreatedAt = new Date()

    if (hasTenantColumn) {
      const pr = await tx.purchaseRequest.create({
        data: {
          prNumber,
          tenantId: scope.tenant.id,
          status: PurchaseRequestStatus.DRAFT,
          requestedBy: userId,
          notes: input.notes,
        },
        select: {
          id: true,
          status: true,
          notes: true,
          createdAt: true,
        },
      })
      prId = pr.id
      prStatus = pr.status
      prNotes = pr.notes
      prCreatedAt = pr.createdAt
    } else {
      const inserted = await tx.$queryRaw<Array<{ id: string; status: PurchaseRequestStatusType; notes: string | null; created_at: Date }>>`
        INSERT INTO purchase_requests (pr_number, status, requested_by, notes)
        VALUES (${prNumber}, ${PurchaseRequestStatus.DRAFT}::"PurchaseRequestStatus", ${userId}, ${input.notes || null})
        RETURNING id, status, notes, created_at
      `
      const row = inserted[0]
      if (!row) {
        throw new ApiError(500, 'PR_CREATE_FAILED', 'Gagal membuat purchase request.')
      }
      prId = row.id
      prStatus = row.status
      prNotes = row.notes
      prCreatedAt = row.created_at
    }

    await tx.purchaseRequestItem.createMany({
      data: input.items.map((item) => {
        const scopedItem = item.itemId ? tenantItemMap.get(item.itemId) : null
        return {
          purchaseRequestId: prId,
          itemId: item.itemId,
          itemName: scopedItem ? fromTenantScopedItemName(scopedItem.name) : item.itemName,
          qty: item.qty,
          unitPrice: item.unitPrice,
        }
      }),
    })

    const createdItems = await tx.purchaseRequestItem.findMany({
      where: {
        purchaseRequestId: prId,
      },
      select: {
        qty: true,
        unitPrice: true,
      },
    })

    await tx.purchaseRequestStatusHistory.create({
      data: {
        purchaseRequestId: prId,
        status: PurchaseRequestStatus.DRAFT,
        notes: 'PR dibuat',
        changedBy: userId,
      },
    })

    return {
      id: prId,
      prNumber,
      status: prStatus,
      notes: prNotes,
      createdAt: prCreatedAt,
      items: createdItems,
    }
  })

  return {
    id: created.id,
    prNumber: created.prNumber,
    status: created.status,
    notes: created.notes,
    createdAt: created.createdAt,
    totalAmount: totalOf(
      created.items.map((item) => ({
        qty: Number(item.qty),
        unitPrice: Number(item.unitPrice),
      })),
    ),
  }
}

export async function getPurchaseRequestDetail(id: string, tenantId?: string) {
  const scope = await resolveTenantUserScope(tenantId)
  const hasTenantColumn = await hasPurchaseRequestTenantColumn()

  const row = await prisma.purchaseRequest.findUnique({
    where: { id },
    include: {
      requester: {
        select: {
          id: true,
          name: true,
          username: true,
        },
      },
      approver: {
        select: {
          id: true,
          name: true,
          username: true,
        },
      },
      items: true,
      history: {
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!row) {
    throw new ApiError(404, 'PR_NOT_FOUND', 'Purchase request tidak ditemukan.')
  }

  if (hasTenantColumn ? row.tenantId !== scope.tenant.id : !scope.userIds.includes(row.requestedBy)) {
    throw new ApiError(403, 'FORBIDDEN', 'Purchase request tidak tersedia untuk tenant aktif ini.')
  }

  return {
    id: row.id,
    prNumber: row.prNumber,
    status: row.status,
    notes: row.notes,
    createdAt: row.createdAt,
    requestedBy: row.requester,
    approvedBy: row.approver,
    items: row.items.map((item) => ({
      id: item.id,
      itemId: item.itemId,
      itemName: item.itemName,
      qty: Number(item.qty),
      unitPrice: Number(item.unitPrice),
      subtotal: Number(item.qty) * Number(item.unitPrice),
    })),
    history: row.history,
    totalAmount: totalOf(
      row.items.map((item) => ({
        qty: Number(item.qty),
        unitPrice: Number(item.unitPrice),
      })),
    ),
  }
}

export async function updatePurchaseRequestStatus(
  id: string,
  userId: string,
  tenantId: string | undefined,
  status: PurchaseRequestStatusType,
  notes?: string,
) {
  const scope = await resolveTenantUserScope(tenantId)
  const hasTenantColumn = await hasPurchaseRequestTenantColumn()
  const existing = await prisma.purchaseRequest.findUnique({ where: { id } })
  if (!existing) {
    throw new ApiError(404, 'PR_NOT_FOUND', 'Purchase request tidak ditemukan.')
  }

  if (hasTenantColumn ? existing.tenantId !== scope.tenant.id : !scope.userIds.includes(existing.requestedBy)) {
    throw new ApiError(403, 'FORBIDDEN', 'Purchase request tidak tersedia untuk tenant aktif ini.')
  }

  await prisma.$transaction(async (tx) => {
    await applyStatusUpdate(tx, existing.id, existing.approvedBy, userId, tenantId, status, notes)
  })

  return {
    code: 'PR_STATUS_UPDATED',
    message: 'Status purchase request berhasil diperbarui.',
  }
}

async function applyStatusUpdate(
  tx: TxClient,
  id: string,
  currentApprovedBy: string | null,
  userId: string,
  tenantId: string | undefined,
  status: PurchaseRequestStatusType,
  notes?: string,
) {
  await tx.purchaseRequest.update({
    where: { id },
    data: {
      status,
      approvedBy:
        status === PurchaseRequestStatus.APPROVED || status === PurchaseRequestStatus.RECEIVED
          ? userId
          : currentApprovedBy,
    },
  })

  await tx.purchaseRequestStatusHistory.create({
    data: {
      purchaseRequestId: id,
      status,
      notes,
      changedBy: userId,
    },
  })

  await tx.auditLog.create({
    data: {
      actorUserId: userId,
      tenantId,
      entityType: 'purchase_requests',
      entityId: id,
      action: 'STATUS_UPDATE',
      diffJson: {
        status,
        notes,
      },
    },
  })
}

export async function bulkUpdatePurchaseRequestStatus(
  ids: string[],
  userId: string,
  tenantId: string | undefined,
  status: PurchaseRequestStatusType,
  notes?: string,
) {
  const scope = await resolveTenantUserScope(tenantId)
  const hasTenantColumn = await hasPurchaseRequestTenantColumn()
  const existing = await prisma.purchaseRequest.findMany({
    where: {
      ...(hasTenantColumn
        ? {
            tenantId: scope.tenant.id,
          }
        : {
            requestedBy: {
              in: scope.userIds,
            },
          }),
      id: {
        in: ids,
      },
    },
    select: {
      id: true,
      approvedBy: true,
      requestedBy: true,
    },
  })

  if (!existing.length) {
    throw new ApiError(404, 'PR_NOT_FOUND', 'Purchase request tidak ditemukan.')
  }

  if (existing.length !== [...new Set(ids)].length) {
    throw new ApiError(403, 'FORBIDDEN', 'Sebagian purchase request tidak tersedia untuk tenant aktif ini.')
  }

  await prisma.$transaction(async (tx) => {
    for (const row of existing) {
      await applyStatusUpdate(tx, row.id, row.approvedBy, userId, tenantId, status, notes)
    }
  })

  return {
    code: 'PR_BULK_STATUS_UPDATED',
    message: `${existing.length} purchase request berhasil diperbarui.`,
    count: existing.length,
  }
}
