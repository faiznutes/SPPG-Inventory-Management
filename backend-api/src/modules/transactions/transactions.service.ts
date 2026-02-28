import { Prisma, TransactionType } from '../../lib/prisma-client.js'
import type { Prisma as PrismaNamespace, TransactionType as TransactionTypeType } from '@prisma/client'
import PDFDocument from 'pdfkit'
import { prisma } from '../../lib/prisma.js'
import { ApiError } from '../../utils/api-error.js'
import { isItemOwnedByTenant, tenantItemSuffix } from '../../utils/item-scope.js'

type CreateTransactionInput = {
  trxType: TransactionTypeType
  itemId: string
  fromLocationId?: string
  toLocationId?: string
  qty: number
  reason?: string
}

type BulkAdjustInput = {
  reason: string
  adjustments: Array<{
    itemId: string
    locationId: string
    qty: number
  }>
}

type TransactionPeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY'

type ListTransactionsQuery = {
  period?: TransactionPeriod
  trxType?: TransactionTypeType
  from?: string
  to?: string
}

const dayNameMap: Record<number, string> = {
  0: 'Minggu',
  1: 'Senin',
  2: 'Selasa',
  3: 'Rabu',
  4: 'Kamis',
  5: 'Jumat',
  6: 'Sabtu',
}

function periodLabel(period?: TransactionPeriod) {
  if (period === 'DAILY') return 'Harian'
  if (period === 'WEEKLY') return 'Mingguan'
  return 'Bulanan'
}

function trxLabel(type: TransactionTypeType) {
  if (type === TransactionType.IN) return 'Masuk'
  if (type === TransactionType.OUT) return 'Keluar'
  if (type === TransactionType.TRANSFER) return 'Transfer'
  return 'Penyesuaian'
}

function formatDateId(date: Date) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function isInactiveLocationName(name: string) {
  return name.startsWith('INACTIVE - ') || name.includes('::INACTIVE - ')
}

function stripTenantPrefix(tenantCode: string, value: string) {
  const prefix = `${tenantCode}::`
  return value.startsWith(prefix) ? value.slice(prefix.length) : value
}

function stripInactivePrefix(value: string) {
  return value.replace(/^INACTIVE - /i, '')
}

function displayLocationName(locationName: string | null | undefined, tenantCode?: string) {
  if (!locationName) return null
  if (!tenantCode) return stripInactivePrefix(locationName)
  return stripInactivePrefix(stripTenantPrefix(tenantCode, locationName))
}

async function resolveTransactionHeaderContext(userId: string, tenantId: string, activeLocationId?: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, code: true },
  })
  if (!tenant) {
    throw new ApiError(400, 'TENANT_CONTEXT_REQUIRED', 'Tenant aktif tidak ditemukan pada sesi pengguna.')
  }

  const [user, location] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        username: true,
        tenantMemberships: {
          where: { tenantId },
          select: { jabatan: true },
          take: 1,
        },
      },
    }),
    activeLocationId
      ? prisma.location.findUnique({
          where: { id: activeLocationId },
          select: { name: true },
        })
      : Promise.resolve(null),
  ])

  const locationName = location?.name
    ? displayLocationName(location.name, tenant.code) || 'Semua Lokasi'
    : 'Semua Lokasi'

  const responsibleLine = `${user?.name || user?.username || 'Pengguna'} - ${user?.tenantMemberships?.[0]?.jabatan || 'Staff'}`
  return {
    tenantHeader: `${tenant.name} - ${locationName}`,
    responsibleLine,
    tenantName: tenant.name,
    locationName,
  }
}

