import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/prisma.js'
import { ApiError } from '../../utils/api-error.js'

type CreateTenantInput = {
  name: string
  code: string
}

type UpdateTenantInput = {
  name: string
  code: string
}

type CreateTenantUserInput = {
  name: string
  username: string
  email?: string
  role: 'ADMIN' | 'STAFF'
  jabatan: string
  canView: boolean
  canEdit: boolean
  locationIds?: string[]
  password: string
}

type UpdateTenantUserInput = {
  name: string
  username: string
  email?: string
  role: 'ADMIN' | 'STAFF'
  jabatan: string
  canView: boolean
  canEdit: boolean
  locationIds?: string[]
  password?: string
}

type BulkTenantUserAction = 'ACTIVATE' | 'DEACTIVATE' | 'ACCESS_NONE' | 'ACCESS_VIEW' | 'ACCESS_EDIT'

type CreateTenantLocationInput = {
  name: string
  description?: string
}

type UpdateTenantLocationInput = {
  name: string
  description?: string
}

type BulkTenantLocationAction = 'ACTIVATE' | 'DEACTIVATE'

type UpdateTenantTelegramSettingsInput = {
  botToken?: string
  chatId?: string
  isEnabled: boolean
  sendOnChecklistExport: boolean
}

type ListTenantsQuery = {
  includeArchived?: boolean
}

type BulkTenantAction = 'DEACTIVATE' | 'ACTIVATE' | 'ARCHIVE' | 'RESTORE'

function withTenantPrefix(tenantCode: string, name: string) {
  return `${tenantCode}::${name}`
}

function toSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

function stripTenantPrefix(tenantCode: string, value: string) {
  const prefix = `${tenantCode}::`
  return value.startsWith(prefix) ? value.slice(prefix.length) : value
}

const INACTIVE_LOCATION_PREFIX = 'INACTIVE - '

function isInactiveTenantLocationName(name: string) {
  return name.startsWith(INACTIVE_LOCATION_PREFIX)
}

function toInactiveTenantLocationName(name: string) {
  return isInactiveTenantLocationName(name) ? name : `${INACTIVE_LOCATION_PREFIX}${name}`
}

function toActiveTenantLocationName(name: string) {
  return name.replace(new RegExp(`^${INACTIVE_LOCATION_PREFIX}`, 'i'), '')
}

async function resolveTenantLocationIds(tenantCode: string, locationIds: string[]) {
  const uniqueIds = [...new Set(locationIds)]
  if (!uniqueIds.length) return []

  const rows = await prisma.location.findMany({
    where: {
      id: { in: uniqueIds },
      name: {
        startsWith: `${tenantCode}::`,
      },
    },
    select: {
      id: true,
    },
  })

  if (rows.length !== uniqueIds.length) {
    throw new ApiError(400, 'LOCATION_SCOPE_INVALID', 'Ada lokasi yang tidak termasuk tenant ini.')
  }

  return rows.map((row) => row.id)
}

async function resolveRequiredStaffLocationIds(tenantCode: string, locationIds?: string[]) {
  if (!locationIds?.length) {
    throw new ApiError(400, 'STAFF_LOCATION_REQUIRED', 'User STAFF wajib memiliki minimal 1 lokasi aktif.')
  }

  const scopedLocationIds = await resolveTenantLocationIds(tenantCode, locationIds)

  const rows = await prisma.location.findMany({
    where: {
      id: { in: scopedLocationIds },
    },
    select: {
      id: true,
      name: true,
    },
  })

  const inactiveLocationIds = rows
    .filter((row) => isInactiveTenantLocationName(stripTenantPrefix(tenantCode, row.name)))
    .map((row) => row.id)

  if (inactiveLocationIds.length) {
    throw new ApiError(400, 'STAFF_LOCATION_INACTIVE', 'Lokasi STAFF harus aktif.')
  }

  return scopedLocationIds
}

function maskToken(token?: string | null) {
  if (!token) return null
  if (token.length <= 10) return '**********'
  return `${token.slice(0, 6)}********${token.slice(-4)}`
}

const ARCHIVE_CODE_PREFIX = 'archv-'

