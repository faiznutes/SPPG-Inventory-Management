import { PurchaseRequestStatus } from '../../lib/prisma-client.js'
import type { PurchaseRequestStatus as PurchaseRequestStatusType } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { ApiError } from '../../utils/api-error.js'

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

export async function listPurchaseRequests() {
  const rows = await prisma.purchaseRequest.findMany({
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

export async function createPurchaseRequest(userId: string, input: CreatePurchaseRequestInput) {
  const total = await prisma.purchaseRequest.count()
  const prNumber = toPrNumber(total + 1)

  const created = await prisma.$transaction(async (tx) => {
    const pr = await tx.purchaseRequest.create({
      data: {
        prNumber,
        status: PurchaseRequestStatus.DRAFT,
        requestedBy: userId,
        notes: input.notes,
        items: {
          create: input.items.map((item) => ({
            itemId: item.itemId,
            itemName: item.itemName,
            qty: item.qty,
            unitPrice: item.unitPrice,
          })),
        },
      },
      include: {
        items: true,
      },
    })

    await tx.purchaseRequestStatusHistory.create({
      data: {
        purchaseRequestId: pr.id,
        status: PurchaseRequestStatus.DRAFT,
        notes: 'PR dibuat',
        changedBy: userId,
      },
    })

    return pr
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

export async function getPurchaseRequestDetail(id: string) {
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
  status: PurchaseRequestStatusType,
  notes?: string,
) {
  const existing = await prisma.purchaseRequest.findUnique({ where: { id } })
  if (!existing) {
    throw new ApiError(404, 'PR_NOT_FOUND', 'Purchase request tidak ditemukan.')
  }

  await prisma.$transaction(async (tx) => {
    await applyStatusUpdate(tx, existing.id, existing.approvedBy, userId, status, notes)
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
  status: PurchaseRequestStatusType,
  notes?: string,
) {
  const existing = await prisma.purchaseRequest.findMany({
    where: {
      id: {
        in: ids,
      },
    },
    select: {
      id: true,
      approvedBy: true,
    },
  })

  if (!existing.length) {
    throw new ApiError(404, 'PR_NOT_FOUND', 'Purchase request tidak ditemukan.')
  }

  await prisma.$transaction(async (tx) => {
    for (const row of existing) {
      await applyStatusUpdate(tx, row.id, row.approvedBy, userId, status, notes)
    }
  })

  return {
    code: 'PR_BULK_STATUS_UPDATED',
    message: `${existing.length} purchase request berhasil diperbarui.`,
    count: existing.length,
  }
}
