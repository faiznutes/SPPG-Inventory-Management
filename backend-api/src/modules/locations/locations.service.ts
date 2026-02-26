import { prisma } from '../../lib/prisma.js'
import { ApiError } from '../../utils/api-error.js'

type CreateLocationInput = {
  name: string
  description?: string
}

export async function listLocations() {
  const rows = await prisma.location.findMany({
    orderBy: { name: 'asc' },
  })

  if (rows.length) return rows

  const fallback = await createLocation({
    name: 'Gudang Utama',
    description: 'Lokasi default operasional SPPG',
  })

  return [fallback]
}

export async function createLocation(input: CreateLocationInput) {
  try {
    return await prisma.$transaction(async (tx) => {
      const location = await tx.location.create({
        data: {
          name: input.name,
          description: input.description,
        },
      })

      const items = await tx.item.findMany({ select: { id: true } })
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

      return location
    })
  } catch {
    throw new ApiError(409, 'LOCATION_EXISTS', 'Nama lokasi sudah ada.')
  }
}
