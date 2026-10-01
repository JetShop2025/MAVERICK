import type { Express } from 'express'

const contact = 'jetshopone@outlook.com'
const layout = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | MAVDRIVE</title><style>body{margin:0;background:#07111f;color:#eef4fc;font:17px/1.65 system-ui,sans-serif}main{max-width:760px;margin:auto;padding:40px 24px}a{color:#8dbfff}h1,h2{line-height:1.2}h2{margin-top:32px}nav{display:flex;gap:24px;flex-wrap:wrap}footer{border-top:1px solid #344459;margin-top:40px;padding-top:20px}</style></head><body><main><nav><a href="/mavdrive/privacy">Privacy Policy</a><a href="/mavdrive/support">Support</a></nav><h1>${title}</h1>${body}<footer>MAVDRIVE · Contact: <a href="mailto:${contact}">${contact}</a></footer></main></body></html>`

export function registerMavdrivePublicPages(app: Express) {
  app.get('/mavdrive/privacy', (_req, res) => res.type('html').send(layout('MAVDRIVE Privacy Policy', `
<p>Effective October 1, 2026. MAVDRIVE is the driver application for the MAVTRACK fleet platform. This policy explains the information handled when you use the application and how to contact us about it.</p>
<h2>Information collected</h2>
<p>We handle your fleet account information, including name, email, phone number, driver license information you or your fleet provide, and assigned truck and trailer information. We also handle assigned loads, stop updates, acceptance or decline responses, signatures, and photos or documents you choose to upload.</p>
<p>While tracking is active and location permission is granted, the app sends location coordinates, timestamps, accuracy, speed, heading and altitude when available, together with the assigned vehicle identifier and tracking status. Tracking can continue with the screen locked or the app in the background. The app also stores session credentials, tracking settings and pending location points on your device. A notification token is registered when notification permission is granted.</p>
<h2>How information is used and shared</h2>
<p>Information supports fleet location tracking, dispatch, load assignment notifications, equipment management and shipment documentation. Your company's authorized MAVTRACK users can view fleet records associated with your account. Load documents designated for customer access can be made available to authorized shipment customers.</p>
<p>The service uses Render for backend hosting, Expo's notification service and Apple or Google notification delivery to send notifications. Email delivery features of the platform use Resend. These providers process information necessary to supply those functions. Information may also be disclosed when required by law.</p>
<h2>Your controls</h2>
<p>Press STOP TRACKING or sign out to stop app tracking. You can revoke location and notification permissions in your device settings. Loads and profile features do not require you to start tracking. Photo uploads use the system picker so you choose the images to share.</p>
<h2>Storage, retention and deletion</h2>
<p>Information sent to MAVTRACK becomes part of your fleet's operational records. Retention depends on the type of record, your fleet's operational requirements and applicable legal obligations. Stopping tracking does not delete previously submitted fleet records. Pending native GPS points are discarded when you explicitly stop tracking.</p>
<p>For access, correction, retention details, or deletion of your account or personal information, contact <a href="mailto:${contact}">${contact}</a> and identify your fleet and account email. We will verify your request and coordinate with your fleet administrator. Records that must be retained for legal obligations or shipment documentation may be retained; we will explain applicable limits when responding. Do not email passwords or sensitive identity documents.</p>
<h2>Security and changes</h2>
<p>The app sends data over HTTPS and stores authentication credentials using the device's secure credential storage. No security method is infallible. Policy changes will be reflected on this page with an updated effective date.</p>`)))
  app.get('/mavdrive/support', (_req, res) => res.type('html').send(layout('MAVDRIVE Support', `
<p>For app support and privacy or data requests, email <a href="mailto:${contact}">${contact}</a>. Include your fleet name, app version, iPhone model and a description of the issue. Do not include passwords.</p>
<h2>Access and assignments</h2><p>Your fleet administrator creates your driver account and assigns your truck and loads. Contact your dispatcher for assignment or equipment corrections.</p>
<h2>Location tracking</h2><p>Set up tracking while parked. In iPhone Settings, enable Location Services, then allow MAVDRIVE location access Always with Precise Location enabled. Start tracking in the app. Press STOP TRACKING to end the session. iOS controls background execution; force-closing the app can interrupt updates.</p>
<h2>Notifications</h2><p>Allow notifications for MAVDRIVE in iPhone Settings, then reopen the app and sign in. Contact support if assigned loads appear in the app but notifications do not arrive.</p>`)))
}
