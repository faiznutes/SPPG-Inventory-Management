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
  password?: string
}

type CreateTenantLocationInput = {
  name: string
  description?: string
}

type UpdateTenantLocationInput = {
  name: string
  description?: string
}

type UpdateTenantTelegramSettingsInput = {
  botToken?: string
  chatId?: string
  isEnabled: boolean
  sendOnChecklistExport: boolean
}

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

function maskToken(token?: string | null) {
  if (!token) return null
  if (token.length <= 10) return '**********'
  return `${token.slice(0, 6)}********${token.slice(-4)}`
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

export async function listTenants() {
  return prisma.tenant.findMany({
    orderBy: { createdAt: 'desc' },
  })
}

export async function deleteTenant(actorUserId: string, tenantId: string) {
  const tenant = await getTenantOrThrow(tenantId)

  if (!tenant.isActive) {
    return {
      code: 'TENANT_ALREADY_INACTIVE',
      message: 'Tenant sudah nonaktif.',
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.tenant.update({
      where: { id: tenantId },
      data: {
        isActive: false,
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
        entityType: 'tenants',
        entityId: tenantId,
        action: 'DELETE',
        diffJson: {
          name: tenant.name,
          code: tenant.code,
          isActive: false,
        },
      },
    })
  })

  return {
    code: 'TENANT_DELETED',
    message: 'Tenant berhasil dihapus (dinonaktifkan).',
  }
}

export async function reactivateTenant(actorUserId: string, tenantId: string) {
  const tenant = await getTenantOrThrow(tenantId)

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
    tenant,
    users: memberships.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      username: m.user.username,
      email: m.user.email,
      role: m.role,
      jabatan: m.jabatan || '-',
      canView: m.canView,
      canEdit: m.canEdit,
      isActive: m.user.isActive,
      isDefault: m.isDefault,
    })),
    locations: locations.map((location) => ({
      id: location.id,
      name: stripTenantPrefix(tenant.code, location.name),
      description: location.description,
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

    await tx.tenantMembership.create({
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

    await tx.auditLog.create({
      data: {
        actorUserId,
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

    await tx.auditLog.create({
      data: {
        actorUserId,
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
        },
      },
    })
  })

  return {
    code: 'TENANT_USER_UPDATED',
    message: 'User tenant berhasil diperbarui.',
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
      name: stripTenantPrefix(tenant.code, location.name),
      description: location.description,
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
  const prefixedName = withTenantPrefix(tenant.code, input.name)

  const existing = await prisma.location.findUnique({ where: { id: locationId } })
  if (!existing || !existing.name.startsWith(`${tenant.code}::`)) {
    throw new ApiError(404, 'TENANT_LOCATION_NOT_FOUND', 'Lokasi tenant tidak ditemukan.')
  }

  try {
    const updated = await prisma.location.update({
      where: { id: locationId },
      data: {
        name: prefixedName,
        description: input.description,
      },
    })

    await prisma.auditLog.create({
      data: {
        actorUserId,
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
      name: stripTenantPrefix(tenant.code, updated.name),
      description: updated.description,
    }
  } catch {
    throw new ApiError(409, 'LOCATION_EXISTS', 'Nama lokasi tenant sudah ada.')
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
