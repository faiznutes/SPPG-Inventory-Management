import { ChecklistResult, ChecklistRunStatus, ChecklistSchedule } from '../../lib/prisma-client.js'
import type {
  ChecklistResult as ChecklistResultType,
  ChecklistTemplateItem,
  ChecklistRunStatus as ChecklistRunStatusType,
} from '@prisma/client'
import PDFDocument from 'pdfkit'
import { prisma } from '../../lib/prisma.js'
import { env } from '../../config/env.js'
import { ApiError } from '../../utils/api-error.js'

const DEFAULT_TEMPLATE_NAME = 'Checklist Harian Operasional'
const DEFAULT_TEMPLATE_ITEMS = [
  { title: 'Barang habis beli lagi', itemType: 'CONSUMABLE' as const },
  { title: 'Habis tapi isi ulang', itemType: 'GAS' as const },
  { title: 'Tidak habis tapi bisa rusak', itemType: 'ASSET' as const },
]
const ITEM_TITLE_DELIMITER = '::'

function displayTemplateName(templateName: string, tenantCode?: string) {
  if (!tenantCode) return templateName
  const suffix = ` - ${tenantCode}`
  return templateName.endsWith(suffix) ? templateName.slice(0, -suffix.length) : templateName
}

type ChecklistItemType = 'ASSET' | 'GAS' | 'CONSUMABLE'
type ChecklistMonitoringPeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'CUSTOM'
type ChecklistMonitoringItemType = 'ALL' | ChecklistItemType
type ChecklistMonitoringCode = 'A' | 'M' | 'H' | 'B'

type ChecklistMonitoringQuery = {
  period?: ChecklistMonitoringPeriod
  itemType?: ChecklistMonitoringItemType
  from?: string
  to?: string
}

type ChecklistMonitoringCell = {
  date: string
  code: ChecklistMonitoringCode
  label: string
  result: ChecklistResultType | 'NA'
  notes: string | null
  conditionPercent: number | null
  runId: string | null
  runStatus: ChecklistRunStatusType | null
}

type ChecklistMonitoringRow = {
  title: string
  itemType: ChecklistItemType
  categoryLabel: string
  cells: ChecklistMonitoringCell[]
  totals: Record<ChecklistMonitoringCode, number>
}

type ChecklistMonitoringData = {
  templateName: string
  tenantName: string
  period: ChecklistMonitoringPeriod
  itemType: ChecklistMonitoringItemType
  range: {
    from: Date
    to: Date
    fromLabel: string
    toLabel: string
  }
  legend: {
    A: string
    M: string
    H: string
    B: string
  }
  dates: Array<{ key: string; label: string; dayName: string; isSunday: boolean }>
  rows: ChecklistMonitoringRow[]
  totals: Record<ChecklistMonitoringCode, number>
}

function detectChecklistItemType(title: string): ChecklistItemType {
  const text = title.toLowerCase()
  if (text.includes('asset') || text.includes('alat') || text.includes('kondisi') || text.includes('rusak')) return 'ASSET'
  if (text.includes('gas') || text.includes('isi ulang')) return 'GAS'
  return 'CONSUMABLE'
}

function encodeChecklistTitle(itemType: ChecklistItemType, title: string) {
  return `${itemType}${ITEM_TITLE_DELIMITER}${title.trim()}`
}

function decodeChecklistTitle(rawTitle: string): { itemType: ChecklistItemType; title: string } {
  const [head, ...rest] = rawTitle.split(ITEM_TITLE_DELIMITER)
  if (rest.length > 0 && ['ASSET', 'GAS', 'CONSUMABLE'].includes(head)) {
    return {
      itemType: head as ChecklistItemType,
      title: rest.join(ITEM_TITLE_DELIMITER).trim(),
    }
  }

  return {
    itemType: detectChecklistItemType(rawTitle),
    title: rawTitle,
  }
}

function extractConditionPercent(notes?: string | null) {
  if (!notes) return null
  const match = notes.match(/kondisi\s*[:=]\s*(\d{1,3})/i)
  if (!match) return null
  const value = Number(match[1])
  if (!Number.isFinite(value)) return null
  return Math.max(0, Math.min(100, value))
}

