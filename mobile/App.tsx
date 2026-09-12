import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as SecureStore from "expo-secure-store";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";


(Text as any).defaultProps = {
  ...((Text as any).defaultProps || {}),
  allowFontScaling: false,
  maxFontSizeMultiplier: 1,
};

(TextInput as any).defaultProps = {
  ...((TextInput as any).defaultProps || {}),
  allowFontScaling: false,
  maxFontSizeMultiplier: 1,
};

const API_URL = "https://maverick-1z64.onrender.com";
const MOBILE_TELEMETRY_KEY =
  process.env.EXPO_PUBLIC_MOBILE_TELEMETRY_KEY ?? "";

const BACKGROUND_LOCATION_TASK =
  "MAVTRACK_BACKGROUND_LOCATION";

const TOKEN_KEY = "mavtrack_driver_token";
const USER_KEY = "mavtrack_driver_user";
const TRACKING_DEVICE_KEY =
  "mavtrack_tracking_device_id";

const GPS_PING_INTERVAL_MS = 60_000;
const GPS_PING_MIN_GAP_MS = 55_000;
const LAST_GPS_PING_KEY =
  "mavtrack_last_gps_ping_at";

const DEFAULT_TRACKING_DEVICE_ID =
  "TRK-TEST-001";

type TabName = "home" | "loads" | "profile";
type LoadFilter = "pending" | "active" | "completed";

type DriverProfile = {
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  licenseNumber?: string | null;
  licenseState?: string | null;
  profilePhotoUrl?: string | null;
  currentTruckNumber?: string | null;
  physicalTruckNumber?: string | null;
  currentTrailerNumber?: string | null;
  currentTrailerLicense?: string | null;
};

type DriverUser = {
  id: number;
  email: string;
  name?: string | null;
  role: string;
  active?: boolean;
  companyId?: number;
  profile?: DriverProfile | null;
  driverProfile?: DriverProfile | null;
};

type DispatchStatus =
  | "ASSIGNED"
  | "EN_ROUTE_TO_PICKUP"
  | "AT_PICKUP"
  | "LOADED"
  | "IN_TRANSIT"
  | "AT_DELIVERY"
  | "DELIVERED"
  | "CANCELLED";

type AssignmentStatus =
  | "UNASSIGNED"
  | "PENDING"
  | "ACCEPTED"
  | "DECLINED";

type Asset = {
  id: number;
  deviceId: string;
  name?: string | null;
  assetType?: string | null;
  trackingSource?: string | null;
};

type DispatchStop = {
  id: number;
  sequence: number;
  pairNumber: number;
  type: "PICKUP" | "DROP";
  status:
    | "PENDING"
    | "EN_ROUTE"
    | "ARRIVED"
    | "COMPLETED";
  name: string;
  address: string;
  phone?: string | null;
  reference?: string | null;
  notes?: string | null;
  scheduledAt?: string | null;
  arrivedAt?: string | null;
  completedAt?: string | null;
};

type DispatchDocument = {
  id: number;
  dispatchId: number;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  category: string;
  uploadedByRole: string;
  uploadedByName?: string | null;
  customerVisible: boolean;
  isSignature: boolean;
  signedBy?: string | null;
  signedAt?: string | null;
  description?: string | null;
  createdAt: string;
};

type SignaturePoint = {
  x: number;
  y: number;
};

type Dispatch = {
  id: number;
  loadNumber: string;
  status: DispatchStatus;
  assignmentStatus?: AssignmentStatus;
  pickupName: string;
  pickupAddress: string;
  pickupScheduledAt?: string | null;
  pickupPhone?: string | null;
  pickupReference?: string | null;
  deliveryName: string;
  deliveryAddress: string;
  deliveryScheduledAt?: string | null;
  deliveryPhone?: string | null;
  deliveryReference?: string | null;
  commodity?: string | null;
  referenceNumber?: string | null;
  dispatcherName?: string | null;
  dispatcherPhone?: string | null;
  poNumber?: string | null;
  bolNumber?: string | null;
  carrierName?: string | null;
  lessorName?: string | null;
  truckNumber?: string | null;
  trailerNumber?: string | null;
  units?: number | null;
  weightLbs?: number | null;
  miles?: number | null;
  carrierPay?: number | null;
  rateType?: string | null;
  temperatureSetpointC?: number | null;
  temperatureMinC?: number | null;
  temperatureMaxC?: number | null;
  driverInstructions?: string | null;
  termsAndAgreement?: string | null;
  notes?: string | null;
  acceptedAt?: string | null;
  declinedAt?: string | null;
  asset?: Asset | null;
  stops?: DispatchStop[];
  documents?: DispatchDocument[];
};

type GPSData = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speedMps: number | null;
  heading: number | null;
  timestamp: number;
};

async function postLocationToMavtrack(
  location: Location.LocationObject,
  deviceId: string,
  force = false
) {
  if (!MOBILE_TELEMETRY_KEY || !deviceId) {
    return false;
  }

  const now = Date.now();

  if (!force) {
    const savedLastPing =
      await SecureStore.getItemAsync(
        LAST_GPS_PING_KEY
      );

    const lastPingAt =
      savedLastPing
        ? Number(savedLastPing)
        : 0;

    if (
      Number.isFinite(lastPingAt) &&
      now - lastPingAt <
        GPS_PING_MIN_GAP_MS
    ) {
      return true;
    }
  }

  const speedKph =
    location.coords.speed != null &&
    location.coords.speed >= 0
      ? location.coords.speed * 3.6
      : null;

  const response = await fetch(
    `${API_URL}/api/mobile/telemetry`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-mavtrack-key": MOBILE_TELEMETRY_KEY,
      },
      body: JSON.stringify({
        deviceId,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        altitude: location.coords.altitude,
        speedKph,
        heading: location.coords.heading,
        accuracy: location.coords.accuracy,
        recordedAt: new Date(
          location.timestamp
        ).toISOString(),
      }),
    }
  );

  if (response.ok) {
    await SecureStore.setItemAsync(
      LAST_GPS_PING_KEY,
      String(now)
    );
  }

  return response.ok;
}

TaskManager.defineTask(
  BACKGROUND_LOCATION_TASK,
  async ({ data, error }) => {
    if (error || !data) {
      return;
    }

    const payload = data as {
      locations?: Location.LocationObject[];
    };

    const deviceId =
      (await SecureStore.getItemAsync(
        TRACKING_DEVICE_KEY
      )) || "";

    if (!deviceId) {
      return;
    }

    const locations = payload.locations || [];

    if (!locations.length) {
      return;
    }

    // M2-style telemetry cycle:
    // use only the freshest fix and send at most one ping per minute.
    const latestLocation =
      locations[locations.length - 1];

    try {
      await postLocationToMavtrack(
        latestLocation,
        deviceId
      );
    } catch {
      // iOS will deliver another native location update later.
    }
  }
);

function formatDateTime(
  value?: string | null
) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not scheduled";
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function assignmentLabel(
  value?: AssignmentStatus
) {
  switch (value) {
    case "PENDING":
      return "PENDING";
    case "ACCEPTED":
      return "ACCEPTED";
    case "DECLINED":
      return "DECLINED";
    default:
      return "UNASSIGNED";
  }
}

function statusLabel(status: DispatchStatus) {
  return status
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) =>
      char.toUpperCase()
    );
}

