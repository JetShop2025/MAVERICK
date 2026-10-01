import 'dotenv/config'
import assert from 'node:assert/strict'
import { PrismaClient } from './generated/prisma/client.js'
import { PrismaPg } from '@prisma/adapter-pg'
import { loadTelemetryViews } from './telemetry-view.js'

// Optional read-only integration check; never starts the server or runs bootstrap writes.
if (!process.env.DATABASE_URL) {
  console.log('Database smoke check skipped: DATABASE_URL is not configured locally.')
} else {
  const prisma = new PrismaClient({ adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000
  }) })
  try {
    const assets = await prisma.asset.findMany({ where: { active: true }, take: 2 })
    const views = await loadTelemetryViews(prisma, assets)
    for (const asset of assets) {
      const view = views[asset.deviceId]
      assert.equal(view?.deviceId, asset.deviceId)
      assert.equal(view?.trackingSource, asset.trackingSource)
    }
    console.log('Read-only database smoke check passed for', assets.length, 'assets.')
  } finally {
    await prisma.$disconnect()
  }
}
