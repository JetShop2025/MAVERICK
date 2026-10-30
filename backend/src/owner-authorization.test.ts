import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import type { PrismaClient, Prisma } from './generated/prisma/client.js'
import {
  registerOwnerAuthorization, requireSignedOwner, OwnerApprovalRequired,
  ownerEmail, ownerApprovalChanged, emailOwnerApproval
} from './owner-authorization.js'

test('owner email validation and approval changes', () => {
  assert.equal(ownerEmail(' OWNER@Example.com '), 'owner@example.com')
  assert.equal(ownerEmail('bad-address'), null)
  assert.equal(ownerApprovalChanged({ truckNumber: '1' }, { truckNumber: '2' }), true)
  assert.equal(ownerApprovalChanged({ truckNumber: '1' }, { truckNumber: '1' }), false)
  assert.equal(ownerApprovalChanged({ termsAndAgreement: 'A' }, { termsAndAgreement: 'B' }), true)
  assert.equal(ownerApprovalChanged({ stops: [{ sequence: 1, name: 'A' }] },
    { stops: { create: [{ sequence: 1, name: 'B' }] } }), true)
})

test('owner authorization HTTP workflow, email failure and driver gate', async (t) => {
  const token = 'a'.repeat(64)
  const load: any = {
    id: 41, companyId: 7, loadNumber: '00000041', status: 'ASSIGNED',
    authorizedSignerEmail: 'owner@example.com', driverId: 5, assignmentStatus: 'PENDING',
    pickupName: 'Pickup', deliveryName: 'Delivery'
  }
  let current: any
  const documents: any[] = []
  const events: any[] = []
  const emails: any[] = []
  let providerAccepts = false
  let pushes = 0
  const reset = () => {
    current = { id: 1, dispatchId: 41, token, status: 'PENDING',
      signerEmail: 'owner@example.com', signerName: null, signerTitle: null,
      signedAt: null, sentAt: null, viewedAt: null, createdAt: new Date(), dispatch: load }
    load.authorizedSignerEmail = 'owner@example.com'
  }
  reset()
  const mock: any = {
    $queryRaw: async () => [],
    dispatch: {
      findUnique: async () => ({ ...load, signatureRequests: [current] }),
      findFirst: async ({ where }: any) => where.id === 41 && where.companyId === 7 ? load : null
    },
    dispatchSignatureRequest: {
      findUnique: async ({ where }: any) => where.token === token ? current : null,
      findFirst: async () => current,
      update: async ({ data }: any) => Object.assign(current, data),
      updateMany: async ({ data }: any) => { Object.assign(current, data); return { count: 1 } },
      create: async ({ data }: any) => { current = { ...current, ...data, id: current.id + 1 }; return current }
    },
    dispatchDocument: { create: async ({ data }: any) => { documents.push(data); return data } },
    dispatchStatusEvent: { create: async ({ data }: any) => { events.push(data); return data } }
  }
  mock.$transaction = async (work: any) => work(mock)
  const prisma = mock as PrismaClient
  const tx = mock as Prisma.TransactionClient
  const send = async (email: any) => { emails.push(email); return { ok: providerAccepts } }
  const app = express()
  app.use(express.json())
  registerOwnerAuthorization(app, prisma,
    (req, res, next) => {
      if (!req.headers.authorization) { res.status(401).json({ ok: false }); return }
      Object.assign(req, { user: { companyId: Number(req.headers['x-company'] || 7) } }); next()
    },
    (req, res, next) => {
      if (req.headers['x-role'] === 'driver') { res.status(403).json({ ok: false }); return }
      next()
    }, send, 'https://example.com', async () => { pushes++ })
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address()
  assert(address && typeof address !== 'string')
  const base = 'http://127.0.0.1:' + address.port
  async function call(path: string, body?: any, headers: Record<string, string> = {}) {
    const response = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    })
    assert.match(response.headers.get('content-type') || '', /application\/json/)
    return { status: response.status, body: await response.json() }
  }
  const link = '/api/public/sign/' + token
  const bytes = Buffer.alloc(120)
  Buffer.from('89504e470d0a1a0a', 'hex').copy(bytes)
  const signature = { action: 'SIGN', signerName: 'Test Owner', signatureDataBase64: bytes.toString('base64') }
  try {
    await t.test('pending, missing and wrong-recipient approvals block driver acceptance', async () => {
      await assert.rejects(requireSignedOwner(tx, 41), OwnerApprovalRequired)
      current.status = 'SIGNED'; current.signedAt = new Date(); current.signerEmail = 'other@example.com'
      await assert.rejects(requireSignedOwner(tx, 41), OwnerApprovalRequired)
      current = undefined
      await assert.rejects(requireSignedOwner(tx, 41), OwnerApprovalRequired)
      reset()
    })
    await t.test('failed mail remains unsent and is reported; retry records provider acceptance', async () => {
      const failed = await emailOwnerApproval(prisma, 41, send, 'https://example.com')
      assert.equal(failed.ok, false)
      assert.equal(current.sentAt, null)
      assert.deepEqual(emails.at(-1).to, ['owner@example.com'])
      assert.match(emails.at(-1).html, /https:\/\/example.com\/sign\/[a-f0-9]{64}/)
      providerAccepts = true
      assert.equal((await emailOwnerApproval(prisma, 41, send, 'https://example.com')).ok, true)
      assert(current.sentAt instanceof Date)
    })
    await t.test('public link exposes no token; invalid and expired links are rejected', async () => {
      const page = await call(link)
      assert.equal(page.status, 200)
      assert.equal(JSON.stringify(page.body).includes(token), false)
      assert.equal((await call('/api/public/sign/invalid')).status, 404)
      current.createdAt = new Date(Date.now() - 8 * 86400000)
      assert.equal((await call(link)).status, 404)
      reset()
    })
    await t.test('valid owner signature is stored before driver acceptance is unlocked', async () => {
      assert.equal((await call(link, signature)).status, 200)
      assert.equal(current.status, 'SIGNED')
      assert.equal(documents.length, 1)
      assert.equal(documents[0].mimeType, 'image/png')
      assert.match(documents[0].description, /Owner \/ authorized signer/)
      assert.equal(events[0].eventType, 'OWNER_AUTHORIZED')
      assert.equal(pushes, 1)
      await assert.doesNotReject(requireSignedOwner(tx, 41))
      assert.equal((await call(link, signature)).status, 409)
      assert.equal(documents.length, 1)
    })
    await t.test('changes requested hold the driver and invalid images cannot authorize', async () => {
      reset()
      assert.equal((await call(link, { ...signature, signatureDataBase64: Buffer.alloc(120).toString('base64') })).status, 400)
      assert.equal((await call(link, { action: 'REQUEST_CHANGES', changesNote: 'Correct delivery address' })).status, 200)
      assert.equal(current.status, 'CHANGES_REQUESTED')
      await assert.rejects(requireSignedOwner(tx, 41), OwnerApprovalRequired)
    })
    await t.test('staff resend route requires authentication and company access', async () => {
      const path = '/api/dispatches/41/owner-authorization'
      assert.equal((await call(path, {})).status, 401)
      assert.equal((await call(path, {}, { authorization: 'test', 'x-role': 'driver' })).status, 403)
      assert.equal((await call(path, {}, { authorization: 'test', 'x-company': '8' })).status, 404)
      assert.equal((await call(path, {}, { authorization: 'test' })).status, 200)
      assert.equal(current.status, 'PENDING')
    })
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})