async function renderTransactionsPdfBuffer(input: {
  tenantHeader: string
  responsibleLine: string
  period: TransactionPeriod
  trxType?: TransactionTypeType
  rows: Array<{
    tanggal: string
    hari: string
    kategori: string
    item: string
    lokasi: string
    qty: number
    penginput: string
    keterangan: string
    libur: string
  }>
}) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 30 })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    doc.font('Helvetica-Bold').fontSize(14).text(input.tenantHeader)
    doc.moveDown(0.2)
    doc.font('Helvetica').fontSize(10).text(input.responsibleLine)
    doc.text('Laporan: Transaksi Inventaris')
    doc.text(`Periode: ${periodLabel(input.period)}`)
    doc.text(`Filter Kategori: ${input.trxType ? trxLabel(input.trxType) : 'Semua'}`)
    doc.text(`Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')}`)
    doc.moveDown(0.5)

    const fullWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right
    const widths = [90, 45, 52, 72, 90, 30, 55, 70, 35]
    const headers = ['Tanggal', 'Hari', 'Kategori', 'Item', 'Lokasi', 'Qty', 'Penginput', 'Keterangan', 'Libur']

    const drawTableHeader = () => {
      const y = doc.y
      let x = doc.page.margins.left
      doc.save().rect(x, y, fullWidth, 20).fill('#f8fafc').restore()
      doc.strokeColor('#cbd5e1').lineWidth(0.7).rect(x, y, fullWidth, 20).stroke()
      doc.font('Helvetica-Bold').fontSize(8)
      headers.forEach((header, idx) => {
        doc.text(header, x + 3, y + 6, { width: widths[idx] - 6, align: idx === 5 ? 'right' : 'left' })
        x += widths[idx]
        if (idx < widths.length - 1) {
          doc.moveTo(x, y).lineTo(x, y + 20).stroke('#cbd5e1')
        }
      })
      doc.y = y + 20
    }

    const ensureSpace = (h: number) => {
      const bottom = doc.page.height - doc.page.margins.bottom
      if (doc.y + h > bottom) {
        doc.addPage()
        drawTableHeader()
      }
    }

    drawTableHeader()
    doc.font('Helvetica').fontSize(8)

    for (const row of input.rows) {
      const textHeights = [
        doc.heightOfString(row.tanggal, { width: widths[0] - 6 }),
        doc.heightOfString(row.hari, { width: widths[1] - 6 }),
        doc.heightOfString(row.kategori, { width: widths[2] - 6 }),
        doc.heightOfString(row.item, { width: widths[3] - 6 }),
        doc.heightOfString(row.lokasi, { width: widths[4] - 6 }),
        doc.heightOfString(String(row.qty), { width: widths[5] - 6 }),
        doc.heightOfString(row.penginput, { width: widths[6] - 6 }),
        doc.heightOfString(row.keterangan, { width: widths[7] - 6 }),
        doc.heightOfString(row.libur, { width: widths[8] - 6 }),
      ]
      const rowH = Math.max(18, ...textHeights) + 6
      ensureSpace(rowH)
      const y = doc.y
      let x = doc.page.margins.left
      doc.strokeColor('#e2e8f0').lineWidth(0.6).rect(x, y, fullWidth, rowH).stroke()
      const values = [row.tanggal, row.hari, row.kategori, row.item, row.lokasi, String(row.qty), row.penginput, row.keterangan, row.libur]
      values.forEach((val, idx) => {
        doc.text(val, x + 3, y + 4, { width: widths[idx] - 6, align: idx === 5 ? 'right' : 'left' })
        x += widths[idx]
        if (idx < widths.length - 1) {
          doc.moveTo(x, y).lineTo(x, y + rowH).stroke('#e2e8f0')
        }
      })
      doc.y = y + rowH
    }

    doc.end()
  })
}

async function sendTelegramPdf(input: {
  botToken: string
  chatId: string
  caption: string
  fileName: string
  pdfBuffer: Buffer
}) {
  const form = new FormData()
  form.append('chat_id', input.chatId)
  form.append('caption', input.caption)
  form.append('document', new Blob([new Uint8Array(input.pdfBuffer)], { type: 'application/pdf' }), input.fileName)

  const response = await fetch(`https://api.telegram.org/bot${input.botToken}/sendDocument`, {
    method: 'POST',
    body: form,
  })

  const json = (await response.json().catch(() => null)) as { ok?: boolean; description?: string } | null
  if (!response.ok || !json?.ok) {
    throw new ApiError(502, 'TELEGRAM_SEND_FAILED', json?.description || 'Gagal mengirim PDF transaksi ke Telegram.')
  }
}

