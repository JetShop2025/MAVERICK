import express, {
  type Request,
  type Response,
  type NextFunction
} from 'express'

import cors from 'cors'
import dotenv from 'dotenv'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { createHash, randomBytes } from 'node:crypto'

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
  express.json({
    limit: '16mb'
  })
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

const MOBILE_TELEMETRY_KEY =
  process.env.MOBILE_TELEMETRY_KEY?.trim() || ''

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


const EXPO_PUSH_ACCESS_TOKEN =
  process.env.EXPO_PUSH_ACCESS_TOKEN?.trim() || ''

function isExpoPushToken(
  value: unknown
) {
  return (
    typeof value === 'string' &&
    /^(Expo|Exponent)PushToken\[[^\]]+\]$/.test(
      value.trim()
    )
  )
}

async function sendExpoPushToUser({
  userId,
  title,
  body,
  data,
  badge
}: {
  userId: number
  title: string
  body: string
  data: Record<string, string>
  badge?: number
}) {
  try {
    const devices =
      await prisma.pushDevice.findMany({
        where: {
          userId,
          active: true
        },
        select: {
          id: true,
          token: true
        }
      })

    const validDevices =
      devices.filter((device) =>
        isExpoPushToken(device.token)
      )

    if (validDevices.length === 0) {
      return {
        ok: false,
        skipped: true,
        sent: 0
      }
    }

    const messages =
      validDevices.map((device) => ({
        to: device.token,
        sound: 'default',
        title,
        body,
        data,
        badge:
          typeof badge === 'number'
            ? Math.max(0, Math.floor(badge))
            : undefined,
        priority: 'high'
      }))

    const response =
      await fetch(
        'https://exp.host/--/api/v2/push/send',
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...(EXPO_PUSH_ACCESS_TOKEN
              ? {
                  Authorization:
                    `Bearer ${EXPO_PUSH_ACCESS_TOKEN}`
                }
              : {})
          },
          body: JSON.stringify(messages)
        }
      )

    const payload =
      await response.json().catch(() => null)

    if (!response.ok) {
      console.error(
        'Expo push delivery failed:',
        response.status,
        payload
      )

      return {
        ok: false,
        skipped: false,
        sent: 0
      }
    }

    const tickets =
      Array.isArray(payload?.data)
        ? payload.data
        : payload?.data
          ? [payload.data]
          : []

    const disabledDeviceIds: number[] = []

    tickets.forEach(
      (ticket: any, index: number) => {
        if (
          ticket?.status === 'error' &&
          ticket?.details?.error ===
            'DeviceNotRegistered'
        ) {
          const device =
            validDevices[index]

          if (device) {
            disabledDeviceIds.push(
              device.id
            )
          }
        }
      }
    )

    if (disabledDeviceIds.length > 0) {
      await prisma.pushDevice.updateMany({
        where: {
          id: {
            in: disabledDeviceIds
          }
        },
        data: {
          active: false
        }
      })
    }

    return {
      ok: true,
      skipped: false,
      sent:
        validDevices.length -
        disabledDeviceIds.length
    }
  } catch (error) {
    console.error(
      'Expo push delivery error:',
      error
    )

    return {
      ok: false,
      skipped: false,
      sent: 0
    }
  }
}

async function sendLoadAssignmentPush({
  driverId,
  dispatchId,
  loadNumber,
  pickupName,
  deliveryName
}: {
  driverId: number
  dispatchId: number
  loadNumber: string
  pickupName: string
  deliveryName: string
}) {
  const pendingCount =
    await prisma.dispatch.count({
      where: {
        driverId,
        assignmentStatus: 'PENDING',
        status: {
          notIn: [
            'DELIVERED',
            'CANCELLED'
          ]
        }
      }
    })

  return sendExpoPushToUser({
    userId: driverId,
    title: 'New Load Assigned',
    body:
      `Load ${loadNumber} is pending acceptance. ${pickupName} → ${deliveryName}`,
    badge: Math.max(1, pendingCount),
    data: {
      type: 'LOAD_ASSIGNMENT',
      dispatchId: String(dispatchId),
      loadNumber
    }
  })
}

function normalizeCustomerCode(value: unknown) {
  return String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12)
}

function formatPhone(value: unknown) {
  const digits = String(value ?? '')
    .replace(/\D/g, '')
    .slice(0, 10)

  if (digits.length <= 3) return digits
  if (digits.length <= 6) {
    return `${digits.slice(0, 3)} ${digits.slice(3)}`
  }

  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
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


  // Demo assets are no longer recreated automatically in production.
  // This is important because an asset intentionally deleted from Fleet
  // must stay deleted after a Render restart or deploy. Demo seeding can
  // still be enabled explicitly when needed.
  if (
    process.env.SEED_DEMO_ASSETS ===
    'true'
  ) {
    const demoAssets = [
      {
        deviceId: 'TRAILER-001',
        name: 'TRAILER-001',
        description:
          'Maverick tracking unit',
        assetType: 'TRL',
        trackingSource: 'MAV2'
      },
      {
        deviceId: 'TRAILER-002',
        name: 'TRAILER-002',
        description:
          'Maverick T-SIM7670G-S3 tracking unit',
        assetType: 'TRL',
        trackingSource: 'MAV2'
      },
      {
        deviceId: 'TRK-TEST-001',
        name: 'TRK-TEST-001',
        description:
          'MAVTRACK Driver phone tracking',
        assetType: 'TRK',
        trackingSource: 'PHONE'
      }
    ] as const

    for (const demo of demoAssets) {
      const seeded =
        await prisma.asset.upsert({
          where: {
            deviceId:
              demo.deviceId
          },
          update: {
            companyId:
              company.id,
            active: true,
            assetType:
              demo.assetType,
            trackingSource:
              demo.trackingSource
          },
          create: {
            ...demo,
            companyId:
              company.id,
            active: true
          }
        })

      console.log(
        `Demo asset ready: ${seeded.deviceId}`
      )
    }
  }


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
// CUENTAS INTERNAS DE MAVTRACK
// =====================================================

type BootstrapUser = {
  email: string
  name: string
  phone: string | null
  role: 'company_admin' | 'dispatch'
  passwordEnv: string
}

const bootstrapUsers: BootstrapUser[] = [
  {
    email: 'mario@ga-logistics.us',
    name: 'Mario',
    phone: null,
    role: 'company_admin',
    passwordEnv: 'MAVTRACK_MARIO_PASSWORD'
  },
  {
    email: 'dispatcher@ga-logistics.us',
    name: 'Cris',
    phone: '(831) 265-6205',
    role: 'company_admin',
    passwordEnv: 'MAVTRACK_CRIS_PASSWORD'
  },
  {
    email: 'luis@ga-logistics.us',
    name: 'Luis',
    phone: '(831) 236-3029',
    role: 'dispatch',
    passwordEnv: 'MAVTRACK_LUIS_PASSWORD'
  },
  {
    email: 'angel@jettrucking.net',
    name: 'Angel',
    phone: '(831) 901-4213',
    role: 'dispatch',
    passwordEnv: 'MAVTRACK_ANGEL_PASSWORD'
  },
  {
    email: 'augie@jettrucking.net',
    name: 'Augie',
    phone: '(831) 901-7018',
    role: 'dispatch',
    passwordEnv: 'MAVTRACK_AUGIE_PASSWORD'
  },
  {
    email: 'david@jetshop.us',
    name: 'David Cruz',
    phone: null,
    role: 'company_admin',
    passwordEnv: 'MAVTRACK_DAVID_PASSWORD'
  },
  {
    email: 'jetjoseluis@live.com',
    name: 'Jose Luis Tinajero',
    phone: null,
    role: 'company_admin',
    passwordEnv: 'MAVTRACK_JOSE_LUIS_PASSWORD'
  },
  {
    email: 'andrea@ga-logistics.us',
    name: 'Andrea Aguilar',
    phone: null,
    role: 'company_admin',
    passwordEnv: 'MAVTRACK_ANDREA_PASSWORD'
  },
  {
    email: 'ap-compu@outlook.com',
    name: 'Gaby Tinajero',
    phone: null,
    role: 'dispatch',
    passwordEnv: 'MAVTRACK_GABY_PASSWORD'
  }
]

async function ensureBootstrapUsers() {
  // One-time repair for the original Mario email typo (.su -> .us).
  // Preserve the existing user ID and related records whenever possible.
  const legacyMario =
    await prisma.user.findUnique({
      where: {
        email: 'mario@ga-logistics.su'
      },
      select: {
        id: true
      }
    })

  const correctedMario =
    await prisma.user.findUnique({
      where: {
        email: 'mario@ga-logistics.us'
      },
      select: {
        id: true
      }
    })

  if (legacyMario && !correctedMario) {
    await prisma.user.update({
      where: {
        id: legacyMario.id
      },
      data: {
        email: 'mario@ga-logistics.us'
      }
    })

    console.log(
      'Mario email corrected: mario@ga-logistics.us'
    )
  } else if (legacyMario && correctedMario) {
    // If both addresses somehow exist, keep the corrected account authoritative
    // and disable the legacy typo so it cannot still be used to sign in.
    await prisma.user.update({
      where: {
        id: legacyMario.id
      },
      data: {
        active: false
      }
    })
  }

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

  for (const account of bootstrapUsers) {
    const password =
      process.env[account.passwordEnv]

    if (!password) {
      console.warn(
        `${account.passwordEnv} is not configured; ${account.email} was not provisioned.`
      )
      continue
    }

    if (password.length < 8) {
      throw new Error(
        `${account.passwordEnv} must contain at least 8 characters`
      )
    }

    const passwordHash =
      await bcrypt.hash(
        password,
        12
      )

    const existingUser =
      await prisma.user.findUnique({
        where: {
          email: account.email
        },
        select: {
          id: true
        }
      })

    if (existingUser) {
      await prisma.user.update({
        where: {
          id: existingUser.id
        },
        data: {
          name: account.name,
          phone: account.phone,
          role: account.role,
          passwordHash,
          companyId: company.id,
          active: true
        }
      })

      console.log(
        `MAVTRACK user ready: ${account.email} (${account.role})`
      )
      continue
    }

    await prisma.user.create({
      data: {
        email: account.email,
        passwordHash,
        name: account.name,
        phone: account.phone,
        role: account.role,
        active: true,
        companyId: company.id
      }
    })

    console.log(
      `MAVTRACK user created: ${account.email} (${account.role})`
    )
  }
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

      if (!user || !user.active) {
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
    phone: user.phone,
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
            phone: true,
            role: true,
            companyId: true,
            active: true,
            createdAt: true,
            driverProfile: true
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
// DRIVERS / DRIVER PROFILES
// =====================================================

function isCompanyAdmin(
  role: string | undefined
) {
  return (
    role === 'company_admin' ||
    role === 'superadmin'
  )
}

function isDriver(
  role: string | undefined
) {
  return role === 'driver'
}

const driverInclude = {
  driverProfile: true
} as const

function normalizeDriverTrackingId(
  value: unknown
) {
  const deviceId =
    optionalString(value)

  return deviceId
    ? deviceId.toUpperCase()
    : null
}

async function ensureDriverTrackingAsset(
  companyId: number,
  internalTrackingId: unknown
) {
  const deviceId =
    normalizeDriverTrackingId(
      internalTrackingId
    )

  if (!deviceId) {
    return null
  }

  const existingAsset =
    await prisma.asset.findUnique({
      where: {
        deviceId
      },
      select: {
        id: true,
        companyId: true,
        deviceId: true,
        assetType: true,
        trackingSource: true,
        active: true
      }
    })

  if (existingAsset) {
    if (
      existingAsset.companyId !== companyId ||
      existingAsset.assetType !== 'TRK' ||
      existingAsset.trackingSource !== 'PHONE'
    ) {
      throw new Error(
        'INVALID_DRIVER_TRACKING_ID'
      )
    }

    if (!existingAsset.active) {
      await prisma.asset.update({
        where: {
          id: existingAsset.id
        },
        data: {
          active: true
        }
      })
    }

    return existingAsset.deviceId
  }

  const createdAsset =
    await prisma.asset.create({
      data: {
        companyId,
        deviceId,
        name: deviceId,
        description:
          'MAVTRACK Driver phone tracking',
        assetType: 'TRK',
        trackingSource: 'PHONE',
        active: true
      },
      select: {
        deviceId: true
      }
    })

  return createdAsset.deviceId
}

async function validateDriverEquipment(
  companyId: number,
  physicalTruckNumber: unknown
) {
  const truckNumber =
    optionalString(
      physicalTruckNumber
    )

  if (!truckNumber) {
    return null
  }

  const truck =
    await prisma.asset.findFirst({
      where: {
        companyId,
        active: true,
        assetType: 'TRK',
        deviceId: {
          equals: truckNumber,
          mode: 'insensitive'
        }
      },
      select: {
        deviceId: true
      }
    })

  if (!truck) {
    throw new Error(
      'INVALID_DRIVER_TRUCK'
    )
  }

  return truck.deviceId
}

app.get(
  '/api/drivers',
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

      if (!isCompanyAdmin(req.user?.role)) {
        return res.status(403).json({
          ok: false,
          message:
            'You do not have permission to view drivers'
        })
      }

      const drivers =
        await prisma.user.findMany({
          where: {
            companyId,
            role: 'driver',
            active: true
          },
          include: driverInclude,
          orderBy: {
            name: 'asc'
          }
        })

      return res.json({
        ok: true,
        drivers: drivers.map((driver) => ({
          id: driver.id,
          email: driver.email,
          name: driver.name,
          role: driver.role,
          active: driver.active,
          companyId: driver.companyId,
          profile: driver.driverProfile
        }))
      })
    } catch (error) {
      console.error(
        'Get drivers error:',
        error
      )

      return res.status(500).json({
        ok: false,
        message: 'Unable to load drivers'
      })
    }
  }
)

app.post(
  '/api/drivers',
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

      if (!isCompanyAdmin(req.user?.role)) {
        return res.status(403).json({
          ok: false,
          message:
            'You do not have permission to create drivers'
        })
      }

      const email =
        optionalString(
          req.body?.email
        )?.toLowerCase()

      const password =
        optionalString(
          req.body?.password
        )

      const firstName =
        optionalString(
          req.body?.firstName
        )

      const lastName =
        optionalString(
          req.body?.lastName
        )

      if (
        !email ||
        !password ||
        !firstName ||
        !lastName
      ) {
        return res.status(400).json({
          ok: false,
          message:
            'Email, password, first name and last name are required'
        })
      }

      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
          email
        )
      ) {
        return res.status(400).json({
          ok: false,
          message: 'Enter a valid email'
        })
      }

      if (password.length < 8) {
        return res.status(400).json({
          ok: false,
          message:
            'Driver password must be at least 8 characters'
        })
      }

      const existing =
        await prisma.user.findUnique({
          where: {
            email
          }
        })

      if (existing) {
        return res.status(409).json({
          ok: false,
          message:
            'A user with that email already exists'
        })
      }

      const passwordHash =
        await bcrypt.hash(
          password,
          12
        )

      // Internal Tracking ID belongs to the driver's PHONE GPS asset.
      // Create that TRK asset automatically when it does not exist yet.
      const currentTruckNumber =
        await ensureDriverTrackingAsset(
          companyId,
          req.body?.currentTruckNumber
        )

      // Physical Truck is optional. Only validate it when the admin
      // actually entered a truck number.
      const physicalTruckNumber =
        await validateDriverEquipment(
          companyId,
          req.body?.physicalTruckNumber
        )

      const driver =
        await prisma.user.create({
          data: {
            email,
            passwordHash,
            name: `${firstName} ${lastName}`,
            role: 'driver',
            active: true,
            companyId,
            driverProfile: {
              create: {
                companyId,
                firstName,
                lastName,
                phone:
                  optionalString(
                    req.body?.phone
                  ),
                licenseNumber:
                  optionalString(
                    req.body?.licenseNumber
                  ),
                licenseState:
                  optionalString(
                    req.body?.licenseState
                  ),
                profilePhotoUrl:
                  optionalString(
                    req.body?.profilePhotoUrl
                  ),
                currentTruckNumber,
                physicalTruckNumber,
                currentTrailerNumber:
                  optionalString(
                    req.body?.currentTrailerNumber
                  ),
                currentTrailerLicense:
                  optionalString(
                    req.body?.currentTrailerLicense
                  )
              }
            }
          },
          include: driverInclude
        })

      return res.status(201).json({
        ok: true,
        driver: {
          id: driver.id,
          email: driver.email,
          name: driver.name,
          role: driver.role,
          active: driver.active,
          companyId: driver.companyId,
          profile: driver.driverProfile
        }
      })
    } catch (error: any) {
      console.error(
        'Create driver error:',
        error
      )

      if (
        error instanceof Error &&
        error.message ===
          'INVALID_DRIVER_TRACKING_ID'
      ) {
        return res.status(409).json({
          ok: false,
          message:
            'Internal Tracking ID is already used by another asset or company'
        })
      }

      if (
        error instanceof Error &&
        error.message ===
          'INVALID_DRIVER_TRUCK'
      ) {
        return res.status(400).json({
          ok: false,
          message:
            'Current truck must match an active TRK asset in your company'
        })
      }

      if (error?.code === 'P2002') {
        return res.status(409).json({
          ok: false,
          message:
            'A user with that email already exists'
        })
      }

      return res.status(500).json({
        ok: false,
        message: 'Unable to create driver'
      })
    }
  }
)

