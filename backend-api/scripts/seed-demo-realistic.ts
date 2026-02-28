import { ChecklistResult, ChecklistRunStatus, ChecklistSchedule, PurchaseRequestStatus, TransactionType } from '../src/lib/prisma-client.js'
import type { ItemType } from '@prisma/client'
import { prisma } from '../src/lib/prisma.js'
import { tenantItemSuffix } from '../src/utils/item-scope.js'

const INACTIVE_PREFIX = 'INACTIVE - '
const DEFAULT_TEMPLATE_NAME = 'Checklist Harian Operasional'

type Options = {
  username: string
  tenantCode?: string
  from: Date
}

function parseArgs(): Options {
  const args = process.argv.slice(2)
  const map = new Map<string, string>()
  for (let i = 0; i < args.length; i += 1) {
    const key = args[i]
    const value = args[i + 1]
    if (key?.startsWith('--') && value && !value.startsWith('--')) {
      map.set(key.slice(2), value)
      i += 1
    }
  }

  const now = new Date()
  const defaultFrom = new Date(Date.UTC(now.getUTCFullYear(), 1, 1, 0, 0, 0, 0))
  const fromRaw = map.get('from')
  const from = fromRaw ? new Date(`${fromRaw}T00:00:00.000Z`) : defaultFrom
  if (Number.isNaN(from.getTime())) {
    throw new Error('Format --from tidak valid. Gunakan YYYY-MM-DD')
  }

  return {
    username: map.get('username') || 'demo',
    tenantCode: map.get('tenant-code') || undefined,
    from,
  }
}

function isInactiveLocation(name: string) {
  return name.startsWith(INACTIVE_PREFIX) || name.includes(`::${INACTIVE_PREFIX}`)
}

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randPick<T>(arr: T[]) {
  return arr[randInt(0, arr.length - 1)]
}

function randomDateTimeOnDay(day: Date, startHour = 7, endHour = 18) {
  const result = new Date(day)
  result.setUTCHours(randInt(startHour, endHour), randInt(0, 59), randInt(0, 59), 0)
  return result
}

