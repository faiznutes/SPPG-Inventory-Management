import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.js'
import { sendChecklistExportTelegramSchema, submitChecklistSchema } from './checklists.schema.js'
import { getTodayChecklist, sendChecklistExportToTelegram, submitChecklist } from './checklists.service.js'

const checklistsRouter = Router()

checklistsRouter.use(requireAuth)

checklistsRouter.get('/today', async (req, res, next) => {
  try {
    const data = await getTodayChecklist(req.user!.id, req.user!.tenantId)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

checklistsRouter.post('/today/submit', async (req, res, next) => {
  try {
    const body = submitChecklistSchema.parse(req.body)
    const data = await submitChecklist(req.user!.id, body)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

checklistsRouter.post('/today/export/send-telegram', async (req, res, next) => {
  try {
    const body = sendChecklistExportTelegramSchema.parse(req.body)
    const data = await sendChecklistExportToTelegram(req.user!.id, req.user!.tenantId, body.runId)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

export { checklistsRouter }
