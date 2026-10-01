import assert from 'node:assert/strict'
import test from 'node:test'
import { buildTelemetryView, loadTelemetryViews } from './telemetry-view.js'
import type { Asset, Telemetry, PrismaClient } from './generated/prisma/client.js'

const at = (minute: number) => new Date(Date.UTC(2026, 9, 1, 12, minute))
const asset = {
  id: 1, deviceId: 'TRAILER-001', trackingSource: 'MAV2',
  trackingActive: false, trackingStartedAt: null, trackingStoppedAt: null,
  lastHeartbeatAt: null, lastPhoneGpsAt: null
} as Asset
const row = (changes: Partial<Telemetry> = {}): Telemetry => ({
  id: 1, assetId: 1, deviceId: asset.deviceId, source: 'MAV2',
  latitude: 36.3, longitude: -121.2, altitude: 10, temperature: 2,
  speedKph: 0, movementStatus: 'PARKED', accuracyMeters: null, headingDegrees: null,
  batteryVoltage: 3.9, batteryPercent: 70, reeferPower: false, powerSource: 'BATTERY',
  recordedAt: at(0), receivedAt: at(1), isBackfill: false, ...changes
})

test('a late packet cannot replace newer coordinates or their capture time', () => {
  const latest = row({ id: 2, recordedAt: at(0), receivedAt: at(10), latitude: 35 })
  const gps = row({ id: 3, recordedAt: at(5), receivedAt: at(6), latitude: 37 })
  const view = buildTelemetryView(asset, latest, gps, gps)
  assert.equal(view.latitude, 37)
  assert.equal(view.locationReceivedAt, gps.recordedAt)
  assert.equal(view.receivedAt, latest.receivedAt)
  assert.equal(view.hasCurrentGps, false)
})

test('partial coordinates are never mixed with a previous fix', () => {
  const latest = row({ id: 2, latitude: 40, longitude: null, altitude: 99 })
  const gps = row()
  const view = buildTelemetryView(asset, latest, gps, gps)
  assert.equal(view.latitude, gps.latitude)
  assert.equal(view.longitude, gps.longitude)
  assert.equal(view.altitude, gps.altitude)
  assert.equal(view.hasCurrentGps, false)
})

test('GPS with no capture timestamp uses the reception time of that same fix', () => {
  const gps = row({ recordedAt: null, latitude: 0, longitude: 0 })
  const view = buildTelemetryView(asset, gps, gps, null)
  assert.equal(view.latitude, 0)
  assert.equal(view.longitude, 0)
  assert.equal(view.locationReceivedAt, gps.receivedAt)
  assert.equal(view.hasCurrentGps, true)
})

test('missing sensor readings preserve the last temperature and its original time', () => {
  const temp = row()
  const latest = row({ id: 2, temperature: null, receivedAt: at(10) })
  const view = buildTelemetryView(asset, latest, latest, temp)
  assert.equal(view.temperature, 2)
  assert.equal(view.temperatureRecordedAt, temp.recordedAt)
  assert.equal(view.hasCurrentTemperature, false)
  const empty = buildTelemetryView(asset, latest, latest, null)
  assert.equal(empty.temperature, null)
  assert.equal(empty.temperatureRecordedAt, null)
})

test('phone heartbeat/session metadata remains available before the first GPS fix', () => {
  const phone = { ...asset, trackingSource: 'PHONE', trackingActive: true, lastHeartbeatAt: at(2) }
  const view = buildTelemetryView(phone, null, null, null)
  assert.equal(view.trackingActive, true)
  assert.equal(view.lastHeartbeatAt, phone.lastHeartbeatAt)
  assert.equal(view.receivedAt, null)
  assert.equal(view.latitude, null)
})

test('fleet queries are bounded, parameterized, exclude backfill and retain asset isolation', async () => {
  const queries: Array<{ sql: string, values: unknown[] }> = []
  const results = [[row()], [row()], [row()]]
  const fake = { $queryRaw: async (query: { sql: string, values: unknown[] }) => {
    queries.push(query)
    return results[queries.length - 1]
  } } as unknown as PrismaClient
  const second = { ...asset, id: 2, deviceId: 'TRAILER-002' }
  const views = await loadTelemetryViews(fake, [asset, second])
  assert.equal(queries.length, 3)
  for (const query of queries) {
    assert.match(query.sql, /DISTINCT ON/)
    assert.match(query.sql, /"isBackfill" = false/)
    assert.deepEqual(query.values, [1, 2])
  }
  assert.equal(views[asset.deviceId]?.latitude, 36.3)
  assert.equal(views[second.deviceId]?.latitude, null)
  assert.deepEqual(await loadTelemetryViews(fake, []), {})
  assert.equal(queries.length, 3)
})