async function resolveTenantLocationSet(tenantId?: string) {
  if (!tenantId) {
    throw new ApiError(400, 'TENANT_CONTEXT_REQUIRED', 'Tenant aktif tidak ditemukan pada sesi pengguna.')
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      code: true,
      isActive: true,
    },
  })

  if (!tenant || !tenant.isActive) {
    throw new ApiError(403, 'FORBIDDEN', 'Tenant tidak aktif atau tidak ditemukan.')
  }

  const rows = await prisma.location.findMany({
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

  return new Set(rows.filter((row) => !isInactiveLocationName(row.name)).map((row) => row.id))
}

function ensureLocationInTenant(locationId: string | undefined, tenantLocationIds: Set<string>) {
  if (!locationId) return
  if (!tenantLocationIds.has(locationId)) {
    throw new ApiError(403, 'FORBIDDEN', 'Lokasi tidak tersedia untuk tenant aktif ini.')
  }
}

async function ensureLocationActive(locationId: string) {
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { id: true, name: true },
  })

  if (!location) {
    throw new ApiError(404, 'LOCATION_NOT_FOUND', 'Lokasi tidak ditemukan.')
  }

  if (isInactiveLocationName(location.name)) {
    throw new ApiError(400, 'LOCATION_INACTIVE', 'Lokasi nonaktif tidak bisa dipakai transaksi.')
  }
}

function ensureActiveLocationContext(
  input: CreateTransactionInput,
  activeLocationId: string | undefined,
) {
  if (!activeLocationId) return

  if (input.trxType === TransactionType.IN && input.toLocationId !== activeLocationId) {
    throw new ApiError(403, 'FORBIDDEN', 'Transaksi IN harus menggunakan lokasi aktif.')
  }

  if (input.trxType === TransactionType.OUT && input.fromLocationId !== activeLocationId) {
    throw new ApiError(403, 'FORBIDDEN', 'Transaksi OUT harus menggunakan lokasi aktif.')
  }

  if (input.trxType === TransactionType.ADJUST && input.fromLocationId !== activeLocationId) {
    throw new ApiError(403, 'FORBIDDEN', 'Penyesuaian stok harus menggunakan lokasi aktif.')
  }

  if (input.trxType === TransactionType.TRANSFER && input.fromLocationId !== activeLocationId) {
    throw new ApiError(403, 'FORBIDDEN', 'Transfer harus berasal dari lokasi aktif.')
  }
}

async function getOrCreateStock(tx: PrismaNamespace.TransactionClient, itemId: string, locationId: string) {
  const existing = await tx.stock.findUnique({
    where: {
      itemId_locationId: {
        itemId,
        locationId,
      },
    },
  })

  if (existing) return existing

  return tx.stock.create({
    data: {
      itemId,
      locationId,
      qty: 0,
    },
  })
}

function validatePayload(input: CreateTransactionInput) {
  if (input.qty === 0) {
    throw new ApiError(400, 'QTY_INVALID', 'Qty tidak boleh 0.')
  }

  if (
    (input.trxType === TransactionType.IN ||
      input.trxType === TransactionType.OUT ||
      input.trxType === TransactionType.TRANSFER) &&
    input.qty < 0
  ) {
    throw new ApiError(400, 'QTY_INVALID', 'Qty untuk IN/OUT/TRANSFER harus positif.')
  }

  if (input.trxType === TransactionType.IN && !input.toLocationId) {
    throw new ApiError(400, 'LOCATION_REQUIRED', 'Lokasi tujuan wajib untuk transaksi IN.')
  }

  if (input.trxType === TransactionType.OUT && !input.fromLocationId) {
    throw new ApiError(400, 'LOCATION_REQUIRED', 'Lokasi asal wajib untuk transaksi OUT.')
  }

  if (input.trxType === TransactionType.TRANSFER) {
    if (!input.fromLocationId || !input.toLocationId) {
      throw new ApiError(400, 'LOCATION_REQUIRED', 'Lokasi asal dan tujuan wajib untuk transaksi TRANSFER.')
    }

    if (input.fromLocationId === input.toLocationId) {
      throw new ApiError(400, 'LOCATION_INVALID', 'Lokasi asal dan tujuan tidak boleh sama.')
    }
  }

  if (input.trxType === TransactionType.ADJUST && !input.fromLocationId) {
    throw new ApiError(400, 'LOCATION_REQUIRED', 'Lokasi wajib untuk transaksi ADJUST.')
  }
}