app.patch(
  '/api/drivers/:id',
  requireAuth,
  async (
    req: AuthenticatedRequest,
    res: Response
  ) => {
    try {
      const companyId =
        req.user?.companyId

      const driverId =
        Number(req.params.id)

      if (
        !companyId ||
        !Number.isInteger(driverId)
      ) {
        return res.status(400).json({
          ok: false,
          message: 'Invalid driver'
        })
      }

      if (!isCompanyAdmin(req.user?.role)) {
        return res.status(403).json({
          ok: false,
          message:
            'You do not have permission to edit drivers'
        })
      }

      const existing =
        await prisma.user.findFirst({
          where: {
            id: driverId,
            companyId,
            role: 'driver'
          },
          include: driverInclude
        })

      if (!existing) {
        return res.status(404).json({
          ok: false,
          message: 'Driver not found'
        })
      }

      const profileData: Record<string, any> = {}
      const userData: Record<string, any> = {}

      const profileStringFields = [
        'firstName',
        'lastName',
        'phone',
        'licenseNumber',
        'licenseState',
        'profilePhotoUrl',
        'currentTruckNumber',
        'physicalTruckNumber',
        'currentTrailerNumber',
        'currentTrailerLicense'
      ] as const

      for (const field of profileStringFields) {
        if (req.body?.[field] !== undefined) {
          profileData[field] =
            optionalString(
              req.body[field]
            )
        }
      }

      if (
        req.body?.currentTruckNumber !==
        undefined
      ) {
        profileData.currentTruckNumber =
          await ensureDriverTrackingAsset(
            companyId,
            req.body.currentTruckNumber
          )
      }

      if (
        req.body?.physicalTruckNumber !==
        undefined
      ) {
        profileData.physicalTruckNumber =
          await validateDriverEquipment(
            companyId,
            req.body.physicalTruckNumber
          )
      }

      if (req.body?.active !== undefined) {
        if (typeof req.body.active !== 'boolean') {
          return res.status(400).json({
            ok: false,
            message: 'Invalid active value'
          })
        }

        userData.active = req.body.active
      }

      if (req.body?.email !== undefined) {
        const email =
          optionalString(
            req.body.email
          )?.toLowerCase()

        if (
          !email ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
            email
          )
        ) {
          return res.status(400).json({
            ok: false,
            message: 'Enter a valid email'
          })
        }

        userData.email = email
      }

      if (req.body?.password !== undefined) {
        const password =
          optionalString(
            req.body.password
          )

        if (!password || password.length < 8) {
          return res.status(400).json({
            ok: false,
            message:
              'Driver password must be at least 8 characters'
          })
        }

        userData.passwordHash =
          await bcrypt.hash(
            password,
            12
          )
      }

      const finalFirstName =
        profileData.firstName !== undefined
          ? profileData.firstName
          : existing.driverProfile?.firstName

      const finalLastName =
        profileData.lastName !== undefined
          ? profileData.lastName
          : existing.driverProfile?.lastName

      if (!finalFirstName || !finalLastName) {
        return res.status(400).json({
          ok: false,
          message:
            'Driver first name and last name are required'
        })
      }

      userData.name =
        `${finalFirstName} ${finalLastName}`

      const updated =
        await prisma.user.update({
          where: {
            id: existing.id
          },
          data: {
            ...userData,
            driverProfile: {
              upsert: {
                create: {
                  companyId,
                  firstName: finalFirstName,
                  lastName: finalLastName,
                  phone:
                    profileData.phone ?? null,
                  licenseNumber:
                    profileData.licenseNumber ?? null,
                  licenseState:
                    profileData.licenseState ?? null,
                  profilePhotoUrl:
                    profileData.profilePhotoUrl ?? null,
                  currentTruckNumber:
                    profileData.currentTruckNumber ?? null,
                  physicalTruckNumber:
                    profileData.physicalTruckNumber ?? null,
                  currentTrailerNumber:
                    profileData.currentTrailerNumber ?? null,
                  currentTrailerLicense:
                    profileData.currentTrailerLicense ?? null
                },
                update: profileData
              }
            }
          },
          include: driverInclude
        })

      return res.json({
        ok: true,
        driver: {
          id: updated.id,
          email: updated.email,
          name: updated.name,
          role: updated.role,
          active: updated.active,
          companyId: updated.companyId,
          profile: updated.driverProfile
        }
      })
    } catch (error: any) {
      console.error(
        'Update driver error:',
        error
      )

      if (
        error instanceof Error &&
        error.message ===
          'INVALID_DRIVER_TRACKING_ID'
      ) {
        return res.status(409).json({
          ok: false,
          message:
            'Internal Tracking ID is already used by another asset or company'
        })
      }

      if (
        error instanceof Error &&
        error.message ===
          'INVALID_DRIVER_TRUCK'
      ) {
        return res.status(400).json({
          ok: false,
          message:
            'Current truck must match an active TRK asset in your company'
        })
      }

      if (error?.code === 'P2002') {
        return res.status(409).json({
          ok: false,
          message:
            'A user with that email already exists'
        })
      }

      return res.status(500).json({
        ok: false,
        message: 'Unable to update driver'
      })
    }
  }
)

app.get(
  '/api/driver/me',
  requireAuth,
  async (
    req: AuthenticatedRequest,
    res: Response
  ) => {
    try {
      if (!isDriver(req.user?.role)) {
        return res.status(403).json({
          ok: false,
          message: 'Driver account required'
        })
      }

      const driver =
        await prisma.user.findFirst({
          where: {
            id: req.user!.userId,
            companyId: req.user!.companyId,
            role: 'driver',
            active: true
          },
          include: driverInclude
        })

      if (!driver) {
        return res.status(404).json({
          ok: false,
          message: 'Driver profile not found'
        })
      }

      return res.json({
        ok: true,
        driver: {
          id: driver.id,
          email: driver.email,
          name: driver.name,
          companyId: driver.companyId,
          profile: driver.driverProfile
        }
      })
    } catch (error) {
      console.error(
        'Driver me error:',
        error
      )

      return res.status(500).json({
        ok: false,
        message:
          'Unable to load driver profile'
      })
    }
  }
)

app.patch(
  '/api/driver/me',
  requireAuth,
  async (
    req: AuthenticatedRequest,
    res: Response
  ) => {
    try {
      if (!isDriver(req.user?.role)) {
        return res.status(403).json({
          ok: false,
          message: 'Driver account required'
        })
      }

      const existing =
        await prisma.user.findFirst({
          where: {
            id: req.user!.userId,
            companyId: req.user!.companyId,
            role: 'driver',
            active: true
          },
          include: driverInclude
        })

      if (!existing) {
        return res.status(404).json({
          ok: false,
          message: 'Driver profile not found'
        })
      }

      const profileData: Record<string, any> = {}

      for (
        const field of [
          'firstName',
          'lastName',
          'phone',
          'licenseNumber',
          'licenseState',
          'profilePhotoUrl',
          'currentTruckNumber',
          'physicalTruckNumber',
          'currentTrailerNumber',
          'currentTrailerLicense'
        ] as const
      ) {
        if (req.body?.[field] !== undefined) {
          profileData[field] =
            optionalString(
              req.body[field]
            )
        }
      }

      if (
        req.body?.currentTruckNumber !==
        undefined
      ) {
        profileData.currentTruckNumber =
          await ensureDriverTrackingAsset(
            existing.companyId,
            req.body.currentTruckNumber
          )
      }

      if (
        req.body?.physicalTruckNumber !==
        undefined
      ) {
        profileData.physicalTruckNumber =
          await validateDriverEquipment(
            existing.companyId,
            req.body.physicalTruckNumber
          )
      }

      const finalFirstName =
        profileData.firstName !== undefined
          ? profileData.firstName
          : existing.driverProfile?.firstName

      const finalLastName =
        profileData.lastName !== undefined
          ? profileData.lastName
          : existing.driverProfile?.lastName

      if (!finalFirstName || !finalLastName) {
        return res.status(400).json({
          ok: false,
          message:
            'Driver first name and last name are required'
        })
      }

      const updated =
        await prisma.user.update({
          where: {
            id: existing.id
          },
          data: {
            name:
              `${finalFirstName} ${finalLastName}`,
            driverProfile: {
              upsert: {
                create: {
                  companyId: existing.companyId,
                  firstName: finalFirstName,
                  lastName: finalLastName,
                  phone:
                    profileData.phone ?? null,
                  licenseNumber:
                    profileData.licenseNumber ?? null,
                  licenseState:
                    profileData.licenseState ?? null,
                  profilePhotoUrl:
                    profileData.profilePhotoUrl ?? null,
                  currentTruckNumber:
                    profileData.currentTruckNumber ??
                    existing.driverProfile?.currentTruckNumber ??
                    null,
                  physicalTruckNumber:
                    profileData.physicalTruckNumber ??
                    existing.driverProfile?.physicalTruckNumber ??
                    null,
                  currentTrailerNumber:
                    profileData.currentTrailerNumber ?? null,
                  currentTrailerLicense:
                    profileData.currentTrailerLicense ?? null
                },
                update: profileData
              }
            }
          },
          include: driverInclude
        })

      return res.json({
        ok: true,
        driver: {
          id: updated.id,
          email: updated.email,
          name: updated.name,
          companyId: updated.companyId,
          profile: updated.driverProfile
        }
      })
    } catch (error) {
      console.error(
        'Update own driver profile error:',
        error
      )

      if (
        error instanceof Error &&
        error.message ===
          'INVALID_DRIVER_TRACKING_ID'
      ) {
        return res.status(409).json({
          ok: false,
          message:
            'Internal Tracking ID is already used by another asset or company'
        })
      }

      if (
        error instanceof Error &&
        error.message ===
          'INVALID_DRIVER_TRUCK'
      ) {
        return res.status(400).json({
          ok: false,
          message:
            'Current truck must match an active TRK asset in your company'
        })
      }

      return res.status(500).json({
        ok: false,
        message:
          'Unable to update driver profile'
      })
    }
  }
)


app.post(
  '/api/driver/push-token',
  requireAuth,
  async (
    req: AuthenticatedRequest,
    res: Response
  ) => {
    try {
      if (!isDriver(req.user?.role)) {
        return res.status(403).json({
          ok: false,
          message: 'Driver account required'
        })
      }

      const token =
        optionalString(
          req.body?.token
        )

      const platform =
        optionalString(
          req.body?.platform
        )?.toLowerCase() || 'ios'

      if (
        !token ||
        !isExpoPushToken(token) ||
        token.length > 512
      ) {
        return res.status(400).json({
          ok: false,
          message:
            'Invalid push notification token'
        })
      }

      const pushDevice =
        await prisma.pushDevice.upsert({
          where: {
            token
          },
          update: {
            userId:
              req.user!.userId,
            platform:
              platform.slice(0, 20),
            active: true,
            lastRegisteredAt:
              new Date()
          },
          create: {
            token,
            userId:
              req.user!.userId,
            platform:
              platform.slice(0, 20),
            active: true,
            lastRegisteredAt:
              new Date()
          },
          select: {
            id: true,
            platform: true,
            active: true,
            lastRegisteredAt: true
          }
        })

      return res.json({
        ok: true,
        pushDevice
      })
    } catch (error) {
      console.error(
        'Register driver push token error:',
        error
      )

      return res.status(500).json({
        ok: false,
        message:
          'Unable to register notifications'
      })
    }
  }
)

