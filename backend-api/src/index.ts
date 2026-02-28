import { app } from './app.js'
import { env } from './config/env.js'
import { prisma } from './lib/prisma.js'
import { runDemoSeedIfNeeded } from './bootstrap/demo-seed.js'

const server = app.listen(env.PORT, () => {
  console.log(`Backend API berjalan di http://localhost:${env.PORT}`)

  setTimeout(() => {
    void runDemoSeedIfNeeded().catch((error) => {
      console.error('[DEMO] seed otomatis gagal:', error)
    })
  }, 2500)
})

async function shutdown() {
  await prisma.$disconnect()
  server.close(() => {
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
