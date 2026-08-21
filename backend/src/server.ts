import express, {
  type Request,
  type Response,
  type NextFunction
} from 'express'

import cors from 'cors'
import dotenv from 'dotenv'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

import { PrismaClient } from './generated/prisma/client.js'
import { PrismaPg } from '@prisma/adapter-pg'

dotenv.config()

// =====================================================
// PRISMA
// =====================================================

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL
})

const prisma = new PrismaClient({
  adapter
})

// =====================================================
// EXPRESS
// =====================================================

const app = express()

const PORT =
  process.env.PORT || 3000

app.use(cors())

app.use(
  express.json()
)

// =====================================================
// JWT
// =====================================================

const JWT_SECRET =
  process.env.JWT_SECRET || ''

if (!JWT_SECRET) {
  throw new Error(
    'JWT_SECRET is not configured'
  )
}

// =====================================================
// USUARIO AUTENTICADO
// =====================================================

type AuthenticatedRequest = Request & {
  user?: {
    userId: number
    email: string
    role: string
    companyId: number
  }
}


// =====================================================
// MIDDLEWARE DE AUTENTICACION
// =====================================================

function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader =
    req.headers.authorization

  if (
    !authHeader ||
    !authHeader.startsWith('Bearer ')
  ) {
    return res.status(401).json({
      ok: false,
      message: 'Authentication required'
    })
  }

  const token =
    authHeader.substring(7)

  try {
    const decoded =
      jwt.verify(
        token,
        JWT_SECRET
      ) as {
        userId: number
        email: string
        role: string
        companyId: number
      }

    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      companyId: decoded.companyId
    }

    next()

  } catch {
    return res.status(401).json({
      ok: false,
      message: 'Invalid or expired session'
    })
  }
}

// =====================================================
// CREAR PRIMER USUARIO ADMIN
// =====================================================

async function ensureAdminUser() {
  const email =
    process.env.ADMIN_EMAIL
      ?.trim()
      .toLowerCase()

  const password =
    process.env.ADMIN_PASSWORD

  if (!email || !password) {
    console.log(
      'ADMIN_EMAIL or ADMIN_PASSWORD not configured.'
    )

    return
  }

  // =====================================
  // CREAR COMPAÑIA INICIAL
  // =====================================

  const company =
    await prisma.company.upsert({
      where: {
        slug: 'maverick-demo'
      },

      update: {
        active: true
      },

      create: {
        name: 'Maverick Demo Company',
        slug: 'maverick-demo',
        active: true
      }
    })

  console.log(
    `Company ready: ${company.name}`
  )


  // =====================================
  // CREAR ASSET TRAILER-001
  // =====================================

  const asset =
    await prisma.asset.upsert({
      where: {
        deviceId: 'TRAILER-001'
      },

      update: {
        companyId: company.id,
        active: true
      },

      create: {
        deviceId: 'TRAILER-001',
        name: 'TRAILER-001',
        description:
          'Maverick tracking unit',
        companyId: company.id
      }
    })

  console.log(
    `Asset ready: ${asset.deviceId}`
  )


  // =====================================
  // CREAR ASSET TRAILER-002
  // =====================================

  const asset2 =
    await prisma.asset.upsert({
      where: {
        deviceId: 'TRAILER-002'
      },

      update: {
        companyId: company.id,
        active: true
      },

      create: {
        deviceId: 'TRAILER-002',
        name: 'TRAILER-002',
        description:
          'Maverick T-SIM7670G-S3 tracking unit',
        companyId: company.id,
        active: true
      }
    })

  console.log(
    `Asset ready: ${asset2.deviceId}`
  )


  // =====================================
  // CREAR ADMIN
  // =====================================

  const existingUser =
    await prisma.user.findUnique({
      where: {
        email
      }
    })

  if (existingUser) {

    await prisma.user.update({
      where: {
        id: existingUser.id
      },

      data: {
        companyId: company.id,
        role: 'company_admin',
        active: true
      }
    })

    console.log(
      `Admin user ready: ${email}`
    )

    return
  }


  const passwordHash =
    await bcrypt.hash(
      password,
      12
    )


  await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: 'Maverick Admin',
      role: 'company_admin',
      active: true,
      companyId: company.id
    }
  })


  console.log(
    `Admin user created: ${email}`
  )
}

