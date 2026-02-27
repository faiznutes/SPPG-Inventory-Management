import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.js'
import {
  checklistMonitoringQuerySchema,
  sendChecklistExportTelegramSchema,
  sendChecklistMonitoringExportTelegramSchema,
  submitChecklistSchema,
} from './checklists.schema.js'
import {
  getChecklistMonitoring,
  getTodayChecklist,
  sendChecklistExportToTelegram,
  sendChecklistMonitoringExportToTelegram,
  submitChecklist,
} from './checklists.service.js'

const checklistsRouter = Router()

checklistsRouter.use(requireAuth)

checklistsRouter.get('/monitoring', async (req, res, next) => {
  try {
    const query = checklistMonitoringQuerySchema.parse(req.query)
    const data = await getChecklistMonitoring(req.user!.id, req.user!.tenantId, query)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

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
    const data = await submitChecklist(req.user!.id, req.user!.tenantId, body)
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

checklistsRouter.post('/monitoring/export/send-telegram', async (req, res, next) => {
  try {
    const body = sendChecklistMonitoringExportTelegramSchema.parse(req.body)
    const data = await sendChecklistMonitoringExportToTelegram(req.user!.id, req.user!.tenantId, {
      period: body.period,
      itemType: body.itemType,
    })
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

export { checklistsRouter }