function isArchivedCode(code: string) {
  return code.startsWith(ARCHIVE_CODE_PREFIX)
}

function toArchiveCode(code: string) {
  return `${ARCHIVE_CODE_PREFIX}${Date.now()}-${code}`
}

function fromArchiveCode(code: string) {
  if (!isArchivedCode(code)) return code
  const parts = code.split('-')
  if (parts.length < 3) return code.replace(ARCHIVE_CODE_PREFIX, '')
  return parts.slice(2).join('-')
}

async function getTenantOrThrow(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
  if (!tenant) throw new ApiError(404, 'TENANT_NOT_FOUND', 'Tenant tidak ditemukan.')
  return tenant
}

function ensureTenantActive(tenant: { isActive: boolean }) {
  if (!tenant.isActive) {
    throw new ApiError(400, 'TENANT_INACTIVE', 'Tenant nonaktif. Aktifkan tenant terlebih dahulu untuk menyimpan perubahan ini.')
  }
}

export async function listTenants(query: ListTenantsQuery = {}) {
  const rows = await prisma.tenant.findMany({
    where: {
      ...(query.includeArchived
        ? {}
        : {
            code: {
              not: {
                startsWith: ARCHIVE_CODE_PREFIX,
              },
            },
          }),
    },
    orderBy: { createdAt: 'desc' },
  })

  return rows.map((tenant) => ({
    ...tenant,
    archivedAt: isArchivedCode(tenant.code) ? tenant.updatedAt : null,
  }))
}

export async function deleteTenant(actorUserId: string, tenantId: string) {
  const tenant = await getTenantOrThrow(tenantId)

  if (isArchivedCode(tenant.code)) {
    return {
      code: 'TENANT_ALREADY_ARCHIVED',
      message: 'Tenant sudah diarsipkan.',
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.tenant.update({
      where: { id: tenantId },
      data: {
        isActive: false,
        code: toArchiveCode(tenant.code),
      },
    })

    await tx.tenantMembership.updateMany({
      where: {
        tenantId,
      },
      data: {
        isDefault: false,
        canView: false,
        canEdit: false,
      },
    })

    await tx.auditLog.create({
      data: {
        actorUserId,
        tenantId,
        entityType: 'tenants',
        entityId: tenantId,
        action: 'ARCHIVE',
        diffJson: {
          name: tenant.name,
          code: tenant.code,
          isActive: false,
          archived: true,
        },
      },
    })
  })

  return {
    code: 'TENANT_ARCHIVED',
    message: 'Tenant berhasil diarsipkan.',
  }
}

export async function reactivateTenant(actorUserId: string, tenantId: string) {
  const tenant = await getTenantOrThrow(tenantId)

  if (isArchivedCode(tenant.code)) {
    throw new ApiError(400, 'TENANT_ARCHIVED', 'Tenant diarsipkan. Gunakan aksi restore untuk mengaktifkan kembali.')
  }

  if (tenant.isActive) {
    return {
      code: 'TENANT_ALREADY_ACTIVE',
      message: 'Tenant sudah aktif.',
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.tenant.update({
      where: { id: tenantId },
      data: {
        isActive: true,
      },
    })

    await tx.tenantMembership.updateMany({
      where: {
        tenantId,
      },
      data: {
        canView: true,
      },
    })

    await tx.tenantMembership.updateMany({
      where: {
        tenantId,
        role: 'ADMIN',
      },
      data: {
        canEdit: true,
      },
    })

    await tx.auditLog.create({
      data: {
        actorUserId,
        tenantId,
        entityType: 'tenants',
        entityId: tenantId,
        action: 'RESTORE',
        diffJson: {
          name: tenant.name,
          code: tenant.code,
          isActive: true,
        },
      },
    })
  })

  return {
    code: 'TENANT_REACTIVATED',
    message: 'Tenant berhasil diaktifkan kembali.',
  }
}

