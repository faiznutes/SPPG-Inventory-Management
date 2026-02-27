import { Prisma } from '../../lib/prisma-client.js'
import { prisma } from '../../lib/prisma.js'
import { ApiError } from '../../utils/api-error.js'
import { fromTenantScopedItemName, tenantItemSuffix, toTenantScopedItemName } from '../../utils/item-scope.js'

type CreateItemInput = {
  name: string
  sku?: string
  categoryId?: string
  type: 'CONSUMABLE' | 'ASSET' | 'GAS'
  unit: string
  minStock: number
  reorderQty?: number
}

type BulkItemAction = 'ACTIVATE' | 'DEACTIVATE' | 'DELETE' | 'UPDATE'

type BulkItemUpdatePayload = {
  categoryId?: string | null
  minStock?: number
  reorderQty?: number | null
  unit?: string
  type?: 'CONSUMABLE' | 'ASSET' | 'GAS'
}

export async function listItems(tenantId: string | undefined, isSuperAdmin: boolean, includeInactive: boolean) {
  if (includeInactive && !isSuperAdmin) {
    throw new ApiError(403, 'FORBIDDEN', 'Hanya super admin yang dapat melihat item nonaktif.')
  }

  const suffix = tenantItemSuffix(tenantId)
  const items = await prisma.item.findMany({
    where: {
      ...(suffix
        ? {
            name: {
              endsWith: suffix,
            },
          }
        : {}),
      ...(includeInactive
        ? {}
        : {
            isActive: true,
          }),
    },
    include: {
      category: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  return items.map((item) => ({
    id: item.id,
    name: fromTenantScopedItemName(item.name),
    sku: item.sku,
    type: item.type,
    unit: item.unit,
    minStock: Number(item.minStock),
    reorderQty: item.reorderQty ? Number(item.reorderQty) : null,
    category: item.category
      ? {
          id: item.category.id,
          name: item.category.name,
        }
      : null,
    isActive: item.isActive,
  }))
}

export async function createItem(input: CreateItemInput, actorUserId: string, tenantId?: string) {
  if (!tenantId) {
    throw new ApiError(400, 'TENANT_CONTEXT_REQUIRED', 'Tenant aktif tidak ditemukan pada sesi pengguna.')
  }

  const name = input.name.trim()
  const scopedName = toTenantScopedItemName(name, tenantId)
  const unit = input.unit.trim()
  const sku = input.sku?.trim() || undefined

  if (name.length < 2) {
    throw new ApiError(400, 'ITEM_NAME_INVALID', 'Nama item minimal 2 karakter.')
  }

  const duplicateName = await prisma.item.findFirst({
    where: {
      name: scopedName,
    },
    select: {
      id: true,
    },
  })

  if (duplicateName) {
    throw new ApiError(409, 'ITEM_EXISTS', 'Nama item sudah ada pada tenant ini.')
  }

  if (!unit) {
    throw new ApiError(400, 'ITEM_UNIT_INVALID', 'Satuan item wajib diisi.')
  }

  try {
    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.item.create({
        data: {
          name: scopedName,
          sku,
          categoryId: input.categoryId,
          type: input.type,
          unit,
          minStock: input.minStock,
          reorderQty: input.reorderQty,
        },
        include: {
          category: true,
        },
      })

      const locations = await tx.location.findMany({ select: { id: true } })
      if (locations.length) {
        await tx.stock.createMany({
          data: locations.map((location) => ({
            itemId: created.id,
            locationId: location.id,
            qty: 0,
          })),
          skipDuplicates: true,
        })
      }

      await tx.auditLog.create({
        data: {
          actorUserId,
          tenantId,
          entityType: 'items',
          entityId: created.id,
          action: 'CREATE',
          diffJson: {
            name: created.name,
            sku: created.sku,
            type: created.type,
            unit: created.unit,
          },
        },
      })

      return created
    })

    return {
      id: item.id,
      name: fromTenantScopedItemName(item.name),
      sku: item.sku,
      type: item.type,
      unit: item.unit,
      minStock: Number(item.minStock),
      reorderQty: item.reorderQty ? Number(item.reorderQty) : null,
      category: item.category
        ? {
            id: item.category.id,
            name: item.category.name,
          }
        : null,
      isActive: item.isActive,
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ApiError(409, 'ITEM_EXISTS', 'SKU atau data item sudah ada.')
      }

      if (error.code === 'P2003') {
        throw new ApiError(400, 'CATEGORY_NOT_FOUND', 'Kategori tidak ditemukan atau tidak valid.')
      }
    }

    throw new ApiError(500, 'ITEM_CREATE_FAILED', 'Gagal menyimpan item baru.')
  }
}

