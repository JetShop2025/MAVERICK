import assert from 'node:assert/strict'
import test from 'node:test'
import { loadAssignmentNotice } from './load-push.js'
const base = { loadNumber: '00000001', authorizedSignerEmail: 'owner@example.com', signatureRequests: [] as {status:string; signedAt:Date|null; signerEmail:string}[] }
test('assignment waits for owner and never asks driver to sign yet', () => {
  const notice=loadAssignmentNotice(base)
  assert.equal(notice.ownerAuthorizationStatus,'PENDING')
  assert.match(notice.title,/Awaiting Owner/)
  assert.match(notice.body,/owner's signature is pending/)
})
test('signed owner makes driver signature available', () => {
  const notice=loadAssignmentNotice({...base,signatureRequests:[{status:'SIGNED',signedAt:new Date(),signerEmail:base.authorizedSignerEmail}]})
  assert.equal(notice.ownerAuthorizationStatus,'SIGNED')
  assert.match(notice.title,/Ready for Your Signature/)
})
test('changed owner, incomplete signature and requested changes remain blocked', () => {
  for(const request of [
    {status:'SIGNED',signedAt:new Date(),signerEmail:'other@example.com'},
    {status:'SIGNED',signedAt:null,signerEmail:base.authorizedSignerEmail},
    {status:'CHANGES_REQUESTED',signedAt:null,signerEmail:base.authorizedSignerEmail},
    {status:'PENDING',signedAt:null,signerEmail:base.authorizedSignerEmail}
  ]) assert.equal(loadAssignmentNotice({...base,signatureRequests:[request]}).ownerAuthorizationStatus,'PENDING')
})
