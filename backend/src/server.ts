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
// ULTIMA TELEMETRIA
// =====================================================

app.get(
  '/api/telemetry/latest',
  requireAuth,
  async (req: AuthenticatedRequest, res) => {

    try {

      const companyId =
  req.user?.companyId

if (!companyId) {
  return res.status(401).json({
    ok: false,
    message: 'Invalid session'
  })
}

const companyAssets =
  await prisma.asset.findMany({
    where: {
      companyId,
      active: true
    },
    select: {
      id: true,
      deviceId: true
    }
  })

const assetIds =
  companyAssets.map(
    (asset) => asset.id
  )

if (assetIds.length === 0) {
  return res.status(404).json({
    ok: false,
    message: 'No assets assigned to this company'
  })
}

      // ---------------------------------
      // ULTIMA TELEMETRIA
      // ---------------------------------

      const latestTelemetry =
  await prisma.telemetry.findFirst({
    where: {
      assetId: {
        in: assetIds
      },

      // Una lectura reenviada desde SD es historial,
      // no el estado actual del trailer.
      isBackfill: false
    },
    orderBy: {
      receivedAt: 'desc'
    }
  })

      if (!latestTelemetry) {

        return res.status(404).json({
          ok: false,
          message:
            'No telemetry available'
        })
      }

      // ---------------------------------
      // ULTIMA UBICACION GPS VALIDA
      // ---------------------------------

      const latestLocation =
        await prisma.telemetry.findFirst({
          where: {
            assetId: {
              in: assetIds
            },

            // No usar reenvios historicos para mover
            // el marcador del mapa en tiempo real.
            isBackfill: false,

            latitude: {
              not: null
            },

            longitude: {
              not: null
            },

            // Solo ubicaciones con hora real capturada
            // por GNSS. Evita que datos viejos anteriores
            // a esta correccion parezcan ubicacion nueva.
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

      // ---------------------------------
      // GPS ACTUAL
      // ---------------------------------

      const hasCurrentGps =
        latestTelemetry.latitude !==
          null &&
        latestTelemetry.longitude !==
          null &&
        latestTelemetry.recordedAt !==
          null

      // ---------------------------------
      // RESPUESTA
      // ---------------------------------

      return res.json({
        ok: true,

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

          // Compatibilidad con el frontend actual:
          // conservamos el nombre locationReceivedAt,
          // pero ahora representa la hora REAL de captura GPS.
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
        message:
          'Database error'
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