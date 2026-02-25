import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/prisma.js'
import { ApiError } from '../../utils/api-error.js'

type CreateUserInput = {
  name: string
  username: string
  email?: string
  role: 'ADMIN' | 'PIC' | 'WAREHOUSE' | 'VIEWER'
  password: string
}

export async function listUsers() {
  return prisma.user.findMany({
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function createUser(input: CreateUserInput) {
  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ username: input.username }, { email: input.email || undefined }],
    },
  })

  if (existing) {
    throw new ApiError(409, 'USER_EXISTS', 'Username atau email sudah digunakan.')
  }

  const passwordHash = await bcrypt.hash(input.password, 10)

  return prisma.user.create({
    data: {
      name: input.name,
      username: input.username,
      email: input.email,
      role: input.role,
      passwordHash,
    },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  })
}

export async function updateUserStatus(userId: string, isActive: boolean) {
  try {
    return await prisma.user.update({
      where: { id: userId },
      data: { isActive },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        isActive: true,
      },
    })
  } catch {
    throw new ApiError(404, 'USER_NOT_FOUND', 'User tidak ditemukan.')
  }
}
