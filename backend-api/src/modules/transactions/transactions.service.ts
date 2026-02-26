import { Prisma, TransactionType } from '../../lib/prisma-client.js'
import type { Prisma as PrismaNamespace, TransactionType as TransactionTypeType } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { ApiError } from '../../utils/api-error.js'

type CreateTransactionInput = {
  trxType: TransactionTypeType
  itemId: string
  fromLocationId?: string
  toLocationId?: string
  qty: number
  reason?: string
}

type BulkAdjustInput = {
  reason: string
  adjustments: Array<{
    itemId: string
    locationId: string
    qty: number
  }>
}

type TransactionPeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY'

type ListTransactionsQuery = {
  period?: TransactionPeriod
  trxType?: TransactionTypeType
  from?: string
  to?: string
}

async function getOrCreateStock(tx: PrismaNamespace.TransactionClient, itemId: string, locationId: string) {
  const existing = await tx.stock.findUnique({
    where: {
      itemId_locationId: {
        itemId,
        locationId,
      },
    },
  })

  if (existing) return existing

  return tx.stock.create({
    data: {
      itemId,
      locationId,
      qty: 0,
    },
  })
}

function validatePayload(input: CreateTransactionInput) {
  if (input.qty === 0) {
    throw new ApiError(400, 'QTY_INVALID', 'Qty tidak boleh 0.')
  }

  if (
    (input.trxType === TransactionType.IN ||
      input.trxType === TransactionType.OUT ||
      input.trxType === TransactionType.TRANSFER) &&
    input.qty < 0
  ) {
    throw new ApiError(400, 'QTY_INVALID', 'Qty untuk IN/OUT/TRANSFER harus positif.')
  }

  if (input.trxType === TransactionType.IN && !input.toLocationId) {
    throw new ApiError(400, 'LOCATION_REQUIRED', 'Lokasi tujuan wajib untuk transaksi IN.')
  }

  if (input.trxType === TransactionType.OUT && !input.fromLocationId) {
    throw new ApiError(400, 'LOCATION_REQUIRED', 'Lokasi asal wajib untuk transaksi OUT.')
  }

  if (input.trxType === TransactionType.TRANSFER) {
    if (!input.fromLocationId || !input.toLocationId) {
      throw new ApiError(400, 'LOCATION_REQUIRED', 'Lokasi asal dan tujuan wajib untuk transaksi TRANSFER.')
    }

    if (input.fromLocationId === input.toLocationId) {
      throw new ApiError(400, 'LOCATION_INVALID', 'Lokasi asal dan tujuan tidak boleh sama.')
    }
  }

  if (input.trxType === TransactionType.ADJUST && !input.fromLocationId) {
    throw new ApiError(400, 'LOCATION_REQUIRED', 'Lokasi wajib untuk transaksi ADJUST.')
  }
}

