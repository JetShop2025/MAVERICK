import type { Express, Request, RequestHandler } from 'express'
import { randomBytes } from 'node:crypto'
import { renderOwnerAuthorizationEmail } from './owner-authorization-email.js'
import type { Prisma, PrismaClient } from './generated/prisma/client.js'

export const ownerApprovalSummary = {
  select: {
    id: true, signerEmail: true, signerName: true, signerTitle: true,
    status: true, sentAt: true, signedAt: true, changesNote: true, createdAt: true
  },
  orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
  take: 1
}

export function ownerEmail(value: unknown): string | null {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}

export function newOwnerApproval(signerEmail: string) {
  return { signerEmail, token: randomBytes(32).toString('hex'), status: 'PENDING' }
}

export class OwnerApprovalRequired extends Error {
  constructor() { super('Owner / authorized signer must approve this load before the driver can accept it.') }
}

export async function lockDispatch(tx: Prisma.TransactionClient, dispatchId: number) {
  await tx.$queryRaw`SELECT "id" FROM "Dispatch" WHERE "id" = ${dispatchId} FOR UPDATE`
}

export async function requireSignedOwner(tx: Prisma.TransactionClient, dispatchId: number) {
  const load = await tx.dispatch.findUnique({
    where: { id: dispatchId },
    select: { authorizedSignerEmail: true, signatureRequests: ownerApprovalSummary }
  })
  const approval = load?.signatureRequests[0]
  if (!load?.authorizedSignerEmail || !approval || approval.status !== 'SIGNED' ||
      !approval.signedAt || approval.signerEmail !== load.authorizedSignerEmail) {
    throw new OwnerApprovalRequired()
  }
}

type SendEmail = (input: { to: string[]; subject: string; html: string }) => Promise<{ ok: boolean }>

