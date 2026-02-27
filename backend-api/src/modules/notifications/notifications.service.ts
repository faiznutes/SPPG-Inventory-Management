import { ChecklistRunStatus, PurchaseRequestStatus } from '../../lib/prisma-client.js'
import { prisma } from '../../lib/prisma.js'
import { fromTenantScopedItemName, tenantItemSuffix } from '../../utils/item-scope.js'

type NotificationItem = {
  id: string
  title: string
  message: string
  time: string
  type: 'warning' | 'info'
  tenantCode?: string | null
}

function toIso(date: Date) {
  return date.toISOString()
}

function displayLocationName(locationName: string, tenantCode?: string) {
  const clean = locationName.replace(/^INACTIVE - /i, '')
  if (!tenantCode) return clean
  const prefix = `${tenantCode}::`
  return clean.startsWith(prefix) ? clean.slice(prefix.length) : clean
}

function displayTemplateName(templateName: string, tenantCode?: string) {
  if (!tenantCode) return templateName
  const suffix = ` - ${tenantCode}`
  return templateName.endsWith(suffix) ? templateName.slice(0, -suffix.length) : templateName
}

export async function listNotifications(tenantId?: string, activeLocationId?: string) {
  const suffix = tenantItemSuffix(tenantId)
  const tenant = tenantId
    ? await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, code: true },
      })
    : null

  const tenantMembershipUserIds = tenantId
    ? (
        await prisma.tenantMembership.findMany({
          where: { tenantId },
          select: { userId: true },
        })
      ).map((row) => row.userId)
    : []

  const [stockRows, checklistRuns, purchaseRequests] = await Promise.all([
    prisma.stock.findMany({
      where: {
        ...(activeLocationId
          ? {
              locationId: activeLocationId,
            }
          : {}),
        ...(suffix
          ? {
              item: {
                name: {
                  endsWith: suffix,
                },
              },
            }
          : {}),
      },
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
        ...(activeLocationId
          ? {
              locationId: activeLocationId,
            }
          : {}),
        ...(tenant?.code
          ? {
              template: {
                name: `${'Checklist Harian Operasional'} - ${tenant.code}`,
              },
            }
          : {}),
      },
      include: {
        template: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    }),
    prisma.purchaseRequest.findMany({
      where: {
        ...(tenantMembershipUserIds.length
          ? {
              requestedBy: {
                in: tenantMembershipUserIds,
              },
            }
          : {}),
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
      message: `${fromTenantScopedItemName(row.item.name)} di ${displayLocationName(row.location.name, tenant?.code)} tersisa ${Number(row.qty)} ${row.item.unit}.`,
      time: toIso(row.updatedAt),
      type: 'warning',
      tenantCode: tenant?.code || null,
    }))

const checklistItems: NotificationItem[] = checklistRuns.map((run) => ({
  id: `checklist-${run.id}`,
  title: 'Checklist masuk',
  message: `${displayTemplateName(run.template.name, tenant?.code)} sudah disubmit untuk tanggal ${run.runDate.toISOString().slice(0, 10)}.`,
  time: toIso(run.updatedAt),
  type: 'info',
  tenantCode: tenant?.code || null,
}))

const purchaseRequestItems: NotificationItem[] = purchaseRequests.map((row) => ({
  id: `pr-${row.id}`,
  title: 'PR aktif',
  message: `${row.prNumber} berstatus ${row.status} oleh ${row.requester?.name || row.requester?.username || 'pengguna'}.`,
  time: toIso(row.updatedAt),
  type: 'info',
  tenantCode: tenant?.code || null,
}))

  return [...lowStockItems, ...checklistItems, ...purchaseRequestItems]
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 30)
}
