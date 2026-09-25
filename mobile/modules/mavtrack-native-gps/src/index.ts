import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";

export type NativeGpsDiagnostics = {
  available: boolean;
  running: boolean;
  permission: string;
  precision: string;
  deviceId: string;
  callbacks: number;
  lastFix: string;
  lastAttempt: string;
  lastAck: string;
  lastHttpStatus: number;
  lastError: string;
  queued: number;
  lastLatitude: number | null;
  lastLongitude: number | null;
  lastSpeedKph: number | null;
  backgroundActivitySession?: boolean;
  significantChanges?: boolean;
  uploadBackgroundTask?: boolean;
  engineState?: string;
  lastAppState?: string;
  lastPause?: string;
  lastResume?: string;
  lastLifecycle?: string;
  lastLifecycleAt?: string;
  startedAt?: string;
};

const iosModule = Platform.OS === "ios"
  ? requireOptionalNativeModule("MavtrackNativeGps")
  : null;

export const nativeGpsAvailable = Platform.OS === "ios" && !!iosModule;

export async function startNativeGps(deviceId: string, apiUrl: string, telemetryKey: string): Promise<NativeGpsDiagnostics> {
  if (!iosModule) throw new Error("Native iOS GPS module is not available in this build");
  return iosModule.start(deviceId, apiUrl, telemetryKey);
}

export async function stopNativeGps(): Promise<NativeGpsDiagnostics> {
  if (!iosModule) throw new Error("Native iOS GPS module is not available in this build");
  return iosModule.stop();
}

export async function nativeGpsDiagnostics(): Promise<NativeGpsDiagnostics> {
  if (!iosModule) throw new Error("Native iOS GPS module is not available in this build");
  return iosModule.diagnostics();
}

export async function resumeNativeGps(): Promise<NativeGpsDiagnostics> {
  if (!iosModule) throw new Error("Native iOS GPS module is not available in this build");
  return iosModule.resume();
}