function attachConditionNote(notes: string | undefined, conditionPercent?: number) {
  const cleanNotes = (notes || '').trim().replace(/\s*\|?\s*Kondisi\s*[:=]\s*\d{1,3}%?/gi, '').trim()
  if (typeof conditionPercent !== 'number') return cleanNotes
  const conditionText = `Kondisi: ${Math.round(conditionPercent)}%`
  return cleanNotes ? `${cleanNotes} | ${conditionText}` : conditionText
}

function resultFromCondition(conditionPercent: number) {
  if (conditionPercent >= 80) return ChecklistResult.OK
  if (conditionPercent >= 50) return ChecklistResult.LOW
  return ChecklistResult.OUT
}

function needsRunItemUpgrade(runItems: Array<{ title: string }>, expectedTitles: string[]) {
  const titles = new Set(runItems.map((item) => item.title))
  if (runItems.length !== expectedTitles.length) return true
  return expectedTitles.some((title) => !titles.has(title))
}

function toDateOnly(date: Date) {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`)
}

function formatDateId(date: Date) {
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function checklistResultLabel(result: ChecklistResultType) {
  if (result === 'OK') return 'Aman'
  if (result === 'LOW') return 'Menipis'
  if (result === 'OUT') return 'Habis'
  if (result === 'DAMAGED') return 'Rusak'
  return 'Belum Dicek'
}

function checklistItemTypeLabel(itemType: ChecklistItemType) {
  if (itemType === 'ASSET') return 'Tidak habis tapi bisa rusak'
  if (itemType === 'GAS') return 'Habis tapi isi ulang'
  return 'Barang habis beli lagi'
}

function checklistPdfFileName(runDate: Date) {
  const yyyy = runDate.getFullYear()
  const mm = String(runDate.getMonth() + 1).padStart(2, '0')
  const dd = String(runDate.getDate()).padStart(2, '0')
  return `checklist-${yyyy}-${mm}-${dd}.pdf`
}

function buildExpectedChecklistTitles(templateItems: Array<Pick<ChecklistTemplateItem, 'title'>> = []) {
  if (templateItems.length) {
    return templateItems
      .map((item) => encodeChecklistTitle(detectChecklistItemType(item.title), item.title))
      .sort((a, b) => a.localeCompare(b))
  }

  return DEFAULT_TEMPLATE_ITEMS.map((item) => encodeChecklistTitle(item.itemType, item.title)).sort((a, b) => a.localeCompare(b))
}

async function renderChecklistPdfBuffer(input: {
  tenantName: string
  responsibleLine: string
  templateName: string
  runDate: Date
  items: Array<{
    title: string
    result: ChecklistResultType
    notes: string | null
    conditionPercent: number | null
    itemType: ChecklistItemType
  }>
}) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 40,
    })

    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    doc.fontSize(16).text(input.tenantName)
    doc.moveDown(0.3)
    doc.fontSize(12).text(input.responsibleLine)
    doc.moveDown(0.5)
    doc.fontSize(11).text(input.templateName)
    doc.text(`Tanggal: ${formatDateId(input.runDate)}`)
    doc.moveDown(0.8)

    input.items.forEach((item, index) => {
      if (doc.y > 760) {
        doc.addPage()
      }

      doc.fontSize(10).font('Helvetica-Bold').text(`${index + 1}. ${item.title}`)
      doc.font('Helvetica')
      doc.text(`Kategori: ${checklistItemTypeLabel(item.itemType)}`)
      doc.text(`Status: ${checklistResultLabel(item.result)}`)
      doc.text(`Kondisi (%): ${item.itemType === 'ASSET' ? (item.conditionPercent ?? '-') : '-'}`)
      doc.text(`Catatan: ${(item.notes || '-').replaceAll('\n', ' ')}`)
      doc.moveDown(0.5)
    })

    doc.end()
  })
}

async function renderChecklistMonitoringPdfBuffer(input: {
  tenantName: string
  responsibleLine: string
  monitoring: ChecklistMonitoringData
}) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'portrait',
      margin: 36,
    })

    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    doc.fontSize(14).font('Helvetica-Bold').text(input.tenantName)
    doc.moveDown(0.2)
    doc.fontSize(10).font('Helvetica').text(input.responsibleLine)
    doc.text(input.monitoring.templateName)
    doc.text(`Periode: ${monitoringPeriodLabel(input.monitoring.period)} (${input.monitoring.range.fromLabel} s/d ${input.monitoring.range.toLabel})`)
    doc.text(`Kategori: ${monitoringItemTypeLabel(input.monitoring.itemType)}`)
    doc.text('Legenda: A=Aman, M=Menipis, H=Habis/Rusak, B=Belum dicek')
    doc.moveDown(0.6)

    for (const row of input.monitoring.rows) {
      if (doc.y > 700) {
        doc.addPage()
      }

      doc.font('Helvetica-Bold').fontSize(10).text(row.title)
      doc.font('Helvetica').fontSize(9).text(`Kategori: ${row.categoryLabel}`)

      const dateCodes = row.cells.map((cell, index) => `${input.monitoring.dates[index]?.label || cell.date}: ${cell.code}`)
      const chunks: string[] = []
      for (let i = 0; i < dateCodes.length; i += 6) {
        chunks.push(dateCodes.slice(i, i + 6).join(' | '))
      }

      for (const line of chunks) {
        doc.fontSize(8).text(line)
      }

      doc.font('Helvetica-Bold').fontSize(9).text(`Total -> A:${row.totals.A}  M:${row.totals.M}  H:${row.totals.H}  B:${row.totals.B}`)
      doc.moveDown(0.5)
      doc.strokeColor('#cbd5e1').lineWidth(0.5).moveTo(doc.x, doc.y).lineTo(560, doc.y).stroke()
      doc.moveDown(0.4)
    }

    if (doc.y > 740) doc.addPage()
    doc.moveDown(0.4)
    doc.font('Helvetica-Bold').fontSize(11).text('TOTAL KESELURUHAN', { underline: true })
    doc.moveDown(0.2)
    doc.font('Helvetica-Bold').fontSize(10).text(
      `A: ${input.monitoring.totals.A}    M: ${input.monitoring.totals.M}    H: ${input.monitoring.totals.H}    B: ${input.monitoring.totals.B}`,
    )

    doc.end()
  })
}

async function sendTelegramChecklistPdf(input: {
  botToken: string
  chatId: string
  caption: string
  fileName: string
  pdfBuffer: Buffer
}) {
  const form = new FormData()
  form.append('chat_id', input.chatId)
  form.append('caption', input.caption)
  const fileBytes = new Uint8Array(input.pdfBuffer)
  form.append('document', new Blob([fileBytes], { type: 'application/pdf' }), input.fileName)

  const response = await fetch(`https://api.telegram.org/bot${input.botToken}/sendDocument`, {
    method: 'POST',
    body: form,
  })

  const json = (await response.json().catch(() => null)) as { ok?: boolean; description?: string } | null

  if (!response.ok || !json?.ok) {
    throw new ApiError(502, 'TELEGRAM_SEND_FAILED', json?.description || 'Gagal mengirim PDF ke Telegram.')
  }
}

