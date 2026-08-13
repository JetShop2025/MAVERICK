import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

dotenv.config()

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

app.post('/api/telemetry', (req, res) => {
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

  console.log('Telemetry received:', {
    deviceId,
    temperature,
    latitude,
    longitude,
    altitude
  })

  res.json({
    ok: true,
    message: 'Telemetry received'
  })
})

app.get('/api/telemetry/latest', (req, res) => {

  if (!latestTelemetry) {
    return res.status(404).json({
      ok: false,
      message: 'No telemetry available'
    });
  }

  res.json({
    ok: true,
    telemetry: latestTelemetry
  });
});

app.listen(PORT, () => {
  console.log(`Maverick API running on http://localhost:${PORT}`)
})
