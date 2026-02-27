import { prisma } from '../../lib/prisma.js'
import { ApiError } from '../../utils/api-error.js'
import { fromTenantScopedItemName, tenantItemSuffix, toTenantScopedItemName } from '../../utils/item-scope.js'

type CreateCategoryInput = {
  name: string
  type: 'CONSUMABLE' | 'GAS' | 'ASSET'
}

type UpdateCategoryInput = {
  name: string
  type: 'CONSUMABLE' | 'GAS' | 'ASSET'
}

type ListCategoriesQuery = {
  includeInactive?: boolean
}

type BulkCategoryAction = 'ACTIVATE' | 'DEACTIVATE' | 'DELETE' | 'UPDATE'

type BulkCategoryPayload = {
  name?: string
  type?: 'CONSUMABLE' | 'GAS' | 'ASSET'
}

const INACTIVE_PREFIX = 'INACTIVE - '

function detectCategoryType(name: string): 'CONSUMABLE' | 'GAS' | 'ASSET' {
  const clean = stripTenantCategorySuffix(name).replace(new RegExp(`^${INACTIVE_PREFIX}`, 'i'), '')
  return clean.toUpperCase().includes('GAS') ? 'GAS' : clean.toUpperCase().includes('ASSET') ? 'ASSET' : 'CONSUMABLE'
}

function displayCategoryName(name: string) {
  return stripTenantCategorySuffix(name).replace(new RegExp(`^${INACTIVE_PREFIX}`, 'i'), '').replace(/^(CONSUMABLE|GAS|ASSET)\s-\s/i, '')
}

function normalizedCategoryName(name: string, type: 'CONSUMABLE' | 'GAS' | 'ASSET') {
  return `${type} - ${name.trim()}`
}

function scopedCategoryName(name: string, tenantId: string) {
  return toTenantScopedItemName(name, tenantId)
}

function stripTenantCategorySuffix(name: string) {
  return fromTenantScopedItemName(name)
}

function ensureTenantId(tenantId?: string) {
  if (!tenantId) {
    throw new ApiError(400, 'TENANT_CONTEXT_REQUIRED', 'Tenant aktif tidak ditemukan pada sesi pengguna.')
  }
  return tenantId
}

async function ensureTenantCategoriesSeeded(tenantId: string) {
  const suffix = tenantItemSuffix(tenantId)
  const scopedCount = await prisma.category.count({
    where: {
      name: {
        endsWith: suffix,
      },
    },
  })

  if (scopedCount > 0) return

  const globalRows = await prisma.category.findMany({
    where: {
      name: {
        not: {
          contains: '_tenant_',
        },
      },
    },
    select: {
      name: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  })

  const seeds = [...new Set(globalRows.map((row) => row.name.trim()).filter(Boolean))]
  if (!seeds.length) return

  await prisma.category.createMany({
    data: seeds.map((name) => ({
      name: scopedCategoryName(name, tenantId),
    })),
    skipDuplicates: true,
  })
}

function isInactiveCategoryName(name: string) {
  return name.startsWith(INACTIVE_PREFIX)
}

function toInactiveCategoryName(name: string) {
  return isInactiveCategoryName(name) ? name : `${INACTIVE_PREFIX}${name}`
}

function toActiveCategoryName(name: string) {
  return name.replace(new RegExp(`^${INACTIVE_PREFIX}`, 'i'), '')
}

export async function listCategories(query: ListCategoriesQuery = {}, tenantId?: string) {
  const requiredTenantId = ensureTenantId(tenantId)
  await ensureTenantCategoriesSeeded(requiredTenantId)
  const suffix = tenantItemSuffix(requiredTenantId)
  const categories = await prisma.category.findMany({
    where: {
      name: {
        endsWith: suffix,
      },
      ...(query.includeInactive
        ? {}
        : {
            NOT: {
              name: {
                startsWith: INACTIVE_PREFIX,
              },
            },
          }),
    },
    orderBy: { name: 'asc' },
  })

  return categories.map((category) => ({
    id: category.id,
    name: displayCategoryName(category.name),
    type: detectCategoryType(category.name),
    isActive: !isInactiveCategoryName(category.name),
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  }))
}

export async function createCategory(actorUserId: string, tenantId: string | undefined, input: CreateCategoryInput) {
  const requiredTenantId = ensureTenantId(tenantId)
  try {
    const normalizedName = normalizedCategoryName(input.name, input.type)
    const scopedName = scopedCategoryName(normalizedName, requiredTenantId)

    const category = await prisma.category.create({
      data: {
        name: scopedName,
      },
    })

    await prisma.auditLog.create({
      data: {
        actorUserId,
        tenantId,
        entityType: 'categories',
        entityId: category.id,
        action: 'CREATE',
        diffJson: {
          name: category.name,
          type: input.type,
        },
      },
    })

    return {
      id: category.id,
      name: displayCategoryName(category.name),
      type: input.type,
      isActive: true,
    }
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(409, 'CATEGORY_EXISTS', 'Nama kategori sudah ada.')
  }
}

export async function updateCategory(actorUserId: string, tenantId: string | undefined, categoryId: string, input: UpdateCategoryInput) {
  const requiredTenantId = ensureTenantId(tenantId)
  try {
    const existing = await prisma.category.findUnique({ where: { id: categoryId } })
    if (!existing) {
      throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'Kategori tidak ditemukan.')
    }
    if (!existing.name.endsWith(tenantItemSuffix(requiredTenantId))) {
      throw new ApiError(403, 'FORBIDDEN', 'Kategori tidak tersedia untuk tenant aktif ini.')
    }

    const normalizedName = normalizedCategoryName(input.name, input.type)
    const scopedNormalized = scopedCategoryName(normalizedName, requiredTenantId)
    const nextName = isInactiveCategoryName(existing.name) ? toInactiveCategoryName(scopedNormalized) : scopedNormalized
    const category = await prisma.category.update({
      where: { id: categoryId },
      data: {
        name: nextName,
      },
    })

    await prisma.auditLog.create({
      data: {
        actorUserId,
        tenantId,
        entityType: 'categories',
        entityId: category.id,
        action: 'UPDATE',
        diffJson: {
          name: category.name,
          type: input.type,
        },
      },
    })

    return {
      id: category.id,
      name: displayCategoryName(category.name),
      type: input.type,
      isActive: !isInactiveCategoryName(category.name),
    }
  } catch (error) {
    if (error instanceof ApiError) throw error
    if ((error as { code?: string }).code === 'P2025') {
      throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'Kategori tidak ditemukan.')
    }
    throw new ApiError(409, 'CATEGORY_EXISTS', 'Nama kategori sudah ada.')
  }
}