export async function bulkItemAction(
  actorUserId: string,
  tenantId: string | undefined,
  ids: string[],
  action: BulkItemAction,
  payload?: BulkItemUpdatePayload,
) {
  if (!tenantId) {
    throw new ApiError(400, 'TENANT_CONTEXT_REQUIRED', 'Tenant aktif tidak ditemukan pada sesi pengguna.')
  }

  const uniqueIds = [...new Set(ids)]
  if (!uniqueIds.length) {
    throw new ApiError(400, 'BULK_ITEMS_EMPTY', 'Pilih minimal satu item untuk aksi pilihan.')
  }

  const items = await prisma.item.findMany({
    where: {
      id: { in: uniqueIds },
      name: {
        endsWith: tenantItemSuffix(tenantId),
      },
    },
    select: { id: true, name: true, isActive: true },
  })

  if (!items.length) {
    throw new ApiError(404, 'ITEMS_NOT_FOUND', 'Item tidak ditemukan untuk aksi pilihan.')
  }

  const foundIds = new Set(items.map((item) => item.id))
  const missingIds = uniqueIds.filter((id) => !foundIds.has(id))

  await prisma.$transaction(async (tx) => {
    if (action === 'ACTIVATE') {
      await tx.item.updateMany({
        where: { id: { in: items.map((item) => item.id) } },
        data: { isActive: true },
      })
    } else if (action === 'DEACTIVATE') {
      await tx.item.updateMany({
        where: { id: { in: items.map((item) => item.id) } },
        data: { isActive: false },
      })
    } else if (action === 'DELETE') {
      const targetIds = items.map((item) => item.id)
      await tx.asset.deleteMany({
        where: { itemId: { in: targetIds } },
      })
      await tx.stock.deleteMany({
        where: { itemId: { in: targetIds } },
      })
      await tx.inventoryTransaction.deleteMany({
        where: { itemId: { in: targetIds } },
      })
      await tx.item.deleteMany({
        where: { id: { in: targetIds } },
      })
    } else {
      const data: {
        categoryId?: string | null
        minStock?: number
        reorderQty?: number | null
        unit?: string
        type?: 'CONSUMABLE' | 'ASSET' | 'GAS'
      } = {}

      if (payload?.categoryId !== undefined) data.categoryId = payload.categoryId
      if (payload?.minStock !== undefined) data.minStock = payload.minStock
      if (payload?.reorderQty !== undefined) data.reorderQty = payload.reorderQty
      if (payload?.unit !== undefined) data.unit = payload.unit.trim()
      if (payload?.type !== undefined) data.type = payload.type

      await tx.item.updateMany({
        where: { id: { in: items.map((item) => item.id) } },
        data,
      })
    }

    await tx.auditLog.create({
      data: {
        actorUserId,
        tenantId,
        entityType: 'items',
        entityId: 'bulk',
        action: `BULK_${action}`,
        diffJson: {
          ids: uniqueIds,
          payload: payload || null,
          missingIds,
        },
      },
    })
  })

  return {
    code: 'ITEM_BULK_ACTION_COMPLETED',
    message: `Aksi item terpilih selesai. Diproses: ${items.length}, tidak ditemukan: ${missingIds.length}.`,
    action,
    affectedCount: items.length,
    missingIds,
  }
}
