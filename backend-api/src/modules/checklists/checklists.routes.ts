import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.js'
import { submitChecklistSchema } from './checklists.schema.js'
import { getTodayChecklist, submitChecklist } from './checklists.service.js'

const checklistsRouter = Router()

checklistsRouter.use(requireAuth)

checklistsRouter.get('/today', async (req, res, next) => {
  try {
    const data = await getTodayChecklist(req.user!.id)
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

export { checklistsRouter }