// =====================================================
// ROOT
// =====================================================

app.get(
  '/',
  (_req, res) => {

    res.json({
      name: 'Maverick API',
      status: 'online'
    })
  }
)

// =====================================================
// HEALTH
// =====================================================

app.get(
  '/health',
  (_req, res) => {

    res.json({
      ok: true,
      service: 'maverick-backend'
    })
  }
)

// =====================================================
// LOGIN
// =====================================================

app.post(
  '/api/auth/login',
  async (req, res) => {

    try {
      const {
        email,
        password
      } = req.body

      // ---------------------------------
      // VALIDAR CAMPOS
      // ---------------------------------

      if (
        typeof email !== 'string' ||
        typeof password !== 'string' ||
        !email.trim() ||
        !password
      ) {
        return res.status(400).json({
          ok: false,
          message:
            'Email and password are required'
        })
      }

      // ---------------------------------
      // BUSCAR USUARIO
      // ---------------------------------

      const user =
        await prisma.user.findUnique({
          where: {
            email:
              email
                .trim()
                .toLowerCase()
          }
        })

      if (!user) {
        return res.status(401).json({
          ok: false,
          message:
            'Invalid email or password'
        })
      }

      // ---------------------------------
      // VALIDAR PASSWORD
      // ---------------------------------

      const validPassword =
        await bcrypt.compare(
          password,
          user.passwordHash
        )

      if (!validPassword) {
        return res.status(401).json({
          ok: false,
          message:
            'Invalid email or password'
        })
      }

      // ---------------------------------
      // CREAR JWT
      // ---------------------------------

      const token =
  jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId
    },
    JWT_SECRET,
    {
      expiresIn: '7d'
    }
  )
      // ---------------------------------
      // RESPUESTA
      // ---------------------------------
return res.json({
  ok: true,

  token,

  user: {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    companyId: user.companyId
  }
})

} catch (error) {

  console.error(
    'Login error:',
    error
  )

  return res.status(500).json({
    ok: false,
    message: 'Login service error'
  })
}
}
)

// =====================================================
// VALIDAR SESION
// =====================================================

app.get(
  '/api/auth/me',
  async (req, res) => {

    try {
      const authHeader =
        req.headers.authorization

      if (
        !authHeader ||
        !authHeader.startsWith(
          'Bearer '
        )
      ) {
        return res.status(401).json({
          ok: false,
          message:
            'Authentication required'
        })
      }

      const token =
        authHeader.substring(7)

      const decoded =
  jwt.verify(
    token,
    JWT_SECRET
  ) as {
    userId: number
    email: string
    role: string
    companyId: number
  }

      const user =
        await prisma.user.findUnique({
          where: {
            id: decoded.userId
          },

          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            companyId: true,
            createdAt: true
          }
        })

      if (!user) {
        return res.status(401).json({
          ok: false,
          message:
            'User not found'
        })
      }

      return res.json({
        ok: true,
        user
      })

    } catch {

      return res.status(401).json({
        ok: false,
        message:
          'Invalid or expired session'
      })
    }
  }
)

app.get(
  '/api/assets',
  requireAuth,
  async (
    req: AuthenticatedRequest,
    res: Response
  ) => {
    try {
      const companyId =
        req.user?.companyId

      if (!companyId) {
        return res.status(401).json({
          ok: false,
          message: 'Invalid session'
        })
      }

      const assets =
        await prisma.asset.findMany({
          where: {
            companyId,
            active: true
          },
          orderBy: {
            name: 'asc'
          },
          select: {
            id: true,
            deviceId: true,
            name: true,
            description: true,
            active: true,
            temperatureMinC: true,
            temperatureMaxC: true,
            temperatureAlertsEnabled: true,
            createdAt: true,
            updatedAt: true
          }
        })

      return res.json({
        ok: true,
        assets
      })
    } catch (error) {
      console.error(
        'Get assets error:',
        error
      )

      return res.status(500).json({
        ok: false,
        message:
          'Unable to load assets'
      })
    }
  }
)

