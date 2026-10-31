# MAVDRIVE - App Store preparation
Updated October 30, 2026 (California).

Bundle identifier: com.mavtrack.driver
App Store Connect app: 6810734041
Support contact: jetshopone@outlook.com

## Verified status
- Version 1.0.0 build 13 is available for internal TestFlight testing. No App Store version is currently in review or publicly released.
- The existing editable App Store version is 1.0; its downloaded title was MavDriver. The prepared store.config.json uses MAVDRIVE and preserves the existing version and release strategy.
- Privacy and support pages are deployed at https://maverick-1z64.onrender.com/mavdrive/privacy and https://maverick-1z64.onrender.com/mavdrive/support.
- The user reports successful GPS tests with the screen locked, another app open, network loss/recovery, STOP and sign-out. These are user-reported physical-device results, not independent testing of every build.
- Backend authorization now blocks driver acceptance until the latest owner authorization is signed. Automated backend tests passed; the user confirmed receipt of the owner email.
- Build 13 contains the MAVTRACK logo and owner-authorization UI from build 12.

## Prepared metadata
Localized English title, subtitle, description, keywords, support/privacy URLs and categories are in store.config.json and were synchronized to App Store Connect. Both public URLs returned HTTP 200 on October 30. Age rating is deliberately omitted from this config: Apple's API now requires socialMedia, which EAS's downloaded questionnaire did not contain. Complete the current questionnaire directly in App Store Connect; do not treat imported defaults as audited answers.

## Review notes to enter
MAVDRIVE is the driver app for MAVTRACK fleets. Accounts are provisioned by fleet administrators; there is no public sign-up. Sign in using the dedicated review credentials entered in App Store Connect. A sample truck and sample loads must be assigned to that account. Loads require owner authorization before the driver can accept and sign them; prepare an owner-approved sample load for review. Load and profile features can be reviewed without starting location tracking. START TRACKING begins location sharing with the fleet; STOP TRACKING or sign-out ends it. Background location supports the active truck-tracking workflow while the iPhone is locked or another app is open. Configure and test the app while parked.

Do not commit reviewer passwords. Enter a dedicated review driver's credentials privately in App Store Connect, with valid review contact details.

## Remaining release gates
- In build 13, verify the complete flow: create load, receive owner email, block acceptance before approval, owner signs, driver accepts/signs, and both signatures open correctly in MAVTRACK.
- Verify an assigned-load notification arrives with MAVDRIVE closed and opens the correct load; test while signed in with notifications enabled.
- Capture current iPhone screenshots and upload the required display sizes. Use sample data.
- Complete/verify App Privacy against actual backend and SDK behavior: account/contact information, precise location, identifiers and uploaded photos/documents/signatures. Confirm account linkage, uses, retention/deletion and service providers match the policy.
- Complete/verify the current age-rating questionnaire, distribution, copyright/legal ownership and review contact. These are not confirmed by the metadata download.
- Create and verify the dedicated review account and sample data. Do not use a real driver's account.
- Select build 13 in the editable App Store version after those tests pass, resolve App Store Connect validation and submit for Apple review.

## Commands
Run from mobile on Windows using npx.cmd:
- npx.cmd eas-cli@latest metadata:lint --profile production
- npx.cmd eas-cli@latest metadata:push --profile production --non-interactive
- npx.cmd eas-cli@latest submit:status --platform ios

Metadata synchronization does not submit the app for review. Do not repeat metadata:pull over local edits without preserving them first.
