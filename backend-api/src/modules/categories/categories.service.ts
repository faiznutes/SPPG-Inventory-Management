import { prisma } from '../../lib/prisma.js'
import { ApiError } from '../../utils/api-error.js'

type CreateCategoryInput = {
  name: string
}

export async function listCategories() {
  return prisma.category.findMany({
    orderBy: { name: 'asc' },
  })
}

export async function createCategory(input: CreateCategoryInput) {
  try {
    return await prisma.category.create({
      data: {
        name: input.name,
      },
    })
  } catch {
    throw new ApiError(409, 'CATEGORY_EXISTS', 'Nama kategori sudah ada.')
  }
}