function driverName(
  user: DriverUser | null
) {
  if (!user) return "Driver";

  const profile =
    user.profile || user.driverProfile;

  const fullName = [
    profile?.firstName,
    profile?.lastName,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  return (
    fullName ||
    user.name ||
    user.email ||
    "Driver"
  );
}

function fahrenheitFromCelsius(
  value?: number | null
) {
  if (
    value == null ||
    !Number.isFinite(Number(value))
  ) {
    return "—";
  }

  return `${(
    Number(value) * 9 / 5 + 32
  ).toFixed(0)}°F`;
}


export default function App() {
  const [booting, setBooting] =
    useState(true);

  const [token, setToken] =
    useState<string | null>(null);

  const [user, setUser] =
    useState<DriverUser | null>(null);

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [authError, setAuthError] =
    useState("");

  const [authLoading, setAuthLoading] =
    useState(false);

  const [tab, setTab] =
    useState<TabName>("home");

  const [loadFilter, setLoadFilter] =
    useState<LoadFilter>("pending");

  const [assignments, setAssignments] =
    useState<Dispatch[]>([]);


  const [selectedLoad, setSelectedLoad] =
    useState<Dispatch | null>(null);

  const [signingLoad, setSigningLoad] =
    useState<Dispatch | null>(null);

  const [documentBusy, setDocumentBusy] =
    useState(false);

  const [loadingLoads, setLoadingLoads] =
    useState(false);

  const [appError, setAppError] =
    useState("");

  const [tracking, setTracking] =
    useState(false);

  const [trackingStatus, setTrackingStatus] =
    useState("GPS OFF");

  const [serverStatus, setServerStatus] =
    useState("NOT CONNECTED");

  const [gps, setGps] =
    useState<GPSData | null>(null);

  const [
    trackingMode,
    setTrackingMode
  ] = useState<
    "off" | "foreground" | "background"
  >("off");

  const foregroundWatchRef =
    useRef<Location.LocationSubscription | null>(
      null
    );

  const lastLocationRef =
    useRef<Location.LocationObject | null>(null);

  const heartbeatRef =
    useRef<ReturnType<typeof setInterval> | null>(
      null
    );

  const liveGpsPollRef =
    useRef<ReturnType<typeof setInterval> | null>(
      null
    );

  const liveGpsPollBusyRef = useRef(false);

  const [menuOpen, setMenuOpen] =
    useState(false);

  useEffect(() => {
    void restoreSession();
  }, []);

  useEffect(() => {
    if (!token) return;

    void loadDriver();
    void loadAssignments();

    const interval = setInterval(
      () => void loadAssignments(),
      15000
    );

    return () => clearInterval(interval);
  }, [token]);

  useEffect(() => {
    void checkBackgroundTracking();
  }, []);

  async function restoreSession() {
    try {
      const savedToken =
        await SecureStore.getItemAsync(
          TOKEN_KEY
        );

      const savedUser =
        await SecureStore.getItemAsync(
          USER_KEY
        );

      if (savedToken) {
        setToken(savedToken);

        if (savedUser) {
          setUser(JSON.parse(savedUser));
        }
      }
    } catch {
      // Fall through to login.
    } finally {
      setBooting(false);
    }
  }

  async function apiFetch(
    path: string,
    options: RequestInit = {}
  ) {
    if (!token) {
      throw new Error("Not authenticated");
    }

    const response = await fetch(
      `${API_URL}${path}`,
      {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(options.headers || {}),
        },
      }
    );

    let payload: any = null;

    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (response.status === 401) {
      await logout();
      throw new Error(
        "Session expired. Please sign in again."
      );
    }

    if (!response.ok || !payload?.ok) {
      throw new Error(
        payload?.message ||
          `Server error (${response.status})`
      );
    }

    return payload;
  }

  async function login() {
    if (!email.trim() || !password) {
      setAuthError(
        "Enter your email and password."
      );
      return;
    }

    setAuthLoading(true);
    setAuthError("");

    try {
      const response = await fetch(
        `${API_URL}/api/auth/login`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            email: email.trim(),
            password,
          }),
        }
      );

      const payload = await response.json();

      if (
        !response.ok ||
        !payload?.ok ||
        !payload?.token
      ) {
        throw new Error(
          payload?.message ||
            "Unable to sign in."
        );
      }

      if (
        String(payload.user?.role)
          .toLowerCase() !== "driver"
      ) {
        throw new Error(
          "This app is for driver accounts."
        );
      }

      await SecureStore.setItemAsync(
        TOKEN_KEY,
        payload.token
      );

      await SecureStore.setItemAsync(
        USER_KEY,
        JSON.stringify(payload.user)
      );

      setToken(payload.token);
      setUser(payload.user);
      setEmail("");
      setPassword("");
    } catch (err) {
      setAuthError(
        err instanceof Error
          ? err.message
          : "Unable to sign in."
      );
    } finally {
      setAuthLoading(false);
    }
  }

  async function logout() {
    await SecureStore.deleteItemAsync(
      TOKEN_KEY
    );
    await SecureStore.deleteItemAsync(
      USER_KEY
    );

    setToken(null);
    setUser(null);
    setAssignments([]);
    setSelectedLoad(null);
    setTab("home");
  }

  async function loadDriver() {
    try {
      const payload =
        await apiFetch("/api/driver/me");

      const nextUser =
        payload.user ||
        payload.driver ||
        payload.profile ||
        null;

      if (nextUser) {
        setUser(nextUser);
        await SecureStore.setItemAsync(
          USER_KEY,
          JSON.stringify(nextUser)
        );
      }
    } catch (err) {
      setAppError(
        err instanceof Error
          ? err.message
          : "Unable to load profile."
      );
    }
  }

  async function loadAssignments() {
    setLoadingLoads(true);

    try {
      const payload =
        await apiFetch(
          "/api/driver/assignments"
        );

      const rows =
        payload.dispatches ||
        payload.assignments ||
        [];

      setAssignments(rows);

      if (selectedLoad) {
        const updated = rows.find(
          (row: Dispatch) =>
            row.id === selectedLoad.id
        );

        if (updated) {
          setSelectedLoad(updated);
        }
      }

      setAppError("");
    } catch (err) {
      setAppError(
        err instanceof Error
          ? err.message
          : "Unable to load assignments."
      );
    } finally {
      setLoadingLoads(false);
    }
  }

  async function respondToLoad(
    dispatch: Dispatch,
    action: "accept" | "decline",
    signatureDataBase64?: string
  ) {
    try {
      await apiFetch(
        `/api/driver/dispatches/${dispatch.id}/${action}`,
        {
          method: "POST",
          body:
            action === "decline"
              ? JSON.stringify({
                  reason:
                    "Declined in MavApp",
                })
              : JSON.stringify({
                  signatureDataBase64,
                }),
        }
      );

      await loadAssignments();

      if (action === "accept") {
        setLoadFilter("active");
        setSelectedLoad(null);
        setSigningLoad(null);
      }
    } catch (err) {
      Alert.alert(
        "Unable to update load",
        err instanceof Error
          ? err.message
          : "Please try again."
      );
    }
  }

  async function uploadDocumentPayload(
    dispatch: Dispatch,
    payload: {
      originalName: string;
      mimeType: string;
      category: string;
      dataBase64: string;
    }
  ) {
    try {
      setDocumentBusy(true);

      await apiFetch(
        `/api/dispatches/${dispatch.id}/documents`,
        {
          method: "POST",
          body: JSON.stringify({
            ...payload,
            customerVisible: true,
          }),
        }
      );

      await loadAssignments();
    } catch (err) {
      Alert.alert(
        "Unable to upload document",
        err instanceof Error
          ? err.message
          : "Please try again."
      );
    } finally {
      setDocumentBusy(false);
    }
  }

  async function addLoadPhoto(
    dispatch: Dispatch
  ) {
    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        "Photo access required",
        "Allow photo access to upload load photos."
      );
      return;
    }

    const result =
      await ImagePicker.launchImageLibraryAsync({
        mediaTypes:
          ImagePicker.MediaTypeOptions.Images,
        quality: 0.82,
        base64: true,
      });

    if (
      result.canceled ||
      !result.assets?.[0]?.base64
    ) {
      return;
    }

    const asset =
      result.assets[0];

    await uploadDocumentPayload(
      dispatch,
      {
        originalName:
          asset.fileName ||
          `load-photo-${Date.now()}.jpg`,
        mimeType:
          asset.mimeType ||
          "image/jpeg",
        category:
          "PHOTO",
        dataBase64:
          asset.base64!,
      }
    );
  }

  async function addLoadDocument(
    dispatch: Dispatch
  ) {
    const result =
      await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
      });

    if (
      result.canceled ||
      !result.assets?.[0]
    ) {
      return;
    }

    const asset =
      result.assets[0];

    try {
      const dataBase64 =
        await FileSystem.readAsStringAsync(
          asset.uri,
          {
            encoding:
              FileSystem.EncodingType.Base64,
          }
        );

      await uploadDocumentPayload(
        dispatch,
        {
          originalName:
            asset.name,
          mimeType:
            asset.mimeType ||
            "application/octet-stream",
          category:
            "DOCUMENT",
          dataBase64,
        }
      );
    } catch {
      Alert.alert(
        "Unable to read document",
        "Please choose another file."
      );
    }
  }

  async function openLoadDocument(
    dispatch: Dispatch,
    document: DispatchDocument
  ) {
    try {
      const savedToken =
        token ||
        await SecureStore.getItemAsync(
          TOKEN_KEY
        );

      if (!savedToken) {
        throw new Error(
          "Session expired."
        );
      }

      const safeName =
        document.originalName
          .replace(
            /[^a-zA-Z0-9._-]/g,
            "_"
          );

      const destination =
        `${FileSystem.cacheDirectory}${document.id}-${safeName}`;

      const result =
        await FileSystem.downloadAsync(
          `${API_URL}/api/dispatches/${dispatch.id}/documents/${document.id}/file`,
          destination,
          {
            headers: {
              Authorization:
                `Bearer ${savedToken}`,
            },
          }
        );

      await Linking.openURL(
        result.uri
      );
    } catch (err) {
      Alert.alert(
        "Unable to open document",
        err instanceof Error
          ? err.message
          : "Please try again."
      );
    }
  }

  async function updateStopStatus(
    dispatch: Dispatch,
    stop: DispatchStop,
    status:
      | "EN_ROUTE"
      | "ARRIVED"
      | "COMPLETED"
  ) {
    try {
      await apiFetch(
        `/api/driver/dispatches/${dispatch.id}/stops/${stop.id}/status`,
        {
          method: "POST",
          body: JSON.stringify({
            status,
          }),
        }
      );

      await loadAssignments();
    } catch (err) {
      Alert.alert(
        "Unable to update stop",
        err instanceof Error
          ? err.message
          : "Please try again."
      );
    }
  }

  async function saveDriverProfile(
    fields: {
      firstName: string;
      lastName: string;
      phone: string;
      licenseNumber: string;
      licenseState: string;
      currentTruckNumber: string;
      physicalTruckNumber: string;
      currentTrailerNumber: string;
      currentTrailerLicense: string;
    }
  ) {
    const payload =
      await apiFetch("/api/driver/me", {
        method: "PATCH",
        body: JSON.stringify(fields),
      });

    const returned =
      payload.driver ||
      payload.user ||
      payload.profile ||
      null;

    if (returned) {
      const nextUser: DriverUser = {
        ...(user || ({} as DriverUser)),
        ...returned,
        profile:
          returned.profile ||
          returned.driverProfile ||
          user?.profile ||
          user?.driverProfile ||
          null,
      };

      setUser(nextUser);

      await SecureStore.setItemAsync(
        USER_KEY,
        JSON.stringify(nextUser)
      );
    }
  }

  async function checkBackgroundTracking() {
    try {
      const started =
        await Location.hasStartedLocationUpdatesAsync(
          BACKGROUND_LOCATION_TASK
        );

      if (started) {
        setTracking(true);
        setTrackingMode("background");
        setTrackingStatus(
          "1-MIN GPS PING ACTIVE"
        );
      }
    } catch {
      // Expo Go on a physical iPhone cannot restore
      // native background tracking. START TRACKING
      // will still use the foreground fallback.
    }
  }

  const activeLoad = useMemo(
    () =>
      assignments.find(
        (load) =>
          load.assignmentStatus ===
            "ACCEPTED" &&
          ![
            "DELIVERED",
            "CANCELLED",
          ].includes(load.status)
      ) || null,
    [assignments]
  );

  const pendingLoads = useMemo(
    () =>
      assignments.filter(
        (load) =>
          load.assignmentStatus ===
          "PENDING"
      ),
    [assignments]
  );

  const activeLoads = useMemo(
    () =>
      assignments.filter(
        (load) =>
          load.assignmentStatus ===
            "ACCEPTED" &&
          ![
            "DELIVERED",
            "CANCELLED",
          ].includes(load.status)
      ),
    [assignments]
  );

  const completedLoads = useMemo(
    () =>
      assignments.filter(
        (load) =>
          load.status === "DELIVERED" ||
          load.status === "CANCELLED"
      ),
    [assignments]
  );

  const filteredLoads =
    loadFilter === "pending"
      ? pendingLoads
      : loadFilter === "active"
        ? activeLoads
        : completedLoads;

  const driverProfile =
    user?.profile || user?.driverProfile;

  const trackingDeviceId =
    activeLoad?.asset?.deviceId ||
    driverProfile?.currentTruckNumber ||
    DEFAULT_TRACKING_DEVICE_ID;

  useEffect(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }

    if (liveGpsPollRef.current) {
      clearInterval(liveGpsPollRef.current);
      liveGpsPollRef.current = null;
    }

    if (!tracking || !trackingDeviceId) {
      return;
    }

    const sendMinuteGpsPing = async () => {
      if (
        AppState.currentState !== "active" ||
        liveGpsPollBusyRef.current
      ) {
        return;
      }

      liveGpsPollBusyRef.current = true;

      try {
        // Do not reuse a cached coordinate. Ask iOS for a fresh GPS fix,
        // then transmit it exactly like MAV2's periodic telemetry cycle.
        const location =
          await Location.getCurrentPositionAsync({
            accuracy:
              Location.Accuracy.BestForNavigation,
            mayShowUserSettingsDialog: true,
          });

        await applyLocationUpdate(
          location,
          trackingDeviceId
        );
      } catch {
        setServerStatus("GPS WAITING");
      } finally {
        liveGpsPollBusyRef.current = false;
      }
    };

    // START already sends the first point immediately.
    // After that, request and transmit one fresh fix every 60 seconds.
    liveGpsPollRef.current =
      setInterval(() => {
        void sendMinuteGpsPing();
      }, GPS_PING_INTERVAL_MS);

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }

      if (liveGpsPollRef.current) {
        clearInterval(liveGpsPollRef.current);
        liveGpsPollRef.current = null;
      }
    };
  }, [tracking, trackingDeviceId]);

  async function applyLocationUpdate(
    location: Location.LocationObject,
    deviceId: string,
    forceSend = false
  ) {
    lastLocationRef.current = location;

    setGps({
      latitude:
        location.coords.latitude,
      longitude:
        location.coords.longitude,
      accuracy:
        location.coords.accuracy,
      speedMps:
        location.coords.speed,
      heading:
        location.coords.heading,
      timestamp: location.timestamp,
    });

    try {
      const sent =
        await postLocationToMavtrack(
          location,
          deviceId,
          forceSend
        );

      setServerStatus(
        sent ? "CONNECTED" : "SEND FAILED"
      );
    } catch {
      setServerStatus("SEND FAILED");
    }
  }

  async function beginForegroundTracking(
    deviceId: string
  ) {
    // We intentionally do not depend on watchPositionAsync anymore.
    // The reliable path proven by STOP -> START is a fresh
    // getCurrentPositionAsync request. We repeat that once per minute.
    foregroundWatchRef.current?.remove();
    foregroundWatchRef.current = null;

    setTracking(true);
    setTrackingMode("foreground");
    setTrackingStatus(
      "1-MIN GPS PING ACTIVE"
    );
  }

  async function startTracking() {
    if (!trackingDeviceId) {
      Alert.alert(
        "No truck configured",
        "Add a Current Truck in Profile before starting tracking."
      );
      return;
    }

    if (!MOBILE_TELEMETRY_KEY) {
      Alert.alert(
        "Configuration missing",
        "The mobile telemetry key is not configured."
      );
      return;
    }

    setAppError("");
    setTrackingStatus(
      "REQUESTING LOCATION..."
    );
    setServerStatus("CONNECTING...");

    try {
      const foreground =
        await Location.requestForegroundPermissionsAsync();

      if (
        foreground.status !== "granted"
      ) {
        setTracking(false);
        setTrackingMode("off");
        setTrackingStatus(
          "LOCATION DENIED"
        );

        Alert.alert(
          "Location permission required",
          "Allow location access so MAVTRACK can receive this truck's GPS."
        );
        return;
      }

      await SecureStore.setItemAsync(
        TRACKING_DEVICE_KEY,
        trackingDeviceId
      );

      // Send the first point immediately so the TRK
      // can become ONLINE in MAVTRACK without waiting.
      const current =
        await Location.getCurrentPositionAsync(
          {
            accuracy:
              Location.Accuracy.BestForNavigation,
          }
        );

      await applyLocationUpdate(
        current,
        trackingDeviceId,
        true
      );

      // Always start foreground tracking first.
      // This works in Expo Go and lets us test GPS now.
      await beginForegroundTracking(
        trackingDeviceId
      );

      // Upgrade to native background tracking when
      // the installed build supports it. Expo Go on
      // a physical iPhone can throw here; that is NOT
      // treated as a GPS failure anymore.
      try {
        const background =
          await Location.requestBackgroundPermissionsAsync();

        if (
          background.status !== "granted"
        ) {
          setTracking(true);
          setTrackingMode("foreground");
          setTrackingStatus(
            "FOREGROUND TRACKING ACTIVE"
          );
          return;
        }

        // Always restart the native background task when START is pressed.
        // iOS/Expo keeps the old native task configuration across app
        // updates, so merely checking `alreadyStarted` can leave the device
        // running the settings from an older TestFlight build.
        const alreadyStarted =
          await Location.hasStartedLocationUpdatesAsync(
            BACKGROUND_LOCATION_TASK
          );

        if (alreadyStarted) {
          await Location.stopLocationUpdatesAsync(
            BACKGROUND_LOCATION_TASK
          );
        }

        await Location.startLocationUpdatesAsync(
          BACKGROUND_LOCATION_TASK,
          {
            accuracy:
              Location.Accuracy.BestForNavigation,
            // Ask the native service for periodic fixes. On iOS the
            // OS controls exact delivery timing, so outgoing telemetry
            // is additionally throttled to one fresh point per minute.
            distanceInterval: 0,
            timeInterval:
              GPS_PING_INTERVAL_MS,
            deferredUpdatesDistance: 0,
            deferredUpdatesInterval:
              GPS_PING_INTERVAL_MS,
            pausesUpdatesAutomatically:
              false,
            activityType:
              Location.ActivityType
                .AutomotiveNavigation,
            showsBackgroundLocationIndicator:
              true,
            foregroundService: {
              notificationTitle:
                "MavApp tracking active",
              notificationBody:
                `Tracking ${trackingDeviceId} for MAVTRACK dispatch.`,
            },
          }
        );

        // IMPORTANT: keep the foreground watcher alive.
        // When the app is visible it provides the fastest live updates.
        // The native background task takes over while iOS backgrounds
        // or locks the app. Stopping this watcher here caused MAVTRACK
        // to remain ONLINE while the map stayed on an old coordinate.

        setTracking(true);
        setTrackingMode("background");
        setTrackingStatus(
          "1-MIN GPS PING ACTIVE"
        );
      } catch {
        // Foreground tracking is already alive.
        // Keep it running instead of showing GPS ERROR.
        setTracking(true);
        setTrackingMode("foreground");
        setTrackingStatus(
          "FOREGROUND TRACKING ACTIVE"
        );
      }
    } catch (err) {
      foregroundWatchRef.current?.remove();
      foregroundWatchRef.current = null;

      setTracking(false);
      setTrackingMode("off");
      setTrackingStatus("GPS ERROR");
      setServerStatus("OFFLINE");

      setAppError(
        err instanceof Error
          ? err.message
          : "Unable to start tracking."
      );
    }
  }

  async function stopTracking() {
    try {
      foregroundWatchRef.current?.remove();
      foregroundWatchRef.current = null;

      try {
        const started =
          await Location.hasStartedLocationUpdatesAsync(
            BACKGROUND_LOCATION_TASK
          );

        if (started) {
          await Location.stopLocationUpdatesAsync(
            BACKGROUND_LOCATION_TASK
          );
        }
      } catch {
        // Native background API may not exist in Expo Go.
      }

      await SecureStore.deleteItemAsync(
        TRACKING_DEVICE_KEY
      );
      await SecureStore.deleteItemAsync(
        LAST_GPS_PING_KEY
      );

      setTracking(false);
      setTrackingMode("off");
      setTrackingStatus("GPS OFF");
      setServerStatus("NOT CONNECTED");
    } catch (err) {
      setAppError(
        err instanceof Error
          ? err.message
          : "Unable to stop tracking."
      );
    }
  }

  if (booting) {
    return (
      <SafeAreaView style={styles.bootScreen}>
        <StatusBar
          barStyle="light-content"
          backgroundColor="#07111F"
        />
        <View style={styles.brandMark}>
          <Text style={styles.brandM}>
            M
          </Text>
        </View>
        <Text style={styles.bootBrand}>
          MAVAPP
        </Text>
        <ActivityIndicator
          size="small"
          color="#60A5FA"
          style={{ marginTop: 18 }}
        />
      </SafeAreaView>
    );
  }

  if (!token) {
    return (
      <SafeAreaView style={styles.loginScreen}>
        <StatusBar
          barStyle="light-content"
          backgroundColor="#06111F"
        />

        <KeyboardAvoidingView
          behavior={
            Platform.OS === "ios"
              ? "padding"
              : undefined
          }
          style={styles.loginKeyboardFinal}
        >
          <ScrollView
            contentContainerStyle={
              styles.loginScrollFinal
            }
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.loginVisualFinal}>
              <Image
                source={require("./assets/mavapp-login-truck.png")}
                style={styles.loginTruckPhoto}
                resizeMode="cover"
              />

              <View style={styles.loginPhotoShade} />

              <View style={styles.brandWingRowCompact}>
                <View style={styles.brandWingCompactLeft} />
                <View style={styles.brandShieldCompact}>
                  <Text style={styles.brandShieldCompactText}>
                    M
                  </Text>
                </View>
                <View style={styles.brandWingCompactRight} />
              </View>

              <Text style={styles.loginBrandFinal}>
                MAVERICK
              </Text>
              <Text style={styles.loginAppNameFinal}>
                MAVAPP
              </Text>
            </View>

            <Text style={styles.loginTaglineFinal}>
              Move smarter. Stay connected.
            </Text>
            <Text style={styles.loginDescriptionFinal}>
              Real-time updates, dispatch info, and
              everything you need on the road.
            </Text>

            <View style={styles.loginFieldsFinal}>
              <View style={styles.loginFieldRowFinal}>
                <Text style={styles.loginFieldIconFinal}>
                  ◯
                </Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="Driver email"
                  placeholderTextColor="#7789A0"
                  style={styles.loginFieldInputFinal}
                />
              </View>

              <View style={styles.loginDividerFinal} />

              <View style={styles.loginFieldRowFinal}>
                <Text style={styles.loginFieldIconFinal}>
                  ▣
                </Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  placeholder="Password"
                  placeholderTextColor="#7789A0"
                  style={styles.loginFieldInputFinal}
                />
              </View>
            </View>
            {authError ? (
              <Text style={styles.authErrorFinal}>
                {authError}
              </Text>
            ) : null}

            <Pressable
              onPress={() => void login()}
              disabled={authLoading}
              style={({ pressed }) => [
                styles.loginButtonFinal,
                pressed && styles.buttonPressed,
                authLoading &&
                  styles.buttonDisabled,
              ]}
            >
              {authLoading ? (
                <ActivityIndicator
                  color="#FFFFFF"
                />
              ) : (
                <Text
                  style={
                    styles.loginButtonTextFinal
                  }
                >
                  SIGN IN
                </Text>
              )}
            </Pressable>

            <Text style={styles.loginFooterFinal}>
              New driver? Contact your fleet
              administrator.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  if (signingLoad) {
    return (
      <SignatureAcceptanceScreen
        load={signingLoad}
        driver={user}
        onCancel={() =>
          setSigningLoad(null)
        }
        onConfirm={(signatureDataBase64) =>
          void respondToLoad(
            signingLoad,
            "accept",
            signatureDataBase64
          )
        }
      />
    );
  }

  if (selectedLoad) {
    return (
      <LoadDetailScreen
        load={selectedLoad}
        onBack={() =>
          setSelectedLoad(null)
        }
        onAccept={() =>
          setSigningLoad(
            selectedLoad
          )
        }
        documentBusy={documentBusy}
        onAddPhoto={() =>
          void addLoadPhoto(
            selectedLoad
          )
        }
        onAddDocument={() =>
          void addLoadDocument(
            selectedLoad
          )
        }
        onOpenDocument={(document) =>
          void openLoadDocument(
            selectedLoad,
            document
          )
        }
        onUpdateStop={(stop, status) =>
          void updateStopStatus(
            selectedLoad,
            stop,
            status
          )
        }
        onDecline={() =>
          Alert.alert(
            "Decline load?",
            "The dispatcher will see that you declined this assignment.",
            [
              {
                text: "Cancel",
                style: "cancel",
              },
              {
                text: "Decline",
                style: "destructive",
                onPress: () =>
                  void respondToLoad(
                    selectedLoad,
                    "decline"
                  ),
              },
            ]
          )
        }
      />
    );
  }

  return (
    <SafeAreaView style={styles.app}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#07111F"
      />

      <View style={styles.appHeader}>
        <Pressable
          style={styles.headerSideButton}
          onPress={() =>
            setMenuOpen((value) => !value)
          }
        >
          <Text style={styles.headerMenuIcon}>☰</Text>
        </Pressable>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>
            {tab === "home"
              ? "Home"
              : tab === "loads"
                ? "Loads"
                : "Profile & Equipment"}
          </Text>
        </View>

        <Pressable
          style={styles.headerSideButton}
          onPress={() => {
            setLoadFilter("pending");
            setTab("loads");
            setMenuOpen(false);
          }}
        >
          <Text style={styles.headerBellIcon}>♢</Text>
          {pendingLoads.length > 0 ? (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>
                {pendingLoads.length > 9
                  ? "9+"
                  : pendingLoads.length}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      {menuOpen ? (
        <View style={styles.quickMenu}>
          <Pressable onPress={() => { setTab("home"); setMenuOpen(false); }}>
            <Text style={styles.quickMenuItem}>Home</Text>
          </Pressable>
          <Pressable onPress={() => { setTab("loads"); setMenuOpen(false); }}>
            <Text style={styles.quickMenuItem}>Loads</Text>
          </Pressable>
          <Pressable onPress={() => { setTab("profile"); setMenuOpen(false); }}>
            <Text style={styles.quickMenuItem}>Profile & Equipment</Text>
          </Pressable>
          <Pressable onPress={() => { setMenuOpen(false); void logout(); }}>
            <Text style={[styles.quickMenuItem, styles.quickMenuDanger]}>Sign Out</Text>
          </Pressable>
        </View>
      ) : null}

      {appError ? (
        <View style={styles.inlineError}>
          <Text style={styles.inlineErrorText}>
            {appError}
          </Text>
        </View>
      ) : null}

      {tab === "home" ? (
        <HomeScreen
          user={user}
          activeLoad={activeLoad}
          pendingCount={
            pendingLoads.length
          }
          activeCount={activeLoads.length}
          tracking={tracking}
          trackingMode={trackingMode}
          trackingStatus={trackingStatus}
          serverStatus={serverStatus}
          gps={gps}
          onOpenLoad={(load) =>
            setSelectedLoad(load)
          }
          onOpenPending={() => {
            setLoadFilter("pending");
            setTab("loads");
          }}
          onStartTracking={() =>
            void startTracking()
          }
          onStopTracking={() =>
            void stopTracking()
          }
        />
      ) : tab === "loads" ? (
        <LoadsScreen
          loads={filteredLoads}
          filter={loadFilter}
          loading={loadingLoads}
          pendingCount={
            pendingLoads.length
          }
          activeCount={activeLoads.length}
          completedCount={
            completedLoads.length
          }
          onFilter={setLoadFilter}
          onSelect={(load) =>
            setSelectedLoad(load)
          }
          onRefresh={() =>
            void loadAssignments()
          }
        />
      ) : (
        <ProfileScreen
          user={user}
          activeLoad={activeLoad}
          onSave={(fields) =>
            saveDriverProfile(fields)
          }
          onLogout={() =>
            void logout()
          }
        />
      )}

      <BottomTabs
        tab={tab}
        pendingCount={pendingLoads.length}
        onChange={setTab}
      />
    </SafeAreaView>
  );
}

function HomeScreen({
  user,
  activeLoad,
  pendingCount,
  activeCount,
  tracking,
  trackingMode,
  trackingStatus,
  serverStatus,
  gps,
  onOpenLoad,
  onOpenPending,
  onStartTracking,
  onStopTracking,
}: {
  user: DriverUser | null;
  activeLoad: Dispatch | null;
  pendingCount: number;
  activeCount: number;
  tracking: boolean;
  trackingMode:
    | "off"
    | "foreground"
    | "background";
  trackingStatus: string;
  serverStatus: string;
  gps: GPSData | null;
  onOpenLoad: (load: Dispatch) => void;
  onOpenPending: () => void;
  onStartTracking: () => void;
  onStopTracking: () => void;
}) {
  const speedMph =
    gps?.speedMps != null &&
    gps.speedMps >= 0
      ? gps.speedMps * 2.23694
      : 0;

  const profile =
    user?.profile || user?.driverProfile;

  const currentTruck =
    activeLoad?.truckNumber ||
    profile?.physicalTruckNumber ||
    "—";

  const currentTrailer =
    activeLoad?.trailerNumber ||
    profile?.currentTrailerNumber ||
    "—";

  return (
    <ScrollView
      style={styles.content}
      contentContainerStyle={
        styles.contentContainer
      }
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.kpiRow}>
        <MiniKpi
          label="ONLINE"
          value={tracking ? "1" : "0"}
          caption="Active"
          tone="green"
        />
        <Pressable
          style={{ flex: 1 }}
          onPress={onOpenPending}
        >
          <MiniKpi
            label="PENDING"
            value={String(pendingCount)}
            caption="Loads"
            tone="amber"
          />
        </Pressable>
        <MiniKpi
          label="ACTIVE"
          value={String(activeCount)}
          caption="Load"
          tone="blue"
        />
      </View>

      <Text style={styles.sectionTitlePlain}>
        Current Load
      </Text>

      {activeLoad ? (
        <Pressable
          onPress={() =>
            onOpenLoad(activeLoad)
          }
          style={styles.minimalLoadCard}
        >
          <View style={styles.minimalLoadTop}>
            <View style={styles.loadIconBox}>
              <Text style={styles.loadIconText}>
                ◈
              </Text>
            </View>

            <View style={{ flex: 1 }}>
              <View style={styles.loadTitleRow}>
                <Text style={styles.minimalLoadNumber}>
                  {activeLoad.loadNumber}
                </Text>
                <View style={styles.onlinePill}>
                  <View style={styles.onlinePillDot} />
                  <Text style={styles.onlinePillText}>
                    {tracking ? "ONLINE" : "READY"}
                  </Text>
                </View>
              </View>
              <Text style={styles.minimalRouteLine}>
                {activeLoad.pickupName}
                {"  →  "}
                {activeLoad.deliveryName}
              </Text>
            </View>
          </View>

          <View style={styles.minimalScheduleRow}>
            <View style={styles.scheduleCell}>
              <Text style={styles.scheduleLabel}>
                PICKUP
              </Text>
              <Text style={styles.scheduleValue}>
                {formatDateTime(
                  activeLoad.pickupScheduledAt
                )}
              </Text>
            </View>

            <View style={styles.scheduleCell}>
              <Text style={styles.scheduleLabel}>
                DELIVERY
              </Text>
              <Text style={styles.scheduleValue}>
                {formatDateTime(
                  activeLoad.deliveryScheduledAt
                )}
              </Text>
            </View>
          </View>

          <View style={styles.minimalLoadFooter}>
            <Text style={styles.loadStatusLabel}>
              Load Status
            </Text>
            <Text style={styles.loadStatusValue}>
              ◫ {statusLabel(activeLoad.status)}
            </Text>
            <Text style={styles.updatedText}>
              {serverStatus === "CONNECTED"
                ? "Live"
                : "Waiting for GPS"}
            </Text>
          </View>
        </Pressable>
      ) : (
        <View style={styles.minimalEmptyLoad}>
          <Text style={styles.minimalEmptyTitle}>
            No current load
          </Text>
          <Text style={styles.minimalEmptyCopy}>
            Accepted assignments will appear here.
          </Text>
        </View>
      )}

      <Text style={styles.sectionTitlePlain}>
        Current Truck
      </Text>

      <View style={styles.currentTruckCardPro}>
        <View style={styles.currentTruckTopPro}>
          <View style={styles.truckBadge}>
            <Text style={styles.truckBadgeText}>
              TRK
            </Text>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.currentTruckTitle}>
              {currentTruck}
            </Text>
            <Text style={styles.currentTruckSub}>
              {currentTrailer !== "—"
                ? `Trailer ${currentTrailer}`
                : "Phone GPS tracking"}
            </Text>
          </View>

          <View style={styles.truckOnlineWrap}>
            <View
              style={[
                styles.onlinePillDot,
                !tracking && {
                  backgroundColor: COLORS.muted,
                },
              ]}
            />
            <Text
              style={[
                styles.truckOnlineText,
                !tracking && {
                  color: COLORS.muted,
                },
              ]}
            >
              {tracking ? "ONLINE" : "OFFLINE"}
            </Text>
          </View>
        </View>

        <View style={styles.currentTruckDivider} />

        <View style={styles.currentTruckMetricsPro}>
          <Metric
            label="TYPE"
            value="TRK"
          />
          <Metric
            label="SPEED"
            value={`${speedMph.toFixed(0)} mph`}
          />
          <Metric
            label="ACCURACY"
            value={
              gps?.accuracy != null
                ? `${gps.accuracy.toFixed(0)} m`
                : "—"
            }
          />
        </View>
      </View>

      <Pressable
        onPress={
          tracking
            ? onStopTracking
            : onStartTracking
        }
        style={({ pressed }) => [
          tracking
            ? styles.stopTrackingButtonPro
            : styles.startTrackingButtonPro,
          pressed && styles.buttonPressed,
        ]}
      >
        <Text style={styles.trackingTargetIcon}>
          ◎
        </Text>
        <Text style={styles.trackingButtonTextPro}>
          {tracking
            ? "STOP TRACKING"
            : "START TRACKING"}
        </Text>
      </Pressable>

      <View style={styles.trackingFinePrint}>
        <View
          style={[
            styles.liveDot,
            tracking
              ? styles.liveDotOn
              : styles.liveDotOff,
          ]}
        />
        <Text style={styles.trackingFinePrintText}>
          {trackingStatus}
          {serverStatus
            ? ` · ${serverStatus}`
            : ""}
        </Text>
      </View>
    </ScrollView>
  );
}

