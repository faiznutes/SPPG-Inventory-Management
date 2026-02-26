import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.js'
import { createTransactionSchema, listTransactionsQuerySchema } from './transactions.schema.js'
import { createTransaction, listTransactions } from './transactions.service.js'

const transactionsRouter = Router()

transactionsRouter.use(requireAuth)

transactionsRouter.get('/', async (req, res, next) => {
  try {
    const query = listTransactionsQuerySchema.parse(req.query)
    const data = await listTransactions(query)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

transactionsRouter.post('/', async (req, res, next) => {
  try {
    const body = createTransactionSchema.parse(req.body)
    const data = await createTransaction(body, req.user!.id)
    return res.status(201).json(data)
  } catch (error) {
    return next(error)
  }
})

export { transactionsRouter }
