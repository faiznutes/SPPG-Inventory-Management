import { ChecklistResult, ChecklistRunStatus, ChecklistSchedule } from '../../lib/prisma-client.js'
import type {
  ChecklistResult as ChecklistResultType,
  ChecklistRunStatus as ChecklistRunStatusType,
} from '@prisma/client'
import PDFDocument from 'pdfkit'
import { prisma } from '../../lib/prisma.js'
import { ApiError } from '../../utils/api-error.js'

const DEFAULT_TEMPLATE_NAME = 'Checklist Harian Operasional'
const DEFAULT_TEMPLATE_ITEMS = [
  { title: 'Barang habis beli lagi', itemType: 'CONSUMABLE' as const },
  { title: 'Habis tapi isi ulang', itemType: 'GAS' as const },
  { title: 'Tidak habis tapi bisa rusak', itemType: 'ASSET' as const },
]
const ITEM_TITLE_DELIMITER = '::'

function detectChecklistItemType(title: string): 'ASSET' | 'GAS' | 'CONSUMABLE' {
  const text = title.toLowerCase()
  if (text.includes('asset') || text.includes('alat') || text.includes('kondisi') || text.includes('rusak')) return 'ASSET'
  if (text.includes('gas') || text.includes('isi ulang')) return 'GAS'
  return 'CONSUMABLE'
}

function encodeChecklistTitle(itemType: 'ASSET' | 'GAS' | 'CONSUMABLE', title: string) {
  return `${itemType}${ITEM_TITLE_DELIMITER}${title.trim()}`
}

function decodeChecklistTitle(rawTitle: string): { itemType: 'ASSET' | 'GAS' | 'CONSUMABLE'; title: string } {
  const [head, ...rest] = rawTitle.split(ITEM_TITLE_DELIMITER)
  if (rest.length > 0 && ['ASSET', 'GAS', 'CONSUMABLE'].includes(head)) {
    return {
      itemType: head as 'ASSET' | 'GAS' | 'CONSUMABLE',
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

function checklistItemTypeLabel(itemType: 'ASSET' | 'GAS' | 'CONSUMABLE') {
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
    itemType: 'ASSET' | 'GAS' | 'CONSUMABLE'
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

export async function getTodayChecklist(userId: string, tenantId?: string) {
  const tenant = tenantId
    ? await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, code: true },
      })
    : null
  const template = await ensureDefaultTemplate(userId, tenant?.code)
  const runDate = toDateOnly(new Date())

  const tenantItems = await prisma.item.findMany({
    where: {
      isActive: true,
    },
    orderBy: { name: 'asc' },
    select: {
      name: true,
      type: true,
    },
  })

  const expectedTitles = (tenantItems.length
    ? tenantItems.map((item) => encodeChecklistTitle(item.type, item.name))
    : DEFAULT_TEMPLATE_ITEMS.map((item) => encodeChecklistTitle(item.itemType, item.title))
  ).sort((a, b) => a.localeCompare(b))

  const existingRun = await prisma.checklistRun.findFirst({
    where: {
      templateId: template.id,
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
    templateName: run.template.name,
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

export async function submitChecklist(userId: string, input: SubmitChecklistInput) {
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

export async function sendChecklistExportToTelegram(userId: string, tenantId: string | undefined, runId?: string) {
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
    tenantName: tenant?.name || 'INVENTORY SPPG MBG',
    responsibleLine,
    templateName: run.template.name,
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
      entityType: 'checklist_exports',
      entityId: run.id,
      action: 'SEND_TELEGRAM',
      diffJson: {
        tenantId,
        runId: run.id,
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