// =====================================================
// EDITAR ASSET / LIMITES DE TEMPERATURA
// =====================================================

app.patch(
  '/api/assets/:id',
  requireAuth,
  async (
    req: AuthenticatedRequest,
    res: Response
  ) => {
    try {
      const companyId =
        req.user?.companyId

      const role =
        req.user?.role

      if (!companyId) {
        return res.status(401).json({
          ok: false,
          message: 'Invalid session'
        })
      }

      if (
        role !== 'company_admin' &&
        role !== 'superadmin'
      ) {
        return res.status(403).json({
          ok: false,
          message:
            'You do not have permission to edit assets'
        })
      }

      const assetId =
        Number(req.params.id)

      if (!Number.isInteger(assetId)) {
        return res.status(400).json({
          ok: false,
          message: 'Invalid asset ID'
        })
      }

      const asset =
        await prisma.asset.findFirst({
          where: {
            id: assetId,
            companyId
          }
        })

      if (!asset) {
        return res.status(404).json({
          ok: false,
          message: 'Asset not found'
        })
      }

      const data: {
        name?: string
        temperatureMinC?: number | null
        temperatureMaxC?: number | null
        temperatureAlertsEnabled?: boolean
      } = {}

      // ---------------------------------
      // NOMBRE
      // ---------------------------------

      if (req.body?.name !== undefined) {
        const name =
          typeof req.body.name === 'string'
            ? req.body.name.trim()
            : ''

        if (
          name.length < 2 ||
          name.length > 80
        ) {
          return res.status(400).json({
            ok: false,
            message:
              'Asset name must be between 2 and 80 characters'
          })
        }

        data.name = name
      }

      // ---------------------------------
      // TEMPERATURA MINIMA
      // ---------------------------------

      if (
        req.body?.temperatureMinC !==
        undefined
      ) {
        const value =
          req.body.temperatureMinC

        if (value === null) {
          data.temperatureMinC = null
        } else {
          const parsed =
            Number(value)

          if (!Number.isFinite(parsed)) {
            return res.status(400).json({
              ok: false,
              message:
                'Invalid minimum temperature'
            })
          }

          data.temperatureMinC = parsed
        }
      }

      // ---------------------------------
      // TEMPERATURA MAXIMA
      // ---------------------------------

      if (
        req.body?.temperatureMaxC !==
        undefined
      ) {
        const value =
          req.body.temperatureMaxC

        if (value === null) {
          data.temperatureMaxC = null
        } else {
          const parsed =
            Number(value)

          if (!Number.isFinite(parsed)) {
            return res.status(400).json({
              ok: false,
              message:
                'Invalid maximum temperature'
            })
          }

          data.temperatureMaxC = parsed
        }
      }

      // ---------------------------------
      // ACTIVAR / DESACTIVAR ALERTAS
      // ---------------------------------

      if (
        req.body
          ?.temperatureAlertsEnabled !==
        undefined
      ) {
        if (
          typeof req.body
            .temperatureAlertsEnabled !==
          'boolean'
        ) {
          return res.status(400).json({
            ok: false,
            message:
              'Invalid temperature alert setting'
          })
        }

        data.temperatureAlertsEnabled =
          req.body
            .temperatureAlertsEnabled
      }

      // ---------------------------------
      // VALIDAR LIMITES FINALES
      // ---------------------------------

      const finalMin =
        data.temperatureMinC !== undefined
          ? data.temperatureMinC
          : asset.temperatureMinC

      const finalMax =
        data.temperatureMaxC !== undefined
          ? data.temperatureMaxC
          : asset.temperatureMaxC

      if (
        finalMin !== null &&
        finalMax !== null &&
        finalMin !== undefined &&
        finalMax !== undefined &&
        finalMin >= finalMax
      ) {
        return res.status(400).json({
          ok: false,
          message:
            'Minimum temperature must be lower than maximum temperature'
        })
      }

      if (
        data.temperatureAlertsEnabled === true &&
        (finalMin === null ||
          finalMin === undefined ||
          finalMax === null ||
          finalMax === undefined)
      ) {
        return res.status(400).json({
          ok: false,
          message:
            'Set minimum and maximum temperatures before enabling alerts'
        })
      }

      if (
        Object.keys(data).length === 0
      ) {
        return res.status(400).json({
          ok: false,
          message:
            'No valid fields to update'
        })
      }

      const updatedAsset =
        await prisma.asset.update({
          where: {
            id: asset.id
          },
          data,
          select: {
            id: true,
            deviceId: true,
            name: true,
            description: true,
            active: true,
            temperatureMinC: true,
            temperatureMaxC: true,
            temperatureAlertsEnabled: true,
            createdAt: true,
            updatedAt: true
          }
        })

      return res.json({
        ok: true,
        asset: updatedAsset
      })

    } catch (error) {
      console.error(
        'Update asset error:',
        error
      )

      return res.status(500).json({
        ok: false,
        message:
          'Unable to update asset'
      })
    }
  }
)

