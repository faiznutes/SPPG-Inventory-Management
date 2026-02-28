import { Prisma, PurchaseRequestStatus } from '../../lib/prisma-client.js'
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
        AND table_schema = ANY (current_schemas(false))
    ) AS "exists"
  `

  purchaseRequestTenantColumnCache = Boolean(rows[0]?.exists)
  return purchaseRequestTenantColumnCache
}

type TenantUserScope = {
  tenant: {
    id: string
    code: string
    isActive: boolean
  }
  userIds: string[]
}

async function resolveTenantUserScope(tenantId?: string): Promise<TenantUserScope> {
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

async function resolveTenantUserScopeOrNull(tenantId?: string): Promise<TenantUserScope | null> {
  if (!tenantId) return null
  return resolveTenantUserScope(tenantId)
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
  const scope = await resolveTenantUserScopeOrNull(tenantId)
  if (!scope) return []
  const hasTenantColumn = await hasPurchaseRequestTenantColumn()
  const range = resolveRange(query)
  if (!hasTenantColumn) {
    if (!scope.userIds.length) return []
    const rangeFilter = range
      ? Prisma.sql`AND pr.created_at >= ${range.from} AND pr.created_at <= ${range.to}`
      : Prisma.empty
    const rows = await prisma.$queryRaw<
      Array<{
        id: string
        pr_number: string
        status: PurchaseRequestStatusType
        notes: string | null
        created_at: Date
        requester_id: string
        requester_name: string
        requester_username: string
        total_amount: unknown
      }>
    >`
      SELECT
        pr.id,
        pr.pr_number,
        pr.status,
        pr.notes,
        pr.created_at,
        requester.id AS requester_id,
        requester.name AS requester_name,
        requester.username AS requester_username,
        COALESCE(SUM(pri.qty * pri.unit_price), 0) AS total_amount
      FROM purchase_requests pr
      INNER JOIN users requester ON requester.id = pr.requested_by
      LEFT JOIN purchase_request_items pri ON pri.purchase_request_id = pr.id
      WHERE pr.requested_by IN (${Prisma.join(scope.userIds)})
      ${rangeFilter}
      GROUP BY pr.id, requester.id, requester.name, requester.username
      ORDER BY pr.created_at DESC
    `

    return rows.map((row) => ({
      id: row.id,
      prNumber: row.pr_number,
      status: row.status,
      notes: row.notes,
      requestedBy: {
        id: row.requester_id,
        name: row.requester_name,
        username: row.requester_username,
      },
      createdAt: row.created_at,
      totalAmount: Number(row.total_amount),
    }))
  }

  const rows = await prisma.purchaseRequest.findMany({
    where: {
      tenantId: scope.tenant.id,
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

    try {
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
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2022') {
        throw error
      }

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

  if (!hasTenantColumn) {
    const rows = await prisma.$queryRaw<
      Array<{
        id: string
        pr_number: string
        status: PurchaseRequestStatusType
        notes: string | null
        created_at: Date
        requested_by: string
        approved_by: string | null
        requester_id: string
        requester_name: string
        requester_username: string
        approver_id: string | null
        approver_name: string | null
        approver_username: string | null
      }>
    >`
      SELECT
        pr.id,
        pr.pr_number,
        pr.status,
        pr.notes,
        pr.created_at,
        pr.requested_by,
        pr.approved_by,
        requester.id AS requester_id,
        requester.name AS requester_name,
        requester.username AS requester_username,
        approver.id AS approver_id,
        approver.name AS approver_name,
        approver.username AS approver_username
      FROM purchase_requests pr
      INNER JOIN users requester ON requester.id = pr.requested_by
      LEFT JOIN users approver ON approver.id = pr.approved_by
      WHERE pr.id = ${id}
      LIMIT 1
    `

    const row = rows[0]
    if (!row) {
      throw new ApiError(404, 'PR_NOT_FOUND', 'Purchase request tidak ditemukan.')
    }

    if (!scope.userIds.includes(row.requested_by)) {
      throw new ApiError(403, 'FORBIDDEN', 'Purchase request tidak tersedia untuk tenant aktif ini.')
    }

    const [items, history] = await Promise.all([
      prisma.purchaseRequestItem.findMany({
        where: {
          purchaseRequestId: row.id,
        },
      }),
      prisma.purchaseRequestStatusHistory.findMany({
        where: {
          purchaseRequestId: row.id,
        },
        orderBy: { createdAt: 'asc' },
      }),
    ])

    return {
      id: row.id,
      prNumber: row.pr_number,
      status: row.status,
      notes: row.notes,
      createdAt: row.created_at,
      requestedBy: {
        id: row.requester_id,
        name: row.requester_name,
        username: row.requester_username,
      },
      approvedBy: row.approver_id
        ? {
            id: row.approver_id,
            name: row.approver_name || '-',
            username: row.approver_username || '-',
          }
        : null,
      items: items.map((item) => ({
        id: item.id,
        itemId: item.itemId,
        itemName: item.itemName,
        qty: Number(item.qty),
        unitPrice: Number(item.unitPrice),
        subtotal: Number(item.qty) * Number(item.unitPrice),
      })),
      history,
      totalAmount: totalOf(
        items.map((item) => ({
          qty: Number(item.qty),
          unitPrice: Number(item.unitPrice),
        })),
      ),
    }
  }

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

  if (row.tenantId !== scope.tenant.id) {
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
  if (!hasTenantColumn) {
    const rows = await prisma.$queryRaw<Array<{ id: string; requested_by: string; approved_by: string | null }>>`
      SELECT id, requested_by, approved_by
      FROM purchase_requests
      WHERE id = ${id}
      LIMIT 1
    `
    const existing = rows[0]
    if (!existing) {
      throw new ApiError(404, 'PR_NOT_FOUND', 'Purchase request tidak ditemukan.')
    }

    if (!scope.userIds.includes(existing.requested_by)) {
      throw new ApiError(403, 'FORBIDDEN', 'Purchase request tidak tersedia untuk tenant aktif ini.')
    }

    await prisma.$transaction(async (tx) => {
      await applyStatusUpdate(tx, existing.id, existing.approved_by, userId, tenantId, status, notes, hasTenantColumn)
    })

    return {
      code: 'PR_STATUS_UPDATED',
      message: 'Status purchase request berhasil diperbarui.',
    }
  }

  const existing = await prisma.purchaseRequest.findUnique({ where: { id } })
  if (!existing) {
    throw new ApiError(404, 'PR_NOT_FOUND', 'Purchase request tidak ditemukan.')
  }

  if (existing.tenantId !== scope.tenant.id) {
    throw new ApiError(403, 'FORBIDDEN', 'Purchase request tidak tersedia untuk tenant aktif ini.')
  }

  await prisma.$transaction(async (tx) => {
    await applyStatusUpdate(tx, existing.id, existing.approvedBy, userId, tenantId, status, notes, hasTenantColumn)
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
  hasTenantColumn = true,
) {
  const approvedBy =
    status === PurchaseRequestStatus.APPROVED || status === PurchaseRequestStatus.RECEIVED ? userId : currentApprovedBy

  if (hasTenantColumn) {
    await tx.purchaseRequest.update({
      where: { id },
      data: {
        status,
        approvedBy,
      },
    })
  } else {
    await tx.$executeRaw`
      UPDATE purchase_requests
      SET status = ${status}::"PurchaseRequestStatus",
          approved_by = ${approvedBy},
          updated_at = NOW()
      WHERE id = ${id}
    `
  }

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
  const uniqueIds = [...new Set(ids)]

  if (!hasTenantColumn) {
    if (!scope.userIds.length) {
      throw new ApiError(403, 'FORBIDDEN', 'Purchase request tidak tersedia untuk tenant aktif ini.')
    }

    const existing = await prisma.$queryRaw<Array<{ id: string; approved_by: string | null; requested_by: string }>>`
      SELECT id, approved_by, requested_by
      FROM purchase_requests
      WHERE id IN (${Prisma.join(uniqueIds)})
        AND requested_by IN (${Prisma.join(scope.userIds)})
    `

    if (!existing.length) {
      throw new ApiError(404, 'PR_NOT_FOUND', 'Purchase request tidak ditemukan.')
    }

    if (existing.length !== uniqueIds.length) {
      throw new ApiError(403, 'FORBIDDEN', 'Sebagian purchase request tidak tersedia untuk tenant aktif ini.')
    }

    await prisma.$transaction(async (tx) => {
      for (const row of existing) {
        await applyStatusUpdate(tx, row.id, row.approved_by, userId, tenantId, status, notes, hasTenantColumn)
      }
    })

    return {
      code: 'PR_BULK_STATUS_UPDATED',
      message: `${existing.length} purchase request berhasil diperbarui.`,
      count: existing.length,
    }
  }

  const existing = await prisma.purchaseRequest.findMany({
    where: {
      tenantId: scope.tenant.id,
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

  if (existing.length !== uniqueIds.length) {
    throw new ApiError(403, 'FORBIDDEN', 'Sebagian purchase request tidak tersedia untuk tenant aktif ini.')
  }

  await prisma.$transaction(async (tx) => {
    for (const row of existing) {
      await applyStatusUpdate(tx, row.id, row.approvedBy, userId, tenantId, status, notes, hasTenantColumn)
    }
  })

  return {
    code: 'PR_BULK_STATUS_UPDATED',
    message: `${existing.length} purchase request berhasil diperbarui.`,
    count: existing.length,
  }
}
