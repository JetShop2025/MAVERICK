import type { Express, Request, RequestHandler } from 'express'
import type { PrismaClient } from './generated/prisma/client.js'

type PacketRequest = Request & { user?: { companyId: number } }

export function registerDispatchDocumentPacket(
  app: Express,
  prisma: Pick<PrismaClient, 'dispatch'>,
  requireAuth: RequestHandler,
  requireDispatchAccess: RequestHandler
) {
  app.get(
    '/api/dispatches/:id/document-packet',
    requireAuth,
    requireDispatchAccess,
    async (req: PacketRequest, res) => {
      res.setHeader('Cache-Control', 'no-store')
      const companyId = req.user?.companyId
      const rawId = String(req.params.id)
      const dispatchId = Number(rawId)
      if (!companyId) {
        return res.status(401).json({ ok: false, message: 'Invalid session' })
      }
      if (!/^\d+$/.test(rawId) || !Number.isSafeInteger(dispatchId) || dispatchId <= 0) {
        return res.status(400).json({ ok: false, message: 'Invalid dispatch' })
      }
      try {
        const dispatch = await prisma.dispatch.findFirst({
          where: { id: dispatchId, companyId },
          include: {
            asset: { select: { id: true, deviceId: true, name: true } },
            driver: {
              select: { id: true, name: true, email: true, driverProfile: true }
            },
            stops: { orderBy: { sequence: 'asc' } },
            documents: {
              select: {
                id: true, originalName: true, mimeType: true, sizeBytes: true,
                category: true, dataBase64: true, isSignature: true,
                signedBy: true, signedAt: true, description: true, createdAt: true
              },
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
            },
            signatureRequests: {
              select: {
                id: true, signerName: true, signerTitle: true, signerEmail: true,
                status: true, signedAt: true, createdAt: true
              },
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              take: 1
            }
          }
        })
        if (!dispatch) {
          return res.status(404).json({ ok: false, message: 'Dispatch not found' })
        }
        return res.json({ ok: true, dispatch })
      } catch (error) {
        console.error('Get dispatch document packet error:', error)
        return res.status(500).json({
          ok: false, message: 'Unable to load document packet'
        })
      }
    }
  )
}
