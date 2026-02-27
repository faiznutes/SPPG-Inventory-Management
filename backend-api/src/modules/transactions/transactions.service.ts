import { Prisma, TransactionType } from '../../lib/prisma-client.js'
import type { Prisma as PrismaNamespace, TransactionType as TransactionTypeType } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { ApiError } from '../../utils/api-error.js'
import { isItemOwnedByTenant, tenantItemSuffix } from '../../utils/item-scope.js'

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

function isInactiveLocationName(name: string) {
  return name.startsWith('INACTIVE - ') || name.includes('::INACTIVE - ')
}

async function resolveTenantLocationSet(tenantId?: string) {
  if (!tenantId) {
    throw new ApiError(400, 'TENANT_CONTEXT_REQUIRED', 'Tenant aktif tidak ditemukan pada sesi pengguna.')
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      code: true,
      isActive: true,
    },
  })

  if (!tenant || !tenant.isActive) {
    throw new ApiError(403, 'FORBIDDEN', 'Tenant tidak aktif atau tidak ditemukan.')
  }

  const rows = await prisma.location.findMany({
    where: {
      name: {
        startsWith: `${tenant.code}::`,
      },
    },
    select: {
      id: true,
      name: true,
    },
  })

  return new Set(rows.filter((row) => !isInactiveLocationName(row.name)).map((row) => row.id))
}

function ensureLocationInTenant(locationId: string | undefined, tenantLocationIds: Set<string>) {
  if (!locationId) return
  if (!tenantLocationIds.has(locationId)) {
    throw new ApiError(403, 'FORBIDDEN', 'Lokasi tidak tersedia untuk tenant aktif ini.')
  }
}

async function ensureLocationActive(locationId: string) {
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { id: true, name: true },
  })

  if (!location) {
    throw new ApiError(404, 'LOCATION_NOT_FOUND', 'Lokasi tidak ditemukan.')
  }

  if (isInactiveLocationName(location.name)) {
    throw new ApiError(400, 'LOCATION_INACTIVE', 'Lokasi nonaktif tidak bisa dipakai transaksi.')
  }
}

