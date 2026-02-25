import { ChecklistResult, ChecklistRunStatus } from '@prisma/client'
import { z } from 'zod'

export const submitChecklistSchema = z.object({
  runId: z.string().uuid(),
  status: z.nativeEnum(ChecklistRunStatus),
  items: z.array(
    z.object({
      id: z.string().uuid(),
      result: z.nativeEnum(ChecklistResult),
      notes: z.string().optional(),
    }),
  ),
})
