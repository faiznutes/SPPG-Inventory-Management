import { ChecklistResult, ChecklistRunStatus } from '../../lib/prisma-client.js'
import { z } from 'zod'

export const submitChecklistSchema = z.object({
  runId: z.string().uuid(),
  status: z.nativeEnum(ChecklistRunStatus),
  items: z.array(
    z.object({
      id: z.string().uuid(),
      result: z.nativeEnum(ChecklistResult),
      notes: z.string().optional(),
      conditionPercent: z.number().min(0).max(100).nullable().optional(),
    }),
  ),
})

export const sendChecklistExportTelegramSchema = z.object({
  runId: z.string().uuid().optional(),
})
