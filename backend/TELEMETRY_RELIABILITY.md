# MAVTRACK telemetry reliability changes

- Existing M2 transmissions preserve Fleet names, groups, company ownership and inactive status.
- New devices must be registered in Fleet before sending telemetry.
- The old lot bootstrap is disabled by default. MAV2_AUTO_PROVISION=true enables it temporarily.
  Leave it disabled after provisioning: a deleted device must not silently reappear.
- GET /api/telemetry/fleet returns the authenticated company's active assets in one request.
- GPS coordinates, altitude and timestamp come from the same complete fix.
- Missing temperature keeps the last valid value with temperatureRecordedAt and hasCurrentTemperature.
- Failed refreshes retain cached data; asset changes cancel old requests.
- Missing historical temperature is excluded from numeric statistics instead of becoming 32 F.
- Oversized history returns truncated=true and the UI asks for a shorter range.

## Activating MAV2 authentication

1. Generate a random private key outside git.
2. Configure the same key in the device POST header x-mavtrack-key,
   or inject it in Soracom Beam if the device traffic uses Beam.
3. Test delivery with one device, then update all active devices.
4. Set MAV2_TELEMETRY_KEY in the backend hosting environment.
5. Verify unauthorized POSTs return 401 and authorized device traffic continues.

Do not set MAV2_TELEMETRY_KEY before step 3. Missing keys remain temporarily
accepted for registered MAV2 assets to avoid interrupting the existing fleet.
Unknown devices, inactive assets and assets using another tracking source are rejected.
This compatibility period does not protect known device IDs against spoofing.

## Checks

Backend: node_modules/.bin/tsc --noEmit
Regression tests: node_modules/.bin/tsx --test src/telemetry-view.test.ts
Frontend: npm run build