export async function restoreTenant(actorUserId: string, tenantId: string) {
  const tenant = await getTenantOrThrow(tenantId)

  if (!isArchivedCode(tenant.code)) {
    return {
      code: 'TENANT_NOT_ARCHIVED',
      message: 'Tenant tidak dalam status arsip.',
    }
  }

  const restoredBaseCode = fromArchiveCode(tenant.code)
  let candidateCode = restoredBaseCode

  for (let idx = 1; idx <= 99; idx += 1) {
    const conflict = await prisma.tenant.findFirst({
      where: {
        id: { not: tenantId },
        code: candidateCode,
      },
      select: { id: true },
    })
    if (!conflict) break
    candidateCode = `${restoredBaseCode}-${idx}`
  }

  await prisma.$transaction(async (tx) => {
    await tx.tenant.update({
      where: { id: tenantId },
      data: {
        isActive: true,
        code: candidateCode,
      },
    })

    await tx.tenantMembership.updateMany({
      where: { tenantId },
      data: {
        canView: true,
      },
    })

    await tx.tenantMembership.updateMany({
      where: {
        tenantId,
        role: 'ADMIN',
      },
      data: {
        canEdit: true,
      },
    })

    await tx.auditLog.create({
      data: {
        actorUserId,
        tenantId,
        entityType: 'tenants',
        entityId: tenantId,
        action: 'RESTORE_ARCHIVE',
        diffJson: {
          name: tenant.name,
          code: tenant.code,
          isActive: true,
          archived: false,
        },
      },
    })
  })

  return {
    code: 'TENANT_RESTORED',
    message: 'Tenant berhasil dipulihkan dari arsip.',
  }
}

export async function updateTenantStatus(actorUserId: string, tenantId: string, isActive: boolean) {
  const tenant = await getTenantOrThrow(tenantId)

  if (isArchivedCode(tenant.code)) {
    throw new ApiError(400, 'TENANT_ARCHIVED', 'Tenant diarsipkan. Restore tenant dulu sebelum mengubah status aktif.')
  }

  if (tenant.isActive === isActive) {
    return {
      code: isActive ? 'TENANT_ALREADY_ACTIVE' : 'TENANT_ALREADY_INACTIVE',
      message: isActive ? 'Tenant sudah aktif.' : 'Tenant sudah nonaktif.',
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.tenant.update({
      where: { id: tenantId },
      data: {
        isActive,
      },
    })

    if (!isActive) {
      await tx.tenantMembership.updateMany({
        where: { tenantId },
        data: {
          canView: false,
          canEdit: false,
          isDefault: false,
        },
      })
    }

    await tx.auditLog.create({
      data: {
        actorUserId,
        tenantId,
        entityType: 'tenants',
        entityId: tenantId,
        action: isActive ? 'ACTIVATE' : 'DEACTIVATE',
        diffJson: {
          isActive,
          archived: false,
        },
      },
    })
  })

  return {
    code: isActive ? 'TENANT_ACTIVATED' : 'TENANT_DEACTIVATED',
    message: isActive ? 'Tenant berhasil diaktifkan.' : 'Tenant berhasil dinonaktifkan.',
  }
}

export async function bulkTenantAction(actorUserId: string, ids: string[], action: BulkTenantAction) {
  const successIds: string[] = []
  const failures: Array<{ id: string; message: string }> = []

  for (const tenantId of ids) {
    try {
      if (action === 'DEACTIVATE') {
        await updateTenantStatus(actorUserId, tenantId, false)
      } else if (action === 'ACTIVATE') {
        await reactivateTenant(actorUserId, tenantId)
      } else if (action === 'ARCHIVE') {
        await deleteTenant(actorUserId, tenantId)
      } else {
        await restoreTenant(actorUserId, tenantId)
      }

      successIds.push(tenantId)
    } catch (error) {
      failures.push({
        id: tenantId,
        message: error instanceof Error ? error.message : 'Terjadi kesalahan.',
      })
    }
  }

  return {
    code: 'TENANT_BULK_ACTION_COMPLETED',
    message: `Aksi tenant terpilih selesai. Berhasil: ${successIds.length}, Gagal: ${failures.length}.`,
    action,
    total: ids.length,
    successCount: successIds.length,
    failedCount: failures.length,
    successIds,
    failures,
  }
}

