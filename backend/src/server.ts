import express, {
  type Request,
  type Response,
  type NextFunction
} from 'express'

import cors from 'cors'
import dotenv from 'dotenv'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { randomBytes } from 'node:crypto'

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


const RESEND_API_KEY =
  process.env.RESEND_API_KEY?.trim() || ''

const EMAIL_FROM =
  process.env.EMAIL_FROM?.trim() ||
  'MAVTRACK LLC <tracking@mavtrackfleet.com>'

const PUBLIC_FRONTEND_URL =
  (
    process.env.PUBLIC_FRONTEND_URL?.trim() ||
    'https://mavtrackfleet.com'
  ).replace(/\/+$/, '')

const DEFAULT_NOTIFICATION_EMAIL =
  process.env.NOTIFICATION_EMAIL
    ?.trim()
    .toLowerCase() ||
  process.env.ADMIN_EMAIL
    ?.trim()
    .toLowerCase() ||
  ''

function escapeHtml(
  value: unknown
) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function uniqueEmails(
  values: Array<string | null | undefined>
) {
  return Array.from(
    new Set(
      values
        .flatMap(
          (value) =>
            typeof value === 'string'
              ? value
                  .split(/[;,]/)
                  .map((item) =>
                    item.trim().toLowerCase()
                  )
              : []
        )
        .filter((value) =>
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
            value
          )
        )
    )
  )
}

async function sendMaverickEmail({
  to,
  subject,
  html
}: {
  to: string[]
  subject: string
  html: string
}) {
  const recipients =
    uniqueEmails(to)

  if (
    recipients.length === 0 ||
    !RESEND_API_KEY
  ) {
    return {
      ok: false,
      skipped: true,
      recipients
    }
  }

  try {
    const response =
      await fetch(
        'https://api.resend.com/emails',
        {
          method: 'POST',
          headers: {
            Authorization:
              `Bearer ${RESEND_API_KEY}`,
            'Content-Type':
              'application/json'
          },
          body: JSON.stringify({
            from: EMAIL_FROM,
            to: recipients,
            subject,
            html
          })
        }
      )

    if (!response.ok) {
      console.error(
        'Email delivery failed:',
        response.status,
        await response.text()
      )

      return {
        ok: false,
        skipped: false,
        recipients
      }
    }

    return {
      ok: true,
      skipped: false,
      recipients
    }
  } catch (error) {
    console.error(
      'Email delivery error:',
      error
    )

    return {
      ok: false,
      skipped: false,
      recipients
    }
  }
}

async function createNotificationEvent({
  companyId,
  assetId = null,
  dispatchId = null,
  type,
  severity = 'info',
  title,
  message,
  recipients = [],
  emailSent = false
}: {
  companyId: number
  assetId?: number | null
  dispatchId?: number | null
  type: string
  severity?: string
  title: string
  message: string
  recipients?: string[]
  emailSent?: boolean
}) {
  return prisma.notificationEvent.create({
    data: {
      companyId,
      assetId,
      dispatchId,
      type,
      severity,
      title,
      message,
      emailRecipients:
        recipients.length > 0
          ? recipients.join(', ')
          : null,
      emailSent,
      emailedAt:
        emailSent
          ? new Date()
          : null
    }
  })
}

function dispatchStatusLabel(
  status: string
) {
  return status === 'ASSIGNED'
    ? 'Assigned'
    : status === 'EN_ROUTE_TO_PICKUP'
      ? 'En Route to Pickup'
      : status === 'AT_PICKUP'
        ? 'At Pickup'
        : status === 'LOADED'
          ? 'Loaded'
          : status === 'IN_TRANSIT'
            ? 'In Transit'
            : status === 'AT_DELIVERY'
              ? 'At Delivery'
              : status === 'DELIVERED'
                ? 'Delivered'
                : status === 'CANCELLED'
                  ? 'Cancelled'
                  : status
}

function classifyTemperature(
  temperatureC: number,
  minC: number,
  maxC: number
) {
  if (temperatureC < minC) {
    return 'LOW'
  }

  if (temperatureC > maxC) {
    return 'HIGH'
  }

  return 'NORMAL'
}