function MiniKpi({
  label,
  value,
  caption,
  tone,
}: {
  label: string;
  value: string;
  caption: string;
  tone: "green" | "amber" | "blue";
}) {
  const dotStyle =
    tone === "green"
      ? styles.kpiDotGreen
      : tone === "amber"
        ? styles.kpiDotAmber
        : styles.kpiDotBlue;

  return (
    <View style={styles.kpiCard}>
      <View style={styles.kpiLabelRow}>
        <View style={[styles.kpiDot, dotStyle]} />
        <Text style={styles.kpiLabel}>
          {label}
        </Text>
      </View>
      <Text style={styles.kpiValue}>
        {value}
      </Text>
      <Text style={styles.kpiCaption}>
        {caption}
      </Text>
    </View>
  );
}

function LoadsScreen({
  loads,
  filter,
  loading,
  pendingCount,
  activeCount,
  completedCount,
  onFilter,
  onSelect,
  onRefresh,
}: {
  loads: Dispatch[];
  filter: LoadFilter;
  loading: boolean;
  pendingCount: number;
  activeCount: number;
  completedCount: number;
  onFilter: (filter: LoadFilter) => void;
  onSelect: (load: Dispatch) => void;
  onRefresh: () => void;
}) {
  return (
    <View style={styles.loadsPage}>
      <View style={styles.segmented}>
        <SegmentButton
          label="Pending"
          count={pendingCount}
          active={filter === "pending"}
          onPress={() =>
            onFilter("pending")
          }
        />
        <SegmentButton
          label="Active"
          count={activeCount}
          active={filter === "active"}
          onPress={() =>
            onFilter("active")
          }
        />
        <SegmentButton
          label="Completed"
          count={completedCount}
          active={
            filter === "completed"
          }
          onPress={() =>
            onFilter("completed")
          }
        />
      </View>

      <FlatList
        data={loads}
        keyExtractor={(item) =>
          String(item.id)
        }
        refreshing={loading}
        onRefresh={onRefresh}
        contentContainerStyle={
          styles.loadsList
        }
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>
              {loading ? "…" : "✓"}
            </Text>
            <Text style={styles.emptyTitle}>
              {loading
                ? "Loading"
                : "Nothing here"}
            </Text>
            <Text style={styles.emptyCopy}>
              This section is currently
              clear.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onSelect(item)}
            style={styles.loadListCard}
          >
            <View style={styles.loadTopRow}>
              <View>
                <Text
                  style={
                    styles.loadNumberLabel
                  }
                >
                  LOAD
                </Text>
                <Text
                  style={styles.loadListNumber}
                >
                  {item.loadNumber}
                </Text>
              </View>

              <StatusChip
                text={assignmentLabel(
                  item.assignmentStatus
                )}
                tone={
                  item.assignmentStatus ===
                  "ACCEPTED"
                    ? "green"
                    : item.assignmentStatus ===
                        "DECLINED"
                      ? "red"
                      : "amber"
                }
              />
            </View>

            <RoutePreview load={item} />

            <View
              style={styles.loadListFooter}
            >
              <Text
                style={
                  styles.loadListFooterText
                }
              >
                {item.truckNumber ||
                  item.asset?.deviceId ||
                  "No truck"}
              </Text>
              <Text
                style={
                  styles.loadListFooterArrow
                }
              >
                View details ›
              </Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}


