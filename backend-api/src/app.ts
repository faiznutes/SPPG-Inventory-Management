import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import morgan from 'morgan'
import cookieParser from 'cookie-parser'
import { authRouter } from './modules/auth/auth.routes.js'
import { usersRouter } from './modules/users/users.routes.js'
import { locationsRouter } from './modules/locations/locations.routes.js'
import { categoriesRouter } from './modules/categories/categories.routes.js'
import { itemsRouter } from './modules/items/items.routes.js'
import { stocksRouter } from './modules/stocks/stocks.routes.js'
import { transactionsRouter } from './modules/transactions/transactions.routes.js'
import { checklistsRouter } from './modules/checklists/checklists.routes.js'
import { purchaseRequestsRouter } from './modules/purchase-requests/purchase-requests.routes.js'
import { notificationsRouter } from './modules/notifications/notifications.routes.js'
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js'
import { errorHandler, notFoundHandler } from './middleware/error-handler.js'
import { env } from './config/env.js'

export const app = express()

function createCorsOrigin() {
  if (env.CORS_ORIGIN === '*') {
    return true
  }

  const allowedOrigins = env.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  return (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!origin) {
      callback(null, true)
      return
    }

    callback(null, allowedOrigins.includes(origin))
  }
}

app.use(helmet())
app.set('trust proxy', env.TRUST_PROXY)
app.use(
  cors({
    origin: createCorsOrigin(),
    credentials: true,
  }),
)
app.use(express.json())
app.use(cookieParser())
app.use(morgan('dev'))

app.get('/health', (_req, res) => {
  return res.json({
    status: 'ok',
    service: 'backend-api',
  })
})

app.get('/api/v1/health', (_req, res) => {
  return res.json({
    status: 'ok',
    service: 'backend-api',
  })
})

app.use('/api/v1/auth', authRouter)
app.use('/api/v1/users', usersRouter)
app.use('/api/v1/locations', locationsRouter)
app.use('/api/v1/categories', categoriesRouter)
app.use('/api/v1/items', itemsRouter)
app.use('/api/v1/stocks', stocksRouter)
app.use('/api/v1/transactions', transactionsRouter)
app.use('/api/v1/checklists', checklistsRouter)
app.use('/api/v1/purchase-requests', purchaseRequestsRouter)
app.use('/api/v1/notifications', notificationsRouter)
app.use('/api/v1/dashboard', dashboardRouter)

app.use(notFoundHandler)
app.use(errorHandler)