app.delete(
  '/api/driver/push-token',
  requireAuth,
  async (
    req: AuthenticatedRequest,
    res: Response
  ) => {
    try {
      if (!isDriver(req.user?.role)) {
        return res.status(403).json({
          ok: false,
          message: 'Driver account required'
        })
      }

      const token =
        optionalString(
          req.body?.token
        )

      if (!token) {
        return res.status(400).json({
          ok: false,
          message:
            'Push notification token is required'
        })
      }

      await prisma.pushDevice.updateMany({
        where: {
          userId:
            req.user!.userId,
          token
        },
        data: {
          active: false
        }
      })

      return res.json({
        ok: true
      })
    } catch (error) {
      console.error(
        'Disable driver push token error:',
        error
      )

      return res.status(500).json({
        ok: false,
        message:
          'Unable to disable notifications'
      })
    }
  }
)

app.get(
  '/api/driver/assignments',
  requireAuth,
  async (
    req: AuthenticatedRequest,
    res: Response
  ) => {
    try {
      if (!isDriver(req.user?.role)) {
        return res.status(403).json({
          ok: false,
          message: 'Driver account required'
        })
      }

      const assignments =
        await prisma.dispatch.findMany({
          where: {
            companyId: req.user!.companyId,
            driverId: req.user!.userId
          },
          include: {
            asset: {
              select: {
                id: true,
                deviceId: true,
                name: true,
                assetType: true,
                trackingSource: true
              }
            },
            driver: {
              select: {
                id: true,
                email: true,
                name: true,
                driverProfile: true
              }
            },
            statusEvents: {
              orderBy: {
                createdAt: 'desc'
              },
              take: 20
            },
            stops: {
              orderBy: {
                sequence: 'asc'
              }
            },
            documents: {
              select: {
                id: true,
                dispatchId: true,
                originalName: true,
                mimeType: true,
                sizeBytes: true,
                category: true,
                uploadedByRole: true,
                uploadedByName: true,
                customerVisible: true,
                isSignature: true,
                signedBy: true,
                signedAt: true,
                description: true,
                createdAt: true
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
        assignments
      })
    } catch (error) {
      console.error(
        'Driver assignments error:',
        error
      )

      return res.status(500).json({
        ok: false,
        message:
          'Unable to load driver assignments'
      })
    }
  }
)

async function respondToDriverAssignment({
  req,
  res,
  action
}: {
  req: AuthenticatedRequest
  res: Response
  action: 'ACCEPTED' | 'DECLINED'
}) {
  try {
    if (!isDriver(req.user?.role)) {
      return res.status(403).json({
        ok: false,
        message: 'Driver account required'
      })
    }

    const dispatchId =
      Number(req.params.id)

    if (!Number.isInteger(dispatchId)) {
      return res.status(400).json({
        ok: false,
        message: 'Invalid dispatch'
      })
    }

    const existing =
      await prisma.dispatch.findFirst({
        where: {
          id: dispatchId,
          companyId: req.user!.companyId,
          driverId: req.user!.userId
        },
        include: {
          driver: {
            include: {
              driverProfile: true
            }
          }
        }
      })

    if (!existing) {
      return res.status(404).json({
        ok: false,
        message:
          'Assignment not found for this driver'
      })
    }

    if (
      existing.status === 'DELIVERED' ||
      existing.status === 'CANCELLED'
    ) {
      return res.status(409).json({
        ok: false,
        message:
          'This load is already closed'
      })
    }

    if (
      existing.assignmentStatus !== 'PENDING'
    ) {
      return res.status(409).json({
        ok: false,
        message:
          `Assignment is already ${existing.assignmentStatus.toLowerCase()}`
      })
    }

    const profile =
      existing.driver?.driverProfile

    const signedBy =
      [
        profile?.firstName,
        profile?.lastName
      ]
        .filter(Boolean)
        .join(' ')
        .trim() ||
      existing.driver?.name ||
      req.user!.email

    let signatureBase64: string | null = null
    let signatureSize = 0

    if (action === 'ACCEPTED') {
      signatureBase64 =
        optionalString(
          req.body?.signatureDataBase64
        )

      const signatureBuffer =
        decodeBase64File(
          signatureBase64
        )

      if (
        !signatureBase64 ||
        !signatureBuffer ||
        signatureBuffer.length < 100
      ) {
        return res.status(400).json({
          ok: false,
          message:
            'Driver signature is required to accept this load'
        })
      }

      if (
        signatureBuffer.length >
        512 * 1024
      ) {
        return res.status(413).json({
          ok: false,
          message:
            'Signature is too large'
        })
      }

      signatureSize =
        signatureBuffer.length
    }

    const now = new Date()

    const updated =
      await prisma.$transaction(
        async (tx) => {
          await tx.dispatch.update({
            where: {
              id: existing.id
            },
            data: {
              assignmentStatus: action,
              acceptedAt:
                action === 'ACCEPTED'
                  ? now
                  : null,
              declinedAt:
                action === 'DECLINED'
                  ? now
                  : null
            }
          })

          await tx.dispatchStatusEvent.create({
            data: {
              dispatchId:
                existing.id,
              status:
                existing.status,
              eventType:
                action === 'ACCEPTED'
                  ? 'DRIVER_ACCEPTED'
                  : 'DRIVER_DECLINED',
              title:
                action === 'ACCEPTED'
                  ? 'Driver accepted load'
                  : 'Driver declined load',
              notes:
                action === 'ACCEPTED'
                  ? `${signedBy} accepted and signed for load ${existing.loadNumber}`
                  : `${signedBy} declined load ${existing.loadNumber}`
            }
          })

          if (
            action === 'ACCEPTED' &&
            signatureBase64
          ) {
            await tx.dispatchDocument.create({
              data: {
                dispatchId:
                  existing.id,
                originalName:
                  `Load-${existing.loadNumber}-Acceptance-Signature.svg`,
                mimeType:
                  'image/svg+xml',
                sizeBytes:
                  signatureSize,
                category:
                  'SIGNATURE',
                dataBase64:
                  signatureBase64,
                uploadedByUserId:
                  req.user!.userId,
                uploadedByRole:
                  'driver',
                uploadedByName:
                  signedBy,
                customerVisible:
                  true,
                isSignature:
                  true,
                signedBy,
                signedAt:
                  now,
                description:
                  `Driver acceptance signature for load ${existing.loadNumber}`
              }
            })
          }

          return tx.dispatch.findUnique({
            where: {
              id: existing.id
            },
            include: {
              asset: true,
              driver: {
                select: {
                  id: true,
                  email: true,
                  name: true,
                  driverProfile: true
                }
              },
              statusEvents: {
                orderBy: {
                  createdAt: 'desc'
                }
              },
              stops: {
                orderBy: {
                  sequence: 'asc'
                }
              },
              documents: {
                select: {
                  id: true,
                  dispatchId: true,
                  originalName: true,
                  mimeType: true,
                  sizeBytes: true,
                  category: true,
                  uploadedByRole: true,
                  uploadedByName: true,
                  customerVisible: true,
                  isSignature: true,
                  signedBy: true,
                  signedAt: true,
                  description: true,
                  createdAt: true
                },
                orderBy: {
                  createdAt: 'desc'
                }
              }
            }
          })
        }
      )

    await createNotificationEvent({
      companyId: existing.companyId,
      assetId: existing.assetId,
      dispatchId: existing.id,
      type:
        action === 'ACCEPTED'
          ? 'DRIVER_ASSIGNMENT_ACCEPTED'
          : 'DRIVER_ASSIGNMENT_DECLINED',
      severity:
        action === 'ACCEPTED'
          ? 'success'
          : 'warning',
      title:
        `Load ${existing.loadNumber}: driver ${
          action === 'ACCEPTED'
            ? 'accepted'
            : 'declined'
        }`,
      message:
        `${signedBy} ${
          action === 'ACCEPTED'
            ? 'accepted and signed'
            : 'declined'
        } load ${existing.loadNumber}.`
    })

    return res.json({
      ok: true,
      dispatch: updated
    })
  } catch (error) {
    console.error(
      'Driver assignment response error:',
      error
    )

    return res.status(500).json({
      ok: false,
      message:
        'Unable to update driver assignment'
    })
  }
}

app.post(
  '/api/driver/dispatches/:id/accept',
  requireAuth,
  async (
    req: AuthenticatedRequest,
    res: Response
  ) =>
    respondToDriverAssignment({
      req,
      res,
      action: 'ACCEPTED'
    })
)

app.post(
  '/api/driver/dispatches/:id/decline',
  requireAuth,
  async (
    req: AuthenticatedRequest,
    res: Response
  ) =>
    respondToDriverAssignment({
      req,
      res,
      action: 'DECLINED'
    })
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
            assetType: true,
            trackingSource: true,
            groupName: true,
            temperatureMinC: true,
            temperatureMaxC: true,
            temperatureAlertsEnabled: true,
            temperatureAlertEmail: true,
            cameras: {
              where: {
                active: true
              },
              orderBy: {
                name: 'asc'
              },
              select: {
                id: true,
                provider: true,
                model: true,
                externalId: true,
                name: true,
                active: true,
                cloudStatus: true,
                lastSeenAt: true,
                createdAt: true,
                updatedAt: true
              }
            },
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
// ASSET CAMERAS
// =====================================================

app.get(
  '/api/assets/:id/cameras',
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
            companyId,
            active: true
          },
          select: {
            id: true,
            name: true,
            deviceId: true
          }
        })

      if (!asset) {
        return res.status(404).json({
          ok: false,
          message: 'Asset not found'
        })
      }

      const cameras =
        await prisma.camera.findMany({
          where: {
            assetId,
            active: true
          },
          orderBy: {
            name: 'asc'
          }
        })

      return res.json({
        ok: true,
        asset,
        cameras
      })
    } catch (error) {
      console.error(
        'Get asset cameras error:',
        error
      )

      return res.status(500).json({
        ok: false,
        message:
          'Unable to load asset cameras'
      })
    }
  }
)

app.post(
  '/api/assets/:id/cameras',
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
            'You do not have permission to assign cameras'
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

      const provider =
        typeof req.body?.provider === 'string'
          ? req.body.provider
              .trim()
              .toUpperCase()
          : 'BLACKVUE'

      const model =
        typeof req.body?.model === 'string' &&
        req.body.model.trim()
          ? req.body.model.trim()
          : null

      const externalId =
        typeof req.body?.externalId === 'string' &&
        req.body.externalId.trim()
          ? req.body.externalId.trim()
          : null

      const name =
        typeof req.body?.name === 'string'
          ? req.body.name.trim()
          : ''

      if (
        !name ||
        name.length > 80
      ) {
        return res.status(400).json({
          ok: false,
          message:
            'Camera name is required and must be 80 characters or fewer'
        })
      }

      if (
        provider.length < 2 ||
        provider.length > 40
      ) {
        return res.status(400).json({
          ok: false,
          message: 'Invalid camera provider'
        })
      }

      try {
        const camera =
          await prisma.camera.create({
            data: {
              assetId,
              provider,
              model,
              externalId,
              name,
              cloudStatus: 'NOT_CONNECTED'
            }
          })

        return res.status(201).json({
          ok: true,
          camera
        })
      } catch (error: any) {
        if (error?.code === 'P2002') {
          return res.status(409).json({
            ok: false,
            message:
              'That camera is already assigned in Maverick'
          })
        }

        throw error
      }
    } catch (error) {
      console.error(
        'Create asset camera error:',
        error
      )

      return res.status(500).json({
        ok: false,
        message:
          'Unable to assign camera'
      })
    }
  }
)

