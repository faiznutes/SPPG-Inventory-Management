import { prisma } from '../../lib/prisma.js'

function stockStatus(qty: number, minStock: number) {
  if (qty <= 0) return 'Habis'
  if (qty <= minStock) return 'Menipis'
  return 'Aman'
}

function isInactiveLocationName(name: string) {
  return name.startsWith('INACTIVE - ') || name.includes('::INACTIVE - ')
}

export async function listStocks() {
  const rows = await prisma.stock.findMany({
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
      itemName: row.item.name,
      itemType: row.item.type,
      unit: row.item.unit,
      minStock,
      locationId: row.locationId,
      locationName: row.location.name,
      qty,
      status: stockStatus(qty, minStock),
      updatedAt: row.updatedAt,
    }
    })
}
