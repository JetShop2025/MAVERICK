import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { PrismaClient } from './generated/prisma/client.js'
import { PrismaPg } from '@prisma/adapter-pg'

dotenv.config()

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL
})

const prisma = new PrismaClient({
  adapter
})
const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json())

app.get('/', (_req, res) => {
  res.json({
    name: 'Maverick API',
    status: 'online'
  })
})

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'maverick-backend'
  })
})

let latestTelemetry: any = null;

app.post('/api/telemetry', async (req, res) => {
  const {
    deviceId,
    temperature,
    latitude,
    longitude,
    altitude
  } = req.body

  const safeLatitude =
  typeof latitude === 'number'
    ? latitude
    : null

const safeLongitude =
  typeof longitude === 'number'
    ? longitude
    : null

const safeAltitude =
  typeof altitude === 'number'
    ? altitude
    : null

  latestTelemetry = {
  deviceId,
  temperature,
  latitude,
  longitude,
  altitude,
  receivedAt: new Date().toISOString()
};

await prisma.telemetry.create({
  data: {
    deviceId,
    temperature,
    latitude: safeLatitude,
    longitude: safeLongitude,
    altitude: safeAltitude
  }
})

const temperatureF =
  (temperature * 9) / 5 + 32

console.log('Telemetry received:', {
  deviceId,
  temperatureF: Number(
    temperatureF.toFixed(1)
  ),
  latitude: safeLatitude,
  longitude: safeLongitude,
  altitude: safeAltitude
})
res.json({
  ok: true,
  message: 'Telemetry received'
})
})

app.get('/api/telemetry/latest', async (_req, res) => {
  try {
    // Última telemetría recibida, tenga GPS o no
    const latestTelemetry =
      await prisma.telemetry.findFirst({
        orderBy: {
          receivedAt: 'desc'
        }
      })

    if (!latestTelemetry) {
      return res.status(404).json({
        ok: false,
        message: 'No telemetry available'
      })
    }

    // Última telemetría que SÍ tuvo ubicación GPS válida
    const latestLocation =
      await prisma.telemetry.findFirst({
        where: {
          latitude: {
            not: null
          },
          longitude: {
            not: null
          }
        },
        orderBy: {
          receivedAt: 'desc'
        }
      })

    const hasCurrentGps =
      latestTelemetry.latitude !== null &&
      latestTelemetry.longitude !== null

    res.json({
      ok: true,
      telemetry: {
        ...latestTelemetry,

        // Si la lectura actual no tiene GPS,
        // usamos la última ubicación conocida
        latitude:
          latestTelemetry.latitude ??
          latestLocation?.latitude ??
          null,

        longitude:
          latestTelemetry.longitude ??
          latestLocation?.longitude ??
          null,

        altitude:
          latestTelemetry.altitude ??
          latestLocation?.altitude ??
          null,

        // Nos permite saber si el GPS actual tiene fix
        hasCurrentGps,

        // Fecha de la última ubicación GPS válida
        locationReceivedAt:
          latestLocation?.receivedAt ?? null
      }
    })

  } catch (error) {
    console.error(
      'Error loading latest telemetry:',
      error
    )

    res.status(500).json({
      ok: false,
      message: 'Database error'
    })
  }
})

app.listen(PORT, () => {
  console.log(`Maverick API running on http://localhost:${PORT}`)
})
