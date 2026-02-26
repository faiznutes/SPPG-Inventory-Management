import bcrypt from 'bcryptjs'
import { UserRole } from '../src/lib/prisma-client.js'
import { env } from '../src/config/env.js'
import { prisma } from '../src/lib/prisma.js'

async function ensureSuperAdminUser() {
  const existing = await prisma.user.findUnique({
    where: { username: env.SUPER_ADMIN_USERNAME },
  })

  const passwordHash = await bcrypt.hash(env.SUPER_ADMIN_PASSWORD, 10)

  if (existing) {
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        name: env.SUPER_ADMIN_NAME,
        email: env.SUPER_ADMIN_EMAIL,
        passwordHash,
        role: UserRole.ADMIN,
        isActive: true,
      },
      select: { id: true },
    })
    return updated.id
  }

  const created = await prisma.user.create({
    data: {
      name: env.SUPER_ADMIN_NAME,
      username: env.SUPER_ADMIN_USERNAME,
      email: env.SUPER_ADMIN_EMAIL,
      passwordHash,
      role: UserRole.ADMIN,
      isActive: true,
    },
    select: { id: true },
  })

  return created.id
}

async function truncateAllExceptUsers() {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  `

  const ignored = new Set(['_prisma_migrations', 'users'])
  const names = tables
    .map((row) => row.tablename)
    .filter((name) => !ignored.has(name))
    .map((name) => `"${name}"`)

  if (!names.length) return

  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${names.join(', ')} RESTART IDENTITY CASCADE`)
}

async function main() {
  const superAdminId = await ensureSuperAdminUser()

  await truncateAllExceptUsers()

  await prisma.user.deleteMany({
    where: {
      id: {
        not: superAdminId,
      },
    },
  })

  await prisma.user.update({
    where: { id: superAdminId },
    data: {
      isActive: true,
    },
  })

  console.log('Database reset selesai. Hanya akun superadmin yang tersisa.')
  console.log(`Username: ${env.SUPER_ADMIN_USERNAME}`)
}

main()
  .catch((error) => {
    console.error('Gagal reset database:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
