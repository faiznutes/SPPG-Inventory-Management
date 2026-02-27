import { prisma } from '../../lib/prisma.js'
import { fromTenantScopedItemName, tenantItemSuffix } from '../../utils/item-scope.js'

function stockStatus(qty: number, minStock: number) {
  if (qty <= 0) return 'Habis'
  if (qty <= minStock) return 'Menipis'
  return 'Aman'
}

function isInactiveLocationName(name: string) {
  return name.startsWith('INACTIVE - ') || name.includes('::INACTIVE - ')
}

function displayLocationName(locationName: string, tenantCode?: string) {
  if (!tenantCode) return locationName
  const prefix = `${tenantCode}::`
  return locationName.startsWith(prefix) ? locationName.slice(prefix.length) : locationName
}

export async function listStocks(tenantId?: string, activeLocationId?: string) {
  const suffix = tenantItemSuffix(tenantId)
  const tenant = tenantId
    ? await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { code: true },
      })
    : null

  const rows = await prisma.stock.findMany({
    where: {
      ...(activeLocationId
        ? {
            locationId: activeLocationId,
          }
        : {}),
      item: {
        isActive: true,
        ...(suffix
          ? {
              name: {
                endsWith: suffix,
              },
            }
          : {}),
      },
    },
    include: {
      item: true,
      location: true,
    },
    orderBy: [{ location: { name: 'asc' } }, { item: { name: 'asc' } }],
  })

  return rows
    .filter((row) => !isInactiveLocationName(row.location.name))
    .map((row) => {
    const qty = Number(row.qty)
    const minStock = Number(row.item.minStock)

    return {
      id: row.id,
      itemId: row.itemId,
      itemName: fromTenantScopedItemName(row.item.name),
      itemType: row.item.type,
      unit: row.item.unit,
      minStock,
      locationId: row.locationId,
      locationName: displayLocationName(row.location.name, tenant?.code),
      qty,
      status: stockStatus(qty, minStock),
      updatedAt: row.updatedAt,
    }
    })
}
