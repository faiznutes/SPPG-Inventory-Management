import { prisma } from '../../lib/prisma.js'
import { ApiError } from '../../utils/api-error.js'

type CreateCategoryInput = {
  name: string
  type: 'CONSUMABLE' | 'GAS' | 'ASSET'
}

type UpdateCategoryInput = {
  name: string
  type: 'CONSUMABLE' | 'GAS' | 'ASSET'
}

export async function listCategories() {
  const categories = await prisma.category.findMany({
    orderBy: { name: 'asc' },
  })

  return categories.map((category) => ({
    ...category,
    type: category.name.toUpperCase().includes('GAS')
      ? 'GAS'
      : category.name.toUpperCase().includes('ASSET')
        ? 'ASSET'
        : 'CONSUMABLE',
  }))
}

export async function createCategory(actorUserId: string, input: CreateCategoryInput) {
  try {
    const normalizedName = `${input.type} - ${input.name}`

    const category = await prisma.category.create({
      data: {
        name: normalizedName,
      },
    })

    await prisma.auditLog.create({
      data: {
        actorUserId,
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
      ...category,
      type: input.type,
    }
  } catch {
    throw new ApiError(409, 'CATEGORY_EXISTS', 'Nama kategori sudah ada.')
  }
}

export async function updateCategory(actorUserId: string, categoryId: string, input: UpdateCategoryInput) {
  try {
    const normalizedName = `${input.type} - ${input.name}`
    const category = await prisma.category.update({
      where: { id: categoryId },
      data: {
        name: normalizedName,
      },
    })

    await prisma.auditLog.create({
      data: {
        actorUserId,
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
      ...category,
      type: input.type,
    }
  } catch (error) {
    if ((error as { code?: string }).code === 'P2025') {
      throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'Kategori tidak ditemukan.')
    }
    throw new ApiError(409, 'CATEGORY_EXISTS', 'Nama kategori sudah ada.')
  }
}

export async function deleteCategory(actorUserId: string, categoryId: string) {
  const usageCount = await prisma.item.count({
    where: { categoryId },
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
  } catch {
    throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'Kategori tidak ditemukan.')
  }
}
