import { prisma } from '../../lib/prisma.js'
import { ApiError } from '../../utils/api-error.js'

type CreateItemInput = {
  name: string
  sku?: string
  categoryId?: string
  type: 'CONSUMABLE' | 'ASSET' | 'GAS'
  unit: string
  minStock: number
  reorderQty?: number
}

export async function listItems() {
  const items = await prisma.item.findMany({
    include: {
      category: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  return items.map((item) => ({
    id: item.id,
    name: item.name,
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

export async function createItem(input: CreateItemInput) {
  try {
    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.item.create({
        data: {
          name: input.name,
          sku: input.sku,
          categoryId: input.categoryId,
          type: input.type,
          unit: input.unit,
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
          actorUserId: 'system',
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
      name: item.name,
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
  } catch {
    throw new ApiError(409, 'ITEM_EXISTS', 'SKU atau data item sudah ada.')
  }
}
