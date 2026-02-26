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

const DEFAULT_TENANT = {
  id: 'tenant-default',
  name: 'SPPG Tambak Wedi',
  code: 'sppg-tambak-wedi',
}

type TenantContext = {
  id: string
  name: string
  code: string
}

async function listTenantMemberships(userId: string) {
  try {
    const memberships = await prisma.tenantMembership.findMany({
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

    return memberships.map((membership) => ({
      id: membership.tenant.id,
      name: membership.tenant.name,
      code: membership.tenant.code,
      role: membership.role,
      isDefault: membership.isDefault,
    }))
  } catch {
    return []
  }
}

async function getDefaultTenantContext(userId: string) {
  const memberships = await listTenantMemberships(userId)
  return memberships[0] || DEFAULT_TENANT
}

type UserRoleValue = (typeof UserRole)[keyof typeof UserRole]

async function ensureTenantMembership(userId: string, tenant: TenantContext, role: UserRoleValue) {
  try {
    await prisma.tenantMembership.upsert({
      where: {
        userId_tenantId: {
          userId,
          tenantId: tenant.id,
        },
      },
      create: {
        userId,
        tenantId: tenant.id,
        role,
        isDefault: true,
      },
      update: {
        role,
        isDefault: true,
      },
    })
  } catch {
    return
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
  let user = await prisma.user.findUnique({
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

  if (user.role === UserRole.ADMIN) {
    try {
      const hasSuperAdmin = await prisma.user.findFirst({
        where: { role: UserRole.SUPER_ADMIN },
        select: { id: true },
      })

      if (!hasSuperAdmin) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { role: UserRole.SUPER_ADMIN },
        })
        await ensureTenantMembership(user.id, tenant, UserRole.SUPER_ADMIN)
      }
    } catch {
      // keep login flow working even if enum migration is still pending
    }
  }

  const payload = {
    sub: user.id,
    role: user.role,
    username: user.username,
    tenantId: tenant.id,
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
      availableTenants: await listTenantMemberships(user.id),
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

  const tenant = await getDefaultTenantContext(tokenRecord.user.id)

  const newPayload = {
    sub: tokenRecord.user.id,
    role: tokenRecord.user.role,
    username: tokenRecord.user.username,
    tenantId: tenant.id,
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
  const availableTenants = await listTenantMemberships(user.id)

  return {
    ...user,
    tenant,
    availableTenants,
  }
}

export async function myTenants(userId: string) {
  const tenants = await listTenantMemberships(userId)
  if (tenants.length) return tenants
  return [{ ...DEFAULT_TENANT, role: 'ADMIN', isDefault: true }]
}

export async function selectTenant(userId: string, tenantId: string) {
  const membership = await prisma.tenantMembership.findFirst({
    where: {
      userId,
      tenantId,
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
  })

  if (!membership) {
    throw new ApiError(403, 'FORBIDDEN', 'Kamu tidak memiliki akses ke tenant ini.')
  }

  await prisma.$transaction([
    prisma.tenantMembership.updateMany({
      where: {
        userId,
        isDefault: true,
      },
      data: {
        isDefault: false,
      },
    }),
    prisma.tenantMembership.update({
      where: {
        userId_tenantId: {
          userId,
          tenantId,
        },
      },
      data: {
        isDefault: true,
      },
    }),
  ])

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
      isActive: true,
    },
  })

  if (!user || !user.isActive) {
    throw new ApiError(401, 'AUTH_INVALID', 'User tidak valid untuk mengganti tenant.')
  }

  const payload = {
    sub: user.id,
    role: user.role,
    username: user.username,
    tenantId: membership.tenant.id,
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
      tenant: membership.tenant,
      availableTenants: await listTenantMemberships(user.id),
    },
  }
}
