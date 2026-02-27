import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.js'
import { bulkAdjustTransactionSchema, createTransactionSchema, listTransactionsQuerySchema } from './transactions.schema.js'
import { createBulkAdjustTransactions, createTransaction, listTransactions } from './transactions.service.js'

const transactionsRouter = Router()

transactionsRouter.use(requireAuth)

transactionsRouter.get('/', async (req, res, next) => {
  try {
    const query = listTransactionsQuerySchema.parse(req.query)
    const data = await listTransactions(query, req.user?.tenantId, req.user?.activeLocationId)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

transactionsRouter.post('/', async (req, res, next) => {
  try {
    const body = createTransactionSchema.parse(req.body)
    const data = await createTransaction(body, req.user!.id, req.user?.tenantId, req.user?.activeLocationId)
    return res.status(201).json(data)
  } catch (error) {
    return next(error)
  }
})

transactionsRouter.post('/bulk/adjust', async (req, res, next) => {
  try {
    const body = bulkAdjustTransactionSchema.parse(req.body)
    const data = await createBulkAdjustTransactions(body, req.user!.id, req.user?.tenantId, req.user?.activeLocationId)
    return res.status(201).json(data)
  } catch (error) {
    return next(error)
  }
})

export { transactionsRouter }
