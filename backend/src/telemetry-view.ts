import { Prisma, type PrismaClient, type Asset, type Telemetry } from './generated/prisma/client.js'

export function buildTelemetryView(
  asset: Pick<Asset, 'id' | 'deviceId' | 'trackingSource' | 'trackingActive' |
    'trackingStartedAt' | 'trackingStoppedAt' | 'lastHeartbeatAt' | 'lastPhoneGpsAt' |
    'mav2LocationMovingSec' | 'mav2TemperatureMovingSec' |
    'mav2LocationParkedOnSec' | 'mav2TemperatureParkedOnSec' |
    'mav2LocationParkedOffSec' | 'mav2TemperatureParkedOffSec'>,
  latest: Telemetry | null,
  location: Telemetry | null,
  temperature: Telemetry | null
) {
  const movement =
    String(location?.movementStatus || '')
      .toUpperCase()

  const expectedTelemetryIntervalSec =
    asset.trackingSource === 'MAV2'
      ? movement === 'PARKED'
        ? latest?.reeferPower === true
          ? Math.min(
              asset.mav2LocationParkedOnSec,
              asset.mav2TemperatureParkedOnSec
            )
          : Math.min(
              asset.mav2LocationParkedOffSec,
              asset.mav2TemperatureParkedOffSec
            )
        : Math.min(
            asset.mav2LocationMovingSec,
            asset.mav2TemperatureMovingSec
          )
      : null

  return {
    ...latest,
    deviceId: asset.deviceId,
    trackingSource: asset.trackingSource,
    trackingActive: asset.trackingActive,
    trackingStartedAt: asset.trackingStartedAt,
    trackingStoppedAt: asset.trackingStoppedAt,
    lastHeartbeatAt: asset.lastHeartbeatAt,
    lastPhoneGpsAt: asset.lastPhoneGpsAt,
    expectedTelemetryIntervalSec,
    receivedAt: latest?.receivedAt ?? null,
    reeferPower: latest?.reeferPower ?? null,
    powerSource: latest?.powerSource ?? null,
    // Coordinates and their timestamp always belong to the same complete fix.
    latitude: location?.latitude ?? null,
    longitude: location?.longitude ?? null,
    altitude: location?.altitude ?? null,
    speedKph: location?.speedKph ?? null,
    movementStatus: location?.movementStatus ?? null,
    hasCurrentGps: latest != null && location != null && latest.id === location.id,
    locationReceivedAt: location ? location.recordedAt ?? location.receivedAt : null,
    // Keep the last valid temperature without presenting it as a fresh reading.
    temperature: temperature?.temperature ?? null,
    hasCurrentTemperature: latest != null && temperature != null && latest.id === temperature.id,
    temperatureRecordedAt: temperature ? temperature.recordedAt ?? temperature.receivedAt : null
  }
}

export async function loadTelemetryViews(prisma: PrismaClient, assets: Asset[]) {
  if (assets.length === 0) return {}
  const ids = Prisma.join(assets.map(asset => asset.id))
  // DISTINCT ON runs in PostgreSQL: three bounded result sets for the whole fleet.
  const [latest, locations, temperatures] = await Promise.all([
    prisma.$queryRaw<Telemetry[]>(Prisma.sql`
      SELECT DISTINCT ON ("assetId") * FROM "Telemetry"
      WHERE "assetId" IN (${ids}) AND "isBackfill" = false
      ORDER BY "assetId", "receivedAt" DESC, "id" DESC
    `),
    prisma.$queryRaw<Telemetry[]>(Prisma.sql`
      SELECT DISTINCT ON ("assetId") * FROM "Telemetry"
      WHERE "assetId" IN (${ids}) AND "isBackfill" = false
        AND "latitude" IS NOT NULL AND "longitude" IS NOT NULL
      ORDER BY "assetId", COALESCE("recordedAt", "receivedAt") DESC, "receivedAt" DESC, "id" DESC
    `),
    prisma.$queryRaw<Telemetry[]>(Prisma.sql`
      SELECT DISTINCT ON ("assetId") * FROM "Telemetry"
      WHERE "assetId" IN (${ids}) AND "isBackfill" = false AND "temperature" IS NOT NULL
      ORDER BY "assetId", COALESCE("recordedAt", "receivedAt") DESC, "receivedAt" DESC, "id" DESC
    `)
  ])
  const byAsset = (rows: Telemetry[]) => new Map(rows.map(row => [row.assetId, row]))
  const live = byAsset(latest), gps = byAsset(locations), temp = byAsset(temperatures)
  return Object.fromEntries(assets.map(asset => [
    asset.deviceId,
    buildTelemetryView(asset, live.get(asset.id) ?? null, gps.get(asset.id) ?? null, temp.get(asset.id) ?? null)
  ]))
}
