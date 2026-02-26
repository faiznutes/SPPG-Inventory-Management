import { ChecklistRunStatus, PurchaseRequestStatus } from '../../lib/prisma-client.js'
import { prisma } from '../../lib/prisma.js'

type NotificationItem = {
  id: string
  title: string
  message: string
  time: string
  type: 'warning' | 'info'
}

function toIso(date: Date) {
  return date.toISOString()
}

export async function listNotifications() {
  const [stockRows, checklistRuns, purchaseRequests] = await Promise.all([
    prisma.stock.findMany({
      include: {
        item: true,
        location: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 80,
    }),
    prisma.checklistRun.findMany({
      where: {
        status: ChecklistRunStatus.SUBMITTED,
      },
      include: {
        template: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    }),
    prisma.purchaseRequest.findMany({
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
      include: {
        requester: {
          select: {
            name: true,
            username: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 12,
    }),
  ])

  const lowStockItems: NotificationItem[] = stockRows
    .filter((row) => Number(row.qty) <= Number(row.item.minStock))
    .sort((a, b) => Number(a.qty) - Number(b.qty))
    .slice(0, 10)
    .map((row) => ({
      id: `stock-${row.id}`,
      title: Number(row.qty) <= 0 ? 'Stok habis' : 'Stok menipis',
      message: `${row.item.name} di ${row.location.name} tersisa ${Number(row.qty)} ${row.item.unit}.`,
      time: toIso(row.updatedAt),
      type: 'warning',
    }))

  const checklistItems: NotificationItem[] = checklistRuns.map((run) => ({
    id: `checklist-${run.id}`,
    title: 'Checklist masuk',
    message: `${run.template.name} sudah disubmit untuk tanggal ${run.runDate.toISOString().slice(0, 10)}.`,
    time: toIso(run.updatedAt),
    type: 'info',
  }))

  const purchaseRequestItems: NotificationItem[] = purchaseRequests.map((row) => ({
    id: `pr-${row.id}`,
    title: 'PR aktif',
    message: `${row.prNumber} berstatus ${row.status} oleh ${row.requester?.name || row.requester?.username || 'pengguna'}.`,
    time: toIso(row.updatedAt),
    type: 'info',
  }))

  return [...lowStockItems, ...checklistItems, ...purchaseRequestItems]
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 30)
}
