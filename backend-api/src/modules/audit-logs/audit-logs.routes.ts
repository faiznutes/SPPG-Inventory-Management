import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../../middleware/auth.js'
import { listAuditLogsQuerySchema } from './audit-logs.schema.js'
import { getAuditLogDetail, listAuditLogs } from './audit-logs.service.js'

const auditLogsRouter = Router()

auditLogsRouter.use(requireAuth)

auditLogsRouter.get('/', async (req, res, next) => {
  try {
    const query = listAuditLogsQuerySchema.parse(req.query)
    const data = await listAuditLogs(query, req.user!)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

auditLogsRouter.get('/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    const data = await getAuditLogDetail(id, req.user!)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

export { auditLogsRouter }