function encodeAsciiBase64(
  value: string
) {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  let output = "";

  for (
    let index = 0;
    index < value.length;
    index += 3
  ) {
    const a =
      value.charCodeAt(index) & 255;
    const b =
      index + 1 < value.length
        ? value.charCodeAt(index + 1) & 255
        : NaN;
    const c =
      index + 2 < value.length
        ? value.charCodeAt(index + 2) & 255
        : NaN;

    const triple =
      (a << 16) |
      ((Number.isNaN(b) ? 0 : b) << 8) |
      (Number.isNaN(c) ? 0 : c);

    output +=
      alphabet[(triple >> 18) & 63] +
      alphabet[(triple >> 12) & 63] +
      (Number.isNaN(b)
        ? "="
        : alphabet[(triple >> 6) & 63]) +
      (Number.isNaN(c)
        ? "="
        : alphabet[triple & 63]);
  }

  return output;
}

function SignatureAcceptanceScreen({
  load,
  driver,
  onCancel,
  onConfirm,
}: {
  load: Dispatch;
  driver: DriverUser | null;
  onCancel: () => void;
  onConfirm: (
    signatureDataBase64: string
  ) => void;
}) {
  const [
    points,
    setPoints
  ] = useState<
    Array<SignaturePoint | null>
  >([]);

  const [saving, setSaving] =
    useState(false);

  const width = 320;
  const height = 180;

  const addPoint = (
    event: any
  ) => {
    const {
      locationX,
      locationY,
    } = event.nativeEvent;

    setPoints(
      (current) => [
        ...current,
        {
          x: Math.max(
            0,
            Math.min(
              width,
              Number(locationX)
            )
          ),
          y: Math.max(
            0,
            Math.min(
              height,
              Number(locationY)
            )
          ),
        },
      ]
    );
  };

  const endStroke = () => {
    setPoints(
      (current) =>
        current.length > 0 &&
        current[current.length - 1] !== null
          ? [...current, null]
          : current
    );
  };

  const visiblePoints =
    points.filter(
      (point): point is SignaturePoint =>
        point !== null
    );

  const segments =
    points
      .map(
        (point, index) => {
          if (
            !point ||
            index === 0
          ) {
            return null;
          }

          const previous =
            points[index - 1];

          if (!previous) {
            return null;
          }

          const dx =
            point.x -
            previous.x;
          const dy =
            point.y -
            previous.y;
          const length =
            Math.sqrt(
              dx * dx +
              dy * dy
            );
          const angle =
            Math.atan2(
              dy,
              dx
            ) *
            180 /
            Math.PI;

          return {
            key:
              `segment-${index}`,
            left:
              previous.x,
            top:
              previous.y,
            length,
            angle,
          };
        }
      )
      .filter(Boolean) as Array<{
        key: string;
        left: number;
        top: number;
        length: number;
        angle: number;
      }>;

  const confirm = () => {
    if (
      visiblePoints.length <
      8
    ) {
      Alert.alert(
        "Signature required",
        "Please sign before accepting the load."
      );
      return;
    }

    setSaving(true);

    try {
      const profile =
        driver?.profile ||
        driver?.driverProfile;

      const signedBy =
        [
          profile?.firstName,
          profile?.lastName,
        ]
          .filter(Boolean)
          .join(" ")
          .trim() ||
        driver?.name ||
        driver?.email ||
        "Driver";

      const signedAt =
        new Date()
          .toISOString();

      const polylineGroups:
        SignaturePoint[][] = [];

      let currentStroke:
        SignaturePoint[] = [];

      for (
        const point of points
      ) {
        if (point) {
          currentStroke.push(
            point
          );
        } else if (
          currentStroke.length > 0
        ) {
          polylineGroups.push(
            currentStroke
          );
          currentStroke = [];
        }
      }

      if (
        currentStroke.length > 0
      ) {
        polylineGroups.push(
          currentStroke
        );
      }

      const escapeXml = (
        value: string
      ) =>
        value
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");

      const signatureSvg =
        polylineGroups
          .map(
            (stroke) =>
              `<polyline points="${stroke
                .map(
                  (point) =>
                    `${point.x.toFixed(1)},${point.y.toFixed(1)}`
                )
                .join(" ")}" fill="none" stroke="#0f172a" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>`
          )
          .join("");

      const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="620" viewBox="0 0 900 620">` +
        `<rect width="900" height="620" fill="white"/>` +
        `<text x="40" y="55" font-family="Arial" font-size="28" font-weight="700" fill="#0f172a">MAVTRACK Load Acceptance</text>` +
        `<text x="40" y="100" font-family="Arial" font-size="18" fill="#334155">Load: ${escapeXml(load.loadNumber)}</text>` +
        `<text x="40" y="130" font-family="Arial" font-size="18" fill="#334155">Driver: ${escapeXml(signedBy)}</text>` +
        `<text x="40" y="160" font-family="Arial" font-size="18" fill="#334155">Truck: ${escapeXml(load.truckNumber || load.asset?.deviceId || "—")}</text>` +
        `<text x="40" y="190" font-family="Arial" font-size="18" fill="#334155">Trailer: ${escapeXml(load.trailerNumber || "—")}</text>` +
        `<text x="40" y="220" font-family="Arial" font-size="18" fill="#334155">Accepted: ${escapeXml(signedAt)}</text>` +
        `<text x="40" y="270" font-family="Arial" font-size="16" font-weight="700" fill="#475569">Driver Signature</text>` +
        `<g transform="translate(40,290) scale(2.45,1.55)">${signatureSvg}</g>` +
        `<line x1="40" y1="575" x2="860" y2="575" stroke="#cbd5e1"/>` +
        `<text x="40" y="603" font-family="Arial" font-size="13" fill="#64748b">Signed electronically in MavDriver</text>` +
        `</svg>`;

      onConfirm(
        encodeAsciiBase64(
          svg
        )
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView
      style={styles.app}
    >
      <StatusBar
        barStyle="light-content"
        backgroundColor="#07111F"
      />

      <View
        style={
          styles.detailHeader
        }
      >
        <Pressable
          onPress={onCancel}
          style={styles.backButton}
        >
          <Text
            style={styles.backText}
          >
            ‹
          </Text>
        </Pressable>

        <View
          style={{ flex: 1 }}
        >
          <Text
            style={
              styles.headerEyebrow
            }
          >
            ACCEPT LOAD
          </Text>
          <Text
            style={
              styles.detailTitle
            }
          >
            {load.loadNumber}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={
          styles.signatureContent
        }
      >
        <View
          style={styles.detailCard}
        >
          <DetailSectionTitle
            title="SIGNATURE REQUIRED"
          />

          <Text
            style={
              styles.signatureCopy
            }
          >
            Sign below to confirm
            that you accept this load.
            Your signed acceptance
            will be saved in Load
            Documents.
          </Text>

          <View
            style={[
              styles.signaturePad,
              {
                width,
                height,
              },
            ]}
            onStartShouldSetResponder={() =>
              true
            }
            onMoveShouldSetResponder={() =>
              true
            }
            onResponderGrant={
              addPoint
            }
            onResponderMove={
              addPoint
            }
            onResponderRelease={
              endStroke
            }
            onResponderTerminate={
              endStroke
            }
          >
            {
              segments.map(
                (segment) => (
                  <View
                    key={
                      segment.key
                    }
                    style={[
                      styles.signatureSegment,
                      {
                        left:
                          segment.left,
                        top:
                          segment.top,
                        width:
                          segment.length,
                        transform: [
                          {
                            rotate:
                              `${segment.angle}deg`,
                          },
                        ],
                      },
                    ]}
                  />
                )
              )
            }

            {
              visiblePoints.length === 0
                ? (
                  <Text
                    style={
                      styles.signaturePlaceholder
                    }
                  >
                    Sign here
                  </Text>
                )
                : null
            }
          </View>

          <Pressable
            onPress={() =>
              setPoints([])
            }
            style={
              styles.signatureClearButton
            }
          >
            <Text
              style={
                styles.signatureClearText
              }
            >
              CLEAR SIGNATURE
            </Text>
          </Pressable>
        </View>

        <Pressable
          onPress={confirm}
          disabled={saving}
          style={[
            styles.acceptButton,
            styles.signatureAcceptButton,
            saving &&
              styles.buttonDisabled,
          ]}
        >
          {
            saving
              ? (
                <ActivityIndicator
                  color="#FFFFFF"
                />
              )
              : (
                <Text
                  style={
                    styles.acceptButtonText
                  }
                >
                  ACCEPT & SIGN
                </Text>
              )
          }
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function LoadDetailScreen({
  load,
  onBack,
  onAccept,
  onDecline,
  documentBusy,
  onAddPhoto,
  onAddDocument,
  onOpenDocument,
  onUpdateStop,
}: {
  load: Dispatch;
  onBack: () => void;
  onAccept: () => void;
  onDecline: () => void;
  documentBusy: boolean;
  onAddPhoto: () => void;
  onAddDocument: () => void;
  onOpenDocument: (
    document: DispatchDocument
  ) => void;
  onUpdateStop: (
    stop: DispatchStop,
    status:
      | "EN_ROUTE"
      | "ARRIVED"
      | "COMPLETED"
  ) => void;
}) {
  const pending =
    load.assignmentStatus === "PENDING";

  return (
    <SafeAreaView style={styles.app}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#07111F"
      />

      <View style={styles.detailHeader}>
        <Pressable
          onPress={onBack}
          style={styles.backButton}
        >
          <Text style={styles.backText}>
            ‹
          </Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text
            style={styles.headerEyebrow}
          >
            LOAD DETAILS
          </Text>
          <Text style={styles.detailTitle}>
            {load.loadNumber}
          </Text>
        </View>
        <StatusChip
          text={assignmentLabel(
            load.assignmentStatus
          )}
          tone={
            load.assignmentStatus ===
            "ACCEPTED"
              ? "green"
              : load.assignmentStatus ===
                  "DECLINED"
                ? "red"
                : "amber"
          }
        />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={
          styles.detailContent
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.detailCard}>
          <DetailSectionTitle
            title="ROUTE"
          />
          <RoutePreview load={load} />
        </View>

        {
          (load.stops || []).length > 0
            ? (
              <View style={styles.detailCard}>
                <DetailSectionTitle
                  title="PICKUPS & DROPS"
                />

                <View style={styles.mobileStopsList}>
                  {
                    [...(load.stops || [])]
                      .sort(
                        (a, b) =>
                          a.sequence -
                          b.sequence
                      )
                      .map(
                        (stop) => (
                          <View
                            key={stop.id}
                            style={[
                              styles.mobileStopCard,
                              stop.status === "COMPLETED" &&
                                styles.mobileStopCardComplete,
                            ]}
                          >
                            <View style={styles.mobileStopHeader}>
                              <View style={styles.mobileStopNumber}>
                                <Text style={styles.mobileStopNumberText}>
                                  {stop.pairNumber || stop.sequence}
                                </Text>
                              </View>

                              <View style={{ flex: 1 }}>
                                <Text style={styles.mobileStopType}>
                                  {
                                    stop.type === "PICKUP"
                                      ? `PICKUP ${stop.pairNumber || stop.sequence}`
                                      : `DROP ${stop.pairNumber || stop.sequence}`
                                  }
                                  {" · "}
                                  {
                                    stop.status
                                      .replaceAll("_", " ")
                                  }
                                </Text>
                                <Text style={styles.mobileStopName}>
                                  {stop.name}
                                </Text>
                                <Text style={styles.mobileStopAddress}>
                                  {stop.address}
                                </Text>
                                {
                                  stop.scheduledAt
                                    ? (
                                      <Text style={styles.mobileStopMeta}>
                                        {formatDateTime(stop.scheduledAt)}
                                      </Text>
                                    )
                                    : null
                                }
                              </View>
                            </View>

                            {
                              load.assignmentStatus === "ACCEPTED" &&
                              stop.status !== "COMPLETED"
                                ? (
                                  <View style={styles.mobileStopActions}>
                                    {
                                      stop.status === "PENDING"
                                        ? (
                                          <Pressable
                                            onPress={() =>
                                              onUpdateStop(
                                                stop,
                                                "EN_ROUTE"
                                              )
                                            }
                                            style={styles.mobileStopActionButton}
                                          >
                                            <Text style={styles.mobileStopActionText}>
                                              START EN ROUTE
                                            </Text>
                                          </Pressable>
                                        )
                                        : stop.status === "EN_ROUTE"
                                          ? (
                                            <Pressable
                                              onPress={() =>
                                                onUpdateStop(
                                                  stop,
                                                  "ARRIVED"
                                                )
                                              }
                                              style={styles.mobileStopActionButton}
                                            >
                                              <Text style={styles.mobileStopActionText}>
                                                MARK ARRIVED
                                              </Text>
                                            </Pressable>
                                          )
                                          : (
                                            <Pressable
                                              onPress={() =>
                                                onUpdateStop(
                                                  stop,
                                                  "COMPLETED"
                                                )
                                              }
                                              style={styles.mobileStopActionButton}
                                            >
                                              <Text style={styles.mobileStopActionText}>
                                                COMPLETE STOP
                                              </Text>
                                            </Pressable>
                                          )
                                    }
                                  </View>
                                )
                                : null
                            }
                          </View>
                        )
                      )
                  }
                </View>
              </View>
            )
            : null
        }

        <View style={styles.detailCard}>
          <DetailSectionTitle
            title="LOAD INFORMATION"
          />
          <DetailGrid>
            <DetailItem
              label="Dispatcher"
              value={
                load.dispatcherName || "—"
              }
            />
            <DetailItem
              label="Dispatcher Phone"
              value={load.dispatcherPhone || "—"}
            />
            <DetailItem
              label="PO #"
              value={load.poNumber || "—"}
            />
            <DetailItem
              label="B/L #"
              value={load.bolNumber || "—"}
            />
            <DetailItem
              label="Reference"
              value={
                load.referenceNumber || "—"
              }
            />
          </DetailGrid>
        </View>

        <View style={styles.detailCard}>
          <DetailSectionTitle
            title="TEMPERATURE"
          />
          <View style={styles.temperatureRow}>
            <TemperatureMetric
              label="SET POINT"
              value={fahrenheitFromCelsius(
                load.temperatureSetpointC
              )}
              tone="blue"
            />
            <TemperatureMetric
              label="MINIMUM"
              value={fahrenheitFromCelsius(
                load.temperatureMinC
              )}
              tone="blue"
            />
            <TemperatureMetric
              label="MAXIMUM"
              value={fahrenheitFromCelsius(
                load.temperatureMaxC
              )}
              tone="red"
            />
          </View>
        </View>

        <View style={styles.detailCard}>
          <DetailSectionTitle
            title="EQUIPMENT"
          />
          <DetailGrid>
            <DetailItem
              label="Truck"
              value={
                load.truckNumber ||
                load.asset?.deviceId ||
                "—"
              }
            />
            <DetailItem
              label="Trailer"
              value={
                load.trailerNumber || "—"
              }
            />
            <DetailItem
              label="Carrier"
              value={
                load.carrierName || "—"
              }
            />
            <DetailItem
              label="Status"
              value={statusLabel(
                load.status
              )}
            />
          </DetailGrid>
        </View>

        <View style={styles.detailCard}>
          <DetailSectionTitle
            title="DOCUMENTS"
          />

          {
            (load.documents || []).length > 0
              ? (
                <View style={styles.mobileDocumentList}>
                  {
                    (load.documents || []).map(
                      (document) => (
                        <Pressable
                          key={document.id}
                          onPress={() =>
                            onOpenDocument(
                              document
                            )
                          }
                          style={styles.mobileDocumentRow}
                        >
                          <View style={styles.mobileDocumentBadge}>
                            <Text style={styles.mobileDocumentBadgeText}>
                              {
                                document.isSignature
                                  ? "SIGN"
                                  : document.category === "PHOTO"
                                    ? "IMG"
                                    : "DOC"
                              }
                            </Text>
                          </View>

                          <View style={{ flex: 1 }}>
                            <Text
                              style={styles.mobileDocumentName}
                              numberOfLines={1}
                            >
                              {document.originalName}
                            </Text>
                            <Text style={styles.mobileDocumentMeta}>
                              {
                                document.isSignature
                                  ? `Signed by ${document.signedBy || "driver"}`
                                  : `Uploaded by ${document.uploadedByName || document.uploadedByRole}`
                              }
                              {" · "}
                              {formatDateTime(document.createdAt)}
                            </Text>
                          </View>

                          <Text style={styles.mobileDocumentOpen}>
                            OPEN
                          </Text>
                        </Pressable>
                      )
                    )
                  }
                </View>
              )
              : (
                <Text style={styles.comingSoonCopy}>
                  No load documents yet.
                </Text>
              )
          }

          {
            load.assignmentStatus === "ACCEPTED"
              ? (
                <View style={styles.mobileDocumentActions}>
                  <Pressable
                    onPress={onAddPhoto}
                    disabled={documentBusy}
                    style={styles.mobileDocumentActionButton}
                  >
                    <Text style={styles.mobileDocumentActionText}>
                      + PHOTO
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={onAddDocument}
                    disabled={documentBusy}
                    style={styles.mobileDocumentActionButton}
                  >
                    <Text style={styles.mobileDocumentActionText}>
                      + DOCUMENT
                    </Text>
                  </Pressable>
                </View>
              )
              : (
                <Text style={styles.mobileDocumentHint}>
                  Accept and sign the load before uploading documents.
                </Text>
              )
          }
        </View>

        {pending ? (
          <View style={styles.responseRow}>
            <Pressable
              onPress={onDecline}
              style={styles.declineButton}
            >
              <Text
                style={
                  styles.declineButtonText
                }
              >
                DECLINE
              </Text>
            </Pressable>

            <Pressable
              onPress={onAccept}
              style={styles.acceptButton}
            >
              <Text
                style={
                  styles.acceptButtonText
                }
              >
                ACCEPT LOAD
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function ProfileScreen({
  user,
  activeLoad,
  onSave,
  onLogout,
}: {
  user: DriverUser | null;
  activeLoad: Dispatch | null;
  onSave: (fields: {
    firstName: string;
    lastName: string;
    phone: string;
    licenseNumber: string;
    licenseState: string;
    currentTruckNumber: string;
    physicalTruckNumber: string;
    currentTrailerNumber: string;
    currentTrailerLicense: string;
  }) => Promise<void>;
  onLogout: () => void;
}) {
  const profile =
    user?.profile ||
    user?.driverProfile ||
    null;

  const [profileEditing, setProfileEditing] =
    useState(false);

  const [equipmentEditing, setEquipmentEditing] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [form, setForm] = useState({
    firstName: profile?.firstName || "",
    lastName: profile?.lastName || "",
    phone: profile?.phone || "",
    licenseNumber:
      profile?.licenseNumber || "",
    licenseState:
      profile?.licenseState || "",
    physicalTruckNumber:
      profile?.physicalTruckNumber || "",
    currentTrailerNumber:
      profile?.currentTrailerNumber || "",
    currentTrailerLicense:
      profile?.currentTrailerLicense || "",
  });

  useEffect(() => {
    setForm({
      firstName: profile?.firstName || "",
      lastName: profile?.lastName || "",
      phone: profile?.phone || "",
      licenseNumber:
        profile?.licenseNumber || "",
      licenseState:
        profile?.licenseState || "",
      physicalTruckNumber:
        profile?.physicalTruckNumber || "",
      currentTrailerNumber:
        profile?.currentTrailerNumber || "",
      currentTrailerLicense:
        profile?.currentTrailerLicense || "",
    });
  }, [
    profile?.firstName,
    profile?.lastName,
    profile?.phone,
    profile?.licenseNumber,
    profile?.licenseState,
    profile?.physicalTruckNumber,
    profile?.currentTrailerNumber,
    profile?.currentTrailerLicense,
  ]);

  const fixedTruckDeviceId =
    activeLoad?.asset?.deviceId ||
    profile?.currentTruckNumber ||
    DEFAULT_TRACKING_DEVICE_ID;

  async function saveAll() {
    if (
      !form.firstName.trim() ||
      !form.lastName.trim()
    ) {
      Alert.alert(
        "Name required",
        "First name and last name are required."
      );
      return;
    }

    try {
      setSaving(true);

      await onSave({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        licenseNumber:
          form.licenseNumber.trim(),
        licenseState:
          form.licenseState.trim(),
        currentTruckNumber:
          fixedTruckDeviceId,
        physicalTruckNumber:
          form.physicalTruckNumber.trim(),
        currentTrailerNumber:
          form.currentTrailerNumber.trim(),
        currentTrailerLicense:
          form.currentTrailerLicense.trim(),
      });

      setProfileEditing(false);
      setEquipmentEditing(false);

      Alert.alert(
        "Profile updated",
        "Driver and equipment information has been saved."
      );
    } catch (err) {
      Alert.alert(
        "Unable to save profile",
        err instanceof Error
          ? err.message
          : "Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  const truckDeviceId =
    fixedTruckDeviceId;

  const truckLabel =
    activeLoad?.truckNumber ||
    profile?.physicalTruckNumber ||
    "—";

  const trailerNumber =
    activeLoad?.trailerNumber ||
    profile?.currentTrailerNumber ||
    "—";

  return (
    <ScrollView
      style={styles.content}
      contentContainerStyle={
        styles.profileContentPro
      }
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.profileSectionHeader}>
        <Text style={styles.profileSectionTitle}>
          Driver Profile
        </Text>

        <Pressable
          onPress={() =>
            setProfileEditing(
              (value) => !value
            )
          }
        >
          <Text style={styles.profileEditText}>
            {profileEditing
              ? "Cancel"
              : "Edit"}
          </Text>
        </Pressable>
      </View>

      {profileEditing ? (
        <View style={styles.profileEditCardCompact}>
          <View style={styles.editTwoColRow}>
            <View style={styles.editHalf}>
              <Text style={styles.inputLabel}>
                FIRST NAME
              </Text>
              <TextInput
                value={form.firstName}
                onChangeText={(value) =>
                  setForm((current) => ({
                    ...current,
                    firstName: value,
                  }))
                }
                style={styles.inputCompact}
              />
            </View>

            <View style={styles.editHalf}>
              <Text style={styles.inputLabel}>
                LAST NAME
              </Text>
              <TextInput
                value={form.lastName}
                onChangeText={(value) =>
                  setForm((current) => ({
                    ...current,
                    lastName: value,
                  }))
                }
                style={styles.inputCompact}
              />
            </View>
          </View>

          <Text style={styles.inputLabel}>
            PHONE
          </Text>
          <TextInput
            value={form.phone}
            onChangeText={(value) =>
              setForm((current) => ({
                ...current,
                phone: value,
              }))
            }
            keyboardType="phone-pad"
            style={styles.inputCompact}
          />

          <View style={styles.editTwoColRow}>
            <View style={styles.editHalf}>
              <Text style={styles.inputLabel}>
                DRIVER LICENSE
              </Text>
              <TextInput
                value={form.licenseNumber}
                onChangeText={(value) =>
                  setForm((current) => ({
                    ...current,
                    licenseNumber: value,
                  }))
                }
                autoCapitalize="characters"
                style={styles.inputCompact}
              />
            </View>

            <View style={styles.editHalf}>
              <Text style={styles.inputLabel}>
                STATE
              </Text>
              <TextInput
                value={form.licenseState}
                onChangeText={(value) =>
                  setForm((current) => ({
                    ...current,
                    licenseState: value,
                  }))
                }
                autoCapitalize="characters"
                style={styles.inputCompact}
              />
            </View>
          </View>

          <Pressable
            onPress={() => void saveAll()}
            disabled={saving}
            style={[
              styles.saveProfileButton,
              saving && styles.buttonDisabled,
            ]}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.saveProfileButtonText}>
                SAVE PROFILE
              </Text>
            )}
          </Pressable>
        </View>
      ) : (
        <View style={styles.profileRowsCard}>
          <ProfileRow
            icon="⌕"
            label="Phone"
            value={profile?.phone || "—"}
          />
          <View style={styles.profileRowDivider} />
          <ProfileRow
            icon="▣"
            label="License"
            value={[
              profile?.licenseState,
              profile?.licenseNumber,
            ]
              .filter(Boolean)
              .join(" ") || "—"}
          />
        </View>
      )}

      <View style={styles.profileSectionHeader}>
        <Text style={styles.profileSectionTitle}>
          Equipment
        </Text>

        <Pressable
          onPress={() =>
            setEquipmentEditing(
              (value) => !value
            )
          }
        >
          <Text style={styles.profileEditText}>
            {equipmentEditing
              ? "Cancel"
              : "Edit"}
          </Text>
        </Pressable>
      </View>

      {equipmentEditing ? (
        <View style={styles.profileEditCardCompact}>
          <Text style={styles.inputLabel}>
            TRUCK
          </Text>

          <View style={styles.readOnlyEquipmentRow}>
            <View style={styles.assetChoiceBadge}>
              <Text style={styles.assetChoiceBadgeText}>
                TRK
              </Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.assetChoiceName}>
                {truckLabel}
              </Text>
              <Text style={styles.assetChoiceDevice}>
                {truckDeviceId}
              </Text>
            </View>

            <Text style={styles.fixedEquipmentText}>
              FIXED
            </Text>
          </View>

          <Text style={styles.inputLabel}>
            TRUCK NUMBER
          </Text>
          <TextInput
            value={form.physicalTruckNumber}
            onChangeText={(value) =>
              setForm((current) => ({
                ...current,
                physicalTruckNumber: value,
              }))
            }
            autoCapitalize="characters"
            placeholder="2-01TRK"
            placeholderTextColor="#53657B"
            style={styles.inputCompact}
          />

          <Text style={styles.inputLabel}>
            TRAILER NUMBER
          </Text>
          <TextInput
            value={form.currentTrailerNumber}
            onChangeText={(value) =>
              setForm((current) => ({
                ...current,
                currentTrailerNumber: value,
              }))
            }
            autoCapitalize="characters"
            placeholder="2-01TRL"
            placeholderTextColor="#53657B"
            style={styles.inputCompact}
          />

          <Text style={styles.inputLabel}>
            TRAILER LICENSE
          </Text>
          <TextInput
            value={form.currentTrailerLicense}
            onChangeText={(value) =>
              setForm((current) => ({
                ...current,
                currentTrailerLicense: value,
              }))
            }
            autoCapitalize="characters"
            placeholder="Trailer plate / license"
            placeholderTextColor="#53657B"
            style={styles.inputCompact}
          />

          <Pressable
            onPress={() => void saveAll()}
            disabled={saving}
            style={[
              styles.saveProfileButton,
              saving && styles.buttonDisabled,
            ]}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.saveProfileButtonText}>
                SAVE EQUIPMENT
              </Text>
            )}
          </Pressable>
        </View>
      ) : (
        <View style={styles.profileRowsCard}>
          <ProfileRow
            icon="▰"
            label="Truck"
            value={truckLabel}
            subvalue={truckDeviceId}
          />

          <View style={styles.profileRowDivider} />

          <ProfileRow
            icon="▭"
            label="Trailer"
            value={trailerNumber}
            subvalue={
              profile?.currentTrailerLicense
                ? `License ${profile.currentTrailerLicense}`
                : "No trailer license saved"
            }
          />
        </View>
      )}

      <View style={styles.assignmentProfileCard}>
        <Text style={styles.assignmentProfileTitle}>
          Current Assignment
        </Text>

        {activeLoad ? (
          <View style={styles.assignmentLoadRow}>
            <View style={styles.loadIconBoxSmall}>
              <Text style={styles.loadIconText}>
                ◈
              </Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.assignmentLoadNumber}>
                {activeLoad.loadNumber}
              </Text>
              <Text style={styles.assignmentRouteText}>
                {activeLoad.pickupName}
                {"  →  "}
                {activeLoad.deliveryName}
              </Text>
            </View>

            <View style={styles.onlinePill}>
              <View style={styles.onlinePillDot} />
              <Text style={styles.onlinePillText}>
                ACTIVE
              </Text>
            </View>
          </View>
        ) : (
          <Text style={styles.noAssignmentText}>
            No active assignment.
          </Text>
        )}
      </View>

      <Pressable
        onPress={onLogout}
        style={styles.logoutButtonPro}
      >
        <Text style={styles.logoutTextPro}>
          SIGN OUT
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function ProfileRow({
  icon,
  label,
  value,
  subvalue,
}: {
  icon: string;
  label: string;
  value: string;
  subvalue?: string;
}) {
  return (
    <View style={styles.profileRow}>
      <Text style={styles.profileRowIcon}>
        {icon}
      </Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.profileRowLabel}>
          {label}
        </Text>
        {subvalue ? (
          <Text style={styles.profileRowSubvalue}>
            {subvalue}
          </Text>
        ) : null}
      </View>
      <Text style={styles.profileRowValue}>
        {value}
      </Text>
      <Text style={styles.profileRowChevron}>
        ›
      </Text>
    </View>
  );
}

function BottomTabs({
  tab,
  pendingCount,
  onChange,
}: {
  tab: TabName;
  pendingCount: number;
  onChange: (tab: TabName) => void;
}) {
  return (
    <View style={styles.bottomTabsPro}>
      <TabButton
        label="Home"
        icon="⌂"
        active={tab === "home"}
        onPress={() => onChange("home")}
      />
      <TabButton
        label="Loads"
        icon="▣"
        badge={pendingCount}
        active={tab === "loads"}
        onPress={() => onChange("loads")}
      />
      <TabButton
        label="Map"
        icon="◇"
        active={false}
        onPress={() =>
          Alert.alert(
            "Map",
            "Driver map view will be connected next."
          )
        }
      />
      <TabButton
        label="Alerts"
        icon="♢"
        active={false}
        onPress={() =>
          Alert.alert(
            "Alerts",
            "Driver alerts will be connected next."
          )
        }
      />
      <TabButton
        label="Profile"
        icon="◉"
        active={tab === "profile"}
        onPress={() =>
          onChange("profile")
        }
      />
    </View>
  );
}

function TabButton({
  label,
  icon,
  active,
  badge,
  onPress,
}: {
  label: string;
  icon: string;
  active: boolean;
  badge?: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.tabButtonPro}
    >
      <View style={styles.tabIconWrap}>
        <Text
          style={[
            styles.tabIconPro,
            active &&
              styles.tabIconActivePro,
          ]}
        >
          {icon}
        </Text>

        {badge ? (
          <View style={styles.tabBadge}>
            <Text style={styles.tabBadgeText}>
              {badge > 9 ? "9+" : badge}
            </Text>
          </View>
        ) : null}
      </View>

      <Text
        style={[
          styles.tabLabelPro,
          active &&
            styles.tabLabelActivePro,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SegmentButton({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.segmentButton,
        active &&
          styles.segmentButtonActive,
      ]}
    >
      <Text
        style={[
          styles.segmentText,
          active &&
            styles.segmentTextActive,
        ]}
      >
        {label}
      </Text>
      <View
        style={[
          styles.segmentCount,
          active &&
            styles.segmentCountActive,
        ]}
      >
        <Text
          style={[
            styles.segmentCountText,
            active &&
              styles.segmentCountTextActive,
          ]}
        >
          {count}
        </Text>
      </View>
    </Pressable>
  );
}

function RoutePreview({
  load,
}: {
  load: Dispatch;
}) {
  return (
    <View style={styles.routePreview}>
      <View style={styles.routeRail}>
        <View style={styles.routeDotBlue} />
        <View style={styles.routeLine} />
        <View style={styles.routeDotGreen} />
      </View>

      <View style={styles.routeContent}>
        <RouteStop
          label="PICKUP"
          name={load.pickupName}
          address={load.pickupAddress}
          time={formatDateTime(
            load.pickupScheduledAt
          )}
          reference={
            load.pickupReference
          }
        />

        <View style={styles.routeSpacer} />

        <RouteStop
          label="DELIVERY"
          name={load.deliveryName}
          address={load.deliveryAddress}
          time={formatDateTime(
            load.deliveryScheduledAt
          )}
          reference={
            load.deliveryReference
          }
        />
      </View>
    </View>
  );
}

function RouteStop({
  label,
  name,
  address,
  time,
  reference,
}: {
  label: string;
  name: string;
  address: string;
  time: string;
  reference?: string | null;
}) {
  return (
    <View style={styles.routeStop}>
      <View
        style={styles.routeStopHeading}
      >
        <Text style={styles.routeStopLabel}>
          {label}
        </Text>
        <Text style={styles.routeStopTime}>
          {time}
        </Text>
      </View>
      <Text
        style={styles.routeStopName}
        numberOfLines={1}
      >
        {name}
      </Text>
      <Text
        style={styles.routeStopAddress}
        numberOfLines={2}
      >
        {address}
      </Text>
      {reference ? (
        <Text
          style={styles.routeStopReference}
        >
          REF {reference}
        </Text>
      ) : null}
    </View>
  );
}

function StatusChip({
  text,
  tone,
}: {
  text: string;
  tone:
    | "blue"
    | "green"
    | "amber"
    | "red";
}) {
  const toneStyle =
    tone === "green"
      ? styles.statusGreen
      : tone === "amber"
        ? styles.statusAmber
        : tone === "red"
          ? styles.statusRed
          : styles.statusBlue;

  return (
    <View
      style={[styles.statusChip, toneStyle]}
    >
      <Text
        style={[
          styles.statusChipText,
          toneStyle,
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

function InfoMini({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoMini}>
      <Text style={styles.infoMiniLabel}>
        {label}
      </Text>
      <Text
        style={styles.infoMiniValue}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>
        {value}
      </Text>
      <Text style={styles.metricLabel}>
        {label}
      </Text>
    </View>
  );
}

function TemperatureMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "blue" | "red";
}) {
  return (
    <View style={styles.temperatureMetric}>
      <Text style={styles.temperatureLabel}>
        {label}
      </Text>
      <Text
        style={[
          styles.temperatureValue,
          tone === "red" &&
            styles.temperatureValueRed,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function DetailSectionTitle({
  title,
}: {
  title: string;
}) {
  return (
    <Text style={styles.detailSectionTitle}>
      {title}
    </Text>
  );
}

function DetailGrid({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <View style={styles.detailGrid}>
      {children}
    </View>
  );
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailItem}>
      <Text style={styles.detailItemLabel}>
        {label}
      </Text>
      <Text
        style={styles.detailItemValue}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

const COLORS = {
  bg: "#06111F",
  bgSoft: "#081628",
  surface: "#0C1B2D",
  surface2: "#10243A",
  surface3: "#132A44",
  border: "#1E3550",
  borderSoft: "#162A42",
  text: "#F4F8FE",
  muted: "#8193AA",
  blue: "#2F78FF",
  blueStrong: "#1265FF",
  blueLight: "#5EA2FF",
  green: "#44D17A",
  amber: "#FFAA45",
  red: "#F0525E",
};

const styles = StyleSheet.create({
  app: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  content: {
    flex: 1,
  },

  bootScreen: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: "center",
    justifyContent: "center",
  },

  bootBrand: {
    color: COLORS.text,
    marginTop: 18,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 5,
  },

  brandMark: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#37516F",
    backgroundColor: "#0C1C30",
    shadowColor: COLORS.blue,
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: {
      width: 0,
      height: 10,
    },
  },

  brandM: {
    color: "#FFFFFF",
    fontSize: 34,
    fontWeight: "900",
    fontStyle: "italic",
  },

  loginScreen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  loginKeyboard: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
  },

  loginTop: {
    alignItems: "center",
    marginBottom: 30,
  },

  loginBrand: {
    marginTop: 18,
    color: COLORS.text,
    fontSize: 31,
    fontWeight: "900",
    letterSpacing: 4.5,
  },

  loginSubtitle: {
    marginTop: 6,
    color: COLORS.blueLight,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 3,
  },

  loginCard: {
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    backgroundColor: "rgba(12,27,45,0.96)",
  },

  loginTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
  },

  loginCopy: {
    marginTop: 7,
    marginBottom: 22,
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 19,
  },

  inputLabel: {
    marginBottom: 7,
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
  },

  input: {
    height: 50,
    marginBottom: 16,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: "#0A1728",
    color: COLORS.text,
    fontSize: 15,
  },

  authError: {
    marginBottom: 14,
    color: "#FF9CA4",
    fontSize: 12,
    lineHeight: 18,
  },

  primaryButton: {
    height: 54,
    marginTop: 4,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 27,
    backgroundColor: COLORS.blueStrong,
    shadowColor: COLORS.blue,
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 8,
    },
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1.2,
  },

  buttonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },

  buttonDisabled: {
    opacity: 0.6,
  },

  loginFooter: {
    marginTop: 22,
    textAlign: "center",
    color: "#586A80",
    fontSize: 10,
    fontWeight: "700",
  },

  appHeader: {
    minHeight: 56,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSoft,
    backgroundColor: "#071524",
  },

  quickMenu: {
    position: "absolute",
    top: 58,
    left: 12,
    right: 12,
    zIndex: 50,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#23364D",
    backgroundColor: "#0C1828",
    shadowColor: "#000000",
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 12,
  },
  quickMenuItem: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    color: "#EAF2FB",
    fontSize: 14,
    fontWeight: "700",
    borderBottomWidth: 1,
    borderBottomColor: "#17283B",
  },
  quickMenuDanger: {
    color: "#F87171",
    borderBottomWidth: 0,
  },

  headerSideButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },

  headerCenter: {
    flex: 1,
    alignItems: "center",
  },

  headerTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "900",
  },

  headerMenuIcon: {
    color: "#DDE8F6",
    fontSize: 16,
    fontWeight: "700",
  },

  headerBellIcon: {
    color: "#DDE8F6",
    fontSize: 18,
  },

  headerBadge: {
    position: "absolute",
    top: 3,
    right: 1,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: COLORS.red,
  },

  headerBadgeText: {
    color: "#FFFFFF",
    fontSize: 8,
    fontWeight: "900",
  },

  inlineError: {
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#35161B",
  },

  inlineErrorText: {
    color: "#FFB2B8",
    fontSize: 11,
    lineHeight: 16,
  },

  contentContainer: {
    padding: 14,
    paddingBottom: 14,
    maxWidth: 460,
    width: "100%",
    alignSelf: "center",
  },

  kpiRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },

  kpiCard: {
    flex: 1,
    minHeight: 88,
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 13,
    backgroundColor: COLORS.surface,
  },

  kpiLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  kpiDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  kpiDotGreen: {
    backgroundColor: COLORS.green,
  },

  kpiDotAmber: {
    backgroundColor: COLORS.amber,
  },

  kpiDotBlue: {
    backgroundColor: COLORS.blueLight,
  },

  kpiLabel: {
    color: COLORS.muted,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  kpiValue: {
    marginTop: 5,
    color: COLORS.text,
    fontSize: 23,
    lineHeight: 26,
    fontWeight: "900",
  },

  kpiCaption: {
    marginTop: 1,
    color: "#D0D9E6",
    fontSize: 9,
    fontWeight: "700",
  },

  sectionTitlePlain: {
    marginBottom: 8,
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "900",
  },

  minimalLoadCard: {
    marginBottom: 20,
    padding: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 15,
    backgroundColor: COLORS.surface,
  },

  minimalLoadTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  loadIconBox: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: COLORS.blueStrong,
  },

  loadIconBoxSmall: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: COLORS.blueStrong,
  },

  loadIconText: {
    color: "#FFFFFF",
    fontSize: 21,
    fontWeight: "900",
  },

  loadTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  minimalLoadNumber: {
    flexShrink: 1,
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "900",
  },

  onlinePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    backgroundColor: "#0C2D20",
  },

  onlinePillDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.green,
  },

  onlinePillText: {
    color: "#6FE29A",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  minimalRouteLine: {
    marginTop: 4,
    color: "#CDD8E6",
    fontSize: 11,
    fontWeight: "700",
  },

  minimalScheduleRow: {
    marginTop: 16,
    paddingTop: 14,
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSoft,
  },

  scheduleCell: {
    flex: 1,
  },

  scheduleLabel: {
    color: COLORS.muted,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.6,
  },

  scheduleValue: {
    marginTop: 5,
    color: COLORS.text,
    fontSize: 11,
    fontWeight: "800",
  },

  minimalLoadFooter: {
    marginTop: 14,
    paddingTop: 12,
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSoft,
  },

  loadStatusLabel: {
    color: COLORS.muted,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  loadStatusValue: {
    marginLeft: 8,
    color: COLORS.blueLight,
    fontSize: 11,
    fontWeight: "900",
  },

  updatedText: {
    marginLeft: "auto",
    color: COLORS.muted,
    fontSize: 9,
    fontWeight: "700",
  },

  minimalEmptyLoad: {
    minHeight: 82,
    marginBottom: 16,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 15,
    backgroundColor: COLORS.surface,
  },

  minimalEmptyTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "900",
  },

  minimalEmptyCopy: {
    marginTop: 3,
    color: COLORS.muted,
    fontSize: 9,
  },


  emptyCard: {
    minHeight: 145,
    marginBottom: 18,
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 15,
    backgroundColor: COLORS.surface,
  },

  emptyIcon: {
    color: COLORS.green,
    fontSize: 26,
    fontWeight: "900",
  },

  emptyTitle: {
    marginTop: 8,
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "900",
  },

  emptyCopy: {
    marginTop: 4,
    color: COLORS.muted,
    textAlign: "center",
    fontSize: 11,
  },

  infoMini: {
    flex: 1,
    minWidth: 0,
  },

  infoMiniLabel: {
    color: COLORS.muted,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.7,
  },

  infoMiniValue: {
    marginTop: 3,
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "900",
  },

  currentTruckCardPro: {
    marginBottom: 0,
    padding: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
  },

  currentTruckTopPro: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  currentTruckDivider: {
    height: 1,
    marginTop: 12,
    backgroundColor: COLORS.borderSoft,
  },

  currentTruckMetricsPro: {
    paddingTop: 11,
    flexDirection: "row",
  },

  currentTruckCard: {
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 15,
    backgroundColor: COLORS.surface,
  },

  truckBadge: {
    width: 45,
    height: 45,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: COLORS.blueStrong,
  },

  truckBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },

  currentTruckTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "900",
  },

  currentTruckSub: {
    marginTop: 2,
    color: COLORS.muted,
    fontSize: 10,
  },

  truckOnlineWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  truckOnlineText: {
    color: "#6FE29A",
    fontSize: 9,
    fontWeight: "900",
  },

  truckMetricsRow: {
    marginTop: 8,
    paddingVertical: 12,
    flexDirection: "row",
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    borderRadius: 12,
    backgroundColor: "#0A1728",
  },

  metric: {
    flex: 1,
    alignItems: "center",
  },

  metricValue: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "900",
  },

  metricLabel: {
    marginTop: 3,
    color: COLORS.muted,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.6,
  },

  startTrackingButtonPro: {
    height: 52,
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 28,
    backgroundColor: COLORS.blueStrong,
    shadowColor: COLORS.blue,
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: {
      width: 0,
      height: 8,
    },
  },

  stopTrackingButtonPro: {
    height: 52,
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 28,
    backgroundColor: COLORS.blueStrong,
  },

  trackingTargetIcon: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "900",
  },

  trackingButtonTextPro: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.7,
  },

  signatureContent: {
    padding: 16,
    paddingBottom: 34,
  },
  signatureCopy: {
    marginBottom: 14,
    color: "#AFC0D4",
    fontSize: 13,
    lineHeight: 19,
  },
  signaturePad: {
    position: "relative",
    alignSelf: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  signatureSegment: {
    position: "absolute",
    height: 2.4,
    borderRadius: 999,
    backgroundColor: "#0F172A",
  },
  signaturePlaceholder: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 78,
    textAlign: "center",
    color: "#94A3B8",
    fontSize: 15,
    fontWeight: "700",
  },
  signatureClearButton: {
    alignSelf: "flex-end",
    marginTop: 10,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  signatureClearText: {
    color: "#93C5FD",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  signatureAcceptButton: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },

  mobileStopsList: {
    gap: 10,
  },
  mobileStopCard: {
    padding: 12,
    borderWidth: 1,
    borderColor: "#203248",
    borderRadius: 12,
    backgroundColor: "#0C1828",
  },
  mobileStopCardComplete: {
    borderColor: "rgba(74, 222, 128, 0.28)",
    backgroundColor: "rgba(34, 197, 94, 0.06)",
  },
  mobileStopHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  mobileStopNumber: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1E293B",
  },
  mobileStopNumberText: {
    color: "#EAF2FB",
    fontSize: 12,
    fontWeight: "900",
  },
  mobileStopType: {
    color: "#60A5FA",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  mobileStopName: {
    marginTop: 3,
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "800",
  },
  mobileStopAddress: {
    marginTop: 2,
    color: "#9FB0C4",
    fontSize: 12,
    lineHeight: 17,
  },
  mobileStopMeta: {
    marginTop: 4,
    color: "#71849B",
    fontSize: 11,
  },
  mobileStopActions: {
    marginTop: 10,
    alignItems: "flex-end",
  },
  mobileStopActionButton: {
    minHeight: 36,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(96, 165, 250, 0.28)",
    borderRadius: 9,
    backgroundColor: "rgba(37, 99, 235, 0.12)",
  },
  mobileStopActionText: {
    color: "#93C5FD",
    fontSize: 11,
    fontWeight: "900",
  },

  mobileDocumentList: {
    gap: 8,
  },
  mobileDocumentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#203248",
    borderRadius: 10,
    backgroundColor: "#0C1828",
  },
  mobileDocumentBadge: {
    width: 38,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(37, 99, 235, 0.16)",
  },
  mobileDocumentBadgeText: {
    color: "#93C5FD",
    fontSize: 9,
    fontWeight: "900",
  },
  mobileDocumentName: {
    color: "#F8FAFC",
    fontSize: 12,
    fontWeight: "800",
  },
  mobileDocumentMeta: {
    marginTop: 2,
    color: "#788AA1",
    fontSize: 10,
  },
  mobileDocumentOpen: {
    color: "#60A5FA",
    fontSize: 10,
    fontWeight: "900",
  },
  mobileDocumentActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  mobileDocumentActionButton: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(96, 165, 250, 0.25)",
    borderRadius: 9,
    backgroundColor: "rgba(37, 99, 235, 0.11)",
  },
  mobileDocumentActionText: {
    color: "#93C5FD",
    fontSize: 11,
    fontWeight: "900",
  },
  mobileDocumentHint: {
    marginTop: 10,
    color: "#7F91A8",
    fontSize: 11,
    lineHeight: 16,
  },

  trackingFinePrint: {
    marginTop: 7,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },

  trackingFinePrintText: {
    color: COLORS.muted,
    fontSize: 9,
    fontWeight: "700",
  },

  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  liveDotOn: {
    backgroundColor: COLORS.green,
  },

  liveDotOff: {
    backgroundColor: "#526176",
  },

  bottomTabsPro: {
    height: 62,
    paddingBottom:
      Platform.OS === "ios" ? 5 : 0,
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSoft,
    backgroundColor: "#071524",
  },

  tabButtonPro: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  tabIconWrap: {
    position: "relative",
  },

  tabIconPro: {
    color: "#6D7D93",
    fontSize: 16,
    fontWeight: "900",
  },

  tabIconActivePro: {
    color: COLORS.blueLight,
  },

  tabLabelPro: {
    marginTop: 2,
    color: "#6D7D93",
    fontSize: 8,
    fontWeight: "700",
  },

  tabLabelActivePro: {
    color: COLORS.blueLight,
  },

  tabBadge: {
    position: "absolute",
    top: -6,
    right: -11,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: COLORS.red,
  },

  tabBadgeText: {
    color: "#FFFFFF",
    fontSize: 8,
    fontWeight: "900",
  },

  loadsPage: {
    flex: 1,
  },

  segmented: {
    margin: 16,
    marginBottom: 6,
    padding: 4,
    flexDirection: "row",
    borderRadius: 13,
    backgroundColor: "#0B192A",
  },

  segmentButton: {
    flex: 1,
    minHeight: 38,
    paddingHorizontal: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 10,
  },

  segmentButtonActive: {
    backgroundColor: COLORS.surface3,
  },

  segmentText: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: "800",
  },

  segmentTextActive: {
    color: COLORS.text,
  },

  segmentCount: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: "#18263A",
  },

  segmentCountActive: {
    backgroundColor: COLORS.blueStrong,
  },

  segmentCountText: {
    color: COLORS.muted,
    fontSize: 8,
    fontWeight: "900",
  },

  segmentCountTextActive: {
    color: "#FFFFFF",
  },

  loadsList: {
    padding: 16,
    paddingTop: 10,
    paddingBottom: 30,
  },

  loadListCard: {
    marginBottom: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 15,
    backgroundColor: COLORS.surface,
  },

  loadTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },

  loadNumberLabel: {
    color: COLORS.muted,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.7,
  },

  loadListNumber: {
    marginTop: 3,
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
  },

  loadListFooter: {
    marginTop: 14,
    paddingTop: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSoft,
  },

  loadListFooterText: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: "700",
  },

  loadListFooterArrow: {
    color: COLORS.blueLight,
    fontSize: 10,
    fontWeight: "800",
  },

  routePreview: {
    marginTop: 14,
    flexDirection: "row",
  },

  routeRail: {
    width: 18,
    alignItems: "center",
  },

  routeDotBlue: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.green,
  },

  routeDotGreen: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.red,
  },

  routeLine: {
    width: 1,
    flex: 1,
    marginVertical: 3,
    backgroundColor: "#29445F",
  },

  routeContent: {
    flex: 1,
  },

  routeStop: {
    flex: 1,
  },

  routeStopHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },

  routeStopLabel: {
    color: COLORS.blueLight,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.7,
  },

  routeStopTime: {
    color: COLORS.muted,
    fontSize: 8,
    fontWeight: "700",
  },

  routeStopName: {
    marginTop: 3,
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
  },

  routeStopAddress: {
    marginTop: 2,
    color: COLORS.muted,
    fontSize: 11,
    lineHeight: 16,
  },

  routeStopReference: {
    marginTop: 3,
    color: COLORS.blueLight,
    fontSize: 9,
    fontWeight: "800",
  },

  routeSpacer: {
    height: 20,
  },

  detailHeader: {
    minHeight: 70,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSoft,
    backgroundColor: "#071524",
  },

  headerEyebrow: {
    color: COLORS.blueLight,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1,
  },

  detailTitle: {
    marginTop: 2,
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
  },

  backButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: COLORS.surface2,
  },

  backText: {
    marginTop: -2,
    color: COLORS.text,
    fontSize: 30,
    fontWeight: "400",
  },

  detailContent: {
    padding: 16,
    paddingBottom: 34,
  },

  detailCard: {
    marginBottom: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 15,
    backgroundColor: COLORS.surface,
  },

  detailSectionTitle: {
    marginBottom: 12,
    color: COLORS.muted,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.1,
  },

  detailGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -5,
  },

  detailItem: {
    width: "50%",
    minHeight: 58,
    paddingHorizontal: 5,
    paddingVertical: 7,
  },

  detailItemLabel: {
    color: COLORS.muted,
    fontSize: 9,
    fontWeight: "700",
  },

  detailItemValue: {
    marginTop: 4,
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16,
  },

  temperatureRow: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    borderRadius: 12,
    overflow: "hidden",
  },

  temperatureMetric: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    borderRightWidth: 1,
    borderRightColor: COLORS.borderSoft,
  },

  temperatureLabel: {
    color: COLORS.muted,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.6,
  },

  temperatureValue: {
    marginTop: 4,
    color: COLORS.blueLight,
    fontSize: 18,
    fontWeight: "900",
  },

  temperatureValueRed: {
    color: "#FF6A74",
  },

  instructionsText: {
    color: "#D5DFEC",
    fontSize: 13,
    lineHeight: 20,
  },

  comingSoonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  comingSoonIcon: {
    color: COLORS.blueLight,
    fontSize: 28,
  },

  comingSoonTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
  },

  comingSoonCopy: {
    marginTop: 3,
    color: COLORS.muted,
    fontSize: 11,
    lineHeight: 16,
  },

  responseRow: {
    marginTop: 2,
    flexDirection: "row",
    gap: 10,
  },

  declineButton: {
    flex: 0.8,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#7C333B",
    borderRadius: 13,
    backgroundColor: "#2A1418",
  },

  declineButtonText: {
    color: "#FF9EA6",
    fontSize: 11,
    fontWeight: "900",
  },

  acceptButton: {
    flex: 1.2,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: COLORS.blueStrong,
  },

  acceptButtonText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  profileContentPro: {
    padding: 14,
    paddingBottom: 24,
    maxWidth: 460,
    width: "100%",
    alignSelf: "center",
  },

  profileSectionHeader: {
    marginTop: 6,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  profileSectionTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
  },

  profileEditText: {
    color: COLORS.blueLight,
    fontSize: 12,
    fontWeight: "800",
  },

  profileRowsCard: {
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 15,
    backgroundColor: COLORS.surface,
    overflow: "hidden",
  },

  profileRow: {
    minHeight: 70,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  profileRowDivider: {
    height: 1,
    marginLeft: 48,
    backgroundColor: COLORS.borderSoft,
  },

  profileRowIcon: {
    width: 24,
    color: "#DCE8F8",
    fontSize: 18,
    textAlign: "center",
  },

  profileRowLabel: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: "700",
  },

  profileRowSubvalue: {
    marginTop: 3,
    color: COLORS.muted,
    fontSize: 8,
  },

  profileRowValue: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "900",
  },

  profileRowChevron: {
    color: "#8296AE",
    fontSize: 21,
  },

  profileEditCardCompact: {
    marginBottom: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
  },

  editTwoColRow: {
    flexDirection: "row",
    gap: 10,
  },

  editHalf: {
    flex: 1,
  },

  inputCompact: {
    height: 43,
    marginBottom: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    backgroundColor: "#0A1728",
    color: COLORS.text,
    fontSize: 13,
  },

  equipmentPickerTitle: {
    marginTop: 4,
    marginBottom: 7,
    color: COLORS.muted,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.9,
  },

  assetChoiceWrap: {
    marginBottom: 12,
    gap: 7,
  },

  assetChoice: {
    minHeight: 58,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    borderRadius: 11,
    backgroundColor: "#0A1728",
  },

  assetChoiceSelected: {
    borderColor: COLORS.blue,
    backgroundColor: "#0D2038",
  },

  assetChoiceBadge: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: COLORS.blueStrong,
  },

  assetChoiceTrailerBadge: {
    backgroundColor: "#21476A",
  },

  assetChoiceBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "900",
  },

  assetChoiceName: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "900",
  },

  assetChoiceDevice: {
    marginTop: 2,
    color: COLORS.muted,
    fontSize: 9,
  },

  assetChoiceCheck: {
    color: COLORS.blueLight,
    fontSize: 18,
    fontWeight: "900",
  },

  readOnlyEquipmentRow: {
    minHeight: 58,
    marginBottom: 14,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    borderRadius: 11,
    backgroundColor: "#0A1728",
  },

  fixedEquipmentText: {
    color: COLORS.green,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.7,
  },

  profileEditCard: {
    marginBottom: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 15,
    backgroundColor: COLORS.surface,
  },

  saveProfileButton: {
    height: 50,
    marginTop: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: COLORS.blueStrong,
  },

  saveProfileButtonText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
  },

  assignmentProfileCard: {
    marginTop: 2,
    marginBottom: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 15,
    backgroundColor: COLORS.surface,
  },

  assignmentProfileTitle: {
    marginBottom: 12,
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
  },

  assignmentLoadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  assignmentLoadNumber: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "900",
  },

  assignmentRouteText: {
    marginTop: 3,
    color: COLORS.muted,
    fontSize: 10,
  },

  assignmentScheduleRow: {
    marginTop: 14,
    paddingTop: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSoft,
  },

  assignmentScheduleText: {
    marginTop: 4,
    color: COLORS.text,
    fontSize: 10,
    fontWeight: "800",
  },

  assignmentStatusRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
  },

  noAssignmentText: {
    color: COLORS.muted,
    fontSize: 11,
  },

  logoutButtonPro: {
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#6D3036",
    borderRadius: 12,
    backgroundColor: "#221318",
  },

  logoutTextPro: {
    color: "#FF9EA6",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
  },

  loginKeyboardFinal: {
    flex: 1,
  },

  loginScrollFinal: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 8,
    paddingBottom: 24,
    justifyContent: "center",
    maxWidth: 460,
    width: "100%",
    alignSelf: "center",
  },

  loginVisualFinal: {
    height: 310,
    alignItems: "center",
    justifyContent: "flex-start",
    overflow: "hidden",
    borderRadius: 24,
    backgroundColor: "#08172A",
  },

  loginGlowFinal: {
    position: "absolute",
    top: -95,
    width: 350,
    height: 350,
    borderRadius: 175,
    backgroundColor: "#173A62",
    opacity: 0.30,
  },

  loginTruckFinal: {
    position: "absolute",
    left: 40,
    right: 40,
    bottom: 4,
    height: 94,
    opacity: 0.20,
  },

  trailerShapeFinal: {
    position: "absolute",
    left: 36,
    right: 72,
    bottom: 31,
    height: 62,
    borderRadius: 8,
    backgroundColor: "#27415D",
  },

  cabShapeFinal: {
    position: "absolute",
    right: 20,
    bottom: 31,
    width: 78,
    height: 80,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    backgroundColor: "#355873",
  },

  windowShapeFinal: {
    position: "absolute",
    top: 13,
    left: 15,
    width: 36,
    height: 22,
    borderRadius: 5,
    backgroundColor: "#102840",
  },

  wheelShapeOneFinal: {
    position: "absolute",
    left: 78,
    bottom: 16,
    width: 29,
    height: 29,
    borderRadius: 15,
    backgroundColor: "#050C14",
    borderWidth: 5,
    borderColor: "#405873",
  },

  wheelShapeTwoFinal: {
    position: "absolute",
    right: 43,
    bottom: 16,
    width: 29,
    height: 29,
    borderRadius: 15,
    backgroundColor: "#050C14",
    borderWidth: 5,
    borderColor: "#405873",
  },

  roadShapeFinal: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 10,
    height: 2,
    backgroundColor: "#3A5572",
  },

  logoWingsFinal: {
    marginTop: 47,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  logoWingLeftFinal: {
    width: 47,
    height: 11,
    borderRadius: 6,
    backgroundColor: "#F2F7FF",
    transform: [{ rotate: "16deg" }],
  },

  logoWingRightFinal: {
    width: 47,
    height: 11,
    borderRadius: 6,
    backgroundColor: "#F2F7FF",
    transform: [{ rotate: "-16deg" }],
  },

  logoShieldFinal: {
    width: 62,
    height: 62,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#F2F7FF",
    borderRadius: 18,
    backgroundColor: "#102A47",
  },

  logoShieldTextFinal: {
    color: "#FFFFFF",
    fontSize: 27,
    fontWeight: "900",
    fontStyle: "italic",
  },

  loginBrandFinal: {
    position: "absolute",
    top: 112,
    color: "#FFFFFF",
    fontSize: 27,
    fontWeight: "900",
    letterSpacing: 4.1,
  },

  loginAppNameFinal: {
    position: "absolute",
    top: 149,
    color: COLORS.blueLight,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 2,
  },

  loginLogoImage: {
    width: 78,
    height: 78,
    marginTop: 26,
    borderRadius: 18,
  },

  loginMetaRow: {
    marginTop: 10,
    paddingHorizontal: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  rememberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  rememberBox: {
    width: 14,
    height: 14,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "#6D8097",
  },

  rememberText: {
    color: COLORS.muted,
    fontSize: 9,
    fontWeight: "700",
  },

  forgotText: {
    color: COLORS.blueLight,
    fontSize: 9,
    fontWeight: "700",
  },

  loginTruckPhoto: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
  },

  loginPhotoShade: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(5,16,30,0.38)",
  },

  brandWingRowCompact: {
    position: "absolute",
    top: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  brandWingCompactLeft: {
    width: 45,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#F3F8FF",
    transform: [{ rotate: "17deg" }],
  },

  brandWingCompactRight: {
    width: 45,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#F3F8FF",
    transform: [{ rotate: "-17deg" }],
  },

  brandShieldCompact: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#F3F8FF",
    borderRadius: 17,
    backgroundColor: "rgba(13,39,66,0.88)",
  },

  brandShieldCompactText: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
    fontStyle: "italic",
  },

  loginTaglineFinal: {
    marginTop: 18,
    color: COLORS.text,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "900",
  },

  loginDescriptionFinal: {
    marginTop: 6,
    paddingHorizontal: 16,
    color: COLORS.muted,
    textAlign: "center",
    fontSize: 10,
    lineHeight: 15,
  },

  loginFieldsFinal: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#0B1A2C",
  },

  loginFieldRowFinal: {
    height: 54,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },

  loginFieldIconFinal: {
    width: 22,
    color: "#C7D4E5",
    fontSize: 16,
    textAlign: "center",
  },

  loginFieldInputFinal: {
    flex: 1,
    height: "100%",
    color: COLORS.text,
    fontSize: 14,
  },

  loginDividerFinal: {
    height: 1,
    marginLeft: 46,
    backgroundColor: COLORS.borderSoft,
  },

  authErrorFinal: {
    marginTop: 10,
    color: "#FF9EA6",
    fontSize: 11,
    textAlign: "center",
  },

  loginButtonFinal: {
    height: 50,
    marginTop: 14,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 27,
    backgroundColor: COLORS.blueStrong,
  },

  loginButtonTextFinal: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1.2,
  },

  loginFooterFinal: {
    marginTop: 18,
    color: COLORS.muted,
    fontSize: 10,
    textAlign: "center",
  },

  foregroundModeNotice: {
    marginTop: 8,
    paddingHorizontal: 2,
  },

  foregroundModeTitle: {
    color: COLORS.green,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.7,
  },

  foregroundModeCopy: {
    marginTop: 2,
    color: COLORS.muted,
    fontSize: 8,
    lineHeight: 12,
  },

  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    overflow: "hidden",
    borderRadius: 999,
  },

  statusChipText: {
    fontSize: 8,
    fontWeight: "900",
  },

  statusBlue: {
    color: "#8CC1FF",
    backgroundColor: "#102D52",
  },

  statusGreen: {
    color: "#78E39B",
    backgroundColor: "#0E2D20",
  },

  statusAmber: {
    color: "#FFC870",
    backgroundColor: "#35280B",
  },

  statusRed: {
    color: "#FFA1A8",
    backgroundColor: "#35161B",
  },
});