async function ensureDefaultTemplate(userId: string, tenantCode?: string) {
  const templateName = tenantCode ? `${DEFAULT_TEMPLATE_NAME} - ${tenantCode}` : DEFAULT_TEMPLATE_NAME
  const existing = await prisma.checklistTemplate.findFirst({
    where: { name: templateName },
    include: { items: true },
  })

  if (existing) return existing

  return prisma.checklistTemplate.create({
    data: {
      name: templateName,
      schedule: ChecklistSchedule.DAILY,
      createdBy: userId,
    },
    include: { items: true },
  })
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

function resolveMonitoringRange(period: ChecklistMonitoringPeriod, fromRaw?: string, toRaw?: string) {
  if (period === 'CUSTOM') {
    if (!fromRaw || !toRaw) {
      throw new ApiError(400, 'RANGE_REQUIRED', 'Rentang custom wajib mengisi tanggal dari dan sampai.')
    }

    const fromDate = startOfDay(new Date(`${fromRaw}T00:00:00.000Z`))
    const toDate = endOfDay(new Date(`${toRaw}T00:00:00.000Z`))
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new ApiError(400, 'RANGE_INVALID', 'Format tanggal custom tidak valid.')
    }
    if (fromDate > toDate) {
      throw new ApiError(400, 'RANGE_INVALID', 'Tanggal akhir harus lebih besar atau sama dengan tanggal awal.')
    }

    const maxRangeMs = 31 * 24 * 60 * 60 * 1000
    if (toDate.getTime() - fromDate.getTime() > maxRangeMs) {
      throw new ApiError(400, 'RANGE_EXCEEDED', 'Rentang custom maksimal 31 hari.')
    }

    return { from: fromDate, to: toDate }
  }

  const now = new Date()
  if (period === 'DAILY') {
    const today = startOfDay(now)
    return { from: today, to: endOfDay(today) }
  }

  if (period === 'WEEKLY') {
    const mondayOffset = (now.getDay() + 6) % 7
    const monday = new Date(now)
    monday.setDate(now.getDate() - mondayOffset)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    return { from: startOfDay(monday), to: endOfDay(sunday) }
  }

  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return { from: startOfDay(startMonth), to: endOfDay(endMonth) }
}