export async function updateCategoryStatus(actorUserId: string, tenantId: string | undefined, categoryId: string, isActive: boolean) {
  const requiredTenantId = ensureTenantId(tenantId)
  try {
    const existing = await prisma.category.findUnique({ where: { id: categoryId } })
    if (!existing) {
      throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'Kategori tidak ditemukan.')
    }
    if (!existing.name.endsWith(tenantItemSuffix(requiredTenantId))) {
      throw new ApiError(403, 'FORBIDDEN', 'Kategori tidak tersedia untuk tenant aktif ini.')
    }

    const updated = await prisma.category.update({
      where: { id: categoryId },
      data: {
        name: isActive ? toActiveCategoryName(existing.name) : toInactiveCategoryName(existing.name),
      },
    })

    await prisma.auditLog.create({
      data: {
        actorUserId,
        tenantId,
        entityType: 'categories',
        entityId: updated.id,
        action: isActive ? 'ACTIVATE' : 'DEACTIVATE',
        diffJson: {
          name: updated.name,
          isActive,
        },
      },
    })

    return {
      code: isActive ? 'CATEGORY_ACTIVATED' : 'CATEGORY_DEACTIVATED',
      message: isActive ? 'Kategori berhasil diaktifkan.' : 'Kategori berhasil dinonaktifkan.',
    }
  } catch {
    throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'Kategori tidak ditemukan.')
  }
}

export async function deleteCategory(actorUserId: string, tenantId: string | undefined, categoryId: string) {
  const requiredTenantId = ensureTenantId(tenantId)
  const existing = await prisma.category.findUnique({ where: { id: categoryId } })
  if (!existing) {
    throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'Kategori tidak ditemukan.')
  }
  if (!existing.name.endsWith(tenantItemSuffix(requiredTenantId))) {
    throw new ApiError(403, 'FORBIDDEN', 'Kategori tidak tersedia untuk tenant aktif ini.')
  }

  const usageCount = await prisma.item.count({
    where: {
      categoryId,
      name: {
        endsWith: tenantItemSuffix(requiredTenantId),
      },
    },
  })

  if (usageCount > 0) {
    throw new ApiError(409, 'CATEGORY_IN_USE', 'Kategori sedang dipakai oleh produk dan tidak bisa dihapus.')
  }

  try {
      const deleted = await prisma.category.delete({
        where: { id: categoryId },
      })

    await prisma.auditLog.create({
      data: {
        actorUserId,
        tenantId,
        entityType: 'categories',
        entityId: deleted.id,
        action: 'DELETE',
        diffJson: {
          name: deleted.name,
        },
      },
    })

    return {
      code: 'CATEGORY_DELETED',
      message: 'Kategori berhasil dihapus.',
    }
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'Kategori tidak ditemukan.')
  }
}

export async function bulkCategoryAction(
  actorUserId: string,
  tenantId: string | undefined,
  ids: string[],
  action: BulkCategoryAction,
  payload?: BulkCategoryPayload,
) {
  ensureTenantId(tenantId)
  const uniqueIds = [...new Set(ids)]
  if (!uniqueIds.length) {
    throw new ApiError(400, 'BULK_CATEGORIES_EMPTY', 'Pilih minimal satu kategori untuk aksi pilihan.')
  }

  const successIds: string[] = []
  const failures: Array<{ id: string; message: string }> = []

  for (const categoryId of uniqueIds) {
    try {
      if (action === 'ACTIVATE') {
        await updateCategoryStatus(actorUserId, tenantId, categoryId, true)
      } else if (action === 'DEACTIVATE') {
        await updateCategoryStatus(actorUserId, tenantId, categoryId, false)
      } else if (action === 'DELETE') {
        await deleteCategory(actorUserId, tenantId, categoryId)
      } else {
        const current = await prisma.category.findUnique({ where: { id: categoryId } })
        if (!current) throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'Kategori tidak ditemukan.')
        const nextType = payload?.type || detectCategoryType(current.name)
        const nextName = payload?.name || displayCategoryName(current.name)
        await updateCategory(actorUserId, tenantId, categoryId, {
          name: nextName,
          type: nextType,
        })
      }
      successIds.push(categoryId)
    } catch (error) {
      failures.push({
        id: categoryId,
        message: error instanceof Error ? error.message : 'Terjadi kesalahan.',
      })
    }
  }

  return {
    code: 'CATEGORY_BULK_ACTION_COMPLETED',
    message: `Aksi kategori terpilih selesai. Berhasil: ${successIds.length}, Gagal: ${failures.length}.`,
    action,
    total: uniqueIds.length,
    successCount: successIds.length,
    failedCount: failures.length,
    successIds,
    failures,
  }
}
