import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/prisma.js'
import { ApiError } from '../../utils/api-error.js'

type CreateTenantInput = {
  name: string
  code: string
}

type CreateTenantUserInput = {
  name: string
  username: string
  email?: string
  role: 'TENANT_ADMIN' | 'KOORD_DAPUR' | 'KOORD_KEBERSIHAN' | 'KOORD_LAPANGAN' | 'STAFF'
  password: string
}

type CreateTenantLocationInput = {
  name: string
  description?: string
}

function withTenantPrefix(tenantCode: string, name: string) {
  return `${tenantCode}::${name}`
}

function stripTenantPrefix(tenantCode: string, value: string) {
  const prefix = `${tenantCode}::`
  return value.startsWith(prefix) ? value.slice(prefix.length) : value
}

async function getTenantOrThrow(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
  if (!tenant) throw new ApiError(404, 'TENANT_NOT_FOUND', 'Tenant tidak ditemukan.')
  return tenant
}

export async function listTenants() {
  return prisma.tenant.findMany({
    orderBy: { createdAt: 'desc' },
  })
}

export async function createTenant(actorUserId: string, input: CreateTenantInput) {
  try {
    const tenant = await prisma.tenant.create({
      data: {
        name: input.name,
        code: input.code,
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

export async function getTenantDetail(tenantId: string) {
  const tenant = await getTenantOrThrow(tenantId)

  const [memberships, locations] = await Promise.all([
    prisma.tenantMembership.findMany({
      where: { tenantId },
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
  }
}

export async function addTenantLocation(actorUserId: string, tenantId: string, input: CreateTenantLocationInput) {
  const tenant = await getTenantOrThrow(tenantId)
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