function formatDateKey(date: Date) {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function getDateKeysInRange(from: Date, to: Date) {
  const keys: string[] = []
  const cursor = startOfDay(from)
  const end = startOfDay(to)

  while (cursor <= end) {
    keys.push(formatDateKey(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }

  return keys
}

function monitoringCodeFromResult(result: ChecklistResultType): ChecklistMonitoringCode {
  if (result === 'OK') return 'A'
  if (result === 'LOW') return 'M'
  if (result === 'OUT' || result === 'DAMAGED') return 'H'
  return 'B'
}

function monitoringLabelFromCode(code: ChecklistMonitoringCode) {
  if (code === 'A') return 'Aman'
  if (code === 'M') return 'Menipis'
  if (code === 'H') return 'Habis / Rusak'
  return 'Belum dicek'
}

function monitoringPeriodLabel(period: ChecklistMonitoringPeriod) {
  if (period === 'DAILY') return 'Harian'
  if (period === 'WEEKLY') return 'Mingguan'
  if (period === 'CUSTOM') return 'Custom'
  return 'Bulanan'
}

function monitoringItemTypeLabel(itemType: ChecklistMonitoringItemType) {
  if (itemType === 'CONSUMABLE') return 'Barang habis beli lagi'
  if (itemType === 'GAS') return 'Habis tapi isi ulang'
  if (itemType === 'ASSET') return 'Tidak habis tapi bisa rusak'
  return 'Semua kategori'
}

async function buildChecklistMonitoringData(
  tenantId: string | undefined,
  activeLocationId: string | undefined,
  query: ChecklistMonitoringQuery = {},
): Promise<ChecklistMonitoringData> {
  const period = query.period || 'WEEKLY'
  const itemType = query.itemType || 'ALL'
  const range = resolveMonitoringRange(period, query.from, query.to)
  const from = toDateOnly(range.from)
  const to = toDateOnly(range.to)

  const tenant = tenantId
    ? await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, code: true, name: true },
      })
    : null

  const templateName = tenant?.code ? `${DEFAULT_TEMPLATE_NAME} - ${tenant.code}` : DEFAULT_TEMPLATE_NAME

  const [runs, template] = await Promise.all([
    prisma.checklistRun.findMany({
      where: {
        template: {
          name: templateName,
        },
        ...(activeLocationId
          ? {
              locationId: activeLocationId,
            }
          : {}),
        runDate: {
          gte: from,
          lte: to,
        },
      },
      include: {
        items: true,
      },
      orderBy: {
        runDate: 'asc',
      },
    }),
    prisma.checklistTemplate.findFirst({
      where: {
        name: templateName,
      },
      include: {
        items: {
          orderBy: {
            sortOrder: 'asc',
          },
        },
      },
    }),
  ])

  const expectedTitles = buildExpectedChecklistTitles(template?.items)

  const knownTitles = new Set(expectedTitles)
  for (const run of runs) {
    for (const item of run.items) {
      knownTitles.add(item.title)
    }
  }

  const dateKeys = getDateKeysInRange(from, to)
  const runByDate = new Map(
    runs.map((run) => {
      const rowMap = new Map(run.items.map((item) => [item.title, item]))
      return [formatDateKey(run.runDate), { run, rowMap }] as const
    }),
  )

  const totals: Record<ChecklistMonitoringCode, number> = {
    A: 0,
    M: 0,
    H: 0,
    B: 0,
  }

  const rows: ChecklistMonitoringRow[] = [...knownTitles]
    .map((encodedTitle) => {
      const decoded = decodeChecklistTitle(encodedTitle)
      return {
        title: decoded.title,
        itemType: decoded.itemType,
        encodedTitle,
      }
    })
    .filter((row) => (itemType === 'ALL' ? true : row.itemType === itemType))
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((row) => {
      const cells: ChecklistMonitoringCell[] = dateKeys.map((dateKey) => {
        const dayRun = runByDate.get(dateKey)
        const runItem = dayRun?.rowMap.get(row.encodedTitle)
        const code = runItem ? monitoringCodeFromResult(runItem.result) : 'B'
        totals[code] += 1

        return {
          date: dateKey,
          code,
          label: monitoringLabelFromCode(code),
          result: runItem?.result || 'NA',
          notes: runItem?.notes || null,
          conditionPercent: extractConditionPercent(runItem?.notes),
          runId: dayRun?.run.id || null,
          runStatus: dayRun?.run.status || null,
        }
      })

      const rowTotals = cells.reduce(
        (acc, cell) => {
          acc[cell.code] += 1
          return acc
        },
        { A: 0, M: 0, H: 0, B: 0 } as Record<ChecklistMonitoringCode, number>,
      )

      return {
        title: row.title,
        itemType: row.itemType,
        categoryLabel: checklistItemTypeLabel(row.itemType),
        cells,
        totals: rowTotals,
      }
    })

  return {
    templateName: displayTemplateName(templateName, tenant?.code),
    tenantName: tenant?.name || env.APP_NAME,
    period,
    itemType,
    range: {
      from,
      to,
      fromLabel: formatDateId(from),
      toLabel: formatDateId(to),
    },
    legend: {
      A: 'Aman',
      M: 'Menipis',
      H: 'Habis / Rusak',
      B: 'Belum dicek',
    },
    dates: dateKeys.map((dateKey) => {
      const date = new Date(`${dateKey}T00:00:00.000Z`)
      return {
        key: dateKey,
        label: formatDateId(date),
        dayName: date.toLocaleDateString('id-ID', { weekday: 'short' }),
        isSunday: date.getDay() === 0,
      }
    }),
    rows,
    totals,
  }
}