export async function createTenant(actorUserId: string, input: CreateTenantInput) {
  const normalizedCode = toSlug(input.code || input.name)
  if (!normalizedCode) {
    throw new ApiError(400, 'TENANT_CODE_INVALID', 'Kode tenant tidak valid.')
  }

  try {
    const tenant = await prisma.tenant.create({
      data: {
        name: input.name.trim(),
        code: normalizedCode,
        isActive: true,
      },
    })

    await prisma.auditLog.create({
      data: {
        actorUserId,
        tenantId: tenant.id,
        entityType: 'tenants',
        entityId: tenant.id,
        action: 'CREATE',
        diffJson: {
          name: tenant.name,
          code: tenant.code,
        },
      },
    })

    return tenant
  } catch {
    throw new ApiError(409, 'TENANT_EXISTS', 'Nama atau kode tenant sudah digunakan.')
  }
}

export async function updateTenant(actorUserId: string, tenantId: string, input: UpdateTenantInput) {
  const tenant = await getTenantOrThrow(tenantId)
  if (isArchivedCode(tenant.code)) {
    throw new ApiError(400, 'TENANT_ARCHIVED', 'Tenant diarsipkan. Restore tenant dulu sebelum mengubah detail.')
  }
  const nextName = input.name.trim()
  const nextCode = toSlug(input.code || input.name)

  if (nextName.length < 3 || !nextCode || nextCode.length < 3) {
    throw new ApiError(400, 'TENANT_INVALID', 'Nama dan kode tenant minimal 3 karakter.')
  }

  const oldCode = tenant.code

  try {
    const updatedTenant = await prisma.$transaction(async (tx) => {
      if (oldCode !== nextCode) {
        const prefixedLocations = await tx.location.findMany({
          where: {
            name: {
              startsWith: `${oldCode}::`,
            },
          },
          select: {
            id: true,
            name: true,
          },
        })

        for (const location of prefixedLocations) {
          const suffixName = stripTenantPrefix(oldCode, location.name)
          await tx.location.update({
            where: { id: location.id },
            data: {
              name: withTenantPrefix(nextCode, suffixName),
            },
          })
        }
      }

      const saved = await tx.tenant.update({
        where: { id: tenantId },
        data: {
          name: nextName,
          code: nextCode,
        },
      })

      await tx.auditLog.create({
        data: {
          actorUserId,
          tenantId,
          entityType: 'tenants',
          entityId: tenantId,
          action: 'UPDATE',
          diffJson: {
            oldName: tenant.name,
            oldCode,
            newName: saved.name,
            newCode: saved.code,
          },
        },
      })

      return saved
    })

    return {
      code: 'TENANT_UPDATED',
      message: 'Detail tenant berhasil diperbarui.',
      tenant: updatedTenant,
    }
  } catch {
    throw new ApiError(409, 'TENANT_EXISTS', 'Nama atau kode tenant sudah digunakan.')
  }
}

export async function getTenantDetail(tenantId: string) {
  const tenant = await getTenantOrThrow(tenantId)

  const [memberships, locations] = await Promise.all([
    prisma.tenantMembership.findMany({
      where: {
        tenantId,
        user: {
          username: {
            notIn: ['superadmin', 'admin'],
          },
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            email: true,
            role: true,
            isActive: true,
          },
        },
        locationAccess: {
          select: {
            locationId: true,
          },
        },
      },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.location.findMany({
      where: {
        name: {
          startsWith: `${tenant.code}::`,
        },
      },
      orderBy: { name: 'asc' },
    }),
  ])

  return {
    tenant: {
      ...tenant,
      archivedAt: isArchivedCode(tenant.code) ? tenant.updatedAt : null,
    },
    users: memberships.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      username: m.user.username,
      email: m.user.email,
      role: m.role,
      jabatan: m.jabatan || '-',
      canView: m.canView,
      canEdit: m.canEdit,
      locationAccessIds: m.locationAccess.map((item) => item.locationId),
      isActive: m.user.isActive,
      isDefault: m.isDefault,
    })),
    locations: locations.map((location) => ({
      id: location.id,
      name: toActiveTenantLocationName(stripTenantPrefix(tenant.code, location.name)),
      description: location.description,
      isActive: !isInactiveTenantLocationName(stripTenantPrefix(tenant.code, location.name)),
      isPrefixed: true,
    })),
  }
}