// =====================================================
// RECIBIR TELEMETRIA
// =====================================================

app.post(
  '/api/telemetry',
  async (req, res) => {

    try {
      const {
        deviceId,
        temperature,
        latitude,
        longitude,
        altitude,
        speedKph,
        movementStatus,
        recordedAt,
        isBackfill
      } = req.body

      // ---------------------------------
      // VALIDACION BASICA
      // ---------------------------------

      if (
        typeof deviceId !== 'string' ||
        typeof temperature !== 'number'
      ) {
        return res.status(400).json({
          ok: false,
          message:
            'Invalid telemetry data'
        })
      }

      // ---------------------------------
      // GPS SEGURO
      // ---------------------------------

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

      const safeSpeedKph =
        typeof speedKph === 'number' &&
        Number.isFinite(speedKph)
          ? Math.max(0, speedKph)
          : null

      const safeMovementStatus =
        typeof movementStatus === 'string' &&
        movementStatus.trim().length > 0
          ? movementStatus
              .trim()
              .toUpperCase()
          : null

      const safeIsBackfill =
        isBackfill === true

      let safeRecordedAt:
        Date | null = null

      if (
        typeof recordedAt === 'string' &&
        recordedAt.trim().length > 0
      ) {
        const parsedRecordedAt =
          new Date(recordedAt)

        if (
          !Number.isNaN(
            parsedRecordedAt.getTime()
          )
        ) {
          safeRecordedAt =
            parsedRecordedAt
        }
      }

      // ---------------------------------
      // GUARDAR
      // ---------------------------------
      
      const asset =
  await prisma.asset.findUnique({
    where: {
      deviceId
    }
  })

      await prisma.telemetry.create({
  data: {
    deviceId,
    temperature,

    latitude:
      safeLatitude,

    longitude:
      safeLongitude,

    altitude:
      safeAltitude,

    speedKph:
      safeSpeedKph,

    movementStatus:
      safeMovementStatus,

    recordedAt:
      safeRecordedAt,

    isBackfill:
      safeIsBackfill,

    assetId:
      asset?.id ?? null
  }
})

      // ---------------------------------
      // LOG EN FAHRENHEIT
      // ---------------------------------

      const temperatureF =
        (
          temperature *
          9
        ) /
        5 +
        32

      console.log(
        'Telemetry received:',
        {
          deviceId,

          temperatureF:
            Number(
              temperatureF.toFixed(
                1
              )
            ),

          latitude:
            safeLatitude,

          longitude:
            safeLongitude,

          altitude:
            safeAltitude,

          speedKph:
            safeSpeedKph,

          movementStatus:
            safeMovementStatus,

          recordedAt:
            safeRecordedAt
              ?.toISOString() ??
            null,

          isBackfill:
            safeIsBackfill
        }
      )

      return res.json({
        ok: true,
        message:
          'Telemetry received'
      })

    } catch (error) {

      console.error(
        'Telemetry error:',
        error
      )

      return res.status(500).json({
        ok: false,
        message:
          'Database error'
      })
    }
  }
)

