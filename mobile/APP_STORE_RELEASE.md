# MAVDRIVE 1.0.0 — App Store preparation
Updated October 1, 2026.
Bundle identifier: com.mavtrack.driver
App Store Connect app: 6810734041
Support contact: jetshopone@outlook.com

## Metadata to enter
Name: MAVDRIVE
Subtitle: Fleet dispatch & truck tracking
Description: MAVDRIVE connects drivers with their fleet. View assigned loads, accept or decline assignments, update pickup and delivery stops, and attach shipment photos, documents and signatures. Share your assigned truck's location with your fleet during an active tracking session, including while the app is in the background. Manage your driver and equipment details in one place. A driver account provided by your fleet administrator is required. Set up the app while parked and do not interact with it while driving.
Keywords: fleet,truck,driver,dispatch,loads,tracking,logistics,delivery
Privacy Policy URL (after backend deployment): https://maverick-1z64.onrender.com/mavdrive/privacy
Support URL (after backend deployment): https://maverick-1z64.onrender.com/mavdrive/support

## Review notes
Accounts are provisioned by fleet administrators; the app has no public sign-up. Supply a dedicated review driver account with sample loads and a truck assignment. Do not use a real driver's account. Load/profile features can be reviewed without starting location tracking. Location sharing starts with START TRACKING and ends with STOP TRACKING or sign-out. Background location supports the fleet's truck tracking workflow. Supply actual review credentials in App Store Connect; none are stored in this file.

## Release gates still requiring confirmation
- Publish and verify both public URLs before testing the new privacy links.
- Install the new build on a physical iPhone and test login, loads, acceptance/signature, decline, stop updates, document selection and profile saves.
- Test START, screen lock/background, temporary network loss and recovery, STOP and sign-out; confirm tracking in MAVTRACK and no new tracking after STOP.
- Assign a sample load and verify notification arrival and opening the exact load.
- Capture current iPhone screenshots; complete age rating, distribution, copyright and contact fields.
- Complete App Privacy using the actual service: review contact information, precise location, account/device identifiers, uploaded photos/documents and signatures; these records are associated with driver/fleet accounts.
- Confirm retention/deletion practices and service-provider privacy protections match the published policy.
- Select the tested build and submit for Apple review only after these gates are complete.
