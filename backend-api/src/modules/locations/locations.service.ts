import { prisma } from '../../lib/prisma.js'
import { ApiError } from '../../utils/api-error.js'
import { tenantItemSuffix } from '../../utils/item-scope.js'

type CreateLocationInput = {
  name: string
  description?: string
}

const INACTIVE_LOCATION_PREFIX = 'INACTIVE - '

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

async function resolveTenantOrThrow(tenantId?: string) {
  if (!tenantId) {
    throw new ApiError(400, 'TENANT_CONTEXT_REQUIRED', 'Tenant aktif tidak ditemukan pada sesi pengguna.')
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      code: true,
      isActive: true,
    },
  })

  if (!tenant || !tenant.isActive) {
    throw new ApiError(403, 'FORBIDDEN', 'Tenant tidak aktif atau tidak ditemukan.')
  }

  return tenant
}

export async function listLocations(userId: string, tenantId?: string, sessionRole = 'ADMIN') {
  const tenant = await resolveTenantOrThrow(tenantId)

  let rows = await prisma.location.findMany({
    where: {
      name: {
        startsWith: `${tenant.code}::`,
      },
    },
    select: {
      id: true,
      name: true,
      description: true,
    },
    orderBy: { name: 'asc' },
  })

  if (sessionRole === 'STAFF') {
    const membership = await prisma.tenantMembership.findFirst({
      where: {
        userId,
        tenantId: tenant.id,
      },
      select: {
        id: true,
      },
    })

    if (!membership) return []

    const allowedLocationIds = (
      await prisma.tenantMembershipLocation.findMany({
        where: {
          tenantMembershipId: membership.id,
        },
        select: {
          locationId: true,
        },
      })
    ).map((row) => row.locationId)

    if (!allowedLocationIds.length) return []

    const allowSet = new Set(allowedLocationIds)
    rows = rows.filter((row) => allowSet.has(row.id))
  }

  return rows
    .filter((row) => !isInactiveLocationName(row.name))
    .map((row) => ({
      id: row.id,
      name: stripInactivePrefix(stripTenantPrefix(tenant.code, row.name)),
      description: row.description,
      tenantCode: tenant.code,
      isActive: true,
    }))
}

export async function createLocation(input: CreateLocationInput, tenantId?: string) {
  const tenant = await resolveTenantOrThrow(tenantId)
  const cleanName = input.name.trim()
  if (cleanName.length < 2) {
    throw new ApiError(400, 'LOCATION_INVALID', 'Nama lokasi minimal 2 karakter.')
  }

  const scopedName = `${tenant.code}::${cleanName}`

  try {
    return await prisma.$transaction(async (tx) => {
      const location = await tx.location.create({
        data: {
          name: scopedName,
          description: input.description,
        },
      })

      const items = await tx.item.findMany({
        where: {
          name: {
            endsWith: tenantItemSuffix(tenant.id),
          },
        },
        select: { id: true },
      })
      if (items.length) {
        await tx.stock.createMany({
          data: items.map((item) => ({
            itemId: item.id,
            locationId: location.id,
            qty: 0,
          })),
          skipDuplicates: true,
        })
      }

      return {
        id: location.id,
        name: cleanName,
        description: location.description,
        tenantCode: tenant.code,
        isActive: true,
      }
    })
  } catch {
    throw new ApiError(409, 'LOCATION_EXISTS', 'Nama lokasi sudah ada.')
  }
}
