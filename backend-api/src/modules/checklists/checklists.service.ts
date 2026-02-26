import { ChecklistResult, ChecklistRunStatus, ChecklistSchedule } from '../../lib/prisma-client.js'
import type {
  ChecklistResult as ChecklistResultType,
  ChecklistRunStatus as ChecklistRunStatusType,
} from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { ApiError } from '../../utils/api-error.js'

const DEFAULT_TEMPLATE_NAME = 'Checklist Harian Operasional'
const DEFAULT_TEMPLATE_ITEMS = [
  { title: 'Cek Gas', description: 'Pastikan gas cukup untuk operasional', sortOrder: 1 },
  { title: 'Cek Stok Consumable Utama', description: 'Contoh: beras, minyak, sabun cuci (bisa berkurang)', sortOrder: 2 },
  { title: 'Kondisi Asset Utama', description: 'Contoh: kompor, kulkas (isi kondisi dalam %)', sortOrder: 3 },
]

function detectChecklistItemType(title: string) {
  const text = title.toLowerCase()
  if (text.includes('asset') || text.includes('alat') || text.includes('kondisi')) return 'ASSET'
  if (text.includes('gas')) return 'GAS'
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
    conditionPercent?: number
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