function ensureActiveLocationContext(
  input: CreateTransactionInput,
  activeLocationId: string | undefined,
) {
  if (!activeLocationId) return

  if (input.trxType === TransactionType.IN && input.toLocationId !== activeLocationId) {
    throw new ApiError(403, 'FORBIDDEN', 'Transaksi IN harus menggunakan lokasi aktif.')
  }

  if (input.trxType === TransactionType.OUT && input.fromLocationId !== activeLocationId) {
    throw new ApiError(403, 'FORBIDDEN', 'Transaksi OUT harus menggunakan lokasi aktif.')
  }

  if (input.trxType === TransactionType.ADJUST && input.fromLocationId !== activeLocationId) {
    throw new ApiError(403, 'FORBIDDEN', 'Penyesuaian stok harus menggunakan lokasi aktif.')
  }

  if (input.trxType === TransactionType.TRANSFER && input.fromLocationId !== activeLocationId) {
    throw new ApiError(403, 'FORBIDDEN', 'Transfer harus berasal dari lokasi aktif.')
  }
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

export async function listTransactions(query: ListTransactionsQuery = {}, tenantId?: string, activeLocationId?: string) {
  const suffix = tenantItemSuffix(tenantId)
  const tenantItems = await prisma.item.findMany({
    where: suffix
      ? {
          name: {
            endsWith: suffix,
          },
        }
      : {},
    select: {
      id: true,
    },
  })
  const tenantItemIds = tenantItems.map((item) => item.id)
  if (!tenantItemIds.length) {
    return []
  }

  const range = resolveRange(query)
  const rows = await prisma.inventoryTransaction.findMany({
    where: {
      itemId: {
        in: tenantItemIds,
      },
      ...(activeLocationId
        ? {
            OR: [{ fromLocationId: activeLocationId }, { toLocationId: activeLocationId }],
          }
        : {}),
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

export async function createTransaction(
  input: CreateTransactionInput,
  actorUserId: string,
  tenantId?: string,
  activeLocationId?: string,
) {
  validatePayload(input)
  ensureActiveLocationContext(input, activeLocationId)

  if (!tenantId) {
    throw new ApiError(400, 'TENANT_CONTEXT_REQUIRED', 'Tenant aktif tidak ditemukan pada sesi pengguna.')
  }

  const item = await prisma.item.findUnique({ where: { id: input.itemId } })
  if (!item) {
    throw new ApiError(404, 'ITEM_NOT_FOUND', 'Item tidak ditemukan.')
  }

  if (!isItemOwnedByTenant(item.name, tenantId)) {
    throw new ApiError(403, 'FORBIDDEN', 'Item tidak tersedia pada tenant aktif.')
  }

  if (!item.isActive) {
    throw new ApiError(400, 'ITEM_INACTIVE', 'Item nonaktif tidak dapat dipakai transaksi.')
  }

  const tenantLocationIds = await resolveTenantLocationSet(tenantId)
  ensureLocationInTenant(input.fromLocationId, tenantLocationIds)
  ensureLocationInTenant(input.toLocationId, tenantLocationIds)

  if (input.fromLocationId) await ensureLocationActive(input.fromLocationId)
  if (input.toLocationId) await ensureLocationActive(input.toLocationId)

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
        throw new ApiError(
          400,
          'STOCK_INSUFFICIENT',
          `Stok tidak mencukupi untuk transaksi OUT. Tersedia ${currentQty}, diminta ${input.qty}.`,
        )
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
        throw new ApiError(
          400,
          'STOCK_INSUFFICIENT',
          `Stok asal tidak cukup untuk transfer. Tersedia ${sourceQty}, diminta ${input.qty}.`,
        )
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
        tenantId,
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

export async function createBulkAdjustTransactions(
  input: BulkAdjustInput,
  actorUserId: string,
  tenantId?: string,
  activeLocationId?: string,
) {
  if (!tenantId) {
    throw new ApiError(400, 'TENANT_CONTEXT_REQUIRED', 'Tenant aktif tidak ditemukan pada sesi pengguna.')
  }

  const reason = input.reason.trim()
  if (!reason) {
    throw new ApiError(400, 'REASON_REQUIRED', 'Alasan penyesuaian terpilih wajib diisi.')
  }

  const uniqueAdjustments = input.adjustments.filter((row) => Number.isFinite(row.qty) && row.qty !== 0)
  if (!uniqueAdjustments.length) {
    throw new ApiError(400, 'ADJUSTMENTS_EMPTY', 'Isi minimal satu qty penyesuaian yang valid.')
  }

  const itemIds = [...new Set(uniqueAdjustments.map((row) => row.itemId))]
  const locationIds = [...new Set(uniqueAdjustments.map((row) => row.locationId))]

  const tenantLocationIds = await resolveTenantLocationSet(tenantId)
  for (const locationId of locationIds) {
    ensureLocationInTenant(locationId, tenantLocationIds)
  }

  if (activeLocationId && locationIds.some((locationId) => locationId !== activeLocationId)) {
    throw new ApiError(403, 'FORBIDDEN', 'Bulk penyesuaian hanya boleh untuk lokasi aktif.')
  }

  const items = await prisma.item.findMany({
    where: {
      id: { in: itemIds },
      name: {
        endsWith: tenantItemSuffix(tenantId),
      },
      isActive: true,
    },
    select: { id: true },
  })

  const itemSet = new Set(items.map((item) => item.id))
  const missingItem = uniqueAdjustments.find((row) => !itemSet.has(row.itemId))
  if (missingItem) {
    throw new ApiError(404, 'ITEM_NOT_FOUND', 'Ada item penyesuaian terpilih yang tidak ditemukan.')
  }

  for (const locationId of locationIds) {
    await ensureLocationActive(locationId)
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
        tenantId,
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
    message: `Penyesuaian stok terpilih berhasil diproses untuk ${created.length} baris.`,
    count: created.length,
    transactions: created,
  }
}