export async function listTransactions(query: ListTransactionsQuery = {}, tenantId?: string, activeLocationId?: string) {
  const suffix = tenantItemSuffix(tenantId)
  const tenant = tenantId
    ? await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { code: true },
      })
    : null
  const tenantItems = await prisma.item.findMany({
    where: suffix
      ? {
          name: {
            endsWith: suffix,
          },
        }
      : {},
    select: {
      id: true,
    },
  })
  const tenantItemIds = tenantItems.map((item) => item.id)
  if (!tenantItemIds.length) {
    return []
  }

  const range = resolveRange(query)
  const rows = await prisma.inventoryTransaction.findMany({
    where: {
      itemId: {
        in: tenantItemIds,
      },
      ...(activeLocationId
        ? {
            OR: [{ fromLocationId: activeLocationId }, { toLocationId: activeLocationId }],
          }
        : {}),
      ...(query.trxType
        ? {
            trxType: query.trxType,
          }
        : {}),
      ...(range
        ? {
            createdAt: {
              gte: range.from,
              lte: range.to,
            },
          }
        : {}),
    },
    include: {
      actor: {
        select: {
          id: true,
          name: true,
          username: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  const locationIds = [...new Set(rows.flatMap((row) => [row.fromLocationId, row.toLocationId]).filter(Boolean) as string[])]
  const locationRows = locationIds.length
    ? await prisma.location.findMany({
        where: {
          id: {
            in: locationIds,
          },
        },
        select: {
          id: true,
          name: true,
        },
      })
    : []
  const locationNameMap = new Map(locationRows.map((row) => [row.id, displayLocationName(row.name, tenant?.code)]))

  return rows.map((row) => ({
    id: row.id,
    trxType: row.trxType,
    itemId: row.itemId,
    fromLocationId: row.fromLocationId,
    toLocationId: row.toLocationId,
    qty: row.qty ? Number(row.qty) : 0,
    reason: row.reason,
    createdAt: row.createdAt,
    actor: row.actor,
    fromLocationName: row.fromLocationId ? locationNameMap.get(row.fromLocationId) || null : null,
    toLocationName: row.toLocationId ? locationNameMap.get(row.toLocationId) || null : null,
    tenantCode: tenant?.code || null,
  }))
}

function resolveRange(query: ListTransactionsQuery): { from: Date; to: Date } | null {
  if (query.from || query.to) {
    const now = new Date()
    return {
      from: query.from ? new Date(query.from) : startOfDay(now),
      to: query.to ? new Date(query.to) : endOfDay(now),
    }
  }

  if (!query.period) return null

  const now = new Date()
  if (query.period === 'DAILY') {
    return {
      from: startOfDay(now),
      to: endOfDay(now),
    }
  }

  if (query.period === 'WEEKLY') {
    const mondayOffset = (now.getDay() + 6) % 7
    const monday = new Date(now)
    monday.setDate(now.getDate() - mondayOffset)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)

    return {
      from: startOfDay(monday),
      to: endOfDay(sunday),
    }
  }

  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return {
    from: startOfDay(startMonth),
    to: endOfDay(endMonth),
  }
}

function startOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function endOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(23, 59, 59, 999)
  return next
}

export async function createTransaction(
  input: CreateTransactionInput,
  actorUserId: string,
  tenantId?: string,
  activeLocationId?: string,
) {
  validatePayload(input)
  ensureActiveLocationContext(input, activeLocationId)

  if (!tenantId) {
    throw new ApiError(400, 'TENANT_CONTEXT_REQUIRED', 'Tenant aktif tidak ditemukan pada sesi pengguna.')
  }

  const item = await prisma.item.findUnique({ where: { id: input.itemId } })
  if (!item) {
    throw new ApiError(404, 'ITEM_NOT_FOUND', 'Item tidak ditemukan.')
  }

  if (!isItemOwnedByTenant(item.name, tenantId)) {
    throw new ApiError(403, 'FORBIDDEN', 'Item tidak tersedia pada tenant aktif.')
  }

  if (!item.isActive) {
    throw new ApiError(400, 'ITEM_INACTIVE', 'Item nonaktif tidak dapat dipakai transaksi.')
  }

  const tenantLocationIds = await resolveTenantLocationSet(tenantId)
  ensureLocationInTenant(input.fromLocationId, tenantLocationIds)
  ensureLocationInTenant(input.toLocationId, tenantLocationIds)

  if (input.fromLocationId) await ensureLocationActive(input.fromLocationId)
  if (input.toLocationId) await ensureLocationActive(input.toLocationId)

  const created = await prisma.$transaction(async (tx) => {
    if (input.trxType === TransactionType.IN) {
      const stock = await getOrCreateStock(tx, input.itemId, input.toLocationId!)

      await tx.stock.update({
        where: { id: stock.id },
        data: { qty: new Prisma.Decimal(stock.qty).plus(input.qty) },
      })
    }

    if (input.trxType === TransactionType.OUT) {
      const stock = await getOrCreateStock(tx, input.itemId, input.fromLocationId!)
      const currentQty = Number(stock.qty)

      if (currentQty < input.qty) {
        throw new ApiError(
          400,
          'STOCK_INSUFFICIENT',
          `Stok tidak mencukupi untuk transaksi OUT. Tersedia ${currentQty}, diminta ${input.qty}.`,
        )
      }

      await tx.stock.update({
        where: { id: stock.id },
        data: { qty: new Prisma.Decimal(stock.qty).minus(input.qty) },
      })
    }

    if (input.trxType === TransactionType.TRANSFER) {
      const source = await getOrCreateStock(tx, input.itemId, input.fromLocationId!)
      const target = await getOrCreateStock(tx, input.itemId, input.toLocationId!)

      const sourceQty = Number(source.qty)
      if (sourceQty < input.qty) {
        throw new ApiError(
          400,
          'STOCK_INSUFFICIENT',
          `Stok asal tidak cukup untuk transfer. Tersedia ${sourceQty}, diminta ${input.qty}.`,
        )
      }

      await tx.stock.update({
        where: { id: source.id },
        data: { qty: new Prisma.Decimal(source.qty).minus(input.qty) },
      })

      await tx.stock.update({
        where: { id: target.id },
        data: { qty: new Prisma.Decimal(target.qty).plus(input.qty) },
      })
    }

    if (input.trxType === TransactionType.ADJUST) {
      const stock = await getOrCreateStock(tx, input.itemId, input.fromLocationId!)
      const newQty = Number(stock.qty) + input.qty

      if (newQty < 0) {
        throw new ApiError(400, 'STOCK_NEGATIVE', 'Hasil penyesuaian stok tidak boleh negatif.')
      }

      await tx.stock.update({
        where: { id: stock.id },
        data: { qty: new Prisma.Decimal(stock.qty).plus(input.qty) },
      })
    }

    const transaction = await tx.inventoryTransaction.create({
      data: {
        trxType: input.trxType,
        itemId: input.itemId,
        fromLocationId: input.fromLocationId,
        toLocationId: input.toLocationId,
        qty: input.qty,
        reason: input.reason,
        createdBy: actorUserId,
      },
    })

    await tx.auditLog.create({
      data: {
        actorUserId,
        tenantId,
        entityType: 'inventory_transactions',
        entityId: transaction.id,
        action: 'CREATE',
        diffJson: {
          trxType: input.trxType,
          itemId: input.itemId,
          fromLocationId: input.fromLocationId,
          toLocationId: input.toLocationId,
          qty: input.qty,
        },
      },
    })

    return transaction
  })

  return {
    id: created.id,
    trxType: created.trxType,
    itemId: created.itemId,
    fromLocationId: created.fromLocationId,
    toLocationId: created.toLocationId,
    qty: created.qty ? Number(created.qty) : 0,
    reason: created.reason,
    createdBy: created.createdBy,
    createdAt: created.createdAt,
  }
}

export async function createBulkAdjustTransactions(
  input: BulkAdjustInput,
  actorUserId: string,
  tenantId?: string,
  activeLocationId?: string,
) {
  if (!tenantId) {
    throw new ApiError(400, 'TENANT_CONTEXT_REQUIRED', 'Tenant aktif tidak ditemukan pada sesi pengguna.')
  }

  const reason = input.reason.trim()
  if (!reason) {
    throw new ApiError(400, 'REASON_REQUIRED', 'Alasan penyesuaian terpilih wajib diisi.')
  }

  const uniqueAdjustments = input.adjustments.filter((row) => Number.isFinite(row.qty) && row.qty !== 0)
  if (!uniqueAdjustments.length) {
    throw new ApiError(400, 'ADJUSTMENTS_EMPTY', 'Isi minimal satu qty penyesuaian yang valid.')
  }

  const itemIds = [...new Set(uniqueAdjustments.map((row) => row.itemId))]
  const locationIds = [...new Set(uniqueAdjustments.map((row) => row.locationId))]

  const tenantLocationIds = await resolveTenantLocationSet(tenantId)
  for (const locationId of locationIds) {
    ensureLocationInTenant(locationId, tenantLocationIds)
  }

  if (activeLocationId && locationIds.some((locationId) => locationId !== activeLocationId)) {
    throw new ApiError(403, 'FORBIDDEN', 'Bulk penyesuaian hanya boleh untuk lokasi aktif.')
  }

  const items = await prisma.item.findMany({
    where: {
      id: { in: itemIds },
      name: {
        endsWith: tenantItemSuffix(tenantId),
      },
      isActive: true,
    },
    select: { id: true },
  })

  const itemSet = new Set(items.map((item) => item.id))
  const missingItem = uniqueAdjustments.find((row) => !itemSet.has(row.itemId))
  if (missingItem) {
    throw new ApiError(404, 'ITEM_NOT_FOUND', 'Ada item penyesuaian terpilih yang tidak ditemukan.')
  }

  for (const locationId of locationIds) {
    await ensureLocationActive(locationId)
  }

  const created = await prisma.$transaction(async (tx) => {
    const results: Array<{ id: string; itemId: string; locationId: string; qty: number }> = []

    for (const adj of uniqueAdjustments) {
      const stock = await getOrCreateStock(tx, adj.itemId, adj.locationId)
      const newQty = Number(stock.qty) + adj.qty
      if (newQty < 0) {
        throw new ApiError(400, 'STOCK_NEGATIVE', 'Hasil penyesuaian stok tidak boleh negatif.')
      }

      await tx.stock.update({
        where: { id: stock.id },
        data: { qty: new Prisma.Decimal(stock.qty).plus(adj.qty) },
      })

      const trx = await tx.inventoryTransaction.create({
        data: {
          trxType: TransactionType.ADJUST,
          itemId: adj.itemId,
          fromLocationId: adj.locationId,
          qty: adj.qty,
          reason,
          createdBy: actorUserId,
        },
      })

      results.push({
        id: trx.id,
        itemId: adj.itemId,
        locationId: adj.locationId,
        qty: adj.qty,
      })
    }

    await tx.auditLog.create({
      data: {
        actorUserId,
        tenantId,
        entityType: 'inventory_transactions',
        entityId: 'bulk_adjust',
        action: 'BULK_ADJUST',
        diffJson: {
          reason,
          count: results.length,
          adjustments: results,
        },
      },
    })

    return results
  })

  return {
    code: 'BULK_ADJUST_COMPLETED',
    message: `Penyesuaian stok terpilih berhasil diproses untuk ${created.length} baris.`,
    count: created.length,
    transactions: created,
  }
}

export async function sendTransactionsExportToTelegram(
  userId: string,
  tenantId: string | undefined,
  activeLocationId: string | undefined,
  query: ListTransactionsQuery = {},
) {
  if (!tenantId) {
    throw new ApiError(400, 'TENANT_CONTEXT_REQUIRED', 'Tenant aktif tidak ditemukan pada sesi pengguna.')
  }

  const settings = await prisma.tenantTelegramSetting.findUnique({ where: { tenantId } })
  if (!settings || !settings.isEnabled || !settings.botToken || !settings.chatId) {
    return {
      code: 'TELEGRAM_EXPORT_SKIPPED',
      message: 'Integrasi Telegram tenant tidak aktif.',
      sent: false,
    }
  }

  const [rows, header] = await Promise.all([
    listTransactions(query, tenantId, activeLocationId),
    resolveTransactionHeaderContext(userId, tenantId, activeLocationId),
  ])

  const itemIds = [...new Set(rows.map((row) => row.itemId))]
  const itemRows = itemIds.length
    ? await prisma.item.findMany({
        where: { id: { in: itemIds } },
        select: { id: true, name: true },
      })
    : []
  const itemNameMap = new Map(itemRows.map((row) => [row.id, row.name]))

  const pdfRows = rows.map((row) => {
    const created = new Date(row.createdAt)
    const kategori = trxLabel(row.trxType)
    const lokasi = kategori === 'Masuk'
      ? `Ke ${row.toLocationName || '-'}`
      : kategori === 'Keluar'
        ? `Dari ${row.fromLocationName || '-'}`
        : kategori === 'Transfer'
          ? `${row.fromLocationName || '-'} -> ${row.toLocationName || '-'}`
          : `Di ${row.fromLocationName || '-'}`
    return {
      tanggal: formatDateId(created),
      hari: dayNameMap[created.getDay()],
      kategori,
      item: itemNameMap.get(row.itemId) || row.itemId,
      lokasi,
      qty: row.qty,
      penginput: row.actor?.name || row.actor?.username || '-',
      keterangan: row.reason || '-',
      libur: query.period === 'WEEKLY' && created.getDay() === 0 ? 'Minggu' : '-',
    }
  })

  const pdfBuffer = await renderTransactionsPdfBuffer({
    tenantHeader: header.tenantHeader,
    responsibleLine: header.responsibleLine,
    period: query.period || 'MONTHLY',
    trxType: query.trxType,
    rows: pdfRows,
  })

  const fileName = `transactions-${(query.period || 'MONTHLY').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`
  await sendTelegramPdf({
    botToken: settings.botToken,
    chatId: settings.chatId,
    caption: `Transaksi ${periodLabel(query.period || 'MONTHLY')} - ${header.tenantHeader}`,
    fileName,
    pdfBuffer,
  })

  await prisma.auditLog.create({
    data: {
      actorUserId: userId,
      tenantId,
      entityType: 'transaction_exports',
      entityId: tenantId,
      action: 'SEND_TELEGRAM',
      diffJson: {
        period: query.period || 'MONTHLY',
        trxType: query.trxType || null,
        activeLocationId: activeLocationId || null,
        rows: rows.length,
        chatId: settings.chatId,
      },
    },
  })

  return {
    code: 'TELEGRAM_EXPORT_SENT',
    message: 'Export transaksi berhasil dikirim ke Telegram.',
    sent: true,
  }
}