export async function getChecklistMonitoring(
  userId: string,
  tenantId: string | undefined,
  activeLocationId: string | undefined,
  query: ChecklistMonitoringQuery = {},
) {
  const data = await buildChecklistMonitoringData(tenantId, activeLocationId, query)

  await prisma.auditLog.create({
    data: {
      actorUserId: userId,
      tenantId,
      entityType: 'checklist_monitoring',
      entityId: tenantId || 'global',
      action: 'VIEW',
      diffJson: {
        period: data.period,
        itemType: data.itemType,
        activeLocationId: activeLocationId || null,
        from: data.range.from,
        to: data.range.to,
      },
    },
  })

  return data
}

export async function getTodayChecklist(userId: string, tenantId?: string, activeLocationId?: string) {
  const tenant = tenantId
    ? await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, code: true },
      })
    : null
  const template = await ensureDefaultTemplate(userId, tenant?.code)
  const runDate = toDateOnly(new Date())

  const templateWithItems = await prisma.checklistTemplate.findUnique({
    where: { id: template.id },
    include: {
      items: {
        orderBy: { sortOrder: 'asc' },
      },
    },
  })

  const expectedTitles = buildExpectedChecklistTitles(templateWithItems?.items)

  const existingRun = await prisma.checklistRun.findFirst({
    where: {
      templateId: template.id,
      locationId: activeLocationId || null,
      runDate,
    },
    include: {
      items: true,
      template: true,
    },
  })

  let run = existingRun

  if (!run) {
    run = await prisma.checklistRun.create({
      data: {
        templateId: template.id,
        locationId: activeLocationId || null,
        runDate,
        createdBy: userId,
        status: ChecklistRunStatus.DRAFT,
        items: {
          create: expectedTitles.map((title) => ({
            templateItemId: null,
            title,
            result: ChecklistResult.NA,
          })),
        },
      },
      include: {
        items: true,
        template: true,
      },
    })
  } else if (run.status === ChecklistRunStatus.DRAFT && needsRunItemUpgrade(run.items, expectedTitles)) {
    run = await prisma.$transaction(async (tx) => {
      await tx.checklistRunItem.deleteMany({
        where: {
          checklistRunId: run!.id,
        },
      })

      await tx.checklistRunItem.createMany({
        data: expectedTitles.map((title) => ({
          checklistRunId: run!.id,
          templateItemId: null,
          title,
          result: ChecklistResult.NA,
        })),
      })

      const refreshed = await tx.checklistRun.findUnique({
        where: { id: run!.id },
        include: {
          items: true,
          template: true,
        },
      })

      return refreshed || run!
    })
  }

  return {
    runId: run.id,
    templateName: displayTemplateName(run.template.name, tenant?.code),
    status: run.status,
    runDate: run.runDate,
    items: run.items
      .sort((a, b) => decodeChecklistTitle(a.title).title.localeCompare(decodeChecklistTitle(b.title).title))
      .map((item) => ({
        ...decodeChecklistTitle(item.title),
        id: item.id,
        result: item.result,
        notes: item.notes,
        conditionPercent: extractConditionPercent(item.notes),
      })),
  }
}