app.patch(
  '/api/cameras/:id',
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
            'You do not have permission to edit cameras'
        })
      }

      const cameraId =
        Number(req.params.id)

      if (!Number.isInteger(cameraId)) {
        return res.status(400).json({
          ok: false,
          message: 'Invalid camera ID'
        })
      }

      const existing =
        await prisma.camera.findFirst({
          where: {
            id: cameraId,
            asset: {
              companyId
            }
          }
        })

      if (!existing) {
        return res.status(404).json({
          ok: false,
          message: 'Camera not found'
        })
      }

      const data: {
        name?: string
        model?: string | null
        externalId?: string | null
        active?: boolean
      } = {}

      if (req.body?.name !== undefined) {
        const value =
          typeof req.body.name === 'string'
            ? req.body.name.trim()
            : ''

        if (
          !value ||
          value.length > 80
        ) {
          return res.status(400).json({
            ok: false,
            message: 'Invalid camera name'
          })
        }

        data.name = value
      }

      if (req.body?.model !== undefined) {
        data.model =
          typeof req.body.model === 'string' &&
          req.body.model.trim()
            ? req.body.model.trim()
            : null
      }

      if (req.body?.externalId !== undefined) {
        data.externalId =
          typeof req.body.externalId === 'string' &&
          req.body.externalId.trim()
            ? req.body.externalId.trim()
            : null
      }

      if (req.body?.active !== undefined) {
        data.active =
          Boolean(req.body.active)
      }

      const camera =
        await prisma.camera.update({
          where: {
            id: cameraId
          },
          data
        })

      return res.json({
        ok: true,
        camera
      })
    } catch (error: any) {
      if (error?.code === 'P2002') {
        return res.status(409).json({
          ok: false,
          message:
            'That camera is already assigned in Maverick'
        })
      }

      console.error(
        'Update camera error:',
        error
      )

      return res.status(500).json({
        ok: false,
        message:
          'Unable to update camera'
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
        groupName?: string | null
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
      // ASSET GROUP / COMPANY
      // ---------------------------------

      if (req.body?.groupName !== undefined) {
        const value = req.body.groupName

        if (
          value === null ||
          (
            typeof value === 'string' &&
            value.trim() === ''
          )
        ) {
          data.groupName = null
        } else if (
          typeof value === 'string' &&
          value.trim().length <= 80
        ) {
          data.groupName = value.trim()
        } else {
          return res.status(400).json({
            ok: false,
            message:
              'Asset group name must be 80 characters or fewer'
          })
        }
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
            assetType: true,
            trackingSource: true,
            groupName: true,
            temperatureMinC: true,
            temperatureMaxC: true,
            temperatureAlertsEnabled: true,
            temperatureAlertEmail: true,
            cameras: {
              where: {
                active: true
              },
              orderBy: {
                name: 'asc'
              },
              select: {
                id: true,
                provider: true,
                model: true,
                externalId: true,
                name: true,
                active: true,
                cloudStatus: true,
                lastSeenAt: true,
                createdAt: true,
                updatedAt: true
              }
            },
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
// ELIMINAR ASSET
// =====================================================

app.delete(
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
            'You do not have permission to delete assets'
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
          },
          select: {
            id: true,
            deviceId: true,
            name: true,
            dispatches: {
              where: {
                status: {
                  notIn: [
                    'DELIVERED',
                    'CANCELLED'
                  ]
                }
              },
              select: {
                id: true,
                loadNumber: true,
                status: true
              },
              take: 1
            }
          }
        })

      if (!asset) {
        return res.status(404).json({
          ok: false,
          message: 'Asset not found'
        })
      }

      const activeLoad =
        asset.dispatches[0]

      if (activeLoad) {
        return res.status(409).json({
          ok: false,
          message:
            `Asset is assigned to active load ${activeLoad.loadNumber}. Deliver or cancel that load before deleting the asset.`
        })
      }

      await prisma.$transaction(
        async (tx) => {
          // Preserve historical telemetry, notifications and loads, but
          // detach them from the asset before the asset itself is removed.
          await tx.telemetry.updateMany({
            where: {
              assetId: asset.id
            },
            data: {
              assetId: null
            }
          })

          await tx.notificationEvent.updateMany({
            where: {
              assetId: asset.id
            },
            data: {
              assetId: null
            }
          })

          await tx.dispatch.updateMany({
            where: {
              assetId: asset.id
            },
            data: {
              assetId: null
            }
          })

          await tx.camera.deleteMany({
            where: {
              assetId: asset.id
            }
          })

          await tx.asset.delete({
            where: {
              id: asset.id
            }
          })
        }
      )

      return res.json({
        ok: true,
        deleted: {
          id: asset.id,
          deviceId:
            asset.deviceId,
          name: asset.name
        }
      })
    } catch (error) {
      console.error(
        'Delete asset error:',
        error
      )

      return res.status(500).json({
        ok: false,
        message:
          'Unable to delete asset'
      })
    }
  }
)


function normalizeRememberedAddress(value: string) {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase()
}

function internalAddressCode(address: string) {
  const normalized = normalizeRememberedAddress(address)
  const digest = createHash('sha1')
    .update(normalized)
    .digest('hex')
    .slice(0, 16)
    .toUpperCase()

  return `ADDR_${digest}`
}

async function rememberCustomerLocations(
  companyId: number,
  stops: DispatchStopInput[],
  authorizedSignerEmail?: string | null
) {
  const primaryPickup =
    [...stops]
      .filter((stop) => stop.type === 'PICKUP')
      .sort(
        (a, b) =>
          (a.pairNumber || a.sequence) -
          (b.pairNumber || b.sequence)
      )[0] || null

  for (const stop of stops) {
    const shouldRememberSigner =
      Boolean(
        authorizedSignerEmail &&
        primaryPickup &&
        stop.sequence === primaryPickup.sequence
      )
    if (!stop.name || !stop.address) continue

    const requestedCode = normalizeCustomerCode(stop.customerCode)
    const normalizedAddress = normalizeRememberedAddress(stop.address)

    const existingByAddress =
      await prisma.customerLocation.findFirst({
        where: {
          companyId,
          address: {
            equals: stop.address,
            mode: 'insensitive'
          }
        },
        orderBy: {
          lastUsedAt: 'desc'
        }
      })

    const storageCode =
      requestedCode ||
      existingByAddress?.code ||
      internalAddressCode(normalizedAddress)

    if (
      existingByAddress &&
      existingByAddress.code !== storageCode
    ) {
      const codeOwner =
        await prisma.customerLocation.findUnique({
          where: {
            companyId_code: {
              companyId,
              code: storageCode
            }
          }
        })

      if (!codeOwner) {
        await prisma.customerLocation.update({
          where: { id: existingByAddress.id },
          data: {
            code: storageCode,
            customerName: stop.name,
            address: stop.address,
            phone: stop.phone,
            ...(shouldRememberSigner
              ? {
                  authorizedSignerEmail:
                  authorizedSignerEmail ?? null
                }
              : {}),
            latitude: stop.latitude,
            longitude: stop.longitude,
            lastUsedAt: new Date()
          }
        })
        continue
      }
    }

    await prisma.customerLocation.upsert({
      where: {
        companyId_code: {
          companyId,
          code: storageCode
        }
      },
      update: {
        customerName: stop.name,
        address: stop.address,
        phone: stop.phone,
        ...(shouldRememberSigner
          ? {
              authorizedSignerEmail:
                  authorizedSignerEmail ?? null
            }
          : {}),
        latitude: stop.latitude,
        longitude: stop.longitude,
        lastUsedAt: new Date()
      },
      create: {
        companyId,
        code: storageCode,
        customerName: stop.name,
        address: stop.address,
        phone: stop.phone,
        ...(shouldRememberSigner
          ? {
              authorizedSignerEmail:
                  authorizedSignerEmail ?? null
            }
          : {}),
        latitude: stop.latitude,
        longitude: stop.longitude,
        lastUsedAt: new Date()
      }
    })
  }
}

app.get(
  '/api/customer-locations',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.user?.companyId
    if (!companyId) {
      return res.status(401).json({ ok: false, message: 'Invalid session' })
    }

    const q = String(req.query.q || '').trim()
    const locations = await prisma.customerLocation.findMany({
      where: {
        companyId,
        ...(q
          ? {
              AND: [
                {
                  NOT: {
                    code: { startsWith: 'ADDR_' }
                  }
                },
                {
                  OR: [
                    { code: { contains: q.toUpperCase() } },
                    { customerName: { contains: q, mode: 'insensitive' } },
                    { address: { contains: q, mode: 'insensitive' } }
                  ]
                }
              ]
            }
          : {})
      },
      orderBy: [{ lastUsedAt: 'desc' }],
      take: 12
    })

    return res.json({ ok: true, locations })
  }
)

