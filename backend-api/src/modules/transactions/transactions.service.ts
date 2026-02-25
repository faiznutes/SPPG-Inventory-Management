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

export async function listTransactions() {
  const rows = await prisma.inventoryTransaction.findMany({
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
