import { ChecklistRunStatus, PurchaseRequestStatus } from '../../lib/prisma-client.js'
import type { PurchaseRequestStatus as PurchaseRequestStatusType } from '@prisma/client'
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

async function listActivePurchaseRequests(tenantId?: string, useTenantColumn = true) {
  if (useTenantColumn) {
    return prisma.purchaseRequest.findMany({
      where: {
        ...(tenantId
          ? {
              tenantId,
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
    })
  }

  const rows = tenantId
    ? await prisma.$queryRaw<Array<{
        id: string
        pr_number: string
        status: string
        updated_at: Date
        requester_name: string | null
        requester_username: string | null
      }>>`
        SELECT
          pr.id,
          pr.pr_number,
          pr.status::text AS status,
          pr.updated_at,
          u.name AS requester_name,
          u.username AS requester_username
        FROM purchase_requests pr
        JOIN users u ON u.id = pr.requested_by
        WHERE pr.status::text IN ('SUBMITTED','APPROVED','ORDERED','RECEIVED')
          AND pr.requested_by IN (
            SELECT tm.user_id
            FROM tenant_memberships tm
            WHERE tm.tenant_id = ${tenantId}
          )
        ORDER BY pr.updated_at DESC
        LIMIT 12
      `
    : await prisma.$queryRaw<Array<{
        id: string
        pr_number: string
        status: string
        updated_at: Date
        requester_name: string | null
        requester_username: string | null
      }>>`
        SELECT
          pr.id,
          pr.pr_number,
          pr.status::text AS status,
          pr.updated_at,
          u.name AS requester_name,
          u.username AS requester_username
        FROM purchase_requests pr
        JOIN users u ON u.id = pr.requested_by
        WHERE pr.status::text IN ('SUBMITTED','APPROVED','ORDERED','RECEIVED')
        ORDER BY pr.updated_at DESC
        LIMIT 12
      `

  return rows.map((row) => ({
    id: row.id,
    prNumber: row.pr_number,
    status: row.status as PurchaseRequestStatusType,
    updatedAt: row.updated_at,
    requester: {
      name: row.requester_name,
      username: row.requester_username,
    },
  }))
}

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

  const hasTenantColumn = await hasPurchaseRequestTenantColumn()

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
    listActivePurchaseRequests(tenantId, hasTenantColumn),
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