export async function listTransactions(query: ListTransactionsQuery = {}) {
  const range = resolveRange(query)
  const rows = await prisma.inventoryTransaction.findMany({
    where: {
      ...(query.trxType
        ? {
            trxType: query.trxType,
          }
        : {}),
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
      actor: {
        select: {
          id: true,
          name: true,
          username: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  return rows.map((row) => ({
    id: row.id,
    trxType: row.trxType,
    itemId: row.itemId,
    fromLocationId: row.fromLocationId,
    toLocationId: row.toLocationId,
    qty: row.qty ? Number(row.qty) : 0,
    reason: row.reason,
    createdAt: row.createdAt,
    actor: row.actor,
  }))
}

function resolveRange(query: ListTransactionsQuery): { from: Date; to: Date } | null {
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

export async function createTransaction(input: CreateTransactionInput, actorUserId: string) {
  validatePayload(input)

  const item = await prisma.item.findUnique({ where: { id: input.itemId } })
  if (!item) {
    throw new ApiError(404, 'ITEM_NOT_FOUND', 'Item tidak ditemukan.')
  }

  const created = await prisma.$transaction(async (tx) => {
    if (input.trxType === TransactionType.IN) {
      const stock = await getOrCreateStock(tx, input.itemId, input.toLocationId!)

      await tx.stock.update({
        where: { id: stock.id },
        data: { qty: new Prisma.Decimal(stock.qty).plus(input.qty) },
      })
    }

    if (input.trxType === TransactionType.OUT) {
      const stock = await getOrCreateStock(tx, input.itemId, input.fromLocationId!)
      const currentQty = Number(stock.qty)

      if (currentQty < input.qty) {
        throw new ApiError(400, 'STOCK_INSUFFICIENT', 'Stok tidak mencukupi untuk transaksi OUT.')
      }

      await tx.stock.update({
        where: { id: stock.id },
        data: { qty: new Prisma.Decimal(stock.qty).minus(input.qty) },
      })
    }

    if (input.trxType === TransactionType.TRANSFER) {
      const source = await getOrCreateStock(tx, input.itemId, input.fromLocationId!)
      const target = await getOrCreateStock(tx, input.itemId, input.toLocationId!)

      const sourceQty = Number(source.qty)
      if (sourceQty < input.qty) {
        throw new ApiError(400, 'STOCK_INSUFFICIENT', 'Stok asal tidak cukup untuk transfer.')
      }

      await tx.stock.update({
        where: { id: source.id },
        data: { qty: new Prisma.Decimal(source.qty).minus(input.qty) },
      })

      await tx.stock.update({
        where: { id: target.id },
        data: { qty: new Prisma.Decimal(target.qty).plus(input.qty) },
      })
    }

    if (input.trxType === TransactionType.ADJUST) {
      const stock = await getOrCreateStock(tx, input.itemId, input.fromLocationId!)
      const newQty = Number(stock.qty) + input.qty

      if (newQty < 0) {
        throw new ApiError(400, 'STOCK_NEGATIVE', 'Hasil penyesuaian stok tidak boleh negatif.')
      }

      await tx.stock.update({
        where: { id: stock.id },
        data: { qty: new Prisma.Decimal(stock.qty).plus(input.qty) },
      })
    }

    const transaction = await tx.inventoryTransaction.create({
      data: {
        trxType: input.trxType,
        itemId: input.itemId,
        fromLocationId: input.fromLocationId,
        toLocationId: input.toLocationId,
        qty: input.qty,
        reason: input.reason,
        createdBy: actorUserId,
      },
    })

    await tx.auditLog.create({
      data: {
        actorUserId,
        entityType: 'inventory_transactions',
        entityId: transaction.id,
        action: 'CREATE',
        diffJson: {
          trxType: input.trxType,
          itemId: input.itemId,
          fromLocationId: input.fromLocationId,
          toLocationId: input.toLocationId,
          qty: input.qty,
        },
      },
    })

    return transaction
  })

  return {
    id: created.id,
    trxType: created.trxType,
    itemId: created.itemId,
    fromLocationId: created.fromLocationId,
    toLocationId: created.toLocationId,
    qty: created.qty ? Number(created.qty) : 0,
    reason: created.reason,
    createdBy: created.createdBy,
    createdAt: created.createdAt,
  }
}

export async function createBulkAdjustTransactions(input: BulkAdjustInput, actorUserId: string) {
  const reason = input.reason.trim()
  if (!reason) {
    throw new ApiError(400, 'REASON_REQUIRED', 'Alasan bulk penyesuaian wajib diisi.')
  }

  const uniqueAdjustments = input.adjustments.filter((row) => Number.isFinite(row.qty) && row.qty !== 0)
  if (!uniqueAdjustments.length) {
    throw new ApiError(400, 'ADJUSTMENTS_EMPTY', 'Isi minimal satu qty penyesuaian yang valid.')
  }

  const itemIds = [...new Set(uniqueAdjustments.map((row) => row.itemId))]
  const items = await prisma.item.findMany({
    where: {
      id: { in: itemIds },
    },
    select: { id: true },
  })

  const itemSet = new Set(items.map((item) => item.id))
  const missingItem = uniqueAdjustments.find((row) => !itemSet.has(row.itemId))
  if (missingItem) {
    throw new ApiError(404, 'ITEM_NOT_FOUND', 'Ada item bulk penyesuaian yang tidak ditemukan.')
  }

  const created = await prisma.$transaction(async (tx) => {
    const results: Array<{ id: string; itemId: string; locationId: string; qty: number }> = []

    for (const adj of uniqueAdjustments) {
      const stock = await getOrCreateStock(tx, adj.itemId, adj.locationId)
      const newQty = Number(stock.qty) + adj.qty
      if (newQty < 0) {
        throw new ApiError(400, 'STOCK_NEGATIVE', 'Hasil penyesuaian stok tidak boleh negatif.')
      }

      await tx.stock.update({
        where: { id: stock.id },
        data: { qty: new Prisma.Decimal(stock.qty).plus(adj.qty) },
      })

      const trx = await tx.inventoryTransaction.create({
        data: {
          trxType: TransactionType.ADJUST,
          itemId: adj.itemId,
          fromLocationId: adj.locationId,
          qty: adj.qty,
          reason,
          createdBy: actorUserId,
        },
      })

      results.push({
        id: trx.id,
        itemId: adj.itemId,
        locationId: adj.locationId,
        qty: adj.qty,
      })
    }

    await tx.auditLog.create({
      data: {
        actorUserId,
        entityType: 'inventory_transactions',
        entityId: 'bulk_adjust',
        action: 'BULK_ADJUST',
        diffJson: {
          reason,
          count: results.length,
          adjustments: results,
        },
      },
    })

    return results
  })

  return {
    code: 'BULK_ADJUST_COMPLETED',
    message: `Bulk penyesuaian stok berhasil diproses untuk ${created.length} baris.`,
    count: created.length,
    transactions: created,
  }
}