app.get(
  '/api/address-autocomplete',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.user?.companyId
    if (!companyId) {
      return res.status(401).json({
        ok: false,
        message: 'Invalid session'
      })
    }

    const q = String(req.query.q || '').trim()

    if (q.length < 2) {
      return res.json({
        ok: true,
        results: []
      })
    }

    try {
      const locations =
        await prisma.customerLocation.findMany({
          where: {
            companyId,
            OR: [
              {
                address: {
                  contains: q,
                  mode: 'insensitive'
                }
              },
              {
                customerName: {
                  contains: q,
                  mode: 'insensitive'
                }
              },
              {
                code: {
                  contains: q.toUpperCase()
                }
              }
            ]
          },
          orderBy: [
            { lastUsedAt: 'desc' },
            { updatedAt: 'desc' }
          ],
          take: 8
        })

      const seen = new Set<string>()
      const results = locations
        .filter((location) => {
          const key = normalizeRememberedAddress(
            location.address
          )
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        .map((location) => ({
          id: location.id,
          formatted: location.address,
          code: location.code.startsWith('ADDR_')
            ? null
            : location.code,
          customerName: location.customerName,
          phone: location.phone,
          authorizedSignerEmail:
            location.authorizedSignerEmail,
          city: location.city,
          state: null,
          postcode: null,
          latitude: location.latitude,
          longitude: location.longitude
        }))

      return res.json({
        ok: true,
        results,
        source: 'mavtrack-history'
      })
    } catch (error) {
      console.error(
        'Saved address autocomplete error:',
        error
      )

      return res.status(500).json({
        ok: false,
        message: 'Unable to search saved addresses'
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

async function generateUniqueDispatchLoadNumber(
  companyId: number
) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const candidate =
      String(
        Math.floor(
          Math.random() * 100_000_000
        )
      ).padStart(8, '0')

    const existing =
      await prisma.dispatch.findFirst({
        where: {
          companyId,
          loadNumber: candidate
        },
        select: {
          id: true
        }
      })

    if (!existing) {
      return candidate
    }
  }

  throw new Error(
    'Unable to generate a unique load number'
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

type DispatchStopInput = {
  sequence: number
  pairNumber: number
  type: 'PICKUP' | 'DROP'
  customerCode: string | null
  name: string
  address: string
  phone: string | null
  latitude: number | null
  longitude: number | null
  reference: string | null
  notes: string | null
  scheduledAt: Date | null
}

function parseDispatchStops(
  value: unknown
): {
  stops: DispatchStopInput[] | null
  error: string | null
} {
  if (value === undefined) {
    return { stops: null, error: null }
  }

  if (!Array.isArray(value)) {
    return { stops: null, error: 'Stops must be an array' }
  }

  const rawStops: DispatchStopInput[] = []

  for (let index = 0; index < value.length; index += 1) {
    const raw = value[index] as any
    const type = String(raw?.type || '').trim().toUpperCase()
    const name = optionalString(raw?.name)
    const address = optionalString(raw?.address)

    if ((type !== 'PICKUP' && type !== 'DROP') || !name || !address) {
      return {
        stops: null,
        error: `Stop ${index + 1} must include a valid type, facility name and address`
      }
    }

    rawStops.push({
      sequence: index + 1,
      pairNumber: 1,
      type: type as 'PICKUP' | 'DROP',
      customerCode:
        normalizeCustomerCode(raw?.customerCode) || null,
      name,
      address,
      phone: formatPhone(raw?.phone) || null,
      latitude: optionalNumber(raw?.latitude),
      longitude: optionalNumber(raw?.longitude),
      reference: optionalString(raw?.reference),
      notes: optionalString(raw?.notes),
      scheduledAt: optionalDate(raw?.scheduledAt)
    })
  }

  const pickups = rawStops.filter(
    (stop) => stop.type === 'PICKUP'
  )
  const drops = rawStops.filter(
    (stop) => stop.type === 'DROP'
  )

  if (pickups.length === 0 || drops.length === 0) {
    return {
      stops: null,
      error: 'A load must contain at least one pickup and one drop'
    }
  }

  const orderedStops = [
    ...pickups.map((stop, index) => ({
      ...stop,
      pairNumber: index + 1
    })),
    ...drops.map((stop, index) => ({
      ...stop,
      pairNumber: index + 1
    }))
  ].map((stop, index) => ({
    ...stop,
    sequence: index + 1
  }))

  return {
    stops: orderedStops,
    error: null
  }
}

function dispatchDocumentMeta(
  document: {
    id: number
    dispatchId: number
    originalName: string
    mimeType: string
    sizeBytes: number
    category: string
    uploadedByRole: string
    uploadedByName: string | null
    customerVisible: boolean
    isSignature: boolean
    signedBy: string | null
    signedAt: Date | null
    description: string | null
    createdAt: Date
  }
) {
  return document
}

function decodeBase64File(
  value: unknown
): Buffer | null {
  if (
    typeof value !== 'string' ||
    !value.trim()
  ) {
    return null
  }

  try {
    return Buffer.from(
      value.trim(),
      'base64'
    )
  } catch {
    return null
  }
}

const MAX_DISPATCH_DOCUMENT_BYTES =
  8 * 1024 * 1024

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
                active: true,
                assetType: true,
                trackingSource: true
              }
            },
            driver: {
              select: {
                id: true,
                email: true,
                name: true,
                active: true,
                driverProfile: true
              }
            },
            statusEvents: {
              orderBy: {
                createdAt: 'desc'
              },
              take: 20
            },
            stops: {
              orderBy: {
                sequence: 'asc'
              }
            },
            documents: {
              select: {
                id: true,
                dispatchId: true,
                originalName: true,
                mimeType: true,
                sizeBytes: true,
                category: true,
                uploadedByRole: true,
                uploadedByName: true,
                customerVisible: true,
                isSignature: true,
                signedBy: true,
                signedAt: true,
                description: true,
                createdAt: true
              },
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
            driver: {
              select: {
                id: true,
                email: true,
                name: true,
                active: true,
                driverProfile: true
              }
            },
            statusEvents: {
              orderBy: {
                createdAt: 'desc'
              }
            },
            stops: {
              orderBy: {
                sequence: 'asc'
              }
            },
            documents: {
              select: {
                id: true,
                dispatchId: true,
                originalName: true,
                mimeType: true,
                sizeBytes: true,
                category: true,
                uploadedByRole: true,
                uploadedByName: true,
                customerVisible: true,
                isSignature: true,
                signedBy: true,
                signedAt: true,
                description: true,
                createdAt: true
              },
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

app.delete(
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
          },
          select: {
            id: true,
            loadNumber: true,
            status: true
          }
        })

      if (!existing) {
        return res.status(404).json({
          ok: false,
          message: 'Load not found'
        })
      }

      if (
        existing.status !== 'DELIVERED' &&
        existing.status !== 'CANCELLED'
      ) {
        return res.status(409).json({
          ok: false,
          message:
            'Only delivered or cancelled loads can be deleted from Load History.'
        })
      }

      await prisma.dispatch.delete({
        where: {
          id: existing.id
        }
      })

      return res.json({
        ok: true,
        deleted: {
          id: existing.id,
          loadNumber:
            existing.loadNumber
        }
      })
    } catch (error) {
      console.error(
        'Delete dispatch error:',
        error
      )

      return res.status(500).json({
        ok: false,
        message:
          'Unable to delete load'
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

      const creatingUser =
        req.user?.userId
          ? await prisma.user.findFirst({
              where: {
                id: req.user.userId,
                companyId,
                active: true
              },
              select: {
                name: true,
                phone: true
              }
            })
          : null

      const requestedLoadNumber =
        optionalString(
          req.body?.loadNumber
        )

      const loadNumber =
        requestedLoadNumber &&
        /^\d{8}$/.test(
          requestedLoadNumber
        )
          ? requestedLoadNumber
          : await generateUniqueDispatchLoadNumber(
              companyId
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

      const authorizedSignerEmail =
        optionalString(
          req.body?.authorizedSignerEmail
        )?.toLowerCase()

      if (
        !authorizedSignerEmail ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
          authorizedSignerEmail
        )
      ) {
        return res.status(400).json({
          ok: false,
          message:
            'Owner / authorized signer email is required and must be valid'
        })
      }

      if (
        !pickupName ||
        !pickupAddress ||
        !deliveryName ||
        !deliveryAddress
      ) {
        return res.status(400).json({
          ok: false,
          message:
            'Pickup and delivery are required'
        })
      }

      const parsedStopResult =
        parseDispatchStops(
          req.body?.stops
        )

      if (parsedStopResult.error) {
        return res.status(400).json({
          ok: false,
          message:
            parsedStopResult.error
        })
      }

      const dispatchStops =
        parsedStopResult.stops ||
        [
          {
            sequence: 1,
            pairNumber: 1,
            type: 'PICKUP' as const,
            customerCode:
              normalizeCustomerCode(req.body?.pickupCustomerCode) || null,
            name: pickupName,
            address: pickupAddress,
            phone:
              formatPhone(req.body?.pickupPhone) || null,
            latitude: optionalNumber(req.body?.pickupLatitude),
            longitude: optionalNumber(req.body?.pickupLongitude),
            reference:
              optionalString(
                req.body?.pickupReference
              ),
            notes: null,
            scheduledAt:
              optionalDate(
                req.body?.pickupScheduledAt
              )
          },
          {
            sequence: 2,
            pairNumber: 1,
            type: 'DROP' as const,
            customerCode:
              normalizeCustomerCode(req.body?.deliveryCustomerCode) || null,
            name: deliveryName,
            address: deliveryAddress,
            phone:
              formatPhone(req.body?.deliveryPhone) || null,
            latitude: optionalNumber(req.body?.deliveryLatitude),
            longitude: optionalNumber(req.body?.deliveryLongitude),
            reference:
              optionalString(
                req.body?.deliveryReference
              ),
            notes: null,
            scheduledAt:
              optionalDate(
                req.body?.deliveryScheduledAt
              )
          }
        ]

      let assetId: number | null = null
      let selectedAssetTrackingSource: string | null = null

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
        selectedAssetTrackingSource =
          String(asset.trackingSource || 'MAV2').toUpperCase()
      }

      let driverId: number | null = null

      if (
        req.body?.driverId !== null &&
        req.body?.driverId !== undefined &&
        req.body?.driverId !== ''
      ) {
        const requestedDriverId =
          Number(req.body.driverId)

        if (!Number.isInteger(requestedDriverId)) {
          return res.status(400).json({
            ok: false,
            message: 'Invalid driver'
          })
        }

        const driver =
          await prisma.user.findFirst({
            where: {
              id: requestedDriverId,
              companyId,
              role: 'driver',
              active: true
            },
            include: {
              driverProfile: true
            }
          })

        if (!driver) {
          return res.status(404).json({
            ok: false,
            message: 'Driver not found'
          })
        }

        const conflictingDriverLoad =
          await prisma.dispatch.findFirst({
            where: {
              companyId,
              driverId: driver.id,
              assignmentStatus: {
                in: [
                  'PENDING',
                  'ACCEPTED'
                ]
              },
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

        if (conflictingDriverLoad) {
          return res.status(409).json({
            ok: false,
            message:
              `Driver is already assigned to ${conflictingDriverLoad.loadNumber}`
          })
        }

        driverId = driver.id
      }

      const manualDriverName =
        optionalString(req.body?.manualDriverName)

      if (
        assetId != null &&
        selectedAssetTrackingSource !== 'PHONE' &&
        !manualDriverName
      ) {
        return res.status(400).json({
          ok: false,
          message: 'Driver name is required for MAV2 assets'
        })
      }

      if (
        selectedAssetTrackingSource === 'PHONE' &&
        driverId == null
      ) {
        return res.status(400).json({
          ok: false,
          message: 'This PHONE asset is not linked to an active MavDriver driver'
        })
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
            driverId,
            manualDriverName:
              selectedAssetTrackingSource === 'PHONE'
                ? null
                : manualDriverName,
            assignmentStatus:
              driverId != null
                ? 'PENDING'
                : 'UNASSIGNED',
            acceptedAt: null,
            declinedAt: null,
            authorizedSignerEmail,
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

            dispatcherName:
              creatingUser?.name ||
              optionalString(req.body?.dispatcherName),
            dispatcherPhone:
              formatPhone(creatingUser?.phone) ||
              formatPhone(req.body?.dispatcherPhone) || null,
            poNumber:
              optionalString(
                req.body?.poNumber
              ),
            bolNumber:
              optionalString(
                req.body?.bolNumber
              ),
            carrierName:
              optionalString(
                req.body?.carrierName
              ),
            lessorName:
              optionalString(
                req.body?.lessorName
              ),
            truckNumber:
              optionalString(
                req.body?.truckNumber
              ),
            trailerNumber:
              optionalString(
                req.body?.trailerNumber
              ),
            trailerLicense:
              optionalString(
                req.body?.trailerLicense
              ),

            pickupPhone:
              formatPhone(req.body?.pickupPhone) || null,
            pickupReference:
              optionalString(
                req.body?.pickupReference
              ),

            deliveryPhone:
              formatPhone(req.body?.deliveryPhone) || null,
            deliveryReference:
              optionalString(
                req.body?.deliveryReference
              ),

            units:
              optionalNumber(
                req.body?.units
              ),
            weightLbs:
              optionalNumber(
                req.body?.weightLbs
              ),
            miles:
              optionalNumber(
                req.body?.miles
              ),
            carrierPay:
              optionalNumber(
                req.body?.carrierPay
              ),
            rateType:
              optionalString(
                req.body?.rateType
              ),

            driverInstructions:
              optionalString(
                req.body?.driverInstructions
              ),
            termsAndAgreement:
              optionalString(
                req.body?.termsAndAgreement
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
                eventType:
                  'DISPATCH_CREATED',
                title:
                  'Load assigned',
                notes:
                  'Dispatch created and assigned'
              }
            },

            stops: {
              create:
                dispatchStops
            }
          },
          include: {
            asset: true,
            driver: {
              select: {
                id: true,
                email: true,
                name: true,
                active: true,
                driverProfile: true
              }
            },
            statusEvents: {
              orderBy: {
                createdAt: 'desc'
              }
            },
            stops: {
              orderBy: {
                sequence: 'asc'
              }
            },
            documents: {
              select: {
                id: true,
                dispatchId: true,
                originalName: true,
                mimeType: true,
                sizeBytes: true,
                category: true,
                uploadedByRole: true,
                uploadedByName: true,
                customerVisible: true,
                isSignature: true,
                signedBy: true,
                signedAt: true,
                description: true,
                createdAt: true
              },
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

      await rememberCustomerLocations(
        companyId,
        dispatchStops,
        authorizedSignerEmail
      )

      // Send the load confirmation automatically to the authorized signer.
      // Email delivery must never roll back or invalidate a successfully
      // created dispatch, so failures are recorded but remain non-fatal.
      try {
        const signerEmailResult =
          await sendMaverickEmail({
            to: [authorizedSignerEmail],
            subject:
              `MAVTRACK | Load ${dispatch.loadNumber} Confirmation`,
            html: `
              <!DOCTYPE html>
              <html>
                <body style="margin:0;padding:0;background:#f3f6fa;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f6fa;padding:32px 12px;">
                    <tr>
                      <td align="center">
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
                          <tr>
                            <td style="padding:24px 30px;background:#071426;color:#ffffff;">
                              <div style="font-size:16px;font-weight:800;letter-spacing:1px;">MAVTRACK LLC</div>
                              <div style="margin-top:6px;color:#94a3b8;font-size:12px;">Load Confirmation</div>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding:30px;">
                              <h2 style="margin:0 0 8px;font-size:22px;">Load ${escapeHtml(dispatch.loadNumber)}</h2>
                              <p style="margin:0 0 22px;color:#475569;line-height:1.55;">A new load has been created in MAVTRACK and you are listed as the owner / authorized signer for this load.</p>

                              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
                                <tr>
                                  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#64748b;">Pickup</td>
                                  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;">${escapeHtml(dispatch.pickupName)}</td>
                                </tr>
                                <tr>
                                  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#64748b;">Pickup Address</td>
                                  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;">${escapeHtml(dispatch.pickupAddress)}</td>
                                </tr>
                                <tr>
                                  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#64748b;">Delivery</td>
                                  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;">${escapeHtml(dispatch.deliveryName)}</td>
                                </tr>
                                <tr>
                                  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#64748b;">Delivery Address</td>
                                  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;">${escapeHtml(dispatch.deliveryAddress)}</td>
                                </tr>
                                <tr>
                                  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#64748b;">Carrier</td>
                                  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;">${escapeHtml(dispatch.carrierName || '—')}</td>
                                </tr>
                                <tr>
                                  <td style="padding:10px 0;color:#64748b;">Lessor</td>
                                  <td style="padding:10px 0;text-align:right;font-weight:700;">${escapeHtml(dispatch.lessorName || '—')}</td>
                                </tr>
                              </table>

                              <p style="margin:24px 0 0;color:#64748b;font-size:12px;line-height:1.5;">This email was sent automatically when the dispatch was created in MAVTRACK.</p>
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
          assetId: dispatch.assetId,
          dispatchId: dispatch.id,
          type: signerEmailResult.ok
            ? 'AUTHORIZED_SIGNER_EMAIL_SENT'
            : 'AUTHORIZED_SIGNER_EMAIL_FAILED',
          severity: signerEmailResult.ok
            ? 'success'
            : 'warning',
          title: signerEmailResult.ok
            ? 'Authorized signer email sent'
            : 'Authorized signer email not sent',
          message: signerEmailResult.ok
            ? `Load ${dispatch.loadNumber} confirmation was emailed to ${authorizedSignerEmail}.`
            : `Load ${dispatch.loadNumber} was created, but the confirmation email to ${authorizedSignerEmail} could not be sent.`,
          recipients: signerEmailResult.recipients,
          emailSent: signerEmailResult.ok
        })
      } catch (signerEmailError) {
        console.error(
          'Authorized signer email error:',
          signerEmailError
        )
      }

      if (
        dispatch.driverId != null &&
        dispatch.assignmentStatus === 'PENDING'
      ) {
        await sendLoadAssignmentPush({
          driverId:
            dispatch.driverId,
          dispatchId:
            dispatch.id,
          loadNumber:
            dispatch.loadNumber,
          pickupName:
            dispatch.pickupName,
          deliveryName:
            dispatch.deliveryName
        })
      }

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
          },
          include: {
            stops: {
              orderBy: {
                sequence: 'asc'
              }
            }
          }
        })

      if (!existing) {
        return res.status(404).json({
          ok: false,
          message: 'Dispatch not found'
        })
      }

      const data: Record<string, any> = {}
      let updatedStopsForCatalog: DispatchStopInput[] | null = null
      let notifyAssignedDriverId: number | null = null

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

      if (req.body?.driverId !== undefined) {
        if (
          req.body.driverId === null ||
          req.body.driverId === ''
        ) {
          data.driverId = null
          data.assignmentStatus = 'UNASSIGNED'
          data.acceptedAt = null
          data.declinedAt = null
        } else {
          const requestedDriverId =
            Number(req.body.driverId)

          if (!Number.isInteger(requestedDriverId)) {
            return res.status(400).json({
              ok: false,
              message: 'Invalid driver'
            })
          }

          const driver =
            await prisma.user.findFirst({
              where: {
                id: requestedDriverId,
                companyId,
                role: 'driver',
                active: true
              }
            })

          if (!driver) {
            return res.status(404).json({
              ok: false,
              message: 'Driver not found'
            })
          }

          const conflictingDriverLoad =
            await prisma.dispatch.findFirst({
              where: {
                companyId,
                driverId: driver.id,
                id: {
                  not: dispatchId
                },
                assignmentStatus: {
                  in: [
                    'PENDING',
                    'ACCEPTED'
                  ]
                },
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

          if (conflictingDriverLoad) {
            return res.status(409).json({
              ok: false,
              message:
                `Driver is already assigned to ${conflictingDriverLoad.loadNumber}`
            })
          }

          const isNewPendingAssignment =
            existing.driverId !== driver.id ||
            existing.assignmentStatus ===
              'DECLINED' ||
            existing.assignmentStatus ===
              'UNASSIGNED'

          if (isNewPendingAssignment) {
            data.driverId = driver.id
            data.assignmentStatus = 'PENDING'
            data.acceptedAt = null
            data.declinedAt = null
            notifyAssignedDriverId =
              driver.id
          }
        }
      }

      if (
        req.body?.authorizedSignerEmail !==
        undefined
      ) {
        const authorizedSignerEmail =
          optionalString(
            req.body.authorizedSignerEmail
          )?.toLowerCase()

        if (
          !authorizedSignerEmail ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
            authorizedSignerEmail
          )
        ) {
          return res.status(400).json({
            ok: false,
            message:
              'Owner / authorized signer email is required and must be valid'
          })
        }

        data.authorizedSignerEmail =
          authorizedSignerEmail
      }

      const stringFields = [
        'loadNumber',
        'manualDriverName',
        'pickupName',
        'pickupAddress',
        'pickupPhone',
        'pickupReference',
        'deliveryName',
        'deliveryAddress',
        'deliveryPhone',
        'deliveryReference',
        'commodity',
        'referenceNumber',
        'dispatcherName',
        'dispatcherPhone',
        'poNumber',
        'bolNumber',
        'carrierName',
        'lessorName',
        'truckNumber',
        'trailerNumber',
        'trailerLicense',
        'rateType',
        'driverInstructions',
        'termsAndAgreement',
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

      for (const phoneField of [
        'dispatcherPhone',
        'pickupPhone',
        'deliveryPhone'
      ] as const) {
        if (req.body?.[phoneField] !== undefined) {
          data[phoneField] =
            formatPhone(req.body[phoneField]) || null
        }
      }

      const numberFields = [
        'pickupLatitude',
        'pickupLongitude',
        'deliveryLatitude',
        'deliveryLongitude',
        'units',
        'weightLbs',
        'miles',
        'carrierPay',
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

      if (
        req.body?.stops !== undefined
      ) {
        const parsedStopResult =
          parseDispatchStops(
            req.body.stops
          )

        if (parsedStopResult.error) {
          return res.status(400).json({
            ok: false,
            message:
              parsedStopResult.error
          })
        }

        updatedStopsForCatalog =
          parsedStopResult.stops || []

        data.stops = {
          deleteMany: {},
          create: updatedStopsForCatalog
        }
      }

      const updated =
        await prisma.dispatch.update({
          where: {
            id: existing.id
          },
          data,
          include: {
            asset: true,
            driver: {
              select: {
                id: true,
                email: true,
                name: true,
                active: true,
                driverProfile: true
              }
            },
            statusEvents: {
              orderBy: {
                createdAt: 'desc'
              }
            },
            stops: {
              orderBy: {
                sequence: 'asc'
              }
            },
            documents: {
              select: {
                id: true,
                dispatchId: true,
                originalName: true,
                mimeType: true,
                sizeBytes: true,
                category: true,
                uploadedByRole: true,
                uploadedByName: true,
                customerVisible: true,
                isSignature: true,
                signedBy: true,
                signedAt: true,
                description: true,
                createdAt: true
              },
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
        updatedStopsForCatalog ||
        req.body?.authorizedSignerEmail !==
          undefined
      ) {
        await rememberCustomerLocations(
          companyId,
          updated.stops,
          updated.authorizedSignerEmail
        )
      }

      if (
        notifyAssignedDriverId != null &&
        updated.driverId ===
          notifyAssignedDriverId &&
        updated.assignmentStatus ===
          'PENDING'
      ) {
        await sendLoadAssignmentPush({
          driverId:
            notifyAssignedDriverId,
          dispatchId:
            updated.id,
          loadNumber:
            updated.loadNumber,
          pickupName:
            updated.pickupName,
          deliveryName:
            updated.deliveryName
        })
      }

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
          },
          include: {
            stops: true
          }
        })

      if (!existing) {
        return res.status(404).json({
          ok: false,
          message: 'Dispatch not found'
        })
      }

      if (
        existing.stops.length > 2 &&
        status !== 'CANCELLED'
      ) {
        return res.status(400).json({
          ok: false,
          message:
            'Multi-stop load status is calculated from the individual pickup/drop statuses. Update the route stops instead.'
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
            stops: {
              orderBy: {
                sequence: 'asc'
              }
            },
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
// DISPATCH STOPS + DOCUMENTS
// =====================================================

async function updateDispatchStopStatusForRequest({
  req,
  res,
  driverOnly
}: {
  req: AuthenticatedRequest
  res: Response
  driverOnly: boolean
}) {
  try {
    if (
      driverOnly &&
      !isDriver(req.user?.role)
    ) {
      return res.status(403).json({
        ok: false,
        message: 'Driver account required'
      })
    }

    if (
      !driverOnly &&
      !isCompanyAdmin(req.user?.role)
    ) {
      return res.status(403).json({
        ok: false,
        message: 'Company admin account required'
      })
    }

    const dispatchId =
      Number(req.params.id)

    const stopId =
      Number(req.params.stopId)

    const status =
      String(
        req.body?.status || ''
      ).toUpperCase()

    if (
      !Number.isInteger(dispatchId) ||
      !Number.isInteger(stopId) ||
      ![
        'PENDING',
        'EN_ROUTE',
        'ARRIVED',
        'COMPLETED'
      ].includes(status)
    ) {
      return res.status(400).json({
        ok: false,
        message: 'Invalid stop update'
      })
    }

    const dispatch =
      await prisma.dispatch.findFirst({
        where: {
          id: dispatchId,
          companyId:
            req.user!.companyId,
          ...(driverOnly
            ? {
                driverId:
                  req.user!.userId,
                assignmentStatus:
                  'ACCEPTED' as const
              }
            : {})
        },
        include: {
          stops: {
            orderBy: {
              sequence: 'asc'
            }
          }
        }
      })

    if (!dispatch) {
      return res.status(404).json({
        ok: false,
        message:
          driverOnly
            ? 'Accepted load not found'
            : 'Dispatch not found'
      })
    }

    const stop =
      dispatch.stops.find(
        (item) =>
          item.id === stopId
      )

    if (!stop) {
      return res.status(404).json({
        ok: false,
        message: 'Stop not found'
      })
    }

    const now = new Date()

    const stopsAfterUpdate =
      dispatch.stops.map((item) =>
        item.id === stop.id
          ? {
              ...item,
              status: status as any
            }
          : item
      )

    const orderedStops =
      [...stopsAfterUpdate].sort(
        (a, b) =>
          a.type === b.type
            ? (a.pairNumber || a.sequence) -
              (b.pairNumber || b.sequence)
            : a.type === 'PICKUP'
              ? -1
              : 1
      )

    const allStopsCompleted =
      orderedStops.length > 0 &&
      orderedStops.every(
        (item) =>
          item.status === 'COMPLETED'
      )

    const nextIncompleteIndex =
      orderedStops.findIndex(
        (item) =>
          item.status !== 'COMPLETED'
      )

    const nextIncompleteStop =
      nextIncompleteIndex >= 0
        ? orderedStops[nextIncompleteIndex]
        : null

    const previousCompletedStop =
      nextIncompleteIndex > 0
        ? orderedStops[nextIncompleteIndex - 1]
        : null

    const nextGlobalStatus =
      allStopsCompleted
        ? 'DELIVERED'
        : !nextIncompleteStop
          ? dispatch.status
          : nextIncompleteStop.status === 'EN_ROUTE'
            ? (
                nextIncompleteStop.type === 'PICKUP'
                  ? 'EN_ROUTE_TO_PICKUP'
                  : 'IN_TRANSIT'
              )
            : nextIncompleteStop.status === 'ARRIVED'
              ? (
                  nextIncompleteStop.type === 'PICKUP'
                    ? 'AT_PICKUP'
                    : 'AT_DELIVERY'
                )
              : previousCompletedStop == null
                ? 'ASSIGNED'
                : nextIncompleteStop.type === 'PICKUP'
                  ? 'EN_ROUTE_TO_PICKUP'
                  : previousCompletedStop.type === 'PICKUP'
                    ? 'LOADED'
                    : 'IN_TRANSIT'

    const stopNumber =
      stop.pairNumber || stop.sequence

    const stopTitle =
      `${stop.type === 'PICKUP' ? 'Pickup' : 'Drop'} ${stopNumber}: ${
        status === 'EN_ROUTE'
          ? 'En route'
          : status === 'ARRIVED'
            ? 'Arrived'
            : status === 'COMPLETED'
              ? 'Completed'
              : 'Pending'
      }`

    const updated =
      await prisma.$transaction(
        async (tx) => {
          await tx.dispatchStop.update({
            where: {
              id: stop.id
            },
            data: {
              status:
                status as any,
              arrivedAt:
                status === 'ARRIVED'
                  ? now
                  : status === 'PENDING' ||
                      status === 'EN_ROUTE'
                    ? null
                    : stop.arrivedAt,
              completedAt:
                status === 'COMPLETED'
                  ? now
                  : status === 'PENDING' ||
                      status === 'EN_ROUTE' ||
                      status === 'ARRIVED'
                    ? null
                    : stop.completedAt
            }
          })

          await tx.dispatch.update({
            where: {
              id: dispatch.id
            },
            data: {
              status:
                nextGlobalStatus as any,
              completedAt:
                nextGlobalStatus === 'DELIVERED'
                  ? now
                  : null
            }
          })

          await tx.dispatchStatusEvent.create({
            data: {
              dispatchId:
                dispatch.id,
              status:
                nextGlobalStatus as any,
              eventType:
                'STOP_STATUS',
              title:
                stopTitle,
              notes:
                `${stop.name} — ${stop.address}`
            }
          })

          return tx.dispatch.findUnique({
            where: {
              id:
                dispatch.id
            },
            include: {
              asset: true,
              driver: {
                select: {
                  id: true,
                  email: true,
                  name: true,
                  driverProfile: true
                }
              },
              statusEvents: {
                orderBy: {
                  createdAt: 'desc'
                }
              },
              stops: {
                orderBy: {
                  sequence: 'asc'
                }
              },
              documents: {
                select: {
                  id: true,
                  dispatchId: true,
                  originalName: true,
                  mimeType: true,
                  sizeBytes: true,
                  category: true,
                  uploadedByRole: true,
                  uploadedByName: true,
                  customerVisible: true,
                  isSignature: true,
                  signedBy: true,
                  signedAt: true,
                  description: true,
                  createdAt: true
                },
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
        }
      )

    if (updated) {
      const activeShares =
        await prisma.dispatchShare.findMany({
          where: {
            dispatchId: updated.id,
            revokedAt: null,
            OR: [
              { expiresAt: null },
              {
                expiresAt: {
                  gt: new Date()
                }
              }
            ]
          },
          orderBy: {
            createdAt: 'desc'
          }
        })

      // A customer can have more than one historical share link.
      // Send one update per email address, using the newest active link.
      const shareByEmail =
        new Map<string, (typeof activeShares)[number]>()

      for (const share of activeShares) {
        const email =
          String(share.customerEmail || '')
            .trim()
            .toLowerCase()

        if (email && !shareByEmail.has(email)) {
          shareByEmail.set(email, share)
        }
      }

      const emailRecipients: string[] = []
      let anyEmailSent = false

      const customerStatusLabel =
        status === 'EN_ROUTE'
          ? 'En route'
          : status === 'ARRIVED'
            ? 'Arrived'
            : status === 'COMPLETED'
              ? (
                  stop.type === 'PICKUP'
                    ? 'Picked up / Completed'
                    : 'Delivered / Completed'
                )
              : 'Pending'

      const updateTitle =
        `Load ${updated.loadNumber}: ${stop.type === 'PICKUP' ? 'Pickup' : 'Drop'} ${stopNumber} — ${customerStatusLabel}`

      const updateMessage =
        `${stop.type === 'PICKUP' ? 'Pickup' : 'Drop'} ${stopNumber} at ${stop.name} was updated to ${customerStatusLabel}. Overall load status: ${dispatchStatusLabel(nextGlobalStatus)}.`

      for (const share of shareByEmail.values()) {
        const trackingUrl =
          `${PUBLIC_FRONTEND_URL}/track/${share.token}`

        const result =
          await sendMaverickEmail({
            to: [share.customerEmail],
            subject:
              `MAVTRACK LLC | ${updateTitle}`,
            html: `
              <!DOCTYPE html>
              <html>
                <body style="margin:0;padding:0;background:#f3f6fa;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f6fa;padding:28px 12px;">
                    <tr>
                      <td align="center">
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:680px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(15,23,42,0.08);">
                          <tr>
                            <td style="background:#071426;padding:26px 32px;">
                              <div style="font-size:23px;font-weight:800;letter-spacing:2px;color:#ffffff;">MAVTRACK LLC</div>
                              <div style="margin-top:7px;font-size:13px;color:#94a3b8;">Load ${escapeHtml(updated.loadNumber)} status update</div>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding:30px 32px;">
                              <div style="font-size:12px;font-weight:800;letter-spacing:1.2px;color:#2563eb;text-transform:uppercase;">${escapeHtml(stop.type === 'PICKUP' ? 'Pickup update' : 'Delivery update')}</div>
                              <h2 style="margin:8px 0 8px;font-size:24px;color:#0f172a;">${escapeHtml(stopTitle)}</h2>
                              <p style="margin:0 0 22px;color:#475569;line-height:1.6;">${escapeHtml(updateMessage)}</p>

                              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;margin:8px 0 24px;">
                                <tr>
                                  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#64748b;">Location</td>
                                  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;">${escapeHtml(stop.name)}</td>
                                </tr>
                                <tr>
                                  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#64748b;">Address</td>
                                  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;">${escapeHtml(stop.address)}</td>
                                </tr>
                                <tr>
                                  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#64748b;">Stop status</td>
                                  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;">${escapeHtml(customerStatusLabel)}</td>
                                </tr>
                                <tr>
                                  <td style="padding:10px 0;color:#64748b;">Overall load status</td>
                                  <td style="padding:10px 0;text-align:right;font-weight:700;">${escapeHtml(dispatchStatusLabel(nextGlobalStatus))}</td>
                                </tr>
                              </table>

                              <a href="${trackingUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;">View Live Load</a>
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

        anyEmailSent =
          anyEmailSent || result.ok

        emailRecipients.push(
          ...result.recipients
        )
      }

      await createNotificationEvent({
        companyId: dispatch.companyId,
        assetId: updated.assetId,
        dispatchId: updated.id,
        type: 'DISPATCH_STOP_STATUS',
        severity:
          status === 'COMPLETED'
            ? 'success'
            : 'info',
        title: updateTitle,
        message: updateMessage,
        recipients:
          uniqueEmails(emailRecipients),
        emailSent: anyEmailSent
      })
    }

    return res.json({
      ok: true,
      dispatch: updated
    })
  } catch (error) {
    console.error(
      'Stop status update error:',
      error
    )

    return res.status(500).json({
      ok: false,
      message:
        'Unable to update stop'
    })
  }
}

app.post(
  '/api/driver/dispatches/:id/stops/:stopId/status',
  requireAuth,
  async (
    req: AuthenticatedRequest,
    res: Response
  ) =>
    updateDispatchStopStatusForRequest({
      req,
      res,
      driverOnly: true
    })
)

app.post(
  '/api/dispatches/:id/stops/:stopId/status',
  requireAuth,
  async (
    req: AuthenticatedRequest,
    res: Response
  ) =>
    updateDispatchStopStatusForRequest({
      req,
      res,
      driverOnly: false
    })
)

app.post(
  '/api/dispatches/:id/documents',
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
          message:
            'Invalid dispatch'
        })
      }

      const dispatch =
        await prisma.dispatch.findFirst({
          where: {
            id: dispatchId,
            companyId
          },
          include: {
            driver: {
              select: {
                id: true,
                name: true,
                email: true,
                driverProfile: true
              }
            }
          }
        })

      if (!dispatch) {
        return res.status(404).json({
          ok: false,
          message:
            'Dispatch not found'
        })
      }

      const role =
        String(
          req.user?.role || ''
        ).toLowerCase()

      if (
        role === 'driver' &&
        (
          dispatch.driverId !==
            req.user!.userId ||
          dispatch.assignmentStatus !==
            'ACCEPTED'
        )
      ) {
        return res.status(403).json({
          ok: false,
          message:
            'Driver must accept this load before uploading documents'
        })
      }

      const originalName =
        optionalString(
          req.body?.originalName
        )

      const mimeType =
        optionalString(
          req.body?.mimeType
        ) ||
        'application/octet-stream'

      const category =
        optionalString(
          req.body?.category
        ) ||
        'OTHER'

      const dataBase64 =
        optionalString(
          req.body?.dataBase64
        )

      const buffer =
        decodeBase64File(
          dataBase64
        )

      if (
        !originalName ||
        !dataBase64 ||
        !buffer ||
        buffer.length === 0
      ) {
        return res.status(400).json({
          ok: false,
          message:
            'Document name and file data are required'
        })
      }

      if (
        buffer.length >
        MAX_DISPATCH_DOCUMENT_BYTES
      ) {
        return res.status(413).json({
          ok: false,
          message:
            'Document must be 8 MB or smaller'
        })
      }

      const profile =
        dispatch.driver
          ?.driverProfile

      const driverName =
        [
          profile?.firstName,
          profile?.lastName
        ]
          .filter(Boolean)
          .join(' ')
          .trim()

      const uploaderName =
        role === 'driver'
          ? (
              driverName ||
              dispatch.driver?.name ||
              req.user!.email
            )
          : req.user!.email

      const document =
        await prisma.dispatchDocument.create({
          data: {
            dispatchId:
              dispatch.id,
            originalName,
            mimeType,
            sizeBytes:
              buffer.length,
            category,
            dataBase64,
            uploadedByUserId:
              req.user!.userId,
            uploadedByRole:
              role || 'user',
            uploadedByName:
              uploaderName,
            customerVisible:
              req.body?.customerVisible !==
              false,
            isSignature:
              false,
            description:
              optionalString(
                req.body?.description
              )
          },
          select: {
            id: true,
            dispatchId: true,
            originalName: true,
            mimeType: true,
            sizeBytes: true,
            category: true,
            uploadedByRole: true,
            uploadedByName: true,
            customerVisible: true,
            isSignature: true,
            signedBy: true,
            signedAt: true,
            description: true,
            createdAt: true
          }
        })

      await prisma.dispatchStatusEvent.create({
        data: {
          dispatchId:
            dispatch.id,
          status:
            dispatch.status,
          eventType:
            'DOCUMENT_UPLOADED',
          title:
            'Document uploaded',
          notes:
            `${uploaderName} uploaded ${originalName}`
        }
      })

      return res.status(201).json({
        ok: true,
        document
      })
    } catch (error) {
      console.error(
        'Dispatch document upload error:',
        error
      )

      return res.status(500).json({
        ok: false,
        message:
          'Unable to upload document'
      })
    }
  }
)

app.get(
  '/api/dispatches/:id/documents/:documentId/file',
  requireAuth,
  async (
    req: AuthenticatedRequest,
    res: Response
  ) => {
    try {
      const dispatchId =
        Number(req.params.id)

      const documentId =
        Number(req.params.documentId)

      const document =
        await prisma.dispatchDocument.findFirst({
          where: {
            id: documentId,
            dispatchId,
            dispatch: {
              companyId:
                req.user!.companyId,
              ...(
                isDriver(
                  req.user?.role
                )
                  ? {
                      driverId:
                        req.user!.userId
                    }
                  : {}
              )
            }
          }
        })

      if (!document) {
        return res.status(404).json({
          ok: false,
          message:
            'Document not found'
        })
      }

      if (
        isDriver(req.user?.role) &&
        document.dispatchId !==
          dispatchId
      ) {
        return res.status(403).json({
          ok: false,
          message:
            'Document access denied'
        })
      }

      const buffer =
        Buffer.from(
          document.dataBase64,
          'base64'
        )

      res.setHeader(
        'Content-Type',
        document.mimeType
      )

      res.setHeader(
        'Content-Disposition',
        `inline; filename="${document.originalName.replace(/"/g, '')}"`
      )

      return res.send(buffer)
    } catch (error) {
      console.error(
        'Dispatch document file error:',
        error
      )

      return res.status(500).json({
        ok: false,
        message:
          'Unable to open document'
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
            allowDriverInfo:
              req.body?.allowDriverInfo !== false,
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
                driver: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    active: true,
                    driverProfile: true
                  }
                },
                statusEvents: {
                  orderBy: {
                    createdAt: 'desc'
                  },
                  take: 20
                }
                ,
                stops: {
                  orderBy: {
                    sequence: 'asc'
                  }
                },
                documents: {
                  where: {
                    customerVisible: true
                  },
                  select: {
                    id: true,
                    dispatchId: true,
                    originalName: true,
                    mimeType: true,
                    sizeBytes: true,
                    category: true,
                    uploadedByRole: true,
                    uploadedByName: true,
                    customerVisible: true,
                    isSignature: true,
                    signedBy: true,
                    signedAt: true,
                    description: true,
                    createdAt: true
                  },
                  orderBy: {
                    createdAt: 'desc'
                  }
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

      const assetId =
        share.dispatch.assetId

      const latestTelemetry =
        assetId
          ? await prisma.telemetry.findFirst({
              where: {
                assetId,
                isBackfill: false
              },
              orderBy: {
                receivedAt: 'desc'
              }
            })
          : null

      // Public tracking must keep the map visible even when the
      // newest telemetry row has no GPS fix. Use the most recent
      // valid GPS point for the same asset as a location fallback.
      const latestLocation =
        assetId
          ? await prisma.telemetry.findFirst({
              where: {
                assetId,
                latitude: {
                  not: null
                },
                longitude: {
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
          : null

      const hasCurrentLocation =
        latestTelemetry?.latitude != null &&
        latestTelemetry?.longitude != null

      const locationSource =
        hasCurrentLocation
          ? latestTelemetry
          : latestLocation

      const telemetryAgeMs =
        latestTelemetry?.receivedAt
          ? Date.now() -
            new Date(
              latestTelemetry.receivedAt
            ).getTime()
          : Number.POSITIVE_INFINITY

      const deviceStatus =
        telemetryAgeMs < 2 * 60 * 1000
          ? 'online'
          : telemetryAgeMs < 10 * 60 * 1000
            ? 'delayed'
            : 'offline'

      const driver =
        share.dispatch.driver

      const profile =
        driver?.driverProfile ?? null

      return res.json({
        ok: true,
        share: {
          customerName:
            share.customerName,
          allowLocation:
            share.allowLocation,
          allowTemperature:
            share.allowTemperature,
          allowDriverInfo:
            share.allowDriverInfo,
          allowEta:
            share.allowEta,
          expiresAt:
            share.expiresAt
        },
        dispatch: {
          id:
            share.dispatch.id,
          loadNumber:
            share.dispatch.loadNumber,
          status:
            share.dispatch.status,

          dispatcherName:
            share.dispatch.dispatcherName,
          dispatcherPhone:
            share.dispatch.dispatcherPhone,

          pickupName:
            share.dispatch.pickupName,
          pickupAddress:
            share.dispatch.pickupAddress,
          pickupPhone:
            share.dispatch.pickupPhone,
          pickupReference:
            share.dispatch.pickupReference,
          pickupScheduledAt:
            share.dispatch.pickupScheduledAt,

          deliveryName:
            share.dispatch.deliveryName,
          deliveryAddress:
            share.dispatch.deliveryAddress,
          deliveryPhone:
            share.dispatch.deliveryPhone,
          deliveryReference:
            share.dispatch.deliveryReference,
          deliveryScheduledAt:
            share.dispatch.deliveryScheduledAt,

          commodity:
            share.dispatch.commodity,
          referenceNumber:
            share.dispatch.referenceNumber,
          poNumber:
            share.dispatch.poNumber,
          bolNumber:
            share.dispatch.bolNumber,

          truckNumber:
            share.dispatch.truckNumber,
          trailerNumber:
            share.dispatch.trailerNumber,
          trailerLicense:
            share.dispatch.trailerLicense,

          temperatureSetpointC:
            share.allowTemperature
              ? share.dispatch.temperatureSetpointC
              : null,
          temperatureMinC:
            share.allowTemperature
              ? share.dispatch.temperatureMinC
              : null,
          temperatureMaxC:
            share.allowTemperature
              ? share.dispatch.temperatureMaxC
              : null,

          driverInstructions:
            share.dispatch.driverInstructions,
          notes:
            share.dispatch.notes,

          assignmentStatus:
            share.dispatch.assignmentStatus,
          manualDriverName:
            share.allowDriverInfo
              ? share.dispatch.manualDriverName
              : null,

          asset:
            share.dispatch.asset
              ? {
                  name:
                    share.dispatch.asset.name,
                  deviceId:
                    share.dispatch.asset.deviceId,
                  assetType:
                    share.dispatch.asset.assetType,
                  trackingSource:
                    share.dispatch.asset.trackingSource
                }
              : null,

          driver:
            share.allowDriverInfo && driver
              ? {
                  id:
                    driver.id,
                  name:
                    driver.name,
                  email:
                    driver.email,
                  phone:
                    profile?.phone ?? null,
                  licenseNumber:
                    profile?.licenseNumber ?? null,
                  licenseState:
                    profile?.licenseState ?? null,
                  currentTruckNumber:
                    profile?.currentTruckNumber ?? null,
                  physicalTruckNumber:
                    profile?.physicalTruckNumber ?? null,
                  currentTrailerNumber:
                    profile?.currentTrailerNumber ?? null,
                  currentTrailerLicense:
                    profile?.currentTrailerLicense ?? null
                }
              : null,

          statusEvents:
            share.dispatch.statusEvents,

          stops:
            share.dispatch.stops,

          documents:
            share.dispatch.documents
              .filter(
                (document) =>
                  share.allowDriverInfo ||
                  !document.isSignature
              )
              .map(
              (document) => ({
                ...document,
                fileUrl:
                  `${PUBLIC_FRONTEND_URL}/api/public/track/${share.token}/documents/${document.id}/file`
              })
            )
        },

        telemetry:
          latestTelemetry ||
          locationSource
            ? {
                receivedAt:
                  latestTelemetry?.receivedAt ??
                  locationSource?.receivedAt ??
                  null,

                locationReceivedAt:
                  locationSource?.recordedAt ??
                  locationSource?.receivedAt ??
                  null,

                locationIsCurrent:
                  hasCurrentLocation,

                deviceStatus,

                temperature:
                  share.allowTemperature
                    ? latestTelemetry?.temperature ?? null
                    : null,

                latitude:
                  share.allowLocation
                    ? locationSource?.latitude ?? null
                    : null,

                longitude:
                  share.allowLocation
                    ? locationSource?.longitude ?? null
                    : null,

                altitude:
                  share.allowLocation
                    ? locationSource?.altitude ?? null
                    : null,

                speedKph:
                  share.allowLocation
                    ? latestTelemetry?.speedKph ??
                      locationSource?.speedKph ??
                      null
                    : null,

                movementStatus:
                  share.allowLocation
                    ? latestTelemetry?.movementStatus ??
                      locationSource?.movementStatus ??
                      null
                    : null,

                source:
                  share.allowLocation
                    ? latestTelemetry?.source ??
                      locationSource?.source ??
                      null
                    : null,

                accuracyMeters:
                  share.allowLocation
                    ? latestTelemetry?.accuracyMeters ??
                      locationSource?.accuracyMeters ??
                      null
                    : null,

                headingDegrees:
                  share.allowLocation
                    ? latestTelemetry?.headingDegrees ??
                      locationSource?.headingDegrees ??
                      null
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


app.get(
  '/api/public/track/:token/documents/:documentId/file',
  async (
    req,
    res
  ) => {
    try {
      const token =
        String(
          req.params.token || ''
        ).trim()

      const documentId =
        Number(
          req.params.documentId
        )

      const share =
        await prisma.dispatchShare.findUnique({
          where: {
            token
          }
        })

      if (
        !share ||
        share.revokedAt ||
        (
          share.expiresAt &&
          share.expiresAt <= new Date()
        ) ||
        !Number.isInteger(documentId)
      ) {
        return res.status(404).send(
          'Document not available'
        )
      }

      const document =
        await prisma.dispatchDocument.findFirst({
          where: {
            id:
              documentId,
            dispatchId:
              share.dispatchId,
            customerVisible:
              true
          }
        })

      if (
        !document ||
        (!share.allowDriverInfo && document.isSignature)
      ) {
        return res.status(404).send(
          'Document not available'
        )
      }

      const buffer =
        Buffer.from(
          document.dataBase64,
          'base64'
        )

      res.setHeader(
        'Content-Type',
        document.mimeType
      )

      res.setHeader(
        'Content-Disposition',
        `inline; filename="${document.originalName.replace(/"/g, '')}"`
      )

      return res.send(buffer)
    } catch (error) {
      console.error(
        'Public document file error:',
        error
      )

      return res.status(500).send(
        'Unable to open document'
      )
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
        reeferPower,
        powerSource,
        recordedAt,
        isBackfill
      } = req.body

      // ---------------------------------
      // VALIDACION BASICA
      // ---------------------------------

      if (
        typeof deviceId !== 'string' ||
        !deviceId.trim()
      ) {
        return res.status(400).json({
          ok: false,
          message:
            'Invalid telemetry data'
        })
      }

      const normalizedDeviceId =
        deviceId.trim()

      const safeTemperature =
        typeof temperature === 'number' &&
        Number.isFinite(temperature) &&
        temperature >= -55 &&
        temperature <= 125
          ? temperature
          : null

      // ---------------------------------
      // GPS SEGURO
      // ---------------------------------

      const safeLatitude =
        typeof latitude === 'number' &&
        Number.isFinite(latitude) &&
        latitude >= -90 &&
        latitude <= 90
          ? latitude
          : null

      const safeLongitude =
        typeof longitude === 'number' &&
        Number.isFinite(longitude) &&
        longitude >= -180 &&
        longitude <= 180
          ? longitude
          : null

      const safeAltitude =
        typeof altitude === 'number' &&
        Number.isFinite(altitude)
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

      const safeReeferPower =
        typeof reeferPower === 'boolean'
          ? reeferPower
          : reeferPower === 1 ||
              reeferPower === '1' ||
              String(reeferPower).toLowerCase() === 'true'
            ? true
            : reeferPower === 0 ||
                reeferPower === '0' ||
                String(reeferPower).toLowerCase() === 'false'
              ? false
              : null

      const safePowerSource =
        typeof powerSource === 'string' &&
        powerSource.trim().length > 0
          ? powerSource
              .trim()
              .toUpperCase()
              .slice(0, 32)
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
      
      let asset =
        await prisma.asset.findUnique({
          where: {
            deviceId:
              normalizedDeviceId
          }
        })

      // Automatically provision the physical MAV2 fleet that we are
      // programming now. Keep the already-existing TRAILER-002 untouched,
      // and auto-register/repair TRAILER-001 plus TRAILER-003..012.
      const mav2FleetMatch =
        /^TRAILER-(\d{3})$/.exec(
          normalizedDeviceId
        )

      const mav2FleetNumber =
        mav2FleetMatch
          ? Number(mav2FleetMatch[1])
          : null

      const shouldAutoProvisionMav2 =
        mav2FleetNumber !== null &&
        (
          mav2FleetNumber === 1 ||
          (
            mav2FleetNumber >= 3 &&
            mav2FleetNumber <= 12
          )
        )

      if (shouldAutoProvisionMav2) {
        const trailer002 =
          await prisma.asset.findUnique({
            where: {
              deviceId: 'TRAILER-002'
            },
            select: {
              companyId: true
            }
          })

        if (trailer002) {
          const fleetName =
            `TRL ${String(mav2FleetNumber).padStart(2, '0')}`

          asset =
            await prisma.asset.upsert({
              where: {
                deviceId:
                  normalizedDeviceId
              },
              update: {
                companyId:
                  trailer002.companyId,
                name:
                  fleetName,
                description:
                  'Maverick T-SIM7670G-S3 tracking unit',
                assetType: 'TRL',
                trackingSource: 'MAV2',
                groupName: 'GA LOGISTICS',
                active: true
              },
              create: {
                companyId:
                  trailer002.companyId,
                deviceId:
                  normalizedDeviceId,
                name:
                  fleetName,
                description:
                  'Maverick T-SIM7670G-S3 tracking unit',
                assetType: 'TRL',
                trackingSource: 'MAV2',
                groupName: 'GA LOGISTICS',
                active: true
              }
            })

          // Re-link telemetry that may have arrived before Fleet registration.
          await prisma.telemetry.updateMany({
            where: {
              deviceId:
                normalizedDeviceId,
              OR: [
                {
                  assetId: null
                },
                {
                  assetId: {
                    not:
                      asset.id
                  }
                }
              ]
            },
            data: {
              assetId:
                asset.id
            }
          })

          console.log(
            'MAV2 Fleet assignment confirmed:',
            {
              deviceId:
                asset.deviceId,
              name:
                asset.name,
              groupName:
                asset.groupName,
              companyId:
                asset.companyId,
              active:
                asset.active
            }
          )
        } else {
          console.warn(
            `${normalizedDeviceId} telemetry received, but TRAILER-002 was not found; Fleet assignment could not be completed.`
          )
        }
      }

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
    deviceId:
      normalizedDeviceId,

    temperature:
      safeTemperature,

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

    source:
      'MAV2',

    batteryVoltage:
      safeBatteryVoltage,

    batteryPercent:
      safeBatteryPercent,

    reeferPower:
      safeReeferPower,

    powerSource:
      safePowerSource,

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
        !safeIsBackfill &&
        safeTemperature !== null
      ) {
        await processTemperatureAlertTransition({
          asset,
          previousTemperatureC:
            previousLiveTelemetry
              ?.temperature ?? null,
          currentTemperatureC:
            safeTemperature
        })
      }

      // ---------------------------------
      // LOG EN FAHRENHEIT
      // ---------------------------------

      const temperatureF =
        safeTemperature !== null
          ? (
              safeTemperature *
              9
            ) /
            5 +
            32
          : null

      console.log(
        'Telemetry received:',
        {
          deviceId:
            normalizedDeviceId,

          temperatureF:
            temperatureF !== null
              ? Number(
                  temperatureF.toFixed(
                    1
                  )
                )
              : null,

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

          reeferPower:
            safeReeferPower,

          powerSource:
            safePowerSource,

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
// ESTADO DE SESION DE TRACKING MOVIL / TRK
// =====================================================

app.post(
  '/api/mobile/tracking-state',
  async (req, res) => {
    try {
      const requestKey =
        typeof req.headers['x-mavtrack-key'] === 'string'
          ? req.headers['x-mavtrack-key'].trim()
          : ''

      if (
        !MOBILE_TELEMETRY_KEY ||
        requestKey !== MOBILE_TELEMETRY_KEY
      ) {
        return res.status(401).json({
          ok: false,
          message:
            'Invalid mobile telemetry credentials'
        })
      }

      const deviceId =
        typeof req.body?.deviceId === 'string'
          ? req.body.deviceId.trim()
          : ''

      const active =
        req.body?.active === true

      if (!deviceId) {
        return res.status(400).json({
          ok: false,
          message: 'deviceId is required'
        })
      }

      const asset =
        await prisma.asset.findUnique({
          where: {
            deviceId
          }
        })

      if (
        !asset ||
        !asset.active ||
        asset.assetType !== 'TRK' ||
        asset.trackingSource !== 'PHONE'
      ) {
        return res.status(404).json({
          ok: false,
          message:
            'Truck asset not found'
        })
      }

      const now =
        new Date()

      const updated =
        await prisma.asset.update({
          where: {
            id: asset.id
          },
          data: active
            ? {
                trackingActive: true,
                trackingStartedAt:
                  asset.trackingActive
                    ? asset.trackingStartedAt
                    : now,
                trackingStoppedAt:
                  null,
                lastHeartbeatAt:
                  now
              }
            : {
                trackingActive: false,
                trackingStoppedAt:
                  now,
                lastHeartbeatAt:
                  now
              },
          select: {
            id: true,
            deviceId: true,
            trackingActive: true,
            trackingStartedAt: true,
            trackingStoppedAt: true,
            lastHeartbeatAt: true,
            lastPhoneGpsAt: true
          }
        })

      return res.json({
        ok: true,
        tracking: updated
      })
    } catch (error) {
      console.error(
        'Mobile tracking state error:',
        error
      )

      return res.status(500).json({
        ok: false,
        message:
          'Unable to update tracking state'
      })
    }
  }
)


// =====================================================
// RECIBIR TELEMETRIA MOVIL / TRK
// =====================================================

app.post(
  '/api/mobile/telemetry',
  async (req, res) => {
    try {
      const requestKey =
        typeof req.headers['x-mavtrack-key'] === 'string'
          ? req.headers['x-mavtrack-key'].trim()
          : ''

      if (
        !MOBILE_TELEMETRY_KEY ||
        requestKey !== MOBILE_TELEMETRY_KEY
      ) {
        return res.status(401).json({
          ok: false,
          message:
            'Invalid mobile telemetry credentials'
        })
      }

      const {
        deviceId,
        latitude,
        longitude,
        altitude,
        speedKph,
        heading,
        accuracy,
        trackingActive,
        recordedAt
      } = req.body

      if (
        typeof deviceId !== 'string' ||
        !deviceId.trim() ||
        typeof latitude !== 'number' ||
        !Number.isFinite(latitude) ||
        latitude < -90 ||
        latitude > 90 ||
        typeof longitude !== 'number' ||
        !Number.isFinite(longitude) ||
        longitude < -180 ||
        longitude > 180
      ) {
        return res.status(400).json({
          ok: false,
          message:
            'Invalid mobile GPS data'
        })
      }

      const normalizedDeviceId =
        deviceId.trim()

      const asset =
        await prisma.asset.findUnique({
          where: {
            deviceId:
              normalizedDeviceId
          }
        })

      if (
        !asset ||
        !asset.active ||
        asset.assetType !== 'TRK' ||
        asset.trackingSource !== 'PHONE'
      ) {
        return res.status(404).json({
          ok: false,
          message:
            'Truck asset not found'
        })
      }

      const safeAltitude =
        typeof altitude === 'number' &&
        Number.isFinite(altitude)
          ? altitude
          : null

      const safeSpeedKph =
        typeof speedKph === 'number' &&
        Number.isFinite(speedKph)
          ? Math.max(0, speedKph)
          : null

      const safeHeading =
        typeof heading === 'number' &&
        Number.isFinite(heading)
          ? (
              (
                heading % 360
              ) + 360
            ) % 360
          : null

      const safeAccuracy =
        typeof accuracy === 'number' &&
        Number.isFinite(accuracy) &&
        accuracy >= 0
          ? accuracy
          : null

      let safeRecordedAt =
        new Date()

      if (
        typeof recordedAt === 'string' &&
        recordedAt.trim()
      ) {
        const parsed =
          new Date(recordedAt)

        if (
          !Number.isNaN(
            parsed.getTime()
          )
        ) {
          safeRecordedAt = parsed
        }
      }

      // iOS can occasionally report speed as null/0 even while the
      // coordinates are clearly changing. Derive a second speed estimate
      // from the previous PHONE GPS point so movement is not lost.
      const previousPhonePoint =
        await prisma.telemetry.findFirst({
          where: {
            deviceId: normalizedDeviceId,
            source: 'PHONE',
            latitude: { not: null },
            longitude: { not: null }
          },
          orderBy: { recordedAt: 'desc' },
          select: {
            latitude: true,
            longitude: true,
            accuracyMeters: true,
            recordedAt: true
          }
        })

      let derivedSpeedKph: number | null = null

      if (
        previousPhonePoint?.latitude != null &&
        previousPhonePoint?.longitude != null &&
        previousPhonePoint.recordedAt != null
      ) {
        const elapsedSeconds =
          (
            safeRecordedAt.getTime() -
            previousPhonePoint.recordedAt.getTime()
          ) / 1000

        if (
          elapsedSeconds > 0 &&
          elapsedSeconds <= 120
        ) {
          const distanceMeters = metersBetween(
            {
              latitude: previousPhonePoint.latitude,
              longitude: previousPhonePoint.longitude
            },
            { latitude, longitude }
          )

          const noiseFloorMeters = Math.max(
            8,
            safeAccuracy ?? 0,
            previousPhonePoint.accuracyMeters ?? 0
          )

          if (distanceMeters > noiseFloorMeters) {
            derivedSpeedKph =
              distanceMeters / elapsedSeconds * 3.6
          }
        }
      }

      const effectiveSpeedKph = Math.max(
        safeSpeedKph ?? 0,
        derivedSpeedKph ?? 0
      )

      const movementStatus =
        effectiveSpeedKph >= 5
          ? 'MOVING'
          : 'STOPPED'

      const [telemetry] =
        await prisma.$transaction([
          prisma.telemetry.create({
            data: {
              deviceId:
                normalizedDeviceId,

              temperature:
                null,

              latitude,
              longitude,

              altitude:
                safeAltitude,

              speedKph:
                effectiveSpeedKph,

              movementStatus,

              source:
                'PHONE',

              accuracyMeters:
                safeAccuracy,

              headingDegrees:
                safeHeading,

              recordedAt:
                safeRecordedAt,

              isBackfill:
                false,

              assetId:
                asset.id
            }
          }),

          prisma.asset.update({
            where: {
              id: asset.id
            },
            data: {
              trackingActive:
                trackingActive === false
                  ? false
                  : true,
              lastHeartbeatAt:
                new Date(),
              lastPhoneGpsAt:
                safeRecordedAt,
              ...(trackingActive === false
                ? {
                    trackingStoppedAt:
                      new Date()
                  }
                : {
                    trackingStartedAt:
                      asset.trackingActive
                        ? asset.trackingStartedAt
                        : new Date(),
                    trackingStoppedAt:
                      null
                  })
            }
          })
        ])

      console.log(
        'Mobile telemetry received:',
        {
          deviceId:
            normalizedDeviceId,
          latitude,
          longitude,
          speedKph:
            safeSpeedKph,
          accuracy:
            safeAccuracy,
          recordedAt:
            safeRecordedAt.toISOString()
        }
      )

      return res.json({
        ok: true,
        message:
          'Mobile telemetry received',
        telemetry: {
          id:
            telemetry.id,
          deviceId:
            normalizedDeviceId,
          assetId:
            asset.id,
          source:
            'PHONE',
          recordedAt:
            telemetry.recordedAt
        }
      })
    } catch (error) {
      console.error(
        'Mobile telemetry error:',
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
            deviceId: true,
            trackingSource: true,
            trackingActive: true,
            trackingStartedAt: true,
            trackingStoppedAt: true,
            lastHeartbeatAt: true,
            lastPhoneGpsAt: true
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

          // PHONE tracking session state. Keep connection status separate
          // from GPS freshness so a locked/stationary iPhone does not
          // bounce Offline just because iOS has not emitted a new fix.
          trackingSource: asset.trackingSource,
          trackingActive: asset.trackingActive,
          trackingStartedAt: asset.trackingStartedAt,
          trackingStoppedAt: asset.trackingStoppedAt,
          lastHeartbeatAt: asset.lastHeartbeatAt,
          lastPhoneGpsAt: asset.lastPhoneGpsAt,

          // MAV2 power telemetry.
          reeferPower:
            latestTelemetry.reeferPower ??
            null,

          powerSource:
            latestTelemetry.powerSource ??
            null,

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
            source: true,
            accuracyMeters: true,
            headingDegrees: true,
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
            source:
              row.source,
            accuracyMeters:
              row.accuracyMeters,
            headingDegrees:
              row.headingDegrees,
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

    await ensureBootstrapUsers()

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
