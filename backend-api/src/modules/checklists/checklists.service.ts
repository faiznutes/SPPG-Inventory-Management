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
  { title: 'Habis tapi isi ulang', description: 'Pastikan stok gas/isi ulang cukup untuk operasional.', sortOrder: 1 },
  { title: 'Barang habis beli lagi', description: 'Contoh: beras, minyak, sabun cuci. Jika habis perlu beli lagi.', sortOrder: 2 },
  { title: 'Tidak habis tapi bisa rusak', description: 'Contoh: kompor, kulkas. Isi kondisi dalam % untuk pemantauan.', sortOrder: 3 },
]

function detectChecklistItemType(title: string) {
  const text = title.toLowerCase()
  if (text.includes('asset') || text.includes('alat') || text.includes('kondisi') || text.includes('rusak')) return 'ASSET'
  if (text.includes('gas') || text.includes('isi ulang')) return 'GAS'
  return 'CONSUMABLE'
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

function needsRunItemUpgrade(runItems: Array<{ title: string }>) {
  const titles = new Set(runItems.map((item) => item.title))
  return DEFAULT_TEMPLATE_ITEMS.some((item) => !titles.has(item.title))
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

async function ensureDefaultTemplate(userId: string) {
  const existing = await prisma.checklistTemplate.findFirst({
    where: { name: DEFAULT_TEMPLATE_NAME },
    include: { items: true },
  })

  if (existing) {
    const existingTitles = new Set(existing.items.map((item) => item.title))
    const isLegacyTemplate = DEFAULT_TEMPLATE_ITEMS.some((item) => !existingTitles.has(item.title))

    if (!isLegacyTemplate) return existing

    await prisma.$transaction(async (tx) => {
      await tx.checklistTemplateItem.deleteMany({
        where: {
          templateId: existing.id,
        },
      })

      await tx.checklistTemplateItem.createMany({
        data: DEFAULT_TEMPLATE_ITEMS.map((item) => ({
          templateId: existing.id,
          title: item.title,
          description: item.description,
          sortOrder: item.sortOrder,
        })),
      })
    })

    const refreshed = await prisma.checklistTemplate.findUnique({
      where: { id: existing.id },
      include: { items: true },
    })

    if (refreshed) return refreshed
    return existing
  }

  return prisma.checklistTemplate.create({
    data: {
      name: DEFAULT_TEMPLATE_NAME,
      schedule: ChecklistSchedule.DAILY,
      createdBy: userId,
      items: {
        create: DEFAULT_TEMPLATE_ITEMS,
      },
    },
    include: { items: true },
  })
}

export async function getTodayChecklist(userId: string) {
  const template = await ensureDefaultTemplate(userId)
  const runDate = toDateOnly(new Date())

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
          create: template.items.map((item) => ({
            templateItemId: item.id,
            title: item.title,
            result: ChecklistResult.NA,
          })),
        },
      },
      include: {
        items: true,
        template: true,
      },
    })
  } else if (run.status === ChecklistRunStatus.DRAFT && needsRunItemUpgrade(run.items)) {
    run = await prisma.$transaction(async (tx) => {
      await tx.checklistRunItem.deleteMany({
        where: {
          checklistRunId: run!.id,
        },
      })

      await tx.checklistRunItem.createMany({
        data: template.items.map((item) => ({
          checklistRunId: run!.id,
          templateItemId: item.id,
          title: item.title,
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
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((item) => ({
        id: item.id,
        title: item.title,
        itemType: detectChecklistItemType(item.title),
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

      const itemType = detectChecklistItemType(exists.title)
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

  const [user, tenant] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        username: true,
      },
    }),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
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
        title: item.title,
        result: item.result,
        notes: item.notes,
        conditionPercent: extractConditionPercent(item.notes),
        itemType: detectChecklistItemType(item.title),
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
