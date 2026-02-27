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

const SUPER_ADMIN_USERNAME = env.SUPER_ADMIN_USERNAME
const SUPER_ADMIN_DEFAULT_PASSWORD = env.SUPER_ADMIN_PASSWORD

const DEFAULT_TENANT = {
  id: 'tenant-default',
  name: env.APP_NAME,
  code: env.DEFAULT_TENANT_CODE,
}

const INACTIVE_LOCATION_PREFIX = 'INACTIVE - '

type SessionTenantContext = {
  id: string
  name: string
  code: string
  jabatan?: string | null
  canView?: boolean
  canEdit?: boolean
}

function isInactiveLocationName(name: string) {
  return name.startsWith(INACTIVE_LOCATION_PREFIX) || name.includes(`::${INACTIVE_LOCATION_PREFIX}`)
}

function stripTenantPrefix(tenantCode: string, value: string) {
  const prefix = `${tenantCode}::`
  return value.startsWith(prefix) ? value.slice(prefix.length) : value
}

function stripInactivePrefix(value: string) {
  return value.replace(new RegExp(`^${INACTIVE_LOCATION_PREFIX}`, 'i'), '')
}

async function listAvailableLocations(tenant: SessionTenantContext) {
  const where =
    tenant.id === DEFAULT_TENANT.id
      ? {}
      : {
          name: {
            startsWith: `${tenant.code}::`,
          },
        }

  const rows = await prisma.location.findMany({
    where,
    select: {
      id: true,
      name: true,
    },
    orderBy: { name: 'asc' },
  })

  return rows
    .filter((row) => !isInactiveLocationName(row.name))
    .map((row) => ({
      id: row.id,
      name: tenant.id === DEFAULT_TENANT.id ? stripInactivePrefix(row.name) : stripInactivePrefix(stripTenantPrefix(tenant.code, row.name)),
    }))
}

function resolveSessionRole(user: { role: string; username: string }) {
  if (user.username === SUPER_ADMIN_USERNAME) return 'SUPER_ADMIN'
  if (user.role === 'ADMIN') return 'ADMIN'
  if (user.role === 'SUPER_ADMIN') return 'SUPER_ADMIN'
  return 'STAFF'
}

function isSessionSuperAdmin(user: { role: string; username: string }) {
  return resolveSessionRole(user) === 'SUPER_ADMIN'
}

function isMissingTenantMembershipTable(error: unknown) {
  return Boolean((error as { code?: string })?.code === 'P2021')
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
      jabatan: membership.jabatan,
      canView: membership.canView,
      canEdit: membership.canEdit,
      isDefault: membership.isDefault,
    }))
  } catch {
    return []
  }
}

async function getDefaultTenantContext(userId: string) {
  const memberships = await listTenantMemberships(userId)
  return (memberships[0] || DEFAULT_TENANT) as SessionTenantContext
}

function getRefreshExpiryDate() {
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + env.REFRESH_TOKEN_EXPIRES_DAYS)
  return expiresAt
}