// =====================================================
// ULTIMA TELEMETRIA POR ASSET
// =====================================================

app.get(
  '/api/telemetry/latest',
  requireAuth,
  async (
    req: AuthenticatedRequest,
    res: Response
  ) => {
    try {
      const companyId =
        req.user?.companyId

      if (!companyId) {
        return res.status(401).json({
          ok: false,
          message: 'Invalid session'
        })
      }

      const requestedDeviceId =
        typeof req.query.deviceId === 'string'
          ? req.query.deviceId.trim()
          : ''

      const companyAssets =
        await prisma.asset.findMany({
          where: {
            companyId,
            active: true
          },
          select: {
            id: true,
            deviceId: true,
            name: true
          }
        })

      if (companyAssets.length === 0) {
        return res.status(404).json({
          ok: false,
          message: 'No assets assigned to this company'
        })
      }

      // If deviceId is present, it MUST belong to the authenticated company.
      // Keeping the query optional preserves compatibility while the new
      // frontend and backend are deployed one after the other.
      const requestedAsset =
        requestedDeviceId
          ? companyAssets.find(
              (asset) =>
                asset.deviceId === requestedDeviceId
            )
          : null

      if (
        requestedDeviceId &&
        !requestedAsset
      ) {
        return res.status(404).json({
          ok: false,
          message: 'Asset not found'
        })
      }

      const targetAssetIds =
        requestedAsset
          ? [requestedAsset.id]
          : companyAssets.map(
              (asset) => asset.id
            )

      // Current state must never come from SD/backfill history.
      const latestTelemetry =
        await prisma.telemetry.findFirst({
          where: {
            assetId: {
              in: targetAssetIds
            },
            isBackfill: false
          },
          orderBy: {
            receivedAt: 'desc'
          }
        })

      if (!latestTelemetry) {
        return res.status(404).json({
          ok: false,
          message: requestedDeviceId
            ? 'No telemetry available for this asset'
            : 'No telemetry available'
        })
      }

      // Important in a multi-asset account:
      // last-known GPS must come from the SAME asset as latestTelemetry.
      const latestAssetId =
        latestTelemetry.assetId

      const latestLocation =
        latestAssetId == null
          ? null
          : await prisma.telemetry.findFirst({
              where: {
                assetId: latestAssetId,
                isBackfill: false,
                latitude: {
                  not: null
                },
                longitude: {
                  not: null
                },
                recordedAt: {
                  not: null
                }
              },
              orderBy: [
                {
                  recordedAt: 'desc'
                },
                {
                  receivedAt: 'desc'
                }
              ]
            })

      const hasCurrentGps =
        latestTelemetry.latitude !== null &&
        latestTelemetry.longitude !== null &&
        latestTelemetry.recordedAt !== null

      const responseAsset =
        companyAssets.find(
          (asset) =>
            asset.id === latestTelemetry.assetId
        ) ?? requestedAsset

      return res.json({
        ok: true,
        asset: responseAsset ?? null,
        telemetry: {
          ...latestTelemetry,
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
          hasCurrentGps,
          locationReceivedAt:
            latestLocation?.recordedAt ??
            null
        }
      })
    } catch (error) {
      console.error(
        'Error loading latest telemetry:',
        error
      )

      return res.status(500).json({
        ok: false,
        message: 'Database error'
      })
    }
  }
)

// =====================================================
// HISTORIAL GPS / RECORRIDOS
// =====================================================

