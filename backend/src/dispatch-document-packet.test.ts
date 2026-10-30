import assert from 'node:assert/strict'
import test from 'node:test'
import express, { type RequestHandler } from 'express'
import type { PrismaClient } from './generated/prisma/client.js'
import { registerDispatchDocumentPacket } from './dispatch-document-packet.js'

test('document packet HTTP route preserves signatures and company access', async (t) => {
  const calls: any[] = []
  const packet = {
    id: 41, companyId: 7, loadNumber: '00000041',
    documents: [{ id: 2, isSignature: true, mimeType: 'image/png', dataBase64: 'c2ln' }],
    signatureRequests: [{ id: 3, status: 'SIGNED' }]
  }
  let databaseFails = false
  const prisma = {
    dispatch: {
      async findFirst(query: any) {
        calls.push(query)
        if (databaseFails) throw new Error('Simulated database failure')
        return query.where.id === 41 && query.where.companyId === 7 ? packet : null
      }
    }
  } as unknown as Pick<PrismaClient, 'dispatch'>
  const app = express()
  const auth: RequestHandler = (req, res, next) => {
    if (!req.headers.authorization) {
      res.status(401).json({ ok: false, message: 'Authentication required' })
      return
    }
    Object.assign(req, { user: { companyId: Number(req.headers['x-company'] || 7) } })
    next()
  }
  const staff: RequestHandler = (req, res, next) => {
    if (req.headers['x-role'] === 'driver') {
      res.status(403).json({ ok: false, message: 'Dispatch access required' })
      return
    }
    next()
  }
  registerDispatchDocumentPacket(app, prisma, auth, staff)
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const address = server.address()
  assert(address && typeof address !== 'string')
  const base = 'http://127.0.0.1:' + address.port
  async function get(id = '41', headers: Record<string, string> = { authorization: 'test' }) {
    const response = await fetch(base + '/api/dispatches/' + id + '/document-packet', { headers })
    assert.match(response.headers.get('content-type') || '', /application\/json/)
    return { response, body: await response.json() }
  }
  try {
    await t.test('returns signature bytes, latest approval metadata and no-store', async () => {
      const { response, body } = await get()
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      assert.equal(body.dispatch.documents[0].dataBase64, 'c2ln')
      const query = calls.at(-1)
      assert.deepEqual(query.where, { id: 41, companyId: 7 })
      assert.equal(query.include.documents.select.dataBase64, true)
      assert.equal(query.include.signatureRequests.select.token, undefined)
      assert.equal(query.include.signatureRequests.take, 1)
      assert.deepEqual(query.include.signatureRequests.orderBy, [{ createdAt: 'desc' }, { id: 'desc' }])
    })
    await t.test('requires authentication and staff access before database reads', async () => {
      calls.length = 0
      assert.equal((await get('41', {})).response.status, 401)
      assert.equal((await get('41', { authorization: 'test', 'x-role': 'driver' })).response.status, 403)
      assert.equal(calls.length, 0)
    })
    await t.test('does not return packets from another company', async () => {
      const { response, body } = await get('41', { authorization: 'test', 'x-company': '8' })
      assert.equal(response.status, 404)
      assert.equal(body.dispatch, undefined)
      assert.deepEqual(calls.at(-1).where, { id: 41, companyId: 8 })
    })
    await t.test('rejects invalid IDs without reading the database', async () => {
      calls.length = 0
      for (const id of ['abc', '0', '-1', '1.5', '1e2', '9007199254740992']) {
        assert.equal((await get(id)).response.status, 400)
      }
      assert.equal(calls.length, 0)
    })
    await t.test('returns JSON for missing loads', async () => {
      const { response, body } = await get('999')
      assert.equal(response.status, 404)
      assert.equal(body.ok, false)
    })
    await t.test('returns a controlled JSON error on database failure', async () => {
      databaseFails = true
      const { response, body } = await get()
      assert.equal(response.status, 500)
      assert.equal(body.message, 'Unable to load document packet')
    })
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})
