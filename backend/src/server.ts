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

app.post('/api/telemetry', (req, res) => {
  const {
    deviceId,
    temperature,
    latitude,
    longitude,
    altitude
  } = req.body

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

app.listen(PORT, () => {
  console.log(`Maverick API running on http://localhost:${PORT}`)
})