export async function addTenantUser(actorUserId: string, tenantId: string, input: CreateTenantUserInput) {
  const tenant = await getTenantOrThrow(tenantId)
  ensureTenantActive(tenant)

  const orConditions: Array<{ username?: string; email?: string }> = [{ username: input.username }]
  if (input.email) orConditions.push({ email: input.email })

  const existing = await prisma.user.findFirst({
    where: {
      OR: orConditions,
    },
  })
  if (existing) throw new ApiError(409, 'USER_EXISTS', 'Username atau email sudah digunakan.')

  const passwordHash = await bcrypt.hash(input.password, 10)
  const scopedLocationIds = input.role === 'STAFF'
    ? await resolveRequiredStaffLocationIds(tenant.code, input.locationIds)
    : []

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: input.name,
        username: input.username,
        email: input.email,
        passwordHash,
        role: input.role,
      },
    })

    const membership = await tx.tenantMembership.create({
      data: {
        userId: user.id,
        tenantId,
        role: input.role,
        jabatan: input.jabatan,
        canView: input.canView,
        canEdit: input.canEdit,
        isDefault: true,
      },
    })

    if (input.role === 'STAFF' && scopedLocationIds.length) {
      await tx.tenantMembershipLocation.createMany({
        data: scopedLocationIds.map((locationId) => ({
          tenantMembershipId: membership.id,
          locationId,
        })),
        skipDuplicates: true,
      })
    }

    await tx.auditLog.create({
      data: {
        actorUserId,
        tenantId,
        entityType: 'tenant_users',
        entityId: user.id,
        action: 'CREATE',
        diffJson: {
          tenantId,
          tenantCode: tenant.code,
          role: input.role,
          jabatan: input.jabatan,
          canView: input.canView,
          canEdit: input.canEdit,
          locationIds: scopedLocationIds,
        },
      },
    })

    return user
  })

  return {
    id: created.id,
    name: created.name,
    username: created.username,
    email: created.email,
    role: input.role,
    jabatan: input.jabatan,
    canView: input.canView,
    canEdit: input.canEdit,
  }
}

export async function updateTenantUser(
  actorUserId: string,
  tenantId: string,
  userId: string,
  input: UpdateTenantUserInput,
) {
  const tenant = await getTenantOrThrow(tenantId)
  ensureTenantActive(tenant)
  const membership = await prisma.tenantMembership.findFirst({
    where: { tenantId, userId },
  })
  if (!membership) throw new ApiError(404, 'TENANT_USER_NOT_FOUND', 'User tenant tidak ditemukan.')

  const duplicate = await prisma.user.findFirst({
    where: {
      id: { not: userId },
      OR: [{ username: input.username }, ...(input.email ? [{ email: input.email }] : [])],
    },
  })
  if (duplicate) throw new ApiError(409, 'USER_EXISTS', 'Username atau email sudah digunakan.')

  const scopedLocationIds = input.role === 'STAFF'
    ? await resolveRequiredStaffLocationIds(tenant.code, input.locationIds)
    : []

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        name: input.name,
        username: input.username,
        email: input.email,
        ...(input.password ? { passwordHash: await bcrypt.hash(input.password, 10) } : {}),
      },
    })

    await tx.tenantMembership.update({
      where: {
        userId_tenantId: {
          userId,
          tenantId,
        },
      },
      data: {
        role: input.role,
        jabatan: input.jabatan,
        canView: input.canView,
        canEdit: input.canEdit,
      },
    })

    await tx.tenantMembershipLocation.deleteMany({
      where: {
        tenantMembershipId: membership.id,
      },
    })

    if (input.role === 'STAFF' && scopedLocationIds.length) {
      await tx.tenantMembershipLocation.createMany({
        data: scopedLocationIds.map((locationId) => ({
          tenantMembershipId: membership.id,
          locationId,
        })),
        skipDuplicates: true,
      })
    }

    await tx.auditLog.create({
      data: {
        actorUserId,
        tenantId,
        entityType: 'tenant_users',
        entityId: userId,
        action: 'UPDATE',
        diffJson: {
          tenantId,
          tenantCode: tenant.code,
          role: input.role,
          jabatan: input.jabatan,
          canView: input.canView,
          canEdit: input.canEdit,
          locationIds: scopedLocationIds,
        },
      },
    })
  })

  return {
    code: 'TENANT_USER_UPDATED',
    message: 'User tenant berhasil diperbarui.',
  }
}

