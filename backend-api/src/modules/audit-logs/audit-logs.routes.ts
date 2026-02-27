import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../../middleware/auth.js'
import { requireRole } from '../../middleware/role.js'
import { listAuditLogsQuerySchema } from './audit-logs.schema.js'
import { exportAuditLogsCsv, getAuditLogDetail, getAuditLogStats, listAuditLogs } from './audit-logs.service.js'

const auditLogsRouter = Router()

auditLogsRouter.use(requireAuth)
auditLogsRouter.use(requireRole(['SUPER_ADMIN']))

auditLogsRouter.get('/', async (req, res, next) => {
  try {
    const query = listAuditLogsQuerySchema.parse(req.query)
    const data = await listAuditLogs(query, req.user!)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

auditLogsRouter.get('/export', async (req, res, next) => {
  try {
    const query = listAuditLogsQuerySchema.parse(req.query)
    const csv = await exportAuditLogsCsv(query, req.user!)
    const timestamp = new Date().toISOString().replaceAll(':', '-').slice(0, 19)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${timestamp}.csv"`)
    return res.send(csv)
  } catch (error) {
    return next(error)
  }
})

auditLogsRouter.get('/stats', async (req, res, next) => {
  try {
    const query = listAuditLogsQuerySchema.parse(req.query)
    const data = await getAuditLogStats(query, req.user!)
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