app.get(
  '/api/telemetry/history',
  requireAuth,
  async (
    req: AuthenticatedRequest,
    res: Response
  ) => {
    try {
      const companyId =
        req.user?.companyId

      if (!companyId) {
        return res.status(401).json({
          ok: false,
          message: 'Invalid session'
        })
      }

      const deviceId =
        typeof req.query.deviceId ===
          'string'
          ? req.query.deviceId.trim()
          : ''

      if (!deviceId) {
        return res.status(400).json({
          ok: false,
          message:
            'deviceId is required'
        })
      }

      const asset =
        await prisma.asset.findFirst({
          where: {
            companyId,
            deviceId,
            active: true
          },
          select: {
            id: true,
            deviceId: true,
            name: true
          }
        })

      if (!asset) {
        return res.status(404).json({
          ok: false,
          message:
            'Asset not found'
        })
      }

      const now =
        new Date()

      const defaultFrom =
        new Date(
          now.getTime() -
          24 * 60 * 60 * 1000
        )

      const from =
        typeof req.query.from ===
          'string'
          ? new Date(req.query.from)
          : defaultFrom

      const to =
        typeof req.query.to ===
          'string'
          ? new Date(req.query.to)
          : now

      if (
        Number.isNaN(from.getTime()) ||
        Number.isNaN(to.getTime()) ||
        from > to
      ) {
        return res.status(400).json({
          ok: false,
          message:
            'Invalid history date range'
        })
      }

      const maxWindowMs =
        31 * 24 * 60 * 60 * 1000

      if (
        to.getTime() -
        from.getTime() >
        maxWindowMs
      ) {
        return res.status(400).json({
          ok: false,
          message:
            'History range cannot exceed 31 days'
        })
      }

      const rows =
        await prisma.telemetry.findMany({
          where: {
            assetId: asset.id,
            OR: [
              {
                recordedAt: {
                  gte: from,
                  lte: to
                }
              },
              {
                recordedAt: null,
                receivedAt: {
                  gte: from,
                  lte: to
                }
              }
            ]
          },
          select: {
            id: true,
            temperature: true,
            latitude: true,
            longitude: true,
            altitude: true,
            speedKph: true,
            movementStatus: true,
            recordedAt: true,
            receivedAt: true,
            isBackfill: true
          },
          take: 50000
        })

      const points =
        rows
          .map((row) => ({
            id: row.id,
            temperature:
              row.temperature,
            latitude:
              row.latitude,
            longitude:
              row.longitude,
            altitude:
              row.altitude,
            speedKph:
              row.speedKph,
            movementStatus:
              row.movementStatus,
            isBackfill:
              row.isBackfill,
            timestamp:
              (
                row.recordedAt ??
                row.receivedAt
              ).toISOString()
          }))
          .sort(
            (a, b) =>
              new Date(
                a.timestamp
              ).getTime() -
              new Date(
                b.timestamp
              ).getTime()
          )

      return res.json({
        ok: true,
        asset,
        range: {
          from:
            from.toISOString(),
          to:
            to.toISOString()
        },
        points
      })
    } catch (error) {
      console.error(
        'History error:',
        error
      )

      return res.status(500).json({
        ok: false,
        message:
          'Unable to load trip history'
      })
    }
  }
)



// =====================================================
// ROAD MATCHING (OSRM)
// =====================================================

type RoadMatchInputPoint = {
  latitude: number
  longitude: number
  timestamp?: string | null
}

type RoadMatchInputTrack = {
  id: string
  points: RoadMatchInputPoint[]
}

const OSRM_BASE =
  process.env.OSRM_BASE_URL ||
  'https://router.project-osrm.org'

function metersBetween(
  a: RoadMatchInputPoint,
  b: RoadMatchInputPoint
) {
  const toRad = (value: number) =>
    value * Math.PI / 180

  const earthRadius = 6371000
  const dLat = toRad(b.latitude - a.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const lat1 = toRad(a.latitude)
  const lat2 = toRad(b.latitude)

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLon / 2) ** 2

  return earthRadius *
    2 *
    Math.atan2(
      Math.sqrt(h),
      Math.sqrt(1 - h)
    )
}

