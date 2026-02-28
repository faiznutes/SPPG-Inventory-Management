import { ChecklistResult, ChecklistRunStatus, ChecklistSchedule, PurchaseRequestStatus, TransactionType } from '../lib/prisma-client.js'
import type { ChecklistResult as ChecklistResultType, ItemType, TransactionType as TransactionTypeType } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { tenantItemSuffix } from '../utils/item-scope.js'

const DEMO_USERNAME = 'demo'
const DEMO_TENANT_CODE = 'percobaan-sppg-mbg'
const DEMO_MARKER = '[DEMO]'
const INACTIVE_PREFIX = 'INACTIVE - '
const DEFAULT_TEMPLATE_NAME = 'Checklist Harian Operasional'

const DEFAULT_CATEGORY_NAMES = ['Bahan Pokok', 'Protein', 'Minuman', 'Peralatan Operasional']

const DEFAULT_ITEMS: Array<{ name: string; category: string; type: ItemType; unit: string; minStock: number; reorderQty: number }> = [
  { name: 'Beras Premium', category: 'Bahan Pokok', type: 'CONSUMABLE', unit: 'kg', minStock: 120, reorderQty: 180 },
  { name: 'Minyak Goreng', category: 'Bahan Pokok', type: 'CONSUMABLE', unit: 'liter', minStock: 60, reorderQty: 100 },
  { name: 'Telur Ayam', category: 'Protein', type: 'CONSUMABLE', unit: 'kg', minStock: 50, reorderQty: 80 },
  { name: 'Ayam Potong', category: 'Protein', type: 'CONSUMABLE', unit: 'kg', minStock: 40, reorderQty: 70 },
  { name: 'Galon Air', category: 'Minuman', type: 'CONSUMABLE', unit: 'galon', minStock: 18, reorderQty: 30 },
  { name: 'Gas LPG 12kg', category: 'Peralatan Operasional', type: 'GAS', unit: 'tabung', minStock: 8, reorderQty: 14 },
  { name: 'Kompor Industri', category: 'Peralatan Operasional', type: 'ASSET', unit: 'unit', minStock: 2, reorderQty: 2 },
  { name: 'Regulator Gas', category: 'Peralatan Operasional', type: 'ASSET', unit: 'unit', minStock: 3, reorderQty: 4 },
]

function isInactiveLocation(name: string) {
  return name.startsWith(INACTIVE_PREFIX) || name.includes(`::${INACTIVE_PREFIX}`)
}

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randPick<T>(arr: T[]) {
  return arr[randInt(0, arr.length - 1)]
}

