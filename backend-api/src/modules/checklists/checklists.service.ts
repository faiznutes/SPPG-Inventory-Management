import { ChecklistResult, ChecklistRunStatus, ChecklistSchedule } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { ApiError } from '../../utils/api-error.js'

const DEFAULT_TEMPLATE_NAME = 'Checklist Harian Operasional'

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

  if (existing) return existing

  return prisma.checklistTemplate.create({
    data: {
      name: DEFAULT_TEMPLATE_NAME,
      schedule: ChecklistSchedule.DAILY,
      createdBy: userId,
      items: {
        create: [
          { title: 'Cek Gas', description: 'Pastikan gas cukup untuk operasional', sortOrder: 1 },
          { title: 'Cek Sabun Cuci', description: 'Pastikan stok sabun cuci aman', sortOrder: 2 },
          { title: 'Cek Tissue', description: 'Pastikan stok tissue tersedia', sortOrder: 3 },
        ],
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
        result: item.result,
        notes: item.notes,
      })),
  }
}

type SubmitChecklistInput = {
  runId: string
  status: ChecklistRunStatus
  items: Array<{
    id: string
    result: ChecklistResult
    notes?: string
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

      await tx.checklistRunItem.update({
        where: { id: incoming.id },
        data: {
          result: incoming.result,
          notes: incoming.notes,
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