export async function setTenantUserLocationAccess(
  actorUserId: string,
  tenantId: string,
  userId: string,
  locationIds: string[],
) {
  const tenant = await getTenantOrThrow(tenantId)
  ensureTenantActive(tenant)

  const membership = await prisma.tenantMembership.findFirst({
    where: { tenantId, userId },
  })
  if (!membership) throw new ApiError(404, 'TENANT_USER_NOT_FOUND', 'User tenant tidak ditemukan.')

  const scopedLocationIds = await resolveTenantLocationIds(tenant.code, locationIds)

  await prisma.$transaction(async (tx) => {
    await tx.tenantMembershipLocation.deleteMany({
      where: {
        tenantMembershipId: membership.id,
      },
    })

    if (scopedLocationIds.length) {
      await tx.tenantMembershipLocation.createMany({
        data: scopedLocationIds.map((locationId) => ({
          tenantMembershipId: membership.id,
          locationId,
        })),
        skipDuplicates: true,
      })
    }

    await tx.auditLog.create({
      data: {
        actorUserId,
        tenantId,
        entityType: 'tenant_user_location_access',
        entityId: userId,
        action: 'SET_LOCATION_ACCESS',
        diffJson: {
          tenantId,
          userId,
          locationIds: scopedLocationIds,
        },
      },
    })
  })

  return {
    code: 'TENANT_USER_LOCATION_ACCESS_UPDATED',
    message: 'Akses lokasi user tenant berhasil diperbarui.',
    locationIds: scopedLocationIds,
  }
}

export async function bulkTenantUserAction(
  actorUserId: string,
  tenantId: string,
  userIds: string[],
  action: BulkTenantUserAction,
) {
  const tenant = await getTenantOrThrow(tenantId)
  ensureTenantActive(tenant)

  const uniqueUserIds = [...new Set(userIds)]
  const memberships = await prisma.tenantMembership.findMany({
    where: {
      tenantId,
      userId: { in: uniqueUserIds },
    },
    select: {
      userId: true,
    },
  })

  const foundIds = new Set(memberships.map((m) => m.userId))
  const missingIds = uniqueUserIds.filter((id) => !foundIds.has(id))

  if (!memberships.length) {
    throw new ApiError(404, 'TENANT_USERS_NOT_FOUND', 'User tenant tidak ditemukan untuk aksi pilihan.')
  }

  const targetUserIds = memberships.map((m) => m.userId)

  await prisma.$transaction(async (tx) => {
    if (action === 'ACTIVATE' || action === 'DEACTIVATE') {
      await tx.user.updateMany({
        where: {
          id: { in: targetUserIds },
        },
        data: {
          isActive: action === 'ACTIVATE',
        },
      })
    } else {
      const next =
        action === 'ACCESS_NONE'
          ? { canView: false, canEdit: false }
          : action === 'ACCESS_VIEW'
            ? { canView: true, canEdit: false }
            : { canView: true, canEdit: true }

      await tx.tenantMembership.updateMany({
        where: {
          tenantId,
          userId: { in: targetUserIds },
        },
        data: next,
      })
    }

    await tx.auditLog.create({
      data: {
        actorUserId,
        tenantId,
        entityType: 'tenant_users',
        entityId: 'bulk',
        action: `BULK_${action}`,
        diffJson: {
          tenantId,
          userIds: targetUserIds,
          missingIds,
        },
      },
    })
  })

  return {
    code: 'TENANT_USERS_BULK_ACTION_COMPLETED',
    message: `Aksi user tenant terpilih selesai. Berhasil: ${targetUserIds.length}, tidak ditemukan: ${missingIds.length}.`,
    action,
    affectedCount: targetUserIds.length,
    missingIds,
  }
}