function toDateOnly(date: Date) {
  const yyyy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  return new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`)
}

function addDays(day: Date, days: number) {
  const result = new Date(day)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

function randomDateTimeOnDay(day: Date, startHour = 7, endHour = 18) {
  const result = new Date(day)
  result.setUTCHours(randInt(startHour, endHour), randInt(0, 59), randInt(0, 59), 0)
  return result
}

function resultForType(itemType: ItemType): ChecklistResultType {
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

function noteForResult(result: ChecklistResultType, itemType: ItemType) {
  if (result === ChecklistResult.OK) return Math.random() < 0.25 ? 'Kondisi stabil, monitoring rutin.' : ''
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

export async function runDemoSeedIfNeeded() {
  const from = new Date('2026-02-01T00:00:00.000Z')
  const today = toDateOnly(new Date())

  const user = await prisma.user.findUnique({
    where: { username: DEMO_USERNAME },
    select: {
      id: true,
      tenantMemberships: {
        where: {
          tenant: {
            code: DEMO_TENANT_CODE,
            isActive: true,
          },
        },
        select: {
          tenant: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
        take: 1,
      },
    },
  })

  if (!user) {
    console.log('[DEMO] user demo tidak ditemukan, seed demo dilewati.')
    return
  }

  const tenant = user.tenantMemberships[0]?.tenant
  if (!tenant) {
    console.log('[DEMO] tenant percobaan-sppg-mbg tidak ditemukan di membership demo, seed dilewati.')
    return
  }

  const suffix = tenantItemSuffix(tenant.id)
  let items = await prisma.item.findMany({
    where: {
      name: { endsWith: suffix },
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      type: true,
      minStock: true,
    },
  })
  let locationsRaw = await prisma.location.findMany({
    where: {
      name: {
        startsWith: `${tenant.code}::`,
      },
    },
    select: {
      id: true,
      name: true,
    },
  })
  let locations = locationsRaw.filter((location) => !isInactiveLocation(location.name))

  if (!locations.length) {
    const fallbackLocation = await prisma.location.upsert({
      where: {
        name: `${tenant.code}::SPPG Pusat`,
      },
      update: {},
      create: {
        name: `${tenant.code}::SPPG Pusat`,
        description: 'Lokasi default bootstrap demo',
      },
      select: {
        id: true,
        name: true,
      },
    })
    locationsRaw = [fallbackLocation]
    locations = [fallbackLocation]
  }

  if (!items.length) {
    const scopedCategoryNames = DEFAULT_CATEGORY_NAMES.map((name) => `${name}${suffix}`)
    await prisma.category.createMany({
      data: scopedCategoryNames.map((name) => ({ name })),
      skipDuplicates: true,
    })
    const categories = await prisma.category.findMany({
      where: {
        name: {
          in: scopedCategoryNames,
        },
      },
      select: {
        id: true,
        name: true,
      },
    })
    const categoryIdByScopedName = new Map(categories.map((category) => [category.name, category.id]))
    await prisma.item.createMany({
      data: DEFAULT_ITEMS.map((item, index) => ({
        name: `${item.name}${suffix}`,
        sku: `DEMO-${tenant.code.toUpperCase()}-${String(index + 1).padStart(3, '0')}`,
        categoryId: categoryIdByScopedName.get(`${item.category}${suffix}`) || null,
        type: item.type,
        unit: item.unit,
        minStock: item.minStock,
        reorderQty: item.reorderQty,
        isActive: true,
      })),
      skipDuplicates: true,
    })
    items = await prisma.item.findMany({
      where: {
        name: { endsWith: suffix },
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        type: true,
        minStock: true,
      },
    })
  }

  if (!items.length || !locations.length) {
    console.log('[DEMO] item/lokasi tenant demo belum siap, seed dilewati.')
    return
  }

  const hasTenantColumn = await hasPurchaseRequestTenantColumn()
  const days = Math.max(1, Math.floor((today.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)) + 1)
  const [demoTxCount, checklistRunCount, demoPrCount] = await Promise.all([
    prisma.inventoryTransaction.count({
      where: {
        reason: {
          startsWith: DEMO_MARKER,
        },
        createdAt: {
          gte: from,
        },
        itemId: {
          in: items.map((item) => item.id),
        },
      },
    }),
    prisma.checklistRun.count({
      where: {
        createdBy: user.id,
        runDate: {
          gte: from,
        },
        locationId: {
          in: locations.map((location) => location.id),
        },
      },
    }),
    hasTenantColumn
      ? prisma.purchaseRequest.count({
          where: {
            tenantId: tenant.id,
            notes: {
              startsWith: DEMO_MARKER,
            },
            createdAt: {
              gte: from,
            },
          },
        })
      : prisma.purchaseRequest.count({
          where: {
            requestedBy: user.id,
            notes: {
              startsWith: DEMO_MARKER,
            },
            createdAt: {
              gte: from,
            },
          },
        }),
  ])

  const expectedChecklistRuns = days * Math.max(1, locations.length)
  const minTx = Math.max(60, Math.floor(days * 3))
  const minChecklistRuns = Math.max(20, Math.floor(expectedChecklistRuns * 0.6))
  const minPr = Math.max(6, Math.floor(days / 8))

  if (demoTxCount >= minTx && checklistRunCount >= minChecklistRuns && demoPrCount >= minPr) {
    console.log('[DEMO] data historis demo sudah memadai, seed dilewati.')
    return
  }

  const stocks = await prisma.stock.findMany({
    where: {
      itemId: { in: items.map((item) => item.id) },
      locationId: { in: locations.map((location) => location.id) },
    },
    select: {
      itemId: true,
      locationId: true,
      qty: true,
    },
  })

  const stockMap = new Map<string, number>()
  for (const item of items) {
    for (const location of locations) {
      const key = `${item.id}:${location.id}`
      const existing = stocks.find((stock) => stock.itemId === item.id && stock.locationId === location.id)
      if (existing) {
        stockMap.set(key, Number(existing.qty))
      } else {
        const seedQty = Math.max(10, Math.round(Number(item.minStock || 1) * 3))
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

  let txCount = 0
  let day = toDateOnly(from)
  while (day <= today) {
    const dailyCount = randInt(4, 8)
    for (let i = 0; i < dailyCount; i += 1) {
      const item = randPick(items)
      const location = randPick(locations)
      const sourceKey = `${item.id}:${location.id}`
      const sourceQty = stockMap.get(sourceKey) || 0
      const minStock = Math.max(1, Math.round(Number(item.minStock) || 1))
      let trxType: TransactionTypeType = TransactionType.OUT
      const roll = Math.random()
      if (roll < 0.2) trxType = TransactionType.IN
      else if (roll < 0.33) trxType = TransactionType.ADJUST
      else if (roll < 0.45 && locations.length > 1) trxType = TransactionType.TRANSFER

      if (trxType === TransactionType.OUT && sourceQty > 0) {
        const qty = randInt(1, Math.max(1, Math.min(sourceQty, minStock + 6)))
        await prisma.inventoryTransaction.create({
          data: {
            trxType,
            itemId: item.id,
            fromLocationId: location.id,
            qty,
            reason: `${DEMO_MARKER} Pemakaian operasional`,
            createdBy: user.id,
            createdAt: randomDateTimeOnDay(day),
          },
        })
        await prisma.stock.update({
          where: { itemId_locationId: { itemId: item.id, locationId: location.id } },
          data: { qty: sourceQty - qty },
        })
        stockMap.set(sourceKey, sourceQty - qty)
        txCount += 1
        continue
      }

      if (trxType === TransactionType.TRANSFER && sourceQty > 0) {
        const targets = locations.filter((loc) => loc.id !== location.id)
        if (targets.length) {
          const target = randPick(targets)
          const targetKey = `${item.id}:${target.id}`
          const qty = randInt(1, Math.max(1, Math.min(sourceQty, minStock + 4)))
          const targetQty = stockMap.get(targetKey) || 0
          await prisma.inventoryTransaction.create({
            data: {
              trxType,
              itemId: item.id,
              fromLocationId: location.id,
              toLocationId: target.id,
              qty,
              reason: `${DEMO_MARKER} Rotasi stok antar gudang`,
              createdBy: user.id,
              createdAt: randomDateTimeOnDay(day),
            },
          })
          await prisma.stock.update({
            where: { itemId_locationId: { itemId: item.id, locationId: location.id } },
            data: { qty: sourceQty - qty },
          })
          await prisma.stock.update({
            where: { itemId_locationId: { itemId: item.id, locationId: target.id } },
            data: { qty: targetQty + qty },
          })
          stockMap.set(sourceKey, sourceQty - qty)
          stockMap.set(targetKey, targetQty + qty)
          txCount += 1
          continue
        }
      }

      if (trxType === TransactionType.ADJUST) {
        const delta = randInt(-Math.max(1, Math.round(minStock * 0.2)), Math.max(1, Math.round(minStock * 0.2)))
        const nextQty = Math.max(0, sourceQty + delta)
        const applied = nextQty - sourceQty
        if (applied !== 0) {
          await prisma.inventoryTransaction.create({
            data: {
              trxType,
              itemId: item.id,
              fromLocationId: location.id,
              qty: applied,
              reason: `${DEMO_MARKER} Penyesuaian stok fisik`,
              createdBy: user.id,
              createdAt: randomDateTimeOnDay(day),
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
      await prisma.inventoryTransaction.create({
        data: {
          trxType: TransactionType.IN,
          itemId: item.id,
          toLocationId: location.id,
          qty: inQty,
          reason: `${DEMO_MARKER} Restock pemasok`,
          createdBy: user.id,
          createdAt: randomDateTimeOnDay(day),
        },
      })
      await prisma.stock.update({
        where: { itemId_locationId: { itemId: item.id, locationId: location.id } },
        data: { qty: sourceQty + inQty },
      })
      stockMap.set(sourceKey, sourceQty + inQty)
      txCount += 1
    }

    day = addDays(day, 1)
  }

  const templateName = `${DEFAULT_TEMPLATE_NAME} - ${tenant.code}`
  let template = await prisma.checklistTemplate.findFirst({
    where: { name: templateName },
    include: { items: true },
  })
  if (!template) {
    template = await prisma.checklistTemplate.create({
      data: {
        name: templateName,
        schedule: ChecklistSchedule.DAILY,
        createdBy: user.id,
        items: {
          create: items.slice(0, 10).map((item, index) => ({
            title: item.name.replace(suffix, ''),
            sortOrder: index,
          })),
        },
      },
      include: { items: true },
    })
  }

  let checklistCount = 0
  day = toDateOnly(from)
  while (day <= today) {
    for (const location of locations) {
      const runDate = toDateOnly(day)
      const runAt = randomDateTimeOnDay(day, 14, 19)
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
      await prisma.checklistRunItem.createMany({
        data: template.items.map((tpl) => {
          const linked = items.find((item) => item.name.replace(suffix, '') === tpl.title)
          const itemType = linked?.type || 'CONSUMABLE'
          const result = resultForType(itemType)
          return {
            checklistRunId: run.id,
            templateItemId: tpl.id,
            title: tpl.title,
            result,
            notes: noteForResult(result, itemType) || null,
            createdAt: runAt,
            updatedAt: runAt,
          }
        }),
      })
      checklistCount += 1
    }
    day = addDays(day, 1)
  }

  let prCount = 0
  let prSeq = await prisma.purchaseRequest.count()
  day = toDateOnly(from)
  while (day <= today) {
    if (day.getUTCDate() % 4 === 0) {
      const selected = items.slice(0, randInt(2, Math.min(5, items.length)))
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
              notes: `${DEMO_MARKER} Pengadaan periodik`,
              createdAt,
              updatedAt: createdAt,
            },
            select: { id: true },
          })
          prId = pr.id
        } else {
          const rows = await prisma.$queryRaw<Array<{ id: string }>>`
            INSERT INTO purchase_requests (pr_number, status, requested_by, notes, created_at, updated_at)
            VALUES (${prNumber}, ${PurchaseRequestStatus.SUBMITTED}::"PurchaseRequestStatus", ${user.id}, ${`${DEMO_MARKER} Pengadaan periodik`}, ${createdAt}, ${createdAt})
            RETURNING id
          `
          prId = rows[0]?.id || ''
        }
        if (prId) {
          await prisma.purchaseRequestItem.createMany({
            data: selected.map((item) => ({
              purchaseRequestId: prId,
              itemId: item.id,
              itemName: item.name.replace(suffix, ''),
              qty: randInt(2, 14),
              unitPrice: randInt(5000, 50000),
              createdAt,
              updatedAt: createdAt,
            })),
          })
          await prisma.purchaseRequestStatusHistory.create({
            data: {
              purchaseRequestId: prId,
              status: PurchaseRequestStatus.SUBMITTED,
              notes: `${DEMO_MARKER} PR diajukan`,
              changedBy: user.id,
              createdAt,
            },
          })
          prCount += 1
        }
      }
    }
    day = addDays(day, 1)
  }

  console.log(`[DEMO] seed selesai untuk tenant ${tenant.code}`)
  console.log(`[DEMO] transaksi dibuat: ${txCount}, checklist run: ${checklistCount}, purchase request: ${prCount}`)
}