function addDays(day: Date, days: number) {
  const result = new Date(day)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

function formatDateOnly(date: Date) {
  const yyyy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function toDateOnly(date: Date) {
  return new Date(`${formatDateOnly(date)}T00:00:00.000Z`)
}

function seededReason(label: string, extra?: string) {
  return `[DEMO] ${label}${extra ? ` - ${extra}` : ''}`
}

function resultForType(itemType: ItemType): ChecklistResult {
  const roll = Math.random()
  if (itemType === 'ASSET') {
    if (roll < 0.72) return ChecklistResult.OK
    if (roll < 0.92) return ChecklistResult.LOW
    return ChecklistResult.DAMAGED
  }
  if (itemType === 'GAS') {
    if (roll < 0.62) return ChecklistResult.OK
    if (roll < 0.86) return ChecklistResult.LOW
    return ChecklistResult.OUT
  }
  if (roll < 0.65) return ChecklistResult.OK
  if (roll < 0.9) return ChecklistResult.LOW
  return ChecklistResult.OUT
}

function noteForResult(result: ChecklistResult, itemType: ItemType) {
  if (result === ChecklistResult.OK) {
    return Math.random() < 0.25 ? 'Kondisi stabil, monitoring rutin.' : ''
  }
  if (result === ChecklistResult.LOW) {
    if (itemType === 'ASSET') return `Perlu perawatan ringan. Kondisi: ${randInt(55, 79)}%`
    return 'Stok menipis, disarankan restock esok pagi.'
  }
  if (result === ChecklistResult.OUT) {
    if (itemType === 'ASSET') return `Kondisi menurun. Kondisi: ${randInt(25, 49)}%`
    return 'Habis saat operasional, pengadaan diprioritaskan.'
  }
  return 'Ditemukan kendala, butuh tindakan perbaikan.'
}

async function hasPurchaseRequestTenantColumn() {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'purchase_requests'
        AND column_name = 'tenant_id'
    ) AS "exists"
  `
  return Boolean(rows[0]?.exists)
}

async function ensureTemplate(tenantCode: string, userId: string, items: Array<{ name: string; type: ItemType }>) {
  const templateName = `${DEFAULT_TEMPLATE_NAME} - ${tenantCode}`
  const existing = await prisma.checklistTemplate.findFirst({
    where: { name: templateName },
    include: { items: true },
  })
  if (existing) return existing

  const templateItems = items.slice(0, 10).map((item, index) => ({
    title: item.name,
    sortOrder: index,
  }))

  return prisma.checklistTemplate.create({
    data: {
      name: templateName,
      schedule: ChecklistSchedule.DAILY,
      createdBy: userId,
      items: {
        create: templateItems.length
          ? templateItems
          : [
              { title: 'Cek bahan baku utama', sortOrder: 0 },
              { title: 'Cek gas isi ulang', sortOrder: 1 },
              { title: 'Cek kondisi alat masak', sortOrder: 2 },
            ],
      },
    },
    include: { items: true },
  })
}

async function main() {
  const options = parseArgs()
  const today = toDateOnly(new Date())

  const user = await prisma.user.findUnique({
    where: { username: options.username },
    select: {
      id: true,
      name: true,
      username: true,
      tenantMemberships: {
        select: {
          tenantId: true,
          isDefault: true,
          tenant: {
            select: { id: true, name: true, code: true, isActive: true },
          },
        },
      },
    },
  })

  if (!user) throw new Error(`User ${options.username} tidak ditemukan`)

  const memberships = user.tenantMemberships.filter((m) => m.tenant.isActive)
  if (!memberships.length) throw new Error(`User ${options.username} belum memiliki membership tenant aktif`)

  const membership = options.tenantCode
    ? memberships.find((m) => m.tenant.code === options.tenantCode)
    : memberships.find((m) => m.isDefault) || memberships[0]

  if (!membership) throw new Error(`Tenant ${options.tenantCode} tidak ditemukan pada membership user ${options.username}`)

  const tenant = membership.tenant
  const suffix = tenantItemSuffix(tenant.id)

  const [locationsRaw, itemsRaw] = await Promise.all([
    prisma.location.findMany({
      where: {
        name: {
          startsWith: `${tenant.code}::`,
        },
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: { name: 'asc' },
    }),
    prisma.item.findMany({
      where: {
        name: { endsWith: suffix },
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        type: true,
        unit: true,
        minStock: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  const locations = locationsRaw.filter((loc) => !isInactiveLocation(loc.name))
  if (!locations.length) throw new Error(`Tenant ${tenant.code} tidak memiliki lokasi aktif`)
  if (!itemsRaw.length) throw new Error(`Tenant ${tenant.code} tidak memiliki item aktif`)

  const stocks = await prisma.stock.findMany({
    where: {
      itemId: { in: itemsRaw.map((item) => item.id) },
      locationId: { in: locations.map((loc) => loc.id) },
    },
    select: { id: true, itemId: true, locationId: true, qty: true },
  })

  const stockMap = new Map<string, number>()
  for (const item of itemsRaw) {
    for (const location of locations) {
      const key = `${item.id}:${location.id}`
      const existing = stocks.find((s) => s.itemId === item.id && s.locationId === location.id)
      if (existing) {
        stockMap.set(key, Number(existing.qty))
      } else {
        const seedQty = Math.max(10, Math.round(Number(item.minStock) * randInt(2, 4)))
        await prisma.stock.create({
          data: {
            itemId: item.id,
            locationId: location.id,
            qty: seedQty,
          },
        })
        stockMap.set(key, seedQty)
      }
    }
  }

  const txMarkerExists = await prisma.inventoryTransaction.findFirst({
    where: {
      reason: {
        startsWith: '[DEMO]',
      },
      createdAt: {
        gte: options.from,
      },
      itemId: {
        in: itemsRaw.map((item) => item.id),
      },
    },
    select: { id: true },
  })

  if (txMarkerExists) {
    console.log('Seed demo sudah pernah dijalankan pada tenant ini (marker ditemukan). Lewati untuk hindari duplikasi.')
    return
  }

  const itemByType = {
    CONSUMABLE: itemsRaw.filter((item) => item.type === 'CONSUMABLE'),
    GAS: itemsRaw.filter((item) => item.type === 'GAS'),
    ASSET: itemsRaw.filter((item) => item.type === 'ASSET'),
  }

  let day = toDateOnly(options.from)
  let txCount = 0

  while (day <= today) {
    const dailyBase = randInt(4, 8)
    for (let i = 0; i < dailyBase; i += 1) {
      const location = randPick(locations)
      const typeRoll = Math.random()
      let trxType: TransactionType = TransactionType.OUT
      if (typeRoll < 0.18) trxType = TransactionType.IN
      else if (typeRoll < 0.3) trxType = TransactionType.ADJUST
      else if (typeRoll < 0.4 && locations.length > 1) trxType = TransactionType.TRANSFER

      const itemPool = trxType === TransactionType.IN
        ? itemsRaw
        : [...itemByType.CONSUMABLE, ...itemByType.GAS, ...itemByType.ASSET]
      const item = randPick(itemPool)
      const minStock = Math.max(1, Math.round(Number(item.minStock) || 1))
      const sourceKey = `${item.id}:${location.id}`
      const currentSourceQty = stockMap.get(sourceKey) || 0

      if (trxType === TransactionType.OUT) {
        const maxOut = Math.max(1, Math.min(currentSourceQty, Math.round(minStock * 0.8) + 5))
        if (maxOut <= 0) {
          trxType = TransactionType.IN
        } else {
          const qty = randInt(1, maxOut)
          const at = randomDateTimeOnDay(day)
          await prisma.inventoryTransaction.create({
            data: {
              trxType,
              itemId: item.id,
              fromLocationId: location.id,
              qty,
              reason: seededReason('Pemakaian operasional', location.name),
              createdBy: user.id,
              createdAt: at,
            },
          })
          await prisma.stock.update({
            where: { itemId_locationId: { itemId: item.id, locationId: location.id } },
            data: { qty: currentSourceQty - qty },
          })
          stockMap.set(sourceKey, currentSourceQty - qty)
          txCount += 1
          continue
        }
      }

      if (trxType === TransactionType.TRANSFER) {
        const targets = locations.filter((l) => l.id !== location.id)
        if (!targets.length || currentSourceQty <= 0) {
          trxType = TransactionType.IN
        } else {
          const target = randPick(targets)
          const targetKey = `${item.id}:${target.id}`
          const qty = randInt(1, Math.max(1, Math.min(currentSourceQty, Math.round(minStock * 0.6) + 3)))
          const at = randomDateTimeOnDay(day)

          await prisma.inventoryTransaction.create({
            data: {
              trxType,
              itemId: item.id,
              fromLocationId: location.id,
              toLocationId: target.id,
              qty,
              reason: seededReason('Rotasi stok antar gudang'),
              createdBy: user.id,
              createdAt: at,
            },
          })

          const targetQty = stockMap.get(targetKey) || 0
          await prisma.stock.update({
            where: { itemId_locationId: { itemId: item.id, locationId: location.id } },
            data: { qty: currentSourceQty - qty },
          })
          await prisma.stock.update({
            where: { itemId_locationId: { itemId: item.id, locationId: target.id } },
            data: { qty: targetQty + qty },
          })
          stockMap.set(sourceKey, currentSourceQty - qty)
          stockMap.set(targetKey, targetQty + qty)
          txCount += 1
          continue
        }
      }

      if (trxType === TransactionType.ADJUST) {
        const delta = randInt(-Math.max(1, Math.round(minStock * 0.2)), Math.max(1, Math.round(minStock * 0.2)))
        const nextQty = Math.max(0, currentSourceQty + delta)
        const appliedDelta = nextQty - currentSourceQty
        if (appliedDelta !== 0) {
          const at = randomDateTimeOnDay(day)
          await prisma.inventoryTransaction.create({
            data: {
              trxType,
              itemId: item.id,
              fromLocationId: location.id,
              qty: appliedDelta,
              reason: seededReason('Penyesuaian stok fisik'),
              createdBy: user.id,
              createdAt: at,
            },
          })
          await prisma.stock.update({
            where: { itemId_locationId: { itemId: item.id, locationId: location.id } },
            data: { qty: nextQty },
          })
          stockMap.set(sourceKey, nextQty)
          txCount += 1
          continue
        }
      }

      const inQty = randInt(Math.max(2, Math.round(minStock * 0.5)), Math.max(4, Math.round(minStock * 1.8)))
      const at = randomDateTimeOnDay(day)
      await prisma.inventoryTransaction.create({
        data: {
          trxType: TransactionType.IN,
          itemId: item.id,
          toLocationId: location.id,
          qty: inQty,
          reason: seededReason('Restock dari pemasok'),
          createdBy: user.id,
          createdAt: at,
        },
      })
      await prisma.stock.update({
        where: { itemId_locationId: { itemId: item.id, locationId: location.id } },
        data: { qty: currentSourceQty + inQty },
      })
      stockMap.set(sourceKey, currentSourceQty + inQty)
      txCount += 1
    }

    day = addDays(day, 1)
  }

  const template = await ensureTemplate(
    tenant.code,
    user.id,
    itemsRaw.map((item) => ({ name: item.name.replace(suffix, ''), type: item.type })),
  )

  let checklistCount = 0
  day = toDateOnly(options.from)
  while (day <= today) {
    for (const location of locations) {
      const runAt = randomDateTimeOnDay(day, 14, 19)
      const runDate = toDateOnly(day)
      const run = await prisma.checklistRun.upsert({
        where: {
          templateId_runDate_locationId: {
            templateId: template.id,
            runDate,
            locationId: location.id,
          },
        },
        update: {
          status: ChecklistRunStatus.SUBMITTED,
          createdBy: user.id,
          createdAt: runAt,
          updatedAt: runAt,
        },
        create: {
          templateId: template.id,
          locationId: location.id,
          runDate,
          status: ChecklistRunStatus.SUBMITTED,
          createdBy: user.id,
          createdAt: runAt,
          updatedAt: runAt,
        },
      })

      await prisma.checklistRunItem.deleteMany({ where: { checklistRunId: run.id } })

      const runItems = template.items.map((tpl) => {
        const linked = itemsRaw.find((item) => item.name.replace(suffix, '') === tpl.title)
        const itemType = linked?.type || (tpl.title.toLowerCase().includes('gas') ? 'GAS' : tpl.title.toLowerCase().includes('alat') ? 'ASSET' : 'CONSUMABLE')
        const result = resultForType(itemType as ItemType)
        const notes = noteForResult(result, itemType as ItemType)
        return {
          checklistRunId: run.id,
          templateItemId: tpl.id,
          title: tpl.title,
          result,
          notes: notes || null,
          createdAt: runAt,
          updatedAt: runAt,
        }
      })

      await prisma.checklistRunItem.createMany({ data: runItems })
      checklistCount += 1
    }
    day = addDays(day, 1)
  }

  const hasTenantColumn = await hasPurchaseRequestTenantColumn()
  let prCount = 0
  let prSeq = await prisma.purchaseRequest.count()
  day = toDateOnly(options.from)

  while (day <= today) {
    if (day.getUTCDate() % 4 === 0) {
      const candidateItems = itemsRaw
        .map((item) => {
          const totalStock = locations.reduce((acc, location) => acc + (stockMap.get(`${item.id}:${location.id}`) || 0), 0)
          return {
            item,
            totalStock,
            minStock: Number(item.minStock) || 1,
          }
        })
        .sort((a, b) => a.totalStock - b.totalStock)

      const selected = candidateItems.slice(0, randInt(2, Math.min(5, candidateItems.length)))
      if (selected.length) {
        prSeq += 1
        const prNumber = `PR-${String(prSeq).padStart(6, '0')}`
        const createdAt = randomDateTimeOnDay(day, 9, 13)

        let prId = ''
        if (hasTenantColumn) {
          const pr = await prisma.purchaseRequest.create({
            data: {
              prNumber,
              tenantId: tenant.id,
              requestedBy: user.id,
              status: PurchaseRequestStatus.SUBMITTED,
              notes: seededReason('Pengadaan periodik operasional'),
              createdAt,
              updatedAt: createdAt,
            },
            select: { id: true },
          })
          prId = pr.id
        } else {
          const rows = await prisma.$queryRaw<Array<{ id: string }>>`
            INSERT INTO purchase_requests (pr_number, status, requested_by, notes, created_at, updated_at)
            VALUES (${prNumber}, ${PurchaseRequestStatus.SUBMITTED}::"PurchaseRequestStatus", ${user.id}, ${seededReason('Pengadaan periodik operasional')}, ${createdAt}, ${createdAt})
            RETURNING id
          `
          prId = rows[0]?.id || ''
        }

        if (prId) {
          await prisma.purchaseRequestItem.createMany({
            data: selected.map((entry) => ({
              purchaseRequestId: prId,
              itemId: entry.item.id,
              itemName: entry.item.name.replace(suffix, ''),
              qty: randInt(Math.max(2, entry.minStock), Math.max(4, entry.minStock * 3)),
              unitPrice: randInt(5000, 45000),
              createdAt,
              updatedAt: createdAt,
            })),
          })

          const statusFlow = [
            PurchaseRequestStatus.SUBMITTED,
            PurchaseRequestStatus.APPROVED,
            PurchaseRequestStatus.ORDERED,
            PurchaseRequestStatus.RECEIVED,
          ]
          const steps = randInt(2, statusFlow.length)

          for (let i = 0; i < steps; i += 1) {
            const status = statusFlow[i]
            const statusAt = addDays(createdAt, i)
            await prisma.purchaseRequestStatusHistory.create({
              data: {
                purchaseRequestId: prId,
                status,
                notes: seededReason(`Status ${status}`),
                changedBy: user.id,
                createdAt: statusAt,
              },
            })
          }

          const latestStatus = statusFlow[steps - 1]
          await prisma.purchaseRequest.update({
            where: { id: prId },
            data: {
              status: latestStatus,
              approvedBy: latestStatus === PurchaseRequestStatus.SUBMITTED ? null : user.id,
              updatedAt: addDays(createdAt, steps - 1),
            },
          })

          prCount += 1
        }
      }
    }

    day = addDays(day, 1)
  }

  console.log(`Seed demo selesai untuk tenant ${tenant.code} (${tenant.name})`) 
  console.log(`Range tanggal: ${formatDateOnly(options.from)} s/d ${formatDateOnly(today)}`)
  console.log(`Lokasi aktif: ${locations.length}`)
  console.log(`Item aktif tenant: ${itemsRaw.length}`)
  console.log(`Transaksi demo dibuat: ${txCount}`)
  console.log(`Checklist run dibuat/diupdate: ${checklistCount}`)
  console.log(`Purchase request dibuat: ${prCount}`)
}

main()
  .catch((error) => {
    console.error('Gagal seed demo realistis:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