export async function addTenantLocation(actorUserId: string, tenantId: string, input: CreateTenantLocationInput) {
  const tenant = await getTenantOrThrow(tenantId)
  ensureTenantActive(tenant)
  const prefixedName = withTenantPrefix(tenant.code, input.name)

  try {
    const location = await prisma.$transaction(async (tx) => {
      const created = await tx.location.create({
        data: {
          name: prefixedName,
          description: input.description,
        },
      })

      const items = await tx.item.findMany({ select: { id: true } })
      if (items.length) {
        await tx.stock.createMany({
          data: items.map((item) => ({
            itemId: item.id,
            locationId: created.id,
            qty: 0,
          })),
          skipDuplicates: true,
        })
      }

      await tx.auditLog.create({
        data: {
          actorUserId,
          tenantId,
          entityType: 'tenant_locations',
          entityId: created.id,
          action: 'CREATE',
          diffJson: {
            tenantId,
            tenantCode: tenant.code,
            name: input.name,
          },
        },
      })

      return created
    })

    return {
      id: location.id,
      name: toActiveTenantLocationName(stripTenantPrefix(tenant.code, location.name)),
      description: location.description,
      isActive: !isInactiveTenantLocationName(stripTenantPrefix(tenant.code, location.name)),
    }
  } catch {
    throw new ApiError(409, 'LOCATION_EXISTS', 'Nama lokasi tenant sudah ada.')
  }
}

export async function updateTenantLocation(
  actorUserId: string,
  tenantId: string,
  locationId: string,
  input: UpdateTenantLocationInput,
) {
  const tenant = await getTenantOrThrow(tenantId)
  ensureTenantActive(tenant)

  const existing = await prisma.location.findUnique({ where: { id: locationId } })
  if (!existing || !existing.name.startsWith(`${tenant.code}::`)) {
    throw new ApiError(404, 'TENANT_LOCATION_NOT_FOUND', 'Lokasi tenant tidak ditemukan.')
  }

  try {
    const existingSuffix = stripTenantPrefix(tenant.code, existing.name)
    const keepInactive = isInactiveTenantLocationName(existingSuffix)
    const nextSuffix = keepInactive ? toInactiveTenantLocationName(input.name) : input.name
    const nextPrefixedName = withTenantPrefix(tenant.code, nextSuffix)

    const updated = await prisma.location.update({
      where: { id: locationId },
      data: {
        name: nextPrefixedName,
        description: input.description,
      },
    })

    await prisma.auditLog.create({
      data: {
        actorUserId,
        tenantId,
        entityType: 'tenant_locations',
        entityId: updated.id,
        action: 'UPDATE',
        diffJson: {
          tenantId,
          tenantCode: tenant.code,
          name: input.name,
        },
      },
    })

    return {
      id: updated.id,
      name: toActiveTenantLocationName(stripTenantPrefix(tenant.code, updated.name)),
      description: updated.description,
      isActive: !isInactiveTenantLocationName(stripTenantPrefix(tenant.code, updated.name)),
    }
  } catch {
    throw new ApiError(409, 'LOCATION_EXISTS', 'Nama lokasi tenant sudah ada.')
  }
}