export async function ensureAdminSeed() {
  try {
    const superAdminUser = await prisma.user.findUnique({
      where: { username: SUPER_ADMIN_USERNAME },
    })

    if (!superAdminUser) {
      const superAdminHash = await bcrypt.hash(SUPER_ADMIN_DEFAULT_PASSWORD, 10)
      await prisma.user.create({
        data: {
          name: env.SUPER_ADMIN_NAME,
          username: SUPER_ADMIN_USERNAME,
          email: env.SUPER_ADMIN_EMAIL,
          passwordHash: superAdminHash,
          role: UserRole.ADMIN,
        },
      })
    }
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
  const sessionRole = resolveSessionRole({ role: user.role, username: user.username })
  const sessionIsSuperAdmin = isSessionSuperAdmin({ role: user.role, username: user.username })

  const memberships = await listTenantMemberships(user.id)
  const availableLocations = await listAvailableLocations(tenant as SessionTenantContext)
  const activeLocationId = availableLocations[0]?.id

  const payload = {
    sub: user.id,
    role: sessionRole,
    username: user.username,
    tenantId: tenant.id,
    activeLocationId,
    isSuperAdmin: sessionIsSuperAdmin,
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
      role: sessionRole,
      tenant,
      jabatan: (tenant as { jabatan?: string }).jabatan || null,
      canView: (tenant as { canView?: boolean }).canView ?? true,
      canEdit: (tenant as { canEdit?: boolean }).canEdit ?? (sessionRole === 'SUPER_ADMIN' || sessionRole === 'ADMIN'),
      activeLocationId: activeLocationId || null,
      availableLocations,
      isSuperAdmin: sessionIsSuperAdmin,
      availableTenants: memberships.length ? memberships : [{ ...DEFAULT_TENANT, role: sessionRole, isDefault: true }],
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
  const sessionRole = resolveSessionRole({ role: tokenRecord.user.role, username: tokenRecord.user.username })
  const sessionIsSuperAdmin = isSessionSuperAdmin({ role: tokenRecord.user.role, username: tokenRecord.user.username })
  const availableLocations = await listAvailableLocations(tenant as SessionTenantContext)
  const activeLocationId =
    payload.activeLocationId && availableLocations.some((location) => location.id === payload.activeLocationId)
      ? payload.activeLocationId
      : availableLocations[0]?.id

  const newPayload = {
    sub: tokenRecord.user.id,
    role: sessionRole,
    username: tokenRecord.user.username,
    tenantId: tenant.id,
    activeLocationId,
    isSuperAdmin: sessionIsSuperAdmin,
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
  const sessionRole = resolveSessionRole({ role: user.role, username: user.username })
  const sessionIsSuperAdmin = isSessionSuperAdmin({ role: user.role, username: user.username })
  const memberships = await listTenantMemberships(user.id)
  const availableTenants = memberships.length ? memberships : [{ ...DEFAULT_TENANT, role: sessionRole, isDefault: true }]
  const availableLocations = await listAvailableLocations(tenant as SessionTenantContext)
  const activeLocationId = availableLocations[0]?.id || null

  return {
    ...user,
    role: sessionRole,
    tenant,
    jabatan: (tenant as { jabatan?: string }).jabatan || null,
    canView: (tenant as { canView?: boolean }).canView ?? true,
    canEdit: (tenant as { canEdit?: boolean }).canEdit ?? (sessionRole === 'SUPER_ADMIN' || sessionRole === 'ADMIN'),
    activeLocationId,
    availableLocations,
    isSuperAdmin: sessionIsSuperAdmin,
    availableTenants,
  }
}

export async function myTenants(userId: string) {
  const tenants = await listTenantMemberships(userId)
  if (tenants.length) return tenants
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      username: true,
    },
  })
  const sessionRole = user ? resolveSessionRole({ role: user.role, username: user.username }) : 'ADMIN'
  return [{ ...DEFAULT_TENANT, role: sessionRole, isDefault: true }]
}