type SubmitChecklistInput = {
  runId: string
  status: ChecklistRunStatusType
  items: Array<{
    id: string
    result: ChecklistResultType
    notes?: string
    conditionPercent?: number | null
  }>
}

export async function submitChecklist(userId: string, tenantId: string | undefined, input: SubmitChecklistInput) {
  const run = await prisma.checklistRun.findUnique({
    where: { id: input.runId },
    include: { items: true },
  })

  if (!run) {
    throw new ApiError(404, 'CHECKLIST_RUN_NOT_FOUND', 'Checklist run tidak ditemukan.')
  }

  await prisma.$transaction(async (tx) => {
    for (const incoming of input.items) {
      const exists = run.items.find((item) => item.id === incoming.id)
      if (!exists) continue

      const decoded = decodeChecklistTitle(exists.title)
      const itemType = decoded.itemType
      const nextCondition = typeof incoming.conditionPercent === 'number'
        ? Math.max(0, Math.min(100, incoming.conditionPercent))
        : undefined
      const derivedResult = itemType === 'ASSET' && typeof nextCondition === 'number'
        ? resultFromCondition(nextCondition)
        : incoming.result

      await tx.checklistRunItem.update({
        where: { id: incoming.id },
        data: {
          result: derivedResult,
          notes: attachConditionNote(incoming.notes, nextCondition),
        },
      })
    }

    await tx.checklistRun.update({
      where: { id: input.runId },
      data: {
        status: input.status,
        createdBy: userId,
      },
    })

    await tx.auditLog.create({
      data: {
        actorUserId: userId,
        tenantId,
        entityType: 'checklist_runs',
        entityId: input.runId,
        action: 'SUBMIT',
        diffJson: {
          status: input.status,
        },
      },
    })
  })

  return {
    code: 'CHECKLIST_SAVED',
    message: 'Checklist berhasil disimpan.',
  }
}

export async function sendChecklistExportToTelegram(
  userId: string,
  tenantId: string | undefined,
  activeLocationId: string | undefined,
  runId?: string,
) {
  if (!tenantId) {
    throw new ApiError(400, 'TENANT_CONTEXT_REQUIRED', 'Tenant aktif tidak ditemukan pada sesi pengguna.')
  }

  const settings = await prisma.tenantTelegramSetting.findUnique({
    where: { tenantId },
  })

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      name: true,
      code: true,
    },
  })

  if (!settings || !settings.isEnabled || !settings.sendOnChecklistExport || !settings.botToken || !settings.chatId) {
    return {
      code: 'TELEGRAM_EXPORT_SKIPPED',
      message: 'Integrasi Telegram tenant tidak aktif.',
      sent: false,
    }
  }

  const run = runId
    ? await prisma.checklistRun.findUnique({
        where: { id: runId },
        include: {
          template: true,
          items: true,
        },
      })
    : await prisma.checklistRun.findFirst({
        where: {
          ...(activeLocationId
            ? {
                locationId: activeLocationId,
              }
            : {}),
          runDate: toDateOnly(new Date()),
          template: {
            name: tenant?.code ? `${DEFAULT_TEMPLATE_NAME} - ${tenant.code}` : DEFAULT_TEMPLATE_NAME,
          },
        },
        include: {
          template: true,
          items: true,
        },
        orderBy: {
          updatedAt: 'desc',
        },
      })

  if (!run) {
    throw new ApiError(404, 'CHECKLIST_RUN_NOT_FOUND', 'Checklist run tidak ditemukan untuk export Telegram.')
  }

  const [user] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        username: true,
      },
    }),
  ])

  const responsibleLine = `${user?.name || user?.username || 'Pengguna'} - ${user?.username || '-'}`

  const pdfBuffer = await renderChecklistPdfBuffer({
    tenantName: tenant?.name || env.APP_NAME,
    responsibleLine,
    templateName: displayTemplateName(run.template.name, tenant?.code),
    runDate: run.runDate,
    items: run.items
      .slice()
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((item) => ({
        title: decodeChecklistTitle(item.title).title,
        result: item.result,
        notes: item.notes,
        conditionPercent: extractConditionPercent(item.notes),
        itemType: decodeChecklistTitle(item.title).itemType,
      })),
  })

  await sendTelegramChecklistPdf({
    botToken: settings.botToken,
    chatId: settings.chatId,
    caption: `Laporan checklist ${formatDateId(run.runDate)} - ${tenant?.name || 'Tenant'}`,
    fileName: checklistPdfFileName(run.runDate),
    pdfBuffer,
  })

  await prisma.auditLog.create({
    data: {
      actorUserId: userId,
      tenantId,
      entityType: 'checklist_exports',
      entityId: run.id,
      action: 'SEND_TELEGRAM',
      diffJson: {
        tenantId,
        runId: run.id,
        activeLocationId: activeLocationId || null,
        chatId: settings.chatId,
      },
    },
  })

  return {
    code: 'TELEGRAM_EXPORT_SENT',
    message: 'Laporan checklist berhasil dikirim ke Telegram.',
    sent: true,
  }
}

