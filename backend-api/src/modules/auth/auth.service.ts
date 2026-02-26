import bcrypt from 'bcryptjs'
import { UserRole } from '../../lib/prisma-client.js'
import { prisma } from '../../lib/prisma.js'
import { ApiError } from '../../utils/api-error.js'
import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  verifyRefreshToken,
} from '../../utils/token.js'
import { env } from '../../config/env.js'

type LoginInput = {
  username: string
  password: string
}

async function getDefaultTenantContext(userId: string) {
  try {
    const membership = await prisma.tenantMembership.findFirst({
      where: {
        userId,
        tenant: {
          isActive: true,
        },
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
      orderBy: [
        { isDefault: 'desc' },
        { createdAt: 'asc' },
      ],
    })

    return (
      membership?.tenant || {
        id: 'tenant-default',
        name: 'SPPG Tambak Wedi',
        code: 'sppg-tambak-wedi',
      }
    )
  } catch {
    return {
      id: 'tenant-default',
      name: 'SPPG Tambak Wedi',
      code: 'sppg-tambak-wedi',
    }
  }
}

function getRefreshExpiryDate() {
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + env.REFRESH_TOKEN_EXPIRES_DAYS)
  return expiresAt
}

export async function ensureAdminSeed() {
  try {
    const superAdmin = await prisma.user.findFirst({ where: { role: UserRole.SUPER_ADMIN } })
    if (superAdmin) return

    const legacyAdmin = await prisma.user.findFirst({ where: { role: UserRole.ADMIN } })
    if (legacyAdmin) {
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: legacyAdmin.id },
          data: { role: UserRole.SUPER_ADMIN },
        })

        const tenantByNewCode = await tx.tenant.findUnique({
          where: { code: 'sppg-tambak-wedi' },
        })

        let defaultTenant
        if (tenantByNewCode) {
          defaultTenant = await tx.tenant.update({
            where: { id: tenantByNewCode.id },
            data: {
              name: 'SPPG Tambak Wedi',
              isActive: true,
            },
          })
        } else {
          const tenantByLegacyCode = await tx.tenant.findUnique({
            where: { code: 'sppg-pusat' },
          })

          if (tenantByLegacyCode) {
            defaultTenant = await tx.tenant.update({
              where: { id: tenantByLegacyCode.id },
              data: {
                name: 'SPPG Tambak Wedi',
                code: 'sppg-tambak-wedi',
                isActive: true,
              },
            })
          } else {
            defaultTenant = await tx.tenant.create({
              data: {
                name: 'SPPG Tambak Wedi',
                code: 'sppg-tambak-wedi',
                isActive: true,
              },
            })
          }
        }

        await tx.tenantMembership.upsert({
          where: {
            userId_tenantId: {
              userId: legacyAdmin.id,
              tenantId: defaultTenant.id,
            },
          },
          create: {
            userId: legacyAdmin.id,
            tenantId: defaultTenant.id,
            role: UserRole.SUPER_ADMIN,
            isDefault: true,
          },
          update: {
            role: UserRole.SUPER_ADMIN,
            isDefault: true,
          },
        })
      })
      return
    }

    const passwordHash = await bcrypt.hash('admin12345', 10)
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: 'Admin SPPG',
          username: 'admin',
          email: 'admin@sppg.local',
          passwordHash,
          role: UserRole.SUPER_ADMIN,
        },
      })

      const tenantByNewCode = await tx.tenant.findUnique({
        where: { code: 'sppg-tambak-wedi' },
      })

      let defaultTenant
      if (tenantByNewCode) {
        defaultTenant = await tx.tenant.update({
          where: { id: tenantByNewCode.id },
          data: {
            name: 'SPPG Tambak Wedi',
            isActive: true,
          },
        })
      } else {
        const tenantByLegacyCode = await tx.tenant.findUnique({
          where: { code: 'sppg-pusat' },
        })

        if (tenantByLegacyCode) {
          defaultTenant = await tx.tenant.update({
            where: { id: tenantByLegacyCode.id },
            data: {
              name: 'SPPG Tambak Wedi',
              code: 'sppg-tambak-wedi',
              isActive: true,
            },
          })
        } else {
          defaultTenant = await tx.tenant.create({
            data: {
              name: 'SPPG Tambak Wedi',
              code: 'sppg-tambak-wedi',
              isActive: true,
            },
          })
        }
      }

      await tx.tenantMembership.create({
        data: {
          userId: user.id,
          tenantId: defaultTenant.id,
          role: UserRole.SUPER_ADMIN,
          isDefault: true,
        },
      })
    })
  } catch {
    return
  }
}

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({
    where: { username: input.username },
  })

  if (!user || !user.isActive) {
    throw new ApiError(401, 'AUTH_INVALID', 'Username atau password tidak sesuai.')
  }

  const match = await bcrypt.compare(input.password, user.passwordHash)
  if (!match) {
    throw new ApiError(401, 'AUTH_INVALID', 'Username atau password tidak sesuai.')
  }

  const tenant = await getDefaultTenantContext(user.id)

  const payload = {
    sub: user.id,
    role: user.role,
    username: user.username,
  }

  const accessToken = generateAccessToken(payload)
  const refreshToken = generateRefreshToken(payload)

  await prisma.refreshToken.create({
    data: {
      tokenHash: hashToken(refreshToken),
      userId: user.id,
      expiresAt: getRefreshExpiryDate(),
    },
  })

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      tenant,
    },
  }
}

export async function refresh(rawRefreshToken: string) {
  if (!rawRefreshToken) {
    throw new ApiError(401, 'AUTH_REFRESH_REQUIRED', 'Refresh token tidak ditemukan.')
  }

  let payload
  try {
    payload = verifyRefreshToken(rawRefreshToken)
  } catch {
    throw new ApiError(401, 'AUTH_INVALID', 'Refresh token tidak valid.')
  }

  const tokenHash = hashToken(rawRefreshToken)
  const tokenRecord = await prisma.refreshToken.findFirst({
    where: {
      tokenHash,
      userId: payload.sub,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: { user: true },
  })

  if (!tokenRecord || !tokenRecord.user.isActive) {
    throw new ApiError(401, 'AUTH_INVALID', 'Refresh token sudah tidak berlaku.')
  }

  await prisma.refreshToken.update({
    where: { id: tokenRecord.id },
    data: { revokedAt: new Date() },
  })

  const newPayload = {
    sub: tokenRecord.user.id,
    role: tokenRecord.user.role,
    username: tokenRecord.user.username,
  }

  const accessToken = generateAccessToken(newPayload)
  const refreshToken = generateRefreshToken(newPayload)

  await prisma.refreshToken.create({
    data: {
      tokenHash: hashToken(refreshToken),
      userId: tokenRecord.user.id,
      expiresAt: getRefreshExpiryDate(),
    },
  })

  return {
    accessToken,
    refreshToken,
  }
}

export async function logout(rawRefreshToken: string) {
  if (!rawRefreshToken) {
    return
  }

  await prisma.refreshToken.updateMany({
    where: {
      tokenHash: hashToken(rawRefreshToken),
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  })
}

export async function me(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
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

  if (!user) {
    throw new ApiError(404, 'USER_NOT_FOUND', 'User tidak ditemukan.')
  }

  const tenant = await getDefaultTenantContext(user.id)

  return {
    ...user,
    tenant,
  }
}