export async function selectTenant(userId: string, tenantId: string) {
  let membership
  try {
    membership = await prisma.tenantMembership.findFirst({
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
  } catch (error) {
    if (isMissingTenantMembershipTable(error)) {
      if (tenantId !== DEFAULT_TENANT.id) {
        throw new ApiError(403, 'FORBIDDEN', 'Tenant ini belum tersedia pada sistem saat ini.')
      }

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

      const availableLocations = await listAvailableLocations(DEFAULT_TENANT)
      const activeLocationId = availableLocations[0]?.id

      const payload = {
        sub: user.id,
        role: resolveSessionRole({ role: user.role, username: user.username }),
        username: user.username,
        tenantId: DEFAULT_TENANT.id,
        activeLocationId,
        isSuperAdmin: isSessionSuperAdmin({ role: user.role, username: user.username }),
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
          role: resolveSessionRole({ role: user.role, username: user.username }),
          tenant: DEFAULT_TENANT,
          activeLocationId: activeLocationId || null,
          availableLocations,
          isSuperAdmin: isSessionSuperAdmin({ role: user.role, username: user.username }),
          availableTenants: [{ ...DEFAULT_TENANT, role: resolveSessionRole({ role: user.role, username: user.username }), isDefault: true }],
        },
      }
    }

    throw error
  }

  if (!membership) {
    throw new ApiError(403, 'FORBIDDEN', 'Kamu tidak memiliki akses ke tenant ini.')
  }

  if (!membership.canView) {
    throw new ApiError(403, 'FORBIDDEN', 'Akses tenant dinonaktifkan oleh admin.')
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

  const availableLocations = await listAvailableLocations(membership.tenant as SessionTenantContext)
  const activeLocationId = availableLocations[0]?.id

  const payload = {
    sub: user.id,
    role: resolveSessionRole({ role: user.role, username: user.username }),
    username: user.username,
    tenantId: membership.tenant.id,
    activeLocationId,
    isSuperAdmin: isSessionSuperAdmin({ role: user.role, username: user.username }),
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
      role: resolveSessionRole({ role: user.role, username: user.username }),
      tenant: membership.tenant,
      jabatan: membership.jabatan || null,
      canView: membership.canView,
      canEdit: membership.canEdit,
      activeLocationId: activeLocationId || null,
      availableLocations,
      isSuperAdmin: isSessionSuperAdmin({ role: user.role, username: user.username }),
      availableTenants: await listTenantMemberships(user.id),
    },
  }
}

export async function selectLocation(userId: string, locationId: string) {
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
    throw new ApiError(401, 'AUTH_INVALID', 'User tidak valid untuk mengganti lokasi.')
  }

  const tenant = await getDefaultTenantContext(user.id)
  const sessionRole = resolveSessionRole({ role: user.role, username: user.username })
  const sessionIsSuperAdmin = isSessionSuperAdmin({ role: user.role, username: user.username })
  const availableTenants = await listTenantMemberships(user.id)
  const availableLocations = await listAvailableLocations(tenant as SessionTenantContext)

  if (!availableLocations.some((location) => location.id === locationId)) {
    throw new ApiError(403, 'FORBIDDEN', 'Lokasi tidak tersedia untuk tenant aktif ini.')
  }

  const payload = {
    sub: user.id,
    role: sessionRole,
    username: user.username,
    tenantId: tenant.id,
    activeLocationId: locationId,
    isSuperAdmin: sessionIsSuperAdmin,
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
      role: sessionRole,
      tenant,
      jabatan: (tenant as { jabatan?: string }).jabatan || null,
      canView: (tenant as { canView?: boolean }).canView ?? true,
      canEdit: (tenant as { canEdit?: boolean }).canEdit ?? (sessionRole === 'SUPER_ADMIN' || sessionRole === 'ADMIN'),
      activeLocationId: locationId,
      availableLocations,
      isSuperAdmin: sessionIsSuperAdmin,
      availableTenants: availableTenants.length ? availableTenants : [{ ...DEFAULT_TENANT, role: sessionRole, isDefault: true }],
    },
  }
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      passwordHash: true,
      isActive: true,
    },
  })

  if (!user || !user.isActive) {
    throw new ApiError(401, 'AUTH_INVALID', 'User tidak valid.')
  }

  const isCurrentValid = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!isCurrentValid) {
    throw new ApiError(400, 'PASSWORD_INVALID', 'Password saat ini tidak sesuai.')
  }

  const isSameAsCurrent = await bcrypt.compare(newPassword, user.passwordHash)
  if (isSameAsCurrent) {
    throw new ApiError(400, 'PASSWORD_SAME', 'Password baru harus berbeda dari password lama.')
  }

  const passwordHash = await bcrypt.hash(newPassword, 10)

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
    },
  })

  return {
    code: 'PASSWORD_CHANGED',
    message: 'Password berhasil diperbarui.',
  }
}
