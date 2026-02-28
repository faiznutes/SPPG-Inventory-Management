import { ChecklistRunStatus, PurchaseRequestStatus } from '../../lib/prisma-client.js'
import { prisma } from '../../lib/prisma.js'
import { fromTenantScopedItemName, tenantItemSuffix } from '../../utils/item-scope.js'

let purchaseRequestTenantColumnCache: boolean | null = null

async function hasPurchaseRequestTenantColumn() {
  if (purchaseRequestTenantColumnCache !== null) return purchaseRequestTenantColumnCache
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'purchase_requests'
        AND column_name = 'tenant_id'
    ) AS "exists"
  `
  purchaseRequestTenantColumnCache = Boolean(rows[0]?.exists)
  return purchaseRequestTenantColumnCache
}

function toDateOnly(date: Date) {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`)
}

function displayLocationName(locationName: string, tenantCode?: string) {
  if (!tenantCode) return locationName
  const prefix = `${tenantCode}::`
  return locationName.startsWith(prefix) ? locationName.slice(prefix.length) : locationName
}

function isInactiveLocationName(name: string) {
  return name.startsWith('INACTIVE - ') || name.includes('::INACTIVE - ')
}

export async function getDashboardSummary(tenantId?: string, activeLocationId?: string) {
  const today = toDateOnly(new Date())
  const suffix = tenantItemSuffix(tenantId)
  const tenant = tenantId
    ? await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, code: true },
      })
    : null

  const hasTenantColumn = await hasPurchaseRequestTenantColumn()
  const tenantMembershipUserIds = tenantId && !hasTenantColumn
    ? (
        await prisma.tenantMembership.findMany({
          where: { tenantId },
          select: { userId: true },
        })
      ).map((row) => row.userId)
    : []

  const [itemCount, stockRows, activePrCount, checklistDraftCount] = await Promise.all([
    prisma.item.count({
      where: {
        isActive: true,
        ...(suffix
          ? {
              name: {
                endsWith: suffix,
              },
            }
          : {}),
      },
    }),
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
        item: {
          select: {
            minStock: true,
          },
        },
        location: {
          select: {
            name: true,
          },
        },
      },
    }),
    prisma.purchaseRequest.count({
      where: {
        ...(tenantId && hasTenantColumn
          ? {
              tenantId,
            }
          : {}),
        ...(tenantId && !hasTenantColumn
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
    }),
    prisma.checklistRun.count({
      where: {
        ...(tenant?.code
          ? {
              template: {
                name: `${'Checklist Harian Operasional'} - ${tenant.code}`,
              },
            }
          : {}),
        ...(activeLocationId
          ? {
              locationId: activeLocationId,
            }
          : {}),
        runDate: today,
        status: {
          in: [ChecklistRunStatus.DRAFT],
        },
      },
    }),
  ])

  const lowStockCount = stockRows
    .filter((row) => !isInactiveLocationName(row.location.name))
    .filter((row) => Number(row.qty) <= Number(row.item.minStock)).length

  return {
    itemCount,
    lowStockCount,
    checklistPendingCount: checklistDraftCount,
    activePrCount,
  }
}

export async function getLowStockRows(tenantId?: string, activeLocationId?: string) {
  const suffix = tenantItemSuffix(tenantId)
  const tenant = tenantId
    ? await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, code: true },
      })
    : null

  const rows = await prisma.stock.findMany({
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
    orderBy: {
      updatedAt: 'desc',
    },
    take: 80,
  })

  return rows
    .filter((row) => !isInactiveLocationName(row.location.name))
    .filter((row) => Number(row.qty) <= Number(row.item.minStock))
    .sort((a, b) => Number(a.qty) - Number(b.qty))
    .slice(0, 20)
    .map((row) => ({
      id: row.id,
      itemId: row.itemId,
      itemName: fromTenantScopedItemName(row.item.name),
      locationId: row.locationId,
      locationName: displayLocationName(row.location.name, tenant?.code),
      tenantCode: tenant?.code || null,
      qty: Number(row.qty),
      minStock: Number(row.item.minStock),
      unit: row.item.unit,
      updatedAt: row.updatedAt,
    }))
}