function cleanRoadTrack(
  points: RoadMatchInputPoint[]
) {
  const sorted = [...points]
    .filter((point) =>
      Number.isFinite(point.latitude) &&
      Number.isFinite(point.longitude) &&
      Math.abs(point.latitude) <= 90 &&
      Math.abs(point.longitude) <= 180
    )
    .sort((a, b) => {
      const ta = a.timestamp
        ? new Date(a.timestamp).getTime()
        : 0
      const tb = b.timestamp
        ? new Date(b.timestamp).getTime()
        : 0
      return ta - tb
    })

  const cleaned: RoadMatchInputPoint[] = []

  for (const point of sorted) {
    const previous = cleaned[cleaned.length - 1]

    if (
      previous &&
      metersBetween(previous, point) < 8
    ) {
      continue
    }

    cleaned.push(point)
  }

  return cleaned
}

function toMonotonicTimestamps(
  points: RoadMatchInputPoint[]
) {
  let previous = 0

  return points.map((point, index) => {
    const parsed = point.timestamp
      ? Math.floor(
          new Date(point.timestamp).getTime() /
            1000
        )
      : 0

    const candidate =
      Number.isFinite(parsed) && parsed > 0
        ? parsed
        : previous + 1 || index + 1

    const next = Math.max(
      candidate,
      previous + 1
    )

    previous = next
    return next
  })
}

async function osrmMatchChunk(
  points: RoadMatchInputPoint[]
) {
  if (points.length < 2) {
    return null
  }

  const coordinates = points
    .map(
      (point) =>
        `${point.longitude},${point.latitude}`
    )
    .join(';')

  const timestamps =
    toMonotonicTimestamps(points).join(';')

  const radiuses = points
    .map(() => '35')
    .join(';')

  const url =
    `${OSRM_BASE}/match/v1/driving/${coordinates}` +
    `?geometries=geojson&overview=full` +
    `&gaps=ignore&tidy=true` +
    `&timestamps=${timestamps}` +
    `&radiuses=${radiuses}`

  const response = await fetch(url)

  if (!response.ok) {
    return null
  }

  const data = await response.json() as any

  if (
    data?.code !== 'Ok' ||
    !Array.isArray(data?.matchings) ||
    data.matchings.length === 0
  ) {
    return null
  }

  const tracepoints =
    Array.isArray(data.tracepoints)
      ? data.tracepoints
      : []

  const matchedCount =
    tracepoints.filter(Boolean).length

  const coverage =
    points.length > 0
      ? matchedCount / points.length
      : 0

  const usefulMatchings =
    data.matchings.filter(
      (matching: any) =>
        matching?.geometry?.coordinates?.length > 1 &&
        Number(matching?.confidence ?? 0) >= 0.2
    )

  if (
    usefulMatchings.length === 0 ||
    coverage < 0.45
  ) {
    return null
  }

  const segments = usefulMatchings.map(
    (matching: any) =>
      matching.geometry.coordinates.map(
        ([longitude, latitude]: [number, number]) =>
          [latitude, longitude] as [number, number]
      )
  )

  const confidence =
    usefulMatchings.reduce(
      (total: number, matching: any) =>
        total + Number(matching.confidence ?? 0),
      0
    ) / usefulMatchings.length

  return {
    segments,
    source: 'match' as const,
    confidence,
    coverage
  }
}

async function osrmRouteChunk(
  points: RoadMatchInputPoint[]
) {
  if (points.length < 2) {
    return null
  }

  const coordinates = points
    .map(
      (point) =>
        `${point.longitude},${point.latitude}`
    )
    .join(';')

  const url =
    `${OSRM_BASE}/route/v1/driving/${coordinates}` +
    '?alternatives=false&steps=false' +
    '&geometries=geojson&overview=full'

  const response = await fetch(url)

  if (!response.ok) {
    return null
  }

  const data = await response.json() as any

  const coordinatesOut =
    data?.routes?.[0]?.geometry?.coordinates

  if (
    data?.code !== 'Ok' ||
    !Array.isArray(coordinatesOut) ||
    coordinatesOut.length < 2
  ) {
    return null
  }

  return {
    segments: [
      coordinatesOut.map(
        ([longitude, latitude]: [number, number]) =>
          [latitude, longitude] as [number, number]
      )
    ],
    source: 'route' as const,
    confidence: null,
    coverage: 1
  }
}

