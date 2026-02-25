import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.js'
import { requireRole } from '../../middleware/role.js'
import { createUserSchema, updateUserStatusSchema } from './users.schema.js'
import { createUser, listUsers, updateUserStatus } from './users.service.js'

const usersRouter = Router()

usersRouter.use(requireAuth, requireRole(['ADMIN']))

usersRouter.get('/', async (_req, res, next) => {
  try {
    const data = await listUsers()
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

usersRouter.post('/', async (req, res, next) => {
  try {
    const body = createUserSchema.parse(req.body)
    const data = await createUser(body)
    return res.status(201).json(data)
  } catch (error) {
    return next(error)
  }
})

usersRouter.patch('/:id/status', async (req, res, next) => {
  try {
    const body = updateUserStatusSchema.parse(req.body)
    const data = await updateUserStatus(req.params.id, body.isActive)
    return res.json(data)
  } catch (error) {
    return next(error)
  }
})

export { usersRouter }