async function processTemperatureAlertTransition({
  asset,
  previousTemperatureC,
  currentTemperatureC
}: {
  asset: {
    id: number
    companyId: number
    deviceId: string
    name: string
    temperatureMinC: number | null
    temperatureMaxC: number | null
    temperatureAlertsEnabled: boolean
    temperatureAlertEmail: string | null
  }
  previousTemperatureC: number | null
  currentTemperatureC: number
}) {
  const activeDispatch =
    await prisma.dispatch.findFirst({
      where: {
        assetId: asset.id,
        companyId: asset.companyId,
        status: {
          notIn: [
            'DELIVERED',
            'CANCELLED'
          ]
        }
      },
      include: {
        shares: {
          where: {
            revokedAt: null,
            OR: [
              {
                expiresAt: null
              },
              {
                expiresAt: {
                  gt: new Date()
                }
              }
            ]
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    })

  const dispatchHasLimits =
    activeDispatch?.temperatureMinC != null &&
    activeDispatch?.temperatureMaxC != null

  const assetHasLimits =
    asset.temperatureAlertsEnabled &&
    asset.temperatureMinC != null &&
    asset.temperatureMaxC != null

  if (
    !dispatchHasLimits &&
    !assetHasLimits
  ) {
    return
  }

  const minC =
    Number(
      dispatchHasLimits
        ? activeDispatch!.temperatureMinC
        : asset.temperatureMinC
    )

  const maxC =
    Number(
      dispatchHasLimits
        ? activeDispatch!.temperatureMaxC
        : asset.temperatureMaxC
    )

  const currentState =
    classifyTemperature(
      currentTemperatureC,
      minC,
      maxC
    )

  const previousState =
    previousTemperatureC == null
      ? 'UNKNOWN'
      : classifyTemperature(
          previousTemperatureC,
          minC,
          maxC
        )

  if (
    currentState === previousState ||
    (
      currentState === 'NORMAL' &&
      previousState === 'UNKNOWN'
    )
  ) {
    return
  }

  const temperatureF =
    currentTemperatureC * 9 / 5 + 32

  const minF =
    minC * 9 / 5 + 32

  const maxF =
    maxC * 9 / 5 + 32

  const loadText =
    activeDispatch
      ? `Load ${activeDispatch.loadNumber}`
      : 'Asset temperature limits'

  const title =
    currentState === 'NORMAL'
      ? 'Temperature Restored'
      : currentState === 'HIGH'
        ? 'High Temperature Alert'
        : 'Low Temperature Alert'

  const message =
    currentState === 'NORMAL'
      ? `${asset.name} returned to the configured range (${minF.toFixed(1)}°F–${maxF.toFixed(1)}°F). Current temperature: ${temperatureF.toFixed(1)}°F.`
      : `${asset.name} is ${currentState === 'HIGH' ? 'above' : 'below'} the configured range (${minF.toFixed(1)}°F–${maxF.toFixed(1)}°F). Current temperature: ${temperatureF.toFixed(1)}°F. ${loadText}.`

  const recipients =
    uniqueEmails([
      asset.temperatureAlertEmail,
      DEFAULT_NOTIFICATION_EMAIL,
      ...(
        activeDispatch?.shares
          .map((share) =>
            share.customerEmail
          ) || []
      )
    ])

  const emailResult =
    await sendMaverickEmail({
      to: recipients,
      subject:
        `Maverick: ${title} — ${asset.name}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#0f172a">
          <h2>${escapeHtml(title)}</h2>
          <p>${escapeHtml(message)}</p>
          <table style="border-collapse:collapse;width:100%;margin:18px 0">
            <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0">Asset</td><td style="padding:8px;border-bottom:1px solid #e2e8f0"><strong>${escapeHtml(asset.name)}</strong></td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0">Device</td><td style="padding:8px;border-bottom:1px solid #e2e8f0">${escapeHtml(asset.deviceId)}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0">Current</td><td style="padding:8px;border-bottom:1px solid #e2e8f0">${temperatureF.toFixed(1)}°F</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0">Range</td><td style="padding:8px;border-bottom:1px solid #e2e8f0">${minF.toFixed(1)}°F – ${maxF.toFixed(1)}°F</td></tr>
          </table>
          <p style="color:#64748b;font-size:12px">Maverick Fleet Monitoring</p>
        </div>
      `
    })

  await createNotificationEvent({
    companyId: asset.companyId,
    assetId: asset.id,
    dispatchId:
      activeDispatch?.id ?? null,
    type:
      currentState === 'NORMAL'
        ? 'TEMPERATURE_RESTORED'
        : 'TEMPERATURE_ALERT',
    severity:
      currentState === 'NORMAL'
        ? 'success'
        : 'critical',
    title,
    message,
    recipients:
      emailResult.recipients,
    emailSent:
      emailResult.ok
  })
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


// =====================================================
// NOTIFICATIONS
// =====================================================

app.get(
  '/api/notifications',
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

      const notifications =
        await prisma.notificationEvent.findMany({
          where: {
            companyId
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 50
        })

      return res.json({
        ok: true,
        notifications
      })
    } catch (error) {
      console.error(
        'Get notifications error:',
        error
      )

      return res.status(500).json({
        ok: false,
        message:
          'Unable to load notifications'
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
            temperatureAlertEmail: true,
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
        temperatureAlertEmail?: string | null
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
      // EMAIL DE ALERTAS
      // ---------------------------------

      if (
        req.body?.temperatureAlertEmail !==
        undefined
      ) {
        const value =
          req.body.temperatureAlertEmail

        if (
          value === null ||
          (
            typeof value === 'string' &&
            value.trim() === ''
          )
        ) {
          data.temperatureAlertEmail = null
        } else if (
          typeof value === 'string' &&
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
            value.trim()
          )
        ) {
          data.temperatureAlertEmail =
            value.trim().toLowerCase()
        } else {
          return res.status(400).json({
            ok: false,
            message:
              'Enter a valid temperature alert email'
          })
        }
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
            temperatureAlertEmail: true,
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
// DISPATCH / OPERATIONS
// =====================================================

const DISPATCH_STATUSES = [
  'ASSIGNED',
  'EN_ROUTE_TO_PICKUP',
  'AT_PICKUP',
  'LOADED',
  'IN_TRANSIT',
  'AT_DELIVERY',
  'DELIVERED',
  'CANCELLED'
] as const

type DispatchStatusValue =
  typeof DISPATCH_STATUSES[number]

function isDispatchStatus(
  value: unknown
): value is DispatchStatusValue {
  return (
    typeof value === 'string' &&
    DISPATCH_STATUSES.includes(
      value as DispatchStatusValue
    )
  )
}

function optionalString(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0
    ? trimmed
    : null
}

function optionalNumber(value: unknown) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed)
    ? parsed
    : null
}

function optionalDate(value: unknown) {
  if (
    typeof value !== 'string' ||
    !value.trim()
  ) {
    return null
  }

  const parsed = new Date(value)

  return Number.isNaN(parsed.getTime())
    ? null
    : parsed
}

app.get(
  '/api/dispatches',
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

      const dispatches =
        await prisma.dispatch.findMany({
          where: {
            companyId
          },
          include: {
            asset: {
              select: {
                id: true,
                deviceId: true,
                name: true,
                active: true
              }
            },
            statusEvents: {
              orderBy: {
                createdAt: 'desc'
              },
              take: 20
            },
            shares: {
              where: {
                revokedAt: null
              },
              orderBy: {
                createdAt: 'desc'
              }
            }
          },
          orderBy: [
            {
              completedAt: 'asc'
            },
            {
              updatedAt: 'desc'
            }
          ]
        })

      return res.json({
        ok: true,
        dispatches
      })
    } catch (error) {
      console.error(
        'Get dispatches error:',
        error
      )

      return res.status(500).json({
        ok: false,
        message:
          'Unable to load dispatches'
      })
    }
  }
)

app.get(
  '/api/dispatches/:id',
  requireAuth,
  async (
    req: AuthenticatedRequest,
    res: Response
  ) => {
    try {
      const companyId =
        req.user?.companyId

      const dispatchId =
        Number(req.params.id)

      if (
        !companyId ||
        !Number.isInteger(dispatchId)
      ) {
        return res.status(400).json({
          ok: false,
          message: 'Invalid dispatch'
        })
      }

      const dispatch =
        await prisma.dispatch.findFirst({
          where: {
            id: dispatchId,
            companyId
          },
          include: {
            asset: true,
            statusEvents: {
              orderBy: {
                createdAt: 'desc'
              }
            },
            shares: {
              orderBy: {
                createdAt: 'desc'
              }
            }
          }
        })

      if (!dispatch) {
        return res.status(404).json({
          ok: false,
          message: 'Dispatch not found'
        })
      }

      return res.json({
        ok: true,
        dispatch
      })
    } catch (error) {
      console.error(
        'Get dispatch error:',
        error
      )

      return res.status(500).json({
        ok: false,
        message:
          'Unable to load dispatch'
      })
    }
  }
)

app.post(
  '/api/dispatches',
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

      const loadNumber =
        optionalString(
          req.body?.loadNumber
        )

      const pickupName =
        optionalString(
          req.body?.pickupName
        )

      const pickupAddress =
        optionalString(
          req.body?.pickupAddress
        )

      const deliveryName =
        optionalString(
          req.body?.deliveryName
        )

      const deliveryAddress =
        optionalString(
          req.body?.deliveryAddress
        )

      if (
        !loadNumber ||
        !pickupName ||
        !pickupAddress ||
        !deliveryName ||
        !deliveryAddress
      ) {
        return res.status(400).json({
          ok: false,
          message:
            'Load number, pickup and delivery are required'
        })
      }

      let assetId: number | null = null

      if (
        req.body?.assetId !== null &&
        req.body?.assetId !== undefined &&
        req.body?.assetId !== ''
      ) {
        const requestedAssetId =
          Number(req.body.assetId)

        if (
          !Number.isInteger(
            requestedAssetId
          )
        ) {
          return res.status(400).json({
            ok: false,
            message: 'Invalid asset'
          })
        }

        const asset =
          await prisma.asset.findFirst({
            where: {
              id: requestedAssetId,
              companyId,
              active: true
            }
          })

        if (!asset) {
          return res.status(404).json({
            ok: false,
            message: 'Asset not found'
          })
        }

        const conflicting =
          await prisma.dispatch.findFirst({
            where: {
              companyId,
              assetId: asset.id,
              status: {
                notIn: [
                  'DELIVERED',
                  'CANCELLED'
                ]
              }
            },
            select: {
              id: true,
              loadNumber: true
            }
          })

        if (conflicting) {
          return res.status(409).json({
            ok: false,
            message:
              `Asset is already assigned to ${conflicting.loadNumber}`
          })
        }

        assetId = asset.id
      }

      const requestedStatus =
        isDispatchStatus(
          req.body?.status
        )
          ? req.body.status
          : 'ASSIGNED'

      const temperatureSetpointC =
        optionalNumber(
          req.body?.temperatureSetpointC
        )

      const temperatureMinC =
        optionalNumber(
          req.body?.temperatureMinC
        )

      const temperatureMaxC =
        optionalNumber(
          req.body?.temperatureMaxC
        )

      if (
        temperatureMinC !== null &&
        temperatureMaxC !== null &&
        temperatureMinC >=
          temperatureMaxC
      ) {
        return res.status(400).json({
          ok: false,
          message:
            'Minimum temperature must be lower than maximum temperature'
        })
      }

      const dispatch =
        await prisma.dispatch.create({
          data: {
            companyId,
            assetId,
            loadNumber,
            status: requestedStatus,

            pickupName,
            pickupAddress,
            pickupLatitude:
              optionalNumber(
                req.body?.pickupLatitude
              ),
            pickupLongitude:
              optionalNumber(
                req.body?.pickupLongitude
              ),
            pickupScheduledAt:
              optionalDate(
                req.body?.pickupScheduledAt
              ),

            deliveryName,
            deliveryAddress,
            deliveryLatitude:
              optionalNumber(
                req.body?.deliveryLatitude
              ),
            deliveryLongitude:
              optionalNumber(
                req.body?.deliveryLongitude
              ),
            deliveryScheduledAt:
              optionalDate(
                req.body?.deliveryScheduledAt
              ),

            commodity:
              optionalString(
                req.body?.commodity
              ),
            referenceNumber:
              optionalString(
                req.body?.referenceNumber
              ),

            temperatureSetpointC,
            temperatureMinC,
            temperatureMaxC,

            notes:
              optionalString(
                req.body?.notes
              ),

            completedAt:
              requestedStatus === 'DELIVERED' ||
              requestedStatus === 'CANCELLED'
                ? new Date()
                : null,

            statusEvents: {
              create: {
                status:
                  requestedStatus,
                notes:
                  'Dispatch created'
              }
            }
          },
          include: {
            asset: true,
            statusEvents: {
              orderBy: {
                createdAt: 'desc'
              }
            },
            shares: {
              where: {
                revokedAt: null
              },
              orderBy: {
                createdAt: 'desc'
              }
            }
          }
        })

      return res.status(201).json({
        ok: true,
        dispatch
      })
    } catch (error: any) {
      console.error(
        'Create dispatch error:',
        error
      )

      if (
        error?.code === 'P2002'
      ) {
        return res.status(409).json({
          ok: false,
          message:
            'That load number already exists'
        })
      }

      return res.status(500).json({
        ok: false,
        message:
          'Unable to create dispatch'
      })
    }
  }
)

app.patch(
  '/api/dispatches/:id',
  requireAuth,
  async (
    req: AuthenticatedRequest,
    res: Response
  ) => {
    try {
      const companyId =
        req.user?.companyId

      const dispatchId =
        Number(req.params.id)

      if (
        !companyId ||
        !Number.isInteger(dispatchId)
      ) {
        return res.status(400).json({
          ok: false,
          message: 'Invalid dispatch'
        })
      }

      const existing =
        await prisma.dispatch.findFirst({
          where: {
            id: dispatchId,
            companyId
          }
        })

      if (!existing) {
        return res.status(404).json({
          ok: false,
          message: 'Dispatch not found'
        })
      }

      const data: Record<string, any> = {}

      if (
        req.body?.assetId !== undefined
      ) {
        if (
          req.body.assetId === null ||
          req.body.assetId === ''
        ) {
          data.assetId = null
        } else {
          const requestedAssetId =
            Number(req.body.assetId)

          if (
            !Number.isInteger(
              requestedAssetId
            )
          ) {
            return res.status(400).json({
              ok: false,
              message: 'Invalid asset'
            })
          }

          const asset =
            await prisma.asset.findFirst({
              where: {
                id: requestedAssetId,
                companyId,
                active: true
              }
            })

          if (!asset) {
            return res.status(404).json({
              ok: false,
              message: 'Asset not found'
            })
          }

          const conflicting =
            await prisma.dispatch.findFirst({
              where: {
                companyId,
                assetId: asset.id,
                id: {
                  not: dispatchId
                },
                status: {
                  notIn: [
                    'DELIVERED',
                    'CANCELLED'
                  ]
                }
              }
            })

          if (conflicting) {
            return res.status(409).json({
              ok: false,
              message:
                `Asset is already assigned to ${conflicting.loadNumber}`
            })
          }

          data.assetId = asset.id
        }
      }

      const stringFields = [
        'loadNumber',
        'pickupName',
        'pickupAddress',
        'deliveryName',
        'deliveryAddress',
        'commodity',
        'referenceNumber',
        'notes'
      ] as const

      for (const field of stringFields) {
        if (
          req.body?.[field] !== undefined
        ) {
          data[field] =
            optionalString(
              req.body[field]
            )
        }
      }

      const numberFields = [
        'pickupLatitude',
        'pickupLongitude',
        'deliveryLatitude',
        'deliveryLongitude',
        'temperatureSetpointC',
        'temperatureMinC',
        'temperatureMaxC'
      ] as const

      for (const field of numberFields) {
        if (
          req.body?.[field] !== undefined
        ) {
          data[field] =
            optionalNumber(
              req.body[field]
            )
        }
      }

      if (
        req.body?.pickupScheduledAt !==
        undefined
      ) {
        data.pickupScheduledAt =
          optionalDate(
            req.body.pickupScheduledAt
          )
      }

      if (
        req.body?.deliveryScheduledAt !==
        undefined
      ) {
        data.deliveryScheduledAt =
          optionalDate(
            req.body.deliveryScheduledAt
          )
      }

      const updated =
        await prisma.dispatch.update({
          where: {
            id: existing.id
          },
          data,
          include: {
            asset: true,
            statusEvents: {
              orderBy: {
                createdAt: 'desc'
              }
            },
            shares: {
              where: {
                revokedAt: null
              },
              orderBy: {
                createdAt: 'desc'
              }
            }
          }
        })

      return res.json({
        ok: true,
        dispatch: updated
      })
    } catch (error: any) {
      console.error(
        'Update dispatch error:',
        error
      )

      if (
        error?.code === 'P2002'
      ) {
        return res.status(409).json({
          ok: false,
          message:
            'That load number already exists'
        })
      }

      return res.status(500).json({
        ok: false,
        message:
          'Unable to update dispatch'
      })
    }
  }
)

app.post(
  '/api/dispatches/:id/status',
  requireAuth,
  async (
    req: AuthenticatedRequest,
    res: Response
  ) => {
    try {
      const companyId =
        req.user?.companyId

      const dispatchId =
        Number(req.params.id)

      const status =
        req.body?.status

      if (
        !companyId ||
        !Number.isInteger(dispatchId)
      ) {
        return res.status(400).json({
          ok: false,
          message: 'Invalid dispatch'
        })
      }

      if (!isDispatchStatus(status)) {
        return res.status(400).json({
          ok: false,
          message:
            'Invalid dispatch status'
        })
      }

      const existing =
        await prisma.dispatch.findFirst({
          where: {
            id: dispatchId,
            companyId
          }
        })

      if (!existing) {
        return res.status(404).json({
          ok: false,
          message: 'Dispatch not found'
        })
      }

      const updated =
        await prisma.dispatch.update({
          where: {
            id: existing.id
          },
          data: {
            status,
            completedAt:
              status === 'DELIVERED' ||
              status === 'CANCELLED'
                ? new Date()
                : null,
            statusEvents: {
              create: {
                status,
                notes:
                  optionalString(
                    req.body?.notes
                  )
              }
            }
          },
          include: {
            asset: true,
            statusEvents: {
              orderBy: {
                createdAt: 'desc'
              }
            },
            shares: {
              where: {
                revokedAt: null
              },
              orderBy: {
                createdAt: 'desc'
              }
            }
          }
        })

      if (
        existing.status !== status
      ) {
        const title =
          `Load ${updated.loadNumber}: ${dispatchStatusLabel(status)}`

        const message =
          `${updated.loadNumber} status changed from ${dispatchStatusLabel(existing.status)} to ${dispatchStatusLabel(status)}.`

        const activeShares =
          await prisma.dispatchShare.findMany({
            where: {
              dispatchId:
                updated.id,
              revokedAt: null,
              OR: [
                {
                  expiresAt: null
                },
                {
                  expiresAt: {
                    gt: new Date()
                  }
                }
              ]
            }
          })

        let anyEmailSent = false
        const emailRecipients: string[] = []

        for (
          const share of activeShares
        ) {
          const trackingUrl =
            `${PUBLIC_FRONTEND_URL}/track/${share.token}`

          const result =
            await sendMaverickEmail({
              to: [
                share.customerEmail
              ],
              subject:
                `Maverick: ${title}`,
              html: `
                <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#0f172a">
                  <h2>${escapeHtml(title)}</h2>
                  <p>${escapeHtml(message)}</p>
                  <p><strong>Pickup:</strong> ${escapeHtml(updated.pickupName)}</p>
                  <p><strong>Delivery:</strong> ${escapeHtml(updated.deliveryName)}</p>
                  <p style="margin:28px 0">
                    <a href="${trackingUrl}" style="display:inline-block;background:#2563eb;color:white;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">View Live Load</a>
                  </p>
                </div>
              `
            })

          anyEmailSent =
            anyEmailSent ||
            result.ok

          emailRecipients.push(
            ...result.recipients
          )
        }

        await createNotificationEvent({
          companyId,
          assetId:
            updated.assetId,
          dispatchId:
            updated.id,
          type:
            'DISPATCH_STATUS',
          severity:
            status === 'CANCELLED'
              ? 'warning'
              : status === 'DELIVERED'
                ? 'success'
                : 'info',
          title,
          message,
          recipients:
            uniqueEmails(
              emailRecipients
            ),
          emailSent:
            anyEmailSent
        })
      }

      return res.json({
        ok: true,
        dispatch: updated
      })
    } catch (error) {
      console.error(
        'Dispatch status error:',
        error
      )

      return res.status(500).json({
        ok: false,
        message:
          'Unable to update dispatch status'
      })
    }
  }
)



// =====================================================
// DISPATCH SHARING
// =====================================================

app.post(
  '/api/dispatches/:id/share',
  requireAuth,
  async (
    req: AuthenticatedRequest,
    res: Response
  ) => {
    try {
      const companyId =
        req.user?.companyId

      const dispatchId =
        Number(req.params.id)

      const customerEmail =
        optionalString(
          req.body?.customerEmail
        )?.toLowerCase()

      if (
        !companyId ||
        !Number.isInteger(dispatchId)
      ) {
        return res.status(400).json({
          ok: false,
          message: 'Invalid dispatch'
        })
      }

      if (
        !customerEmail ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
          customerEmail
        )
      ) {
        return res.status(400).json({
          ok: false,
          message:
            'Enter a valid customer email'
        })
      }

      const dispatch =
        await prisma.dispatch.findFirst({
          where: {
            id: dispatchId,
            companyId
          },
          include: {
            asset: true
          }
        })

      if (!dispatch) {
        return res.status(404).json({
          ok: false,
          message: 'Dispatch not found'
        })
      }

      const expirationDays =
        Number(req.body?.expirationDays)

      const safeExpirationDays =
        Number.isFinite(expirationDays)
          ? Math.max(
              1,
              Math.min(
                30,
                Math.round(expirationDays)
              )
            )
          : 7

      const token =
        randomBytes(32)
          .toString('hex')

      const share =
        await prisma.dispatchShare.create({
          data: {
            dispatchId:
              dispatch.id,
            token,
            customerName:
              optionalString(
                req.body?.customerName
              ),
            customerEmail,
            allowLocation:
              req.body?.allowLocation !== false,
            allowTemperature:
              req.body?.allowTemperature !== false,
            allowEta:
              req.body?.allowEta !== false,
            expiresAt:
              new Date(
                Date.now() +
                safeExpirationDays *
                24 *
                60 *
                60 *
                1000
              )
          }
        })

      const trackingUrl =
        `${PUBLIC_FRONTEND_URL}/track/${share.token}`

      const emailResult =
        await sendMaverickEmail({
          to: [
            customerEmail
          ],
          subject:
  `MAVTRACK LLC | Live Tracking for Load ${dispatch.loadNumber}`,

html: `
<!DOCTYPE html>
<html>
  <body style="
    margin:0;
    padding:0;
    background:#f3f6fa;
    font-family:Arial,Helvetica,sans-serif;
    color:#0f172a;
  ">

    <div style="
      display:none;
      max-height:0;
      overflow:hidden;
      opacity:0;
      color:transparent;
    ">
      Secure live shipment tracking for load ${escapeHtml(dispatch.loadNumber)}.
    </div>

    <table
      role="presentation"
      width="100%"
      cellspacing="0"
      cellpadding="0"
      border="0"
      style="background:#f3f6fa;padding:32px 12px;"
    >
      <tr>
        <td align="center">

          <table
            role="presentation"
            width="100%"
            cellspacing="0"
            cellpadding="0"
            border="0"
            style="
              max-width:680px;
              background:#ffffff;
              border-radius:16px;
              overflow:hidden;
              box-shadow:0 8px 30px rgba(15,23,42,0.08);
            "
          >

            <!-- HEADER -->
            <tr>
              <td style="
                background:#071426;
                padding:30px 36px;
              ">
                <div style="
                  font-size:24px;
                  font-weight:800;
                  letter-spacing:2px;
                  color:#ffffff;
                ">
                  MAVTRACK LLC
                </div>

                <div style="
                  margin-top:7px;
                  font-size:13px;
                  color:#94a3b8;
                  letter-spacing:0.5px;
                ">
                  SECURE SHIPMENT TRACKING
                </div>
              </td>
            </tr>

            <!-- INTRO -->
            <tr>
              <td style="padding:36px 36px 18px 36px;">

                <p style="
                  margin:0 0 10px 0;
                  font-size:15px;
                  color:#64748b;
                ">
                  Hello ${escapeHtml(share.customerName || 'Customer')},
                </p>

                <h1 style="
                  margin:0;
                  font-size:28px;
                  line-height:1.25;
                  color:#0f172a;
                ">
                  Your shipment is ready to track
                </h1>

                <p style="
                  margin:12px 0 0 0;
                  font-size:15px;
                  line-height:1.6;
                  color:#64748b;
                ">
                  MAVTRACK LLC has provided you secure access to the
                  live tracking information for this shipment.
                </p>

              </td>
            </tr>

            <!-- LOAD SUMMARY -->
            <tr>
              <td style="padding:12px 36px 6px 36px;">

                <table
                  role="presentation"
                  width="100%"
                  cellspacing="0"
                  cellpadding="0"
                  border="0"
                  style="
                    background:#f8fafc;
                    border:1px solid #e2e8f0;
                    border-radius:12px;
                  "
                >

                  <tr>
                    <td style="padding:22px 22px 8px 22px;">
                      <div style="
                        font-size:11px;
                        font-weight:700;
                        color:#64748b;
                        letter-spacing:1px;
                      ">
                        LOAD
                      </div>

                      <div style="
                        margin-top:5px;
                        font-size:26px;
                        font-weight:800;
                        color:#0f172a;
                      ">
                        ${escapeHtml(dispatch.loadNumber)}
                      </div>
                    </td>

                    <td
                      align="right"
                      style="padding:22px 22px 8px 22px;"
                    >
                      <span style="
                        display:inline-block;
                        padding:8px 14px;
                        border-radius:999px;
                        background:#dbeafe;
                        color:#1d4ed8;
                        font-size:12px;
                        font-weight:800;
                      ">
                        ${escapeHtml(
                          dispatchStatusLabel(
                            dispatch.status
                          )
                        )}
                      </span>
                    </td>
                  </tr>

                </table>

              </td>
            </tr>

            <!-- PICKUP / DELIVERY -->
            <tr>
              <td style="padding:18px 36px;">

                <table
                  role="presentation"
                  width="100%"
                  cellspacing="0"
                  cellpadding="0"
                  border="0"
                >
                  <tr>

                    <td
                      width="48%"
                      valign="top"
                      style="
                        padding:20px;
                        border:1px solid #e2e8f0;
                        border-radius:12px;
                      "
                    >
                      <div style="
                        font-size:11px;
                        font-weight:700;
                        letter-spacing:1px;
                        color:#64748b;
                      ">
                        PICKUP
                      </div>

                      <div style="
                        margin-top:8px;
                        font-size:17px;
                        font-weight:800;
                        color:#0f172a;
                      ">
                        ${escapeHtml(dispatch.pickupName)}
                      </div>

                      <div style="
                        margin-top:6px;
                        font-size:13px;
                        line-height:1.5;
                        color:#64748b;
                      ">
                        ${escapeHtml(dispatch.pickupAddress)}
                      </div>
                    </td>

                    <td width="4%"></td>

                    <td
                      width="48%"
                      valign="top"
                      style="
                        padding:20px;
                        border:1px solid #e2e8f0;
                        border-radius:12px;
                      "
                    >
                      <div style="
                        font-size:11px;
                        font-weight:700;
                        letter-spacing:1px;
                        color:#64748b;
                      ">
                        DELIVERY
                      </div>

                      <div style="
                        margin-top:8px;
                        font-size:17px;
                        font-weight:800;
                        color:#0f172a;
                      ">
                        ${escapeHtml(dispatch.deliveryName)}
                      </div>

                      <div style="
                        margin-top:6px;
                        font-size:13px;
                        line-height:1.5;
                        color:#64748b;
                      ">
                        ${escapeHtml(dispatch.deliveryAddress)}
                      </div>
                    </td>

                  </tr>
                </table>

              </td>
            </tr>

            <!-- BUTTON -->
            <tr>
              <td
                align="center"
                style="padding:14px 36px 34px 36px;"
              >

                <a
                  href="${escapeHtml(trackingUrl)}"
                  style="
                    display:inline-block;
                    background:#2563eb;
                    color:#ffffff;
                    text-decoration:none;
                    padding:15px 30px;
                    border-radius:10px;
                    font-size:15px;
                    font-weight:800;
                    letter-spacing:0.3px;
                  "
                >
                  TRACK SHIPMENT
                </a>

                <p style="
                  margin:18px 0 0 0;
                  font-size:12px;
                  line-height:1.6;
                  color:#94a3b8;
                ">
                  This secure tracking link expires in
                  ${safeExpirationDays}
                  day${safeExpirationDays === 1 ? '' : 's'}.
                </p>

              </td>
            </tr>

            <!-- SECURITY -->
            <tr>
              <td style="
                padding:20px 36px;
                background:#f8fafc;
                border-top:1px solid #e2e8f0;
              ">

                <p style="
                  margin:0;
                  font-size:12px;
                  line-height:1.6;
                  color:#64748b;
                ">
                  This link provides access only to the shipment
                  shared with this email address. It does not provide
                  access to the MAVTRACK LLC fleet management portal
                  or any other shipment.
                </p>

              </td>
            </tr>

            <!-- FOOTER -->
            <tr>
              <td
                align="center"
                style="
                  padding:28px 36px;
                  background:#071426;
                "
              >

                <div style="
                  color:#ffffff;
                  font-size:15px;
                  font-weight:800;
                  letter-spacing:1px;
                ">
                  MAVTRACK LLC
                </div>

                <div style="
                  margin-top:7px;
                  color:#94a3b8;
                  font-size:12px;
                ">
                  Real-Time Fleet & Temperature Visibility
                </div>

                <div style="
                  margin-top:10px;
                  color:#60a5fa;
                  font-size:12px;
                ">
                  mavtrackfleet.com
                </div>

              </td>
            </tr>

          </table>

        </td>
      </tr>
    </table>

  </body>
</html>
`
        })

      await createNotificationEvent({
        companyId,
        assetId:
          dispatch.assetId,
        dispatchId:
          dispatch.id,
        type:
          'LOAD_SHARED',
        severity:
          'info',
        title:
          'Load Shared',
        message:
          `${dispatch.loadNumber} shared with ${customerEmail}`,
        recipients:
          emailResult.recipients,
        emailSent:
          emailResult.ok
      })

      return res.status(201).json({
        ok: true,
        share: {
          ...share,
          trackingUrl,
          emailSent:
            emailResult.ok
        }
      })
    } catch (error) {
      console.error(
        'Create dispatch share error:',
        error
      )

      return res.status(500).json({
        ok: false,
        message:
          'Unable to share load'
      })
    }
  }
)

app.get(
  '/api/dispatches/:id/shares',
  requireAuth,
  async (
    req: AuthenticatedRequest,
    res: Response
  ) => {
    try {
      const companyId =
        req.user?.companyId

      const dispatchId =
        Number(req.params.id)

      if (
        !companyId ||
        !Number.isInteger(dispatchId)
      ) {
        return res.status(400).json({
          ok: false,
          message: 'Invalid dispatch'
        })
      }

      const dispatch =
        await prisma.dispatch.findFirst({
          where: {
            id: dispatchId,
            companyId
          },
          select: {
            id: true
          }
        })

      if (!dispatch) {
        return res.status(404).json({
          ok: false,
          message: 'Dispatch not found'
        })
      }

      const shares =
        await prisma.dispatchShare.findMany({
          where: {
            dispatchId
          },
          orderBy: {
            createdAt: 'desc'
          }
        })

      return res.json({
        ok: true,
        shares:
          shares.map((share) => ({
            ...share,
            trackingUrl:
              `${PUBLIC_FRONTEND_URL}/track/${share.token}`
          }))
      })
    } catch (error) {
      console.error(
        'Get dispatch shares error:',
        error
      )

      return res.status(500).json({
        ok: false,
        message:
          'Unable to load shared links'
      })
    }
  }
)

app.delete(
  '/api/dispatches/:id/shares/:shareId',
  requireAuth,
  async (
    req: AuthenticatedRequest,
    res: Response
  ) => {
    try {
      const companyId =
        req.user?.companyId

      const dispatchId =
        Number(req.params.id)

      const shareId =
        Number(req.params.shareId)

      if (
        !companyId ||
        !Number.isInteger(dispatchId) ||
        !Number.isInteger(shareId)
      ) {
        return res.status(400).json({
          ok: false,
          message: 'Invalid shared link'
        })
      }

      const share =
        await prisma.dispatchShare.findFirst({
          where: {
            id: shareId,
            dispatchId,
            dispatch: {
              companyId
            }
          }
        })

      if (!share) {
        return res.status(404).json({
          ok: false,
          message:
            'Shared link not found'
        })
      }

      const updated =
        await prisma.dispatchShare.update({
          where: {
            id: share.id
          },
          data: {
            revokedAt: new Date()
          }
        })

      return res.json({
        ok: true,
        share: updated
      })
    } catch (error) {
      console.error(
        'Revoke dispatch share error:',
        error
      )

      return res.status(500).json({
        ok: false,
        message:
          'Unable to revoke shared link'
      })
    }
  }
)

app.get(
  '/api/public/track/:token',
  async (
    req,
    res
  ) => {
    try {
      const token =
        String(
          req.params.token || ''
        ).trim()

      if (!token) {
        return res.status(400).json({
          ok: false,
          message:
            'Invalid tracking link'
        })
      }

      const share =
        await prisma.dispatchShare.findUnique({
          where: {
            token
          },
          include: {
            dispatch: {
              include: {
                asset: true,
                statusEvents: {
                  orderBy: {
                    createdAt: 'desc'
                  },
                  take: 12
                }
              }
            }
          }
        })

      if (
        !share ||
        share.revokedAt ||
        (
          share.expiresAt &&
          share.expiresAt <= new Date()
        )
      ) {
        return res.status(404).json({
          ok: false,
          message:
            'This tracking link is no longer available'
        })
      }

      const latestTelemetry =
        share.dispatch.assetId
          ? await prisma.telemetry.findFirst({
              where: {
                assetId:
                  share.dispatch.assetId,
                isBackfill: false
              },
              orderBy: {
                receivedAt: 'desc'
              }
            })
          : null

      return res.json({
        ok: true,
        share: {
          customerName:
            share.customerName,
          allowLocation:
            share.allowLocation,
          allowTemperature:
            share.allowTemperature,
          allowEta:
            share.allowEta,
          expiresAt:
            share.expiresAt
        },
        dispatch: {
          loadNumber:
            share.dispatch.loadNumber,
          status:
            share.dispatch.status,
          pickupName:
            share.dispatch.pickupName,
          pickupAddress:
            share.dispatch.pickupAddress,
          pickupScheduledAt:
            share.dispatch.pickupScheduledAt,
          deliveryName:
            share.dispatch.deliveryName,
          deliveryAddress:
            share.dispatch.deliveryAddress,
          deliveryScheduledAt:
            share.dispatch.deliveryScheduledAt,
          commodity:
            share.dispatch.commodity,
          referenceNumber:
            share.dispatch.referenceNumber,
          asset:
            share.dispatch.asset
              ? {
                  name:
                    share.dispatch.asset.name,
                  deviceId:
                    share.dispatch.asset.deviceId
                }
              : null,
          statusEvents:
            share.dispatch.statusEvents
        },
        telemetry:
          latestTelemetry
            ? {
                receivedAt:
                  latestTelemetry.receivedAt,
                temperature:
                  share.allowTemperature
                    ? latestTelemetry.temperature
                    : null,
                latitude:
                  share.allowLocation
                    ? latestTelemetry.latitude
                    : null,
                longitude:
                  share.allowLocation
                    ? latestTelemetry.longitude
                    : null,
                speedKph:
                  share.allowLocation
                    ? latestTelemetry.speedKph
                    : null,
                movementStatus:
                  share.allowLocation
                    ? latestTelemetry.movementStatus
                    : null
              }
            : null
      })
    } catch (error) {
      console.error(
        'Public tracking error:',
        error
      )

      return res.status(500).json({
        ok: false,
        message:
          'Unable to load tracking information'
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
        batteryVoltage,
        batteryPercent,
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

      const safeBatteryVoltage =
        typeof batteryVoltage === 'number' &&
        Number.isFinite(batteryVoltage) &&
        batteryVoltage >= 0 &&
        batteryVoltage <= 10
          ? batteryVoltage
          : null

      const safeBatteryPercent =
        typeof batteryPercent === 'number' &&
        Number.isFinite(batteryPercent)
          ? Math.max(
              0,
              Math.min(
                100,
                Math.round(batteryPercent)
              )
            )
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

      const previousLiveTelemetry =
        (
          asset &&
          !safeIsBackfill
        )
          ? await prisma.telemetry.findFirst({
              where: {
                assetId:
                  asset.id,
                isBackfill:
                  false
              },
              orderBy: {
                receivedAt:
                  'desc'
              },
              select: {
                temperature:
                  true
              }
            })
          : null

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

    batteryVoltage:
      safeBatteryVoltage,

    batteryPercent:
      safeBatteryPercent,

    recordedAt:
      safeRecordedAt,

    isBackfill:
      safeIsBackfill,

    assetId:
      asset?.id ?? null
  }
})

      if (
        asset &&
        !safeIsBackfill
      ) {
        await processTemperatureAlertTransition({
          asset,
          previousTemperatureC:
            previousLiveTelemetry
              ?.temperature ?? null,
          currentTemperatureC:
            temperature
        })
      }

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

          batteryVoltage:
            safeBatteryVoltage,

          batteryPercent:
            safeBatteryPercent,

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
        typeof req.query.deviceId === 'string'
          ? req.query.deviceId.trim()
          : ''

      if (!deviceId) {
        return res.status(400).json({
          ok: false,
          message: 'deviceId is required'
        })
      }

      // The requested asset MUST belong to the
      // authenticated company. This also prevents
      // telemetry from one trailer being returned
      // for another trailer.
      const asset =
        await prisma.asset.findFirst({
          where: {
            companyId,
            deviceId,
            active: true
          },
          select: {
            id: true,
            deviceId: true
          }
        })

      if (!asset) {
        return res.status(404).json({
          ok: false,
          message: 'Asset not found'
        })
      }

      // ---------------------------------
      // LATEST LIVE TELEMETRY FOR THIS ASSET
      // ---------------------------------

      const latestTelemetry =
        await prisma.telemetry.findFirst({
          where: {
            assetId: asset.id,
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
            'No telemetry available for this asset'
        })
      }

      // ---------------------------------
      // LAST VALID GPS LOCATION FOR THIS ASSET
      // ---------------------------------

      const latestLocation =
        await prisma.telemetry.findFirst({
          where: {
            assetId: asset.id,
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

      return res.json({
        ok: true,
        telemetry: {
          ...latestTelemetry,

          // Always identify the requested device.
          deviceId: asset.deviceId,

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
            batteryVoltage: true,
            batteryPercent: true,
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
            batteryVoltage:
              row.batteryVoltage,
            batteryPercent:
              row.batteryPercent,
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
    .map(() => '65')
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

function selectRouteAnchors(
  points: RoadMatchInputPoint[]
) {
  if (points.length <= 2) {
    return points
  }

  const first =
    points[0]

  const last =
    points[
      points.length - 1
    ]

  if (!first || !last) {
    return []
  }

  const anchors:
    RoadMatchInputPoint[] = [
      first
    ]

  let lastKept:
    RoadMatchInputPoint =
      first

  for (
    let index = 1;
    index <
      points.length - 1;
    index++
  ) {
    const point =
      points[index]

    if (!point) {
      continue
    }

    // Preserve meaningful turns/progress while removing tightly
    // clustered GPS jitter before asking OSRM to route the path.
    if (
      metersBetween(
        lastKept,
        point
      ) >= 90
    ) {
      anchors.push(
        point
      )

      lastKept =
        point
    }
  }

  if (
    anchors[
      anchors.length - 1
    ] !== last
  ) {
    anchors.push(
      last
    )
  }

  // Keep public OSRM requests compact and reliable.
  if (
    anchors.length <= 22
  ) {
    return anchors
  }

  const sampled:
    RoadMatchInputPoint[] =
      []

  for (
    let i = 0;
    i < 22;
    i++
  ) {
    const index =
      Math.round(
        i *
          (
            anchors.length -
            1
          ) /
          21
      )

    const candidate =
      anchors[index]

    if (!candidate) {
      continue
    }

    if (
      sampled[
        sampled.length - 1
      ] !== candidate
    ) {
      sampled.push(
        candidate
      )
    }
  }

  return sampled
}

async function osrmRouteChunk(
  points: RoadMatchInputPoint[]
) {
  if (points.length < 2) {
    return null
  }

  const anchors =
    selectRouteAnchors(points)

  if (anchors.length < 2) {
    return null
  }

  const coordinates = anchors
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
  const chunkSize = 35
  const overlap = 2

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