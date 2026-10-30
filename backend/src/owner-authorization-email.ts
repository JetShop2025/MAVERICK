type OwnerAuthorizationEmail = {
  loadNumber: string
  pickupName: string
  deliveryName: string
  pickupAddress?: string | null
  deliveryAddress?: string | null
  carrierName?: string | null
  truckNumber?: string | null
  trailerNumber?: string | null
  authorizationUrl: string
}

const escape = (value: string) => value.replace(/[&<>"']/g, character =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!))

export function renderOwnerAuthorizationEmail(load: OwnerAuthorizationEmail) {
  const url = escape(load.authorizationUrl)
  const equipment = [
    ['Carrier', load.carrierName],
    ['Truck', load.truckNumber],
    ['Trailer', load.trailerNumber]
  ].filter(([, value]) => value)
  const equipmentRows = equipment.map(([label, value]) =>
    '<tr><td style="padding:7px 0;color:#64748b;font-size:13px;">' + label +
    '</td><td align="right" style="padding:7px 0;color:#0f172a;font-size:13px;font-weight:bold;">' +
    escape(value!) + '</td></tr>').join('')
  const stop = (label: string, name: string, address?: string | null) =>
    '<tr><td style="padding:18px 22px;border-bottom:1px solid #e2e8f0;">' +
    '<p style="margin:0 0 7px;font-size:11px;letter-spacing:1px;font-weight:bold;color:#2563eb;">' + label + '</p>' +
    '<p style="margin:0;font-size:16px;line-height:24px;font-weight:bold;color:#0f172a;">' + escape(name) + '</p>' +
    (address ? '<p style="margin:5px 0 0;font-size:13px;line-height:20px;color:#64748b;">' + escape(address) + '</p>' : '') +
    '</td></tr>'

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Load authorization | MAVTRACK LLC</title></head>
<body style="margin:0;padding:0;background:#f3f6fa;font-family:Arial,Helvetica,sans-serif;color:#0f172a;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">Your approval is requested for load ${escape(load.loadNumber)}. Review the details and sign before driver acceptance.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f3f6fa">
<tr><td align="center" style="padding:28px 12px;">
<!--[if mso]><table role="presentation" width="680" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="max-width:680px;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
<tr><td bgcolor="#071426" style="padding:28px 30px;border-bottom:4px solid #2563eb;">
<p style="margin:0;font-size:24px;line-height:30px;font-weight:bold;letter-spacing:2px;color:#ffffff;">MAVTRACK LLC</p>
<p style="margin:8px 0 0;font-size:11px;line-height:18px;letter-spacing:1.5px;color:#a8b8cd;">SECURE LOAD AUTHORIZATION</p>
</td></tr>
<tr><td style="padding:30px 30px 20px;">
<p style="margin:0 0 12px;font-size:11px;line-height:18px;font-weight:bold;letter-spacing:1.3px;color:#2563eb;">ACTION REQUIRED &nbsp; / &nbsp; OWNER APPROVAL</p>
<h1 style="margin:0;font-size:28px;line-height:35px;letter-spacing:-0.5px;color:#0f172a;">Your load is ready for approval</h1>
<p style="margin:14px 0 0;font-size:15px;line-height:24px;color:#64748b;">Please review the load details and sign as the owner or authorized representative. Your approval is required before the driver can accept this assignment.</p>
</td></tr>
<tr><td style="padding:0 30px 24px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f8fafc" style="border:1px solid #e2e8f0;border-radius:12px;">
<tr><td style="padding:20px 22px;border-bottom:1px solid #e2e8f0;">
<p style="margin:0;font-size:11px;line-height:18px;font-weight:bold;letter-spacing:1px;color:#64748b;">LOAD NUMBER</p>
<p style="margin:5px 0 0;font-size:27px;line-height:34px;font-weight:bold;letter-spacing:0.5px;color:#0f172a;">${escape(load.loadNumber)}</p>
</td></tr>
${stop('PICKUP', load.pickupName, load.pickupAddress)}
${stop('DELIVERY', load.deliveryName, load.deliveryAddress)}
${equipmentRows ? '<tr><td style="padding:12px 22px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">' + equipmentRows + '</table></td></tr>' : ''}
</table>
</td></tr>
<tr><td style="padding:0 30px 25px;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
<td align="center" bgcolor="#2563eb" style="border-radius:8px;mso-padding-alt:16px 26px;">
<a href="${url}" target="_blank" style="display:inline-block;padding:16px 26px;border:1px solid #2563eb;border-radius:8px;color:#ffffff;font-size:14px;line-height:20px;font-weight:bold;letter-spacing:0.3px;text-decoration:none;">REVIEW &amp; SIGN AUTHORIZATION</a>
</td></tr></table>
<p style="margin:16px 0 0;font-size:13px;line-height:21px;color:#64748b;">Need a correction? Open the authorization page and select <strong style="color:#334155;">Request Changes</strong>, or contact your dispatcher before signing.</p>
</td></tr>
<tr><td bgcolor="#f8fafc" style="padding:20px 30px;border-top:1px solid #e2e8f0;">
<p style="margin:0;font-size:12px;line-height:20px;color:#64748b;"><strong style="color:#334155;">Private authorization link</strong><br>This link expires 7 days after the authorization request was created. Please do not forward it.</p>
<p style="margin:12px 0 4px;font-size:11px;line-height:18px;color:#64748b;">If the button does not open, use this link:</p>
<p style="margin:0;font-size:11px;line-height:18px;word-break:break-all;overflow-wrap:anywhere;"><a href="${url}" style="color:#2563eb;text-decoration:underline;word-break:break-all;">${url}</a></p>
</td></tr>
<tr><td bgcolor="#071426" style="padding:23px 30px;">
<p style="margin:0;font-size:14px;line-height:20px;letter-spacing:1px;font-weight:bold;color:#ffffff;">MAVTRACK LLC</p>
<p style="margin:6px 0 0;font-size:12px;line-height:20px;color:#a8b8cd;">Real-Time Fleet &amp; Temperature Visibility</p>
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`
}