export async function sendChecklistMonitoringExportToTelegram(
  userId: string,
  tenantId: string | undefined,
  activeLocationId: string | undefined,
  query: ChecklistMonitoringQuery = {},
) {
  if (!tenantId) {
    throw new ApiError(400, 'TENANT_CONTEXT_REQUIRED', 'Tenant aktif tidak ditemukan pada sesi pengguna.')
  }

  const settings = await prisma.tenantTelegramSetting.findUnique({
    where: { tenantId },
  })

  if (!settings || !settings.isEnabled || !settings.sendOnChecklistExport || !settings.botToken || !settings.chatId) {
    return {
      code: 'TELEGRAM_EXPORT_SKIPPED',
      message: 'Integrasi Telegram tenant tidak aktif.',
      sent: false,
    }
  }

  const [monitoring, user] = await Promise.all([
    buildChecklistMonitoringData(tenantId, activeLocationId, query),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        username: true,
      },
    }),
  ])

  const responsibleLine = `${user?.name || user?.username || 'Pengguna'} - ${user?.username || '-'}`

  const pdfBuffer = await renderChecklistMonitoringPdfBuffer({
    tenantName: monitoring.tenantName,
    responsibleLine,
    monitoring,
  })

  const now = new Date()
  const fileName = `checklist-monitoring-${monitoring.period.toLowerCase()}-${now.toISOString().slice(0, 10)}.pdf`
  await sendTelegramChecklistPdf({
    botToken: settings.botToken,
    chatId: settings.chatId,
    caption: `Monitoring checklist ${monitoringPeriodLabel(monitoring.period)} (${monitoring.range.fromLabel} - ${monitoring.range.toLabel}) - ${monitoring.tenantName}`,
    fileName,
    pdfBuffer,
  })

  await prisma.auditLog.create({
    data: {
      actorUserId: userId,
      tenantId,
      entityType: 'checklist_monitoring_exports',
      entityId: tenantId,
      action: 'SEND_TELEGRAM',
      diffJson: {
        tenantId,
        period: monitoring.period,
        itemType: monitoring.itemType,
        activeLocationId: activeLocationId || null,
        from: monitoring.range.from,
        to: monitoring.range.to,
        chatId: settings.chatId,
      },
    },
  })

  return {
    code: 'TELEGRAM_MONITORING_EXPORT_SENT',
    message: 'Monitoring checklist berhasil dikirim ke Telegram.',
    sent: true,
  }
}

export async function exportChecklistMonitoringPdf(
  userId: string,
  tenantId: string | undefined,
  activeLocationId: string | undefined,
  query: ChecklistMonitoringQuery = {},
) {
  const [monitoring, user] = await Promise.all([
    buildChecklistMonitoringData(tenantId, activeLocationId, query),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        username: true,
      },
    }),
  ])

  const responsibleLine = `${user?.name || user?.username || 'Pengguna'} - ${user?.username || '-'}`
  const pdfBuffer = await renderChecklistMonitoringPdfBuffer({
    tenantName: monitoring.tenantName,
    responsibleLine,
    monitoring,
  })

  return {
    monitoring,
    fileName: `checklist-monitoring-${monitoring.period.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`,
    pdfBuffer,
  }
}