async function matchRoadTrack(
  track: RoadMatchInputTrack
) {
  const cleaned = cleanRoadTrack(track.points)

  if (cleaned.length < 2) {
    return {
      id: track.id,
      source: 'raw',
      confidence: null,
      coverage: 0,
      segments: [] as [number, number][][]
    }
  }

  const chunks: RoadMatchInputPoint[][] = []
  const chunkSize = 70
  const overlap = 1

  for (
    let start = 0;
    start < cleaned.length - 1;
    start += chunkSize - overlap
  ) {
    const chunk = cleaned.slice(
      start,
      start + chunkSize
    )

    if (chunk.length >= 2) {
      chunks.push(chunk)
    }
  }

  const segments: [number, number][][] = []
  const sources: string[] = []
  const confidences: number[] = []
  const coverages: number[] = []

  for (const chunk of chunks) {
    let result = null

    try {
      result = await osrmMatchChunk(chunk)
    } catch (error) {
      console.warn(
        'OSRM match failed, trying route fallback:',
        error
      )
    }

    if (!result) {
      try {
        result = await osrmRouteChunk(chunk)
      } catch (error) {
        console.warn(
          'OSRM route fallback failed:',
          error
        )
      }
    }

    if (!result) {
      continue
    }

    segments.push(...result.segments)
    sources.push(result.source)
    coverages.push(result.coverage)

    if (result.confidence != null) {
      confidences.push(result.confidence)
    }
  }

  return {
    id: track.id,
    source:
      sources.length === 0
        ? 'raw'
        : sources.every(
            (source) => source === 'match'
          )
          ? 'match'
          : 'road',
    confidence:
      confidences.length > 0
        ? confidences.reduce(
            (total, value) => total + value,
            0
          ) / confidences.length
        : null,
    coverage:
      coverages.length > 0
        ? coverages.reduce(
            (total, value) => total + value,
            0
          ) / coverages.length
        : 0,
    segments
  }
}

app.post(
  '/api/road-match',
  requireAuth,
  async (
    req: AuthenticatedRequest,
    res: Response
  ) => {
    try {
      const tracks =
        Array.isArray(req.body?.tracks)
          ? req.body.tracks
          : []

      if (
        tracks.length === 0 ||
        tracks.length > 20
      ) {
        return res.status(400).json({
          ok: false,
          message: 'Invalid road matching request'
        })
      }

      let totalPoints = 0

      const sanitizedTracks: RoadMatchInputTrack[] =
        tracks.map((track: any, index: number) => {
          const points =
            Array.isArray(track?.points)
              ? track.points
                  .slice(0, 1500)
                  .map((point: any) => ({
                    latitude: Number(point.latitude),
                    longitude: Number(point.longitude),
                    timestamp:
                      point.timestamp == null
                        ? null
                        : String(point.timestamp)
                  }))
              : []

          totalPoints += points.length

          return {
            id: String(track?.id ?? index),
            points
          }
        })

      if (totalPoints > 5000) {
        return res.status(400).json({
          ok: false,
          message: 'Too many GPS points for one request'
        })
      }

      const results = []

      // Keep calls sequential so the public OSRM service is not
      // flooded while Maverick is still in prototype/development.
      for (const track of sanitizedTracks) {
        results.push(
          await matchRoadTrack(track)
        )
      }

      return res.json({
        ok: true,
        tracks: results
      })
    } catch (error) {
      console.error(
        'Road matching error:',
        error
      )

      return res.status(502).json({
        ok: false,
        message: 'Road matching is temporarily unavailable'
      })
    }
  }
)


// =====================================================
// ARRANCAR SERVIDOR
// =====================================================

async function startServer() {

  try {

    await ensureAdminUser()

    app.listen(
      PORT,
      () => {

        console.log(
          `Maverick API running on port ${PORT}`
        )
      }
    )

  } catch (error) {

    console.error(
      'Maverick startup error:',
      error
    )

    process.exit(1)
  }
}

startServer()