export async function bulkTenantLocationAction(
  actorUserId: string,
  tenantId: string,
  locationIds: string[],
  action: BulkTenantLocationAction,
) {
  const tenant = await getTenantOrThrow(tenantId)
  ensureTenantActive(tenant)

  const uniqueLocationIds = [...new Set(locationIds)]
  const locations = await prisma.location.findMany({
    where: {
      id: { in: uniqueLocationIds },
      name: {
        startsWith: `${tenant.code}::`,
      },
    },
    select: {
      id: true,
      name: true,
    },
  })

  if (!locations.length) {
    throw new ApiError(404, 'TENANT_LOCATIONS_NOT_FOUND', 'Lokasi tenant tidak ditemukan untuk aksi pilihan.')
  }

  const foundIds = new Set(locations.map((loc) => loc.id))
  const missingIds = uniqueLocationIds.filter((id) => !foundIds.has(id))

  await prisma.$transaction(async (tx) => {
    for (const loc of locations) {
      const suffixName = stripTenantPrefix(tenant.code, loc.name)
      const nextSuffix = action === 'DEACTIVATE' ? toInactiveTenantLocationName(suffixName) : toActiveTenantLocationName(suffixName)
      const nextName = withTenantPrefix(tenant.code, nextSuffix)

      await tx.location.update({
        where: { id: loc.id },
        data: {
          name: nextName,
        },
      })
    }

    await tx.auditLog.create({
      data: {
        actorUserId,
        tenantId,
        entityType: 'tenant_locations',
        entityId: 'bulk',
        action: `BULK_${action}`,
        diffJson: {
          tenantId,
          locationIds: locations.map((loc) => loc.id),
          missingIds,
        },
      },
    })
  })

  return {
    code: 'TENANT_LOCATIONS_BULK_ACTION_COMPLETED',
    message: `Aksi lokasi tenant terpilih selesai. Berhasil: ${locations.length}, tidak ditemukan: ${missingIds.length}.`,
    action,
    affectedCount: locations.length,
    missingIds,
  }
}

export async function getTenantTelegramSettings(tenantId: string) {
  await getTenantOrThrow(tenantId)

  const settings = await prisma.tenantTelegramSetting.findUnique({
    where: { tenantId },
  })

  return {
    tenantId,
    hasBotToken: Boolean(settings?.botToken),
    botTokenMasked: maskToken(settings?.botToken),
    chatId: settings?.chatId || '',
    isEnabled: settings?.isEnabled ?? false,
    sendOnChecklistExport: settings?.sendOnChecklistExport ?? true,
    updatedAt: settings?.updatedAt || null,
  }
}

export async function updateTenantTelegramSettings(
  actorUserId: string,
  tenantId: string,
  input: UpdateTenantTelegramSettingsInput,
) {
  const tenant = await getTenantOrThrow(tenantId)
  ensureTenantActive(tenant)

  const existing = await prisma.tenantTelegramSetting.findUnique({
    where: { tenantId },
  })

  const nextBotToken = input.botToken?.trim() || existing?.botToken || ''
  const nextChatId = input.chatId?.trim() || existing?.chatId || ''

  if (input.isEnabled && (!nextBotToken || !nextChatId)) {
    throw new ApiError(400, 'TELEGRAM_SETTINGS_INVALID', 'Bot token dan chat ID wajib diisi saat integrasi Telegram aktif.')
  }

  const saved = await prisma.tenantTelegramSetting.upsert({
    where: { tenantId },
    update: {
      botToken: nextBotToken,
      chatId: nextChatId,
      isEnabled: input.isEnabled,
      sendOnChecklistExport: input.sendOnChecklistExport,
    },
    create: {
      tenantId,
      botToken: nextBotToken,
      chatId: nextChatId,
      isEnabled: input.isEnabled,
      sendOnChecklistExport: input.sendOnChecklistExport,
    },
  })

  await prisma.auditLog.create({
    data: {
      actorUserId,
      tenantId,
      entityType: 'tenant_telegram_settings',
      entityId: saved.id,
      action: 'UPDATE',
      diffJson: {
        tenantId,
        hasBotToken: Boolean(saved.botToken),
        chatId: saved.chatId,
        isEnabled: saved.isEnabled,
        sendOnChecklistExport: saved.sendOnChecklistExport,
      },
    },
  })

  return {
    code: 'TENANT_TELEGRAM_SETTINGS_UPDATED',
    message: 'Pengaturan Telegram tenant berhasil disimpan.',
    tenantId,
    hasBotToken: Boolean(saved.botToken),
    botTokenMasked: maskToken(saved.botToken),
    chatId: saved.chatId,
    isEnabled: saved.isEnabled,
    sendOnChecklistExport: saved.sendOnChecklistExport,
    updatedAt: saved.updatedAt,
  }
}
