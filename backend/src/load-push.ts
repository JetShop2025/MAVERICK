export function loadAssignmentNotice(load: {
  loadNumber: string;
  authorizedSignerEmail: string | null;
  signatureRequests: { status: string; signedAt: Date | null; signerEmail: string }[];
}) {
  const approval = load.signatureRequests[0];
  const ready = !!load.authorizedSignerEmail && approval?.status === 'SIGNED' &&
    !!approval.signedAt && approval.signerEmail === load.authorizedSignerEmail;
  return ready ? {
    title: 'Load Ready for Your Signature',
    body: `The owner has signed load ${load.loadNumber}. You can now review and sign to accept it.`,
    ownerAuthorizationStatus: 'SIGNED'
  } : {
    title: 'Load Assigned - Awaiting Owner',
    body: `Load ${load.loadNumber} has been assigned to you. The owner's signature is pending. You will be notified when it is ready for your signature.`,
    ownerAuthorizationStatus: 'PENDING'
  };
}
