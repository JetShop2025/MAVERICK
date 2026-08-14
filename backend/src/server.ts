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
    latitude,
    longitude,
    altitude
  }
})

const temperatureF =
  (temperature * 9) / 5 + 32

console.log('Telemetry received:', {
  deviceId,
  temperatureF: Number(
    temperatureF.toFixed(1)
  ),
  latitude,
  longitude,
  altitude
})

  res.json({
    ok: true,
    message: 'Telemetry received'
  })
})

app.get('/api/telemetry/latest', async (req, res) => {
  try {
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

    res.json({
      ok: true,
      telemetry: latestTelemetry
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