export async function emailOwnerApproval(
  prisma: PrismaClient, dispatchId: number, send: SendEmail, frontendUrl: string
) {
  const request = await prisma.dispatchSignatureRequest.findFirst({
    where: { dispatchId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: { dispatch: { select: {
      loadNumber: true, pickupName: true, deliveryName: true,
      pickupAddress: true, deliveryAddress: true, carrierName: true,
      truckNumber: true, trailerNumber: true
    } } }
  })
  if (!request || request.status !== 'PENDING') return { ok: false }
  const url = frontendUrl.replace(/\/+$/, '') + '/sign/' + request.token
  const result = await send({
    to: [request.signerEmail],
    subject: 'MAVTRACK LLC | Owner Authorization Required | Load ' + request.dispatch.loadNumber,
    html: renderOwnerAuthorizationEmail({ ...request.dispatch, authorizationUrl: url })
  })
  if (result.ok) {
    await prisma.dispatchSignatureRequest.update({ where: { id: request.id }, data: { sentAt: new Date() } })
  }
  return result
}

type StaffRequest = Request & { user?: { companyId: number } }
type NotifyDriver = (dispatch: {
  id: number; driverId: number | null; loadNumber: string; pickupName: string; deliveryName: string
}) => Promise<unknown>

export function registerOwnerAuthorization(
  app: Express, prisma: PrismaClient, auth: RequestHandler, staff: RequestHandler,
  send: SendEmail, frontendUrl: string, notifyDriver: NotifyDriver
) {
  app.post('/api/dispatches/:id/owner-authorization', auth, staff, async (req: StaffRequest, res) => {
    try {
      const id = Number(req.params.id)
      if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ ok: false, message: 'Invalid dispatch' })
      const load = await prisma.dispatch.findFirst({ where: { id, companyId: req.user!.companyId } })
      if (!load) return res.status(404).json({ ok: false, message: 'Dispatch not found' })
      if (['CANCELLED', 'DELIVERED'].includes(load.status)) return res.status(409).json({ ok: false, message: 'This load is closed' })
      const email = ownerEmail(load.authorizedSignerEmail)
      if (!email) return res.status(400).json({ ok: false, message: 'Edit the load and enter the owner authorization email first.' })
      await prisma.$transaction(async tx => {
        await lockDispatch(tx, id)
        const latest = await tx.dispatchSignatureRequest.findFirst({
          where: { dispatchId: id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
        })
        if (latest?.status === 'SIGNED') throw new Error('ALREADY_SIGNED')
        if (!latest || latest.status !== 'PENDING' || latest.signerEmail !== email ||
            Date.now() - latest.createdAt.getTime() > 7 * 86400000) {
          await tx.dispatchSignatureRequest.create({ data: { dispatchId: id, ...newOwnerApproval(email) } })
        }
      })
      const result = await emailOwnerApproval(prisma, id, send, frontendUrl)
      return res.status(result.ok ? 200 : 502).json({
        ok: result.ok, message: result.ok ? 'Authorization email sent.' : 'Authorization email could not be sent. Check the email service configuration and try again.'
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'ALREADY_SIGNED') {
        return res.status(409).json({ ok: false, message: 'Owner authorization is already signed.' })
      }
      console.error('Owner authorization email error:', error)
      return res.status(500).json({ ok: false, message: 'Unable to send owner authorization.' })
    }
  })

  async function findRequest(token: string) {
    if (!/^[a-f0-9]{64}$/i.test(token)) return null
    const request = await prisma.dispatchSignatureRequest.findUnique({
      where: { token },
      include: {
        dispatch: {
          select: {
            id: true, loadNumber: true, status: true, pickupName: true, pickupAddress: true,
            deliveryName: true, deliveryAddress: true, carrierName: true, lessorName: true,
            truckNumber: true, trailerNumber: true, poNumber: true, bolNumber: true,
            termsAndAgreement: true, driverInstructions: true,
            stops: { orderBy: { sequence: 'asc' } }
          }
        }
      }
    })
    if (!request) return null
    const latest = await prisma.dispatchSignatureRequest.findFirst({
      where: { dispatchId: request.dispatchId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true }
    })
    if (latest?.id !== request.id || ['DELIVERED', 'CANCELLED'].includes(request.dispatch.status) ||
        (request.status === 'PENDING' && Date.now() - request.createdAt.getTime() > 7 * 86400000)) return null
    return request
  }

  app.get('/api/public/sign/:token', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Referrer-Policy', 'no-referrer')
    try {
      const request = await findRequest(String(req.params.token))
      if (!request) return res.status(404).json({ ok: false, message: 'Authorization link expired or unavailable. Ask dispatch for a new email.' })
      if (!request.viewedAt) {
        await prisma.dispatchSignatureRequest.updateMany({ where: { id: request.id, viewedAt: null }, data: { viewedAt: new Date() } })
      }
      return res.json({
        ok: true,
        request: {
          status: request.status, signerEmail: request.signerEmail, signerName: request.signerName,
          signerTitle: request.signerTitle, signedAt: request.signedAt, changesNote: request.changesNote
        },
        dispatch: request.dispatch
      })
    } catch (error) {
      console.error('Read owner authorization error:', error)
      return res.status(500).json({ ok: false, message: 'Unable to load owner authorization.' })
    }
  })

  app.post('/api/public/sign/:token', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    try {
      const request = await findRequest(String(req.params.token))
      if (!request) return res.status(404).json({ ok: false, message: 'Authorization link expired or unavailable.' })
      const action = req.body?.action
      if (action !== 'SIGN' && action !== 'REQUEST_CHANGES') {
        return res.status(400).json({ ok: false, message: 'Invalid authorization action.' })
      }
      const name = typeof req.body.signerName === 'string' ? req.body.signerName.trim().slice(0, 200) : ''
      const title = typeof req.body.signerTitle === 'string' ? req.body.signerTitle.trim().slice(0, 200) : ''
      const note = typeof req.body.changesNote === 'string' ? req.body.changesNote.trim().slice(0, 4000) : ''
      const base64 = typeof req.body.signatureDataBase64 === 'string' ? req.body.signatureDataBase64 : ''
      const bytes = base64.length <= 700000 ? Buffer.from(base64, 'base64') : Buffer.alloc(0)
      if (action === 'SIGN' && (!name || bytes.length < 100 || bytes.length > 512 * 1024 ||
          bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a')) {
        return res.status(400).json({ ok: false, message: 'Enter your name and provide a valid PNG signature.' })
      }
      if (action === 'REQUEST_CHANGES' && note.length < 3) {
        return res.status(400).json({ ok: false, message: 'Describe the requested changes.' })
      }
      const now = new Date()
      const dispatch = await prisma.$transaction(async tx => {
        await lockDispatch(tx, request.dispatchId)
        const latest = await tx.dispatchSignatureRequest.findFirst({
          where: { dispatchId: request.dispatchId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
        })
        const load = await tx.dispatch.findUnique({ where: { id: request.dispatchId } })
        if (!load || ['DELIVERED', 'CANCELLED'].includes(load.status) ||
            latest?.id !== request.id || latest.status !== 'PENDING' ||
            latest.signerEmail !== load.authorizedSignerEmail ||
            now.getTime() - latest.createdAt.getTime() > 7 * 86400000) throw new Error('STALE_AUTHORIZATION')
        await tx.dispatchSignatureRequest.update({
          where: { id: request.id },
          data: action === 'SIGN'
            ? { status: 'SIGNED', signerName: name, signerTitle: title || null, signedAt: now }
            : { status: 'CHANGES_REQUESTED', changesNote: note, changesRequestedAt: now }
        })
        if (action === 'SIGN') {
          await tx.dispatchDocument.create({
            data: {
              dispatchId: load.id, originalName: 'Load-' + load.loadNumber + '-Owner-Authorization.png',
              mimeType: 'image/png', sizeBytes: bytes.length, dataBase64: base64, category: 'SIGNATURE',
              uploadedByRole: 'owner', uploadedByName: name, customerVisible: false,
              isSignature: true, signedBy: name, signedAt: now,
              description: 'Owner / authorized signer approval for load ' + load.loadNumber
            }
          })
        }
        await tx.dispatchStatusEvent.create({
          data: {
            dispatchId: load.id, status: load.status,
            eventType: action === 'SIGN' ? 'OWNER_AUTHORIZED' : 'OWNER_CHANGES_REQUESTED',
            title: action === 'SIGN' ? 'Owner authorized load' : 'Owner requested changes',
            notes: action === 'SIGN' ? name + ' approved the load authorization.' : note
          }
        })
        return load
      })
      if (action === 'SIGN' && dispatch.driverId && dispatch.assignmentStatus === 'PENDING') {
        await notifyDriver(dispatch).catch(error => console.error('Owner approval driver notification error:', error))
      }
      return res.json({ ok: true })
    } catch (error) {
      if (error instanceof Error && error.message === 'STALE_AUTHORIZATION') {
        return res.status(409).json({ ok: false, message: 'This authorization has already been answered or replaced. Reload the page.' })
      }
      console.error('Save owner authorization error:', error)
      return res.status(500).json({ ok: false, message: 'Unable to save owner authorization.' })
    }
  })
}

const approvalFields = [
  'assetId', 'driverId', 'manualDriverName', 'loadNumber', 'authorizedSignerEmail',
  'pickupName', 'pickupAddress', 'pickupScheduledAt', 'deliveryName', 'deliveryAddress',
  'deliveryScheduledAt', 'commodity', 'referenceNumber', 'poNumber', 'bolNumber',
  'carrierName', 'lessorName', 'truckNumber', 'trailerNumber', 'trailerLicense',
  'units', 'weightLbs', 'miles', 'carrierPay', 'rateType', 'driverInstructions',
  'termsAndAgreement', 'temperatureSetpointC', 'temperatureMinC', 'temperatureMaxC'
]
export function ownerApprovalChanged(existing: Record<string, any>, data: Record<string, any>) {
  const normalized = (value: any) => value instanceof Date ? value.toISOString() : value ?? null
  if (approvalFields.some(field => field in data &&
      normalized(existing[field]) !== normalized(data[field]))) return true
  if (data.stops?.create) {
    const keys = ['sequence', 'pairNumber', 'type', 'customerCode', 'name', 'address',
      'phone', 'latitude', 'longitude', 'reference', 'notes', 'scheduledAt']
    const stops = (rows: any[]) => rows.map(row =>
      Object.fromEntries(keys.map(key => [key, normalized(row[key])])))
    return JSON.stringify(stops(existing.stops || [])) !== JSON.stringify(stops(data.stops.create))
  }
  return false
}
