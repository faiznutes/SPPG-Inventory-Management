import { ChecklistRunStatus, PurchaseRequestStatus } from '../../lib/prisma-client.js'
import { prisma } from '../../lib/prisma.js'

function toDateOnly(date: Date) {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`)
}

export async function getDashboardSummary() {
  const today = toDateOnly(new Date())

  const [itemCount, stockRows, activePrCount, checklistDraftCount] = await Promise.all([
    prisma.item.count({
      where: { isActive: true },
    }),
    prisma.stock.findMany({
      include: {
        item: {
          select: {
            minStock: true,
          },
        },
      },
    }),
    prisma.purchaseRequest.count({
      where: {
        status: {
          in: [
            PurchaseRequestStatus.SUBMITTED,
            PurchaseRequestStatus.APPROVED,
            PurchaseRequestStatus.ORDERED,
            PurchaseRequestStatus.RECEIVED,
          ],
        },
      },
    }),
    prisma.checklistRun.count({
      where: {
        runDate: today,
        status: {
          in: [ChecklistRunStatus.DRAFT],
        },
      },
    }),
  ])

  const lowStockCount = stockRows.filter((row) => Number(row.qty) <= Number(row.item.minStock)).length

  return {
    itemCount,
    lowStockCount,
    checklistPendingCount: checklistDraftCount,
    activePrCount,
  }
}

export async function getLowStockRows() {
  const rows = await prisma.stock.findMany({
    include: {
      item: true,
      location: true,
    },
    orderBy: {
      updatedAt: 'desc',
    },
    take: 80,
  })

  return rows
    .filter((row) => Number(row.qty) <= Number(row.item.minStock))
    .sort((a, b) => Number(a.qty) - Number(b.qty))
    .slice(0, 20)
    .map((row) => ({
      id: row.id,
      itemId: row.itemId,
      itemName: row.item.name,
      locationId: row.locationId,
      locationName: row.location.name,
      qty: Number(row.qty),
      minStock: Number(row.item.minStock),
      unit: row.item.unit,
      updatedAt: row.updatedAt,
    }))
}
