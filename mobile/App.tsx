import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
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

const API_URL = "https://maverick-1z64.onrender.com";
const MOBILE_TELEMETRY_KEY =
  process.env.EXPO_PUBLIC_MOBILE_TELEMETRY_KEY ?? "";

const BACKGROUND_LOCATION_TASK =
  "MAVTRACK_BACKGROUND_LOCATION";

const TOKEN_KEY = "mavtrack_driver_token";
const USER_KEY = "mavtrack_driver_user";
const TRACKING_DEVICE_KEY =
  "mavtrack_tracking_device_id";

type TabName = "home" | "loads" | "profile";
type LoadFilter = "pending" | "active" | "completed";

type DriverProfile = {
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  licenseNumber?: string | null;
  licenseState?: string | null;
  profilePhotoUrl?: string | null;
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
  driverInstructions?: string | null;
  termsAndAgreement?: string | null;
  notes?: string | null;
  acceptedAt?: string | null;
  declinedAt?: string | null;
  asset?: Asset | null;
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
  deviceId: string
) {
  if (!MOBILE_TELEMETRY_KEY || !deviceId) {
    return false;
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

    for (const location of locations) {
      try {
        await postLocationToMavtrack(
          location,
          deviceId
        );
      } catch {
        // Background task will retry on the next update.
      }
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
    action: "accept" | "decline"
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
              : undefined,
        }
      );

      await loadAssignments();

      if (action === "accept") {
        setLoadFilter("active");
        setSelectedLoad(null);
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

  async function checkBackgroundTracking() {
    try {
      const started =
        await Location.hasStartedLocationUpdatesAsync(
          BACKGROUND_LOCATION_TASK
        );

      setTracking(started);

      if (started) {
        setTrackingStatus(
          "BACKGROUND TRACKING ACTIVE"
        );
      }
    } catch {
      // Unsupported in some Expo Go contexts.
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

  const trackingDeviceId =
    activeLoad?.asset?.deviceId || "";

  async function startTracking() {
    if (!activeLoad) {
      Alert.alert(
        "No active load",
        "Accept a load before starting truck tracking."
      );
      return;
    }

    if (!trackingDeviceId) {
      Alert.alert(
        "No truck assigned",
        "This load does not have a tracked TRK asset assigned."
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

    try {
      setAppError("");
      setTrackingStatus(
        "REQUESTING LOCATION..."
      );

      const foreground =
        await Location.requestForegroundPermissionsAsync();

      if (
        foreground.status !== "granted"
      ) {
        setTrackingStatus(
          "LOCATION DENIED"
        );
        return;
      }

      const background =
        await Location.requestBackgroundPermissionsAsync();

      if (
        background.status !== "granted"
      ) {
        Alert.alert(
          "Background location required",
          "Choose Always Allow so dispatch can keep seeing the assigned truck while MavApp is in the background."
        );

        setTrackingStatus(
          "BACKGROUND LOCATION DENIED"
        );
        return;
      }

      await SecureStore.setItemAsync(
        TRACKING_DEVICE_KEY,
        trackingDeviceId
      );

      const alreadyStarted =
        await Location.hasStartedLocationUpdatesAsync(
          BACKGROUND_LOCATION_TASK
        );

      if (!alreadyStarted) {
        await Location.startLocationUpdatesAsync(
          BACKGROUND_LOCATION_TASK,
          {
            accuracy:
              Location.Accuracy.High,
            distanceInterval: 5,
            timeInterval: 10000,
            deferredUpdatesDistance: 5,
            deferredUpdatesInterval: 10000,
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
                `Tracking ${trackingDeviceId} for the active load.`,
            },
          }
        );
      }

      setTracking(true);
      setTrackingStatus(
        "BACKGROUND TRACKING ACTIVE"
      );
      setServerStatus("CONNECTED");

      const current =
        await Location.getCurrentPositionAsync(
          {
            accuracy:
              Location.Accuracy.High,
          }
        );

      setGps({
        latitude:
          current.coords.latitude,
        longitude:
          current.coords.longitude,
        accuracy:
          current.coords.accuracy,
        speedMps:
          current.coords.speed,
        heading:
          current.coords.heading,
        timestamp: current.timestamp,
      });

      const sent =
        await postLocationToMavtrack(
          current,
          trackingDeviceId
        );

      setServerStatus(
        sent ? "CONNECTED" : "SEND FAILED"
      );
    } catch (err) {
      setTracking(false);
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
      const started =
        await Location.hasStartedLocationUpdatesAsync(
          BACKGROUND_LOCATION_TASK
        );

      if (started) {
        await Location.stopLocationUpdatesAsync(
          BACKGROUND_LOCATION_TASK
        );
      }

      await SecureStore.deleteItemAsync(
        TRACKING_DEVICE_KEY
      );

      setTracking(false);
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
          backgroundColor="#07111F"
        />

        <KeyboardAvoidingView
          behavior={
            Platform.OS === "ios"
              ? "padding"
              : undefined
          }
          style={styles.loginKeyboard}
        >
          <View style={styles.loginTop}>
            <View style={styles.brandMark}>
              <Text style={styles.brandM}>
                M
              </Text>
            </View>
            <Text style={styles.loginBrand}>
              MAVAPP
            </Text>
            <Text style={styles.loginSubtitle}>
              DRIVER OPERATIONS
            </Text>
          </View>

          <View style={styles.loginCard}>
            <Text style={styles.loginTitle}>
              Welcome back
            </Text>
            <Text style={styles.loginCopy}>
              Sign in with your MAVTRACK
              driver account.
            </Text>

            <Text style={styles.inputLabel}>
              EMAIL
            </Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="driver@company.com"
              placeholderTextColor="#53657B"
              style={styles.input}
            />

            <Text style={styles.inputLabel}>
              PASSWORD
            </Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor="#53657B"
              style={styles.input}
            />

            {authError ? (
              <Text style={styles.authError}>
                {authError}
              </Text>
            ) : null}

            <Pressable
              onPress={() => void login()}
              disabled={authLoading}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed &&
                  styles.buttonPressed,
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
                    styles.primaryButtonText
                  }
                >
                  SIGN IN
                </Text>
              )}
            </Pressable>
          </View>

          <Text style={styles.loginFooter}>
            Powered by MAVTRACK
          </Text>
        </KeyboardAvoidingView>
      </SafeAreaView>
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
          void respondToLoad(
            selectedLoad,
            "accept"
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
        <View>
          <Text style={styles.headerEyebrow}>
            MAVAPP
          </Text>
          <Text style={styles.headerTitle}>
            {tab === "home"
              ? "Home"
              : tab === "loads"
                ? "Loads"
                : "Profile"}
          </Text>
        </View>

        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {driverName(user)
              .slice(0, 1)
              .toUpperCase()}
          </Text>
        </View>
      </View>

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
          tracking={tracking}
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
  tracking,
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
  tracking: boolean;
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

  return (
    <ScrollView
      style={styles.content}
      contentContainerStyle={
        styles.contentContainer
      }
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.greeting}>
        Hi, {driverName(user).split(" ")[0]}
      </Text>
      <Text style={styles.greetingCopy}>
        Here's your current operation.
      </Text>

      {pendingCount > 0 ? (
        <Pressable
          onPress={onOpenPending}
          style={styles.assignmentBanner}
        >
          <View
            style={
              styles.assignmentBannerIcon
            }
          >
            <Text
              style={
                styles.assignmentBannerIconText
              }
            >
              !
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={
                styles.assignmentBannerTitle
              }
            >
              {pendingCount} new{" "}
              {pendingCount === 1
                ? "assignment"
                : "assignments"}
            </Text>
            <Text
              style={
                styles.assignmentBannerCopy
              }
            >
              Review and respond
            </Text>
          </View>
          <Text
            style={
              styles.assignmentBannerArrow
            }
          >
            ›
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionEyebrow}>
          ACTIVE LOAD
        </Text>
      </View>

      {activeLoad ? (
        <Pressable
          onPress={() =>
            onOpenLoad(activeLoad)
          }
          style={styles.activeLoadCard}
        >
          <View style={styles.loadTopRow}>
            <View>
              <Text
                style={styles.loadNumberLabel}
              >
                TRIP / LOAD
              </Text>
              <Text
                style={styles.loadNumber}
              >
                {activeLoad.loadNumber}
              </Text>
            </View>

            <StatusChip
              text={statusLabel(
                activeLoad.status
              )}
              tone="blue"
            />
          </View>

          <RoutePreview load={activeLoad} />

          <View style={styles.equipmentRow}>
            <InfoMini
              label="TRUCK"
              value={
                activeLoad.truckNumber ||
                activeLoad.asset?.deviceId ||
                "—"
              }
            />
            <InfoMini
              label="TRAILER"
              value={
                activeLoad.trailerNumber ||
                "—"
              }
            />
            <InfoMini
              label="PO"
              value={
                activeLoad.poNumber || "—"
              }
            />
          </View>
        </Pressable>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>
            ✓
          </Text>
          <Text style={styles.emptyTitle}>
            No active load
          </Text>
          <Text style={styles.emptyCopy}>
            Accepted assignments will
            appear here.
          </Text>
        </View>
      )}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionEyebrow}>
          LIVE TRACKING
        </Text>
      </View>

      <View style={styles.trackingCard}>
        <View style={styles.trackingTop}>
          <View style={styles.trackingStatusLeft}>
            <View
              style={[
                styles.liveDot,
                tracking
                  ? styles.liveDotOn
                  : styles.liveDotOff,
              ]}
            />
            <View>
              <Text
                style={
                  styles.trackingStatusTitle
                }
              >
                {tracking
                  ? "Tracking active"
                  : "Tracking stopped"}
              </Text>
              <Text
                style={
                  styles.trackingStatusCopy
                }
              >
                {trackingStatus}
              </Text>
            </View>
          </View>

          <Text
            style={[
              styles.serverBadge,
              serverStatus === "CONNECTED"
                ? styles.serverBadgeOn
                : styles.serverBadgeOff,
            ]}
          >
            {serverStatus}
          </Text>
        </View>

        <View style={styles.trackingMetrics}>
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
          <Metric
            label="HEADING"
            value={
              gps?.heading != null &&
              gps.heading >= 0
                ? `${gps.heading.toFixed(0)}°`
                : "—"
            }
          />
        </View>

        <Pressable
          onPress={
            tracking
              ? onStopTracking
              : onStartTracking
          }
          style={({ pressed }) => [
            tracking
              ? styles.stopTrackingButton
              : styles.startTrackingButton,
            pressed &&
              styles.buttonPressed,
          ]}
        >
          <Text
            style={
              styles.trackingButtonText
            }
          >
            {tracking
              ? "STOP TRACKING"
              : "START TRACKING"}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
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

function LoadDetailScreen({
  load,
  onBack,
  onAccept,
  onDecline,
}: {
  load: Dispatch;
  onBack: () => void;
  onAccept: () => void;
  onDecline: () => void;
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
            <DetailItem
              label="Commodity"
              value={load.commodity || "—"}
            />
            <DetailItem
              label="Units"
              value={
                load.units != null
                  ? String(load.units)
                  : "—"
              }
            />
            <DetailItem
              label="Weight"
              value={
                load.weightLbs != null
                  ? `${Number(
                      load.weightLbs
                    ).toLocaleString()} lb`
                  : "—"
              }
            />
            <DetailItem
              label="Miles"
              value={
                load.miles != null
                  ? String(load.miles)
                  : "—"
              }
            />
          </DetailGrid>
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

        {load.driverInstructions ? (
          <View style={styles.detailCard}>
            <DetailSectionTitle
              title="DRIVER INSTRUCTIONS"
            />
            <Text
              style={
                styles.instructionsText
              }
            >
              {load.driverInstructions}
            </Text>
          </View>
        ) : null}

        <View style={styles.detailCard}>
          <DetailSectionTitle
            title="DOCUMENTS"
          />
          <View style={styles.comingSoonRow}>
            <Text
              style={styles.comingSoonIcon}
            >
              ▤
            </Text>
            <View style={{ flex: 1 }}>
              <Text
                style={
                  styles.comingSoonTitle
                }
              >
                Load documents
              </Text>
              <Text
                style={
                  styles.comingSoonCopy
                }
              >
                Rate confirmations, BOL,
                POD, receipts and photos
                will appear here.
              </Text>
            </View>
          </View>
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
  onLogout,
}: {
  user: DriverUser | null;
  onLogout: () => void;
}) {
  const profile =
    user?.profile ||
    user?.driverProfile ||
    null;

  return (
    <ScrollView
      style={styles.content}
      contentContainerStyle={
        styles.profileContent
      }
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.profileHero}>
        <View
          style={styles.profileAvatarLarge}
        >
          <Text
            style={
              styles.profileAvatarText
            }
          >
            {driverName(user)
              .slice(0, 1)
              .toUpperCase()}
          </Text>
        </View>
        <Text style={styles.profileName}>
          {driverName(user)}
        </Text>
        <Text style={styles.profileEmail}>
          {user?.email || "—"}
        </Text>
        <StatusChip
          text="DRIVER"
          tone="blue"
        />
      </View>

      <View style={styles.detailCard}>
        <DetailSectionTitle
          title="DRIVER PROFILE"
        />
        <DetailGrid>
          <DetailItem
            label="Phone"
            value={profile?.phone || "—"}
          />
          <DetailItem
            label="License"
            value={
              profile?.licenseNumber || "—"
            }
          />
          <DetailItem
            label="State"
            value={
              profile?.licenseState || "—"
            }
          />
          <DetailItem
            label="Account"
            value={
              user?.active === false
                ? "Inactive"
                : "Active"
            }
          />
        </DetailGrid>
      </View>

      <Pressable
        onPress={onLogout}
        style={styles.logoutButton}
      >
        <Text style={styles.logoutText}>
          SIGN OUT
        </Text>
      </Pressable>
    </ScrollView>
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
    <View style={styles.bottomTabs}>
      <TabButton
        label="Home"
        icon="⌂"
        active={tab === "home"}
        onPress={() => onChange("home")}
      />
      <TabButton
        label="Loads"
        icon="▤"
        badge={pendingCount}
        active={tab === "loads"}
        onPress={() => onChange("loads")}
      />
      <TabButton
        label="Profile"
        icon="●"
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
      style={styles.tabButton}
    >
      <View style={styles.tabIconWrap}>
        <Text
          style={[
            styles.tabIcon,
            active && styles.tabIconActive,
          ]}
        >
          {icon}
        </Text>
        {badge ? (
          <View style={styles.tabBadge}>
            <Text
              style={styles.tabBadgeText}
            >
              {badge > 9 ? "9+" : badge}
            </Text>
          </View>
        ) : null}
      </View>
      <Text
        style={[
          styles.tabLabel,
          active && styles.tabLabelActive,
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
  bg: "#07111F",
  surface: "#0E1A2B",
  surface2: "#132238",
  border: "#1D2C42",
  text: "#F7FAFC",
  muted: "#8191A7",
  blue: "#2F6FEB",
  blueLight: "#60A5FA",
  green: "#22C55E",
  amber: "#F59E0B",
  red: "#EF4444",
};

const styles = StyleSheet.create({
  app: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  bootScreen: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: "center",
    justifyContent: "center",
  },

  bootBrand: {
    color: COLORS.text,
    marginTop: 16,
    fontSize: 23,
    fontWeight: "900",
    letterSpacing: 5,
  },

  brandMark: {
    width: 58,
    height: 58,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.blue,
    shadowColor: COLORS.blue,
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 8,
    },
  },

  brandM: {
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "900",
    fontStyle: "italic",
  },

  loginScreen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  loginKeyboard: {
    flex: 1,
    paddingHorizontal: 22,
    justifyContent: "center",
  },

  loginTop: {
    alignItems: "center",
    marginBottom: 30,
  },

  loginBrand: {
    marginTop: 18,
    color: COLORS.text,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 5,
  },

  loginSubtitle: {
    marginTop: 5,
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 3,
  },

  loginCard: {
    padding: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 22,
    backgroundColor: COLORS.surface,
  },

  loginTitle: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: "800",
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
    fontWeight: "800",
    letterSpacing: 1.2,
  },

  input: {
    height: 50,
    marginBottom: 16,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: "#0A1525",
    color: COLORS.text,
    fontSize: 15,
  },

  authError: {
    marginBottom: 14,
    color: "#FCA5A5",
    fontSize: 12,
    lineHeight: 18,
  },

  primaryButton: {
    height: 52,
    marginTop: 4,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: COLORS.blue,
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1,
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
    color: "#46566B",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },

  appHeader: {
    height: 76,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },

  headerEyebrow: {
    color: COLORS.blueLight,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.8,
  },

  headerTitle: {
    marginTop: 3,
    color: COLORS.text,
    fontSize: 21,
    fontWeight: "800",
  },

  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: "#2A3B54",
  },

  avatarText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
  },

  inlineError: {
    marginHorizontal: 18,
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#36181D",
  },

  inlineErrorText: {
    color: "#FCA5A5",
    fontSize: 12,
  },

  content: {
    flex: 1,
  },

  contentContainer: {
    padding: 18,
    paddingBottom: 28,
  },

  greeting: {
    color: COLORS.text,
    fontSize: 26,
    fontWeight: "800",
  },

  greetingCopy: {
    marginTop: 4,
    marginBottom: 18,
    color: COLORS.muted,
    fontSize: 13,
  },

  assignmentBanner: {
    minHeight: 70,
    marginBottom: 20,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#5A4618",
    borderRadius: 14,
    backgroundColor: "#251D0D",
  },

  assignmentBannerIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#4B390E",
  },

  assignmentBannerIconText: {
    color: "#FBBF24",
    fontSize: 20,
    fontWeight: "900",
  },

  assignmentBannerTitle: {
    color: "#F8E6B4",
    fontSize: 14,
    fontWeight: "800",
  },

  assignmentBannerCopy: {
    marginTop: 2,
    color: "#C7A85A",
    fontSize: 11,
  },

  assignmentBannerArrow: {
    color: "#FBBF24",
    fontSize: 28,
  },

  sectionHeader: {
    marginTop: 4,
    marginBottom: 9,
  },

  sectionEyebrow: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.3,
  },

  activeLoadCard: {
    marginBottom: 20,
    padding: 17,
    borderWidth: 1,
    borderColor: "#27415F",
    borderRadius: 18,
    backgroundColor: COLORS.surface,
  },

  loadTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },

  loadNumberLabel: {
    color: COLORS.muted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.2,
  },

  loadNumber: {
    marginTop: 3,
    color: COLORS.text,
    fontSize: 23,
    fontWeight: "900",
  },

  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },

  statusChipText: {
    backgroundColor: "transparent",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.4,
  },

  statusBlue: {
    color: "#93C5FD",
    borderColor: "#2A5D9D",
    backgroundColor: "#10284A",
  },

  statusGreen: {
    color: "#86EFAC",
    borderColor: "#256B40",
    backgroundColor: "#0E2A1B",
  },

  statusAmber: {
    color: "#FCD34D",
    borderColor: "#6F5617",
    backgroundColor: "#2C220B",
  },

  statusRed: {
    color: "#FCA5A5",
    borderColor: "#7F2D35",
    backgroundColor: "#321418",
  },

  routePreview: {
    marginTop: 18,
    flexDirection: "row",
  },

  routeRail: {
    width: 18,
    alignItems: "center",
  },

  routeDotBlue: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: COLORS.blueLight,
  },

  routeLine: {
    width: 1,
    flex: 1,
    minHeight: 62,
    marginVertical: 3,
    backgroundColor: "#33465F",
  },

  routeDotGreen: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: COLORS.green,
  },

  routeContent: {
    flex: 1,
    paddingLeft: 10,
  },

  routeStop: {
    minWidth: 0,
  },

  routeStopHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },

  routeStopLabel: {
    color: COLORS.muted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
  },

  routeStopTime: {
    color: "#9FB0C5",
    fontSize: 10,
    fontWeight: "700",
  },

  routeStopName: {
    marginTop: 3,
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "800",
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

  equipmentRow: {
    marginTop: 16,
    paddingTop: 14,
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },

  infoMini: {
    flex: 1,
    minWidth: 0,
  },

  infoMiniLabel: {
    color: COLORS.muted,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.8,
  },

  infoMiniValue: {
    marginTop: 3,
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
  },

  emptyCard: {
    minHeight: 150,
    marginBottom: 20,
    padding: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
  },

  emptyIcon: {
    color: COLORS.green,
    fontSize: 28,
    fontWeight: "900",
  },

  emptyTitle: {
    marginTop: 8,
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "800",
  },

  emptyCopy: {
    marginTop: 5,
    color: COLORS.muted,
    textAlign: "center",
    fontSize: 12,
  },

  trackingCard: {
    padding: 17,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
  },

  trackingTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  trackingStatusLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  liveDotOn: {
    backgroundColor: COLORS.green,
  },

  liveDotOff: {
    backgroundColor: "#526176",
  },

  trackingStatusTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
  },

  trackingStatusCopy: {
    marginTop: 2,
    color: COLORS.muted,
    fontSize: 9,
  },

  serverBadge: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    overflow: "hidden",
    borderRadius: 999,
    fontSize: 8,
    fontWeight: "900",
  },

  serverBadgeOn: {
    color: "#86EFAC",
    backgroundColor: "#11321F",
  },

  serverBadgeOff: {
    color: "#FCD34D",
    backgroundColor: "#35290B",
  },

  trackingMetrics: {
    marginTop: 18,
    paddingVertical: 14,
    flexDirection: "row",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },

  metric: {
    flex: 1,
    alignItems: "center",
  },

  metricValue: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "900",
  },

  metricLabel: {
    marginTop: 3,
    color: COLORS.muted,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.8,
  },

  startTrackingButton: {
    height: 46,
    marginTop: 14,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: COLORS.blue,
  },

  stopTrackingButton: {
    height: 46,
    marginTop: 14,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: "#8F242D",
  },

  trackingButtonText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
  },

  bottomTabs: {
    height: 72,
    paddingBottom:
      Platform.OS === "ios" ? 5 : 0,
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: "#0A1524",
  },

  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  tabIconWrap: {
    position: "relative",
  },

  tabIcon: {
    color: "#63738A",
    fontSize: 19,
    fontWeight: "800",
  },

  tabIconActive: {
    color: COLORS.blueLight,
  },

  tabLabel: {
    marginTop: 3,
    color: "#63738A",
    fontSize: 9,
    fontWeight: "700",
  },

  tabLabelActive: {
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
    borderRadius: 12,
    backgroundColor: "#0D1929",
  },

  segmentButton: {
    flex: 1,
    minHeight: 38,
    paddingHorizontal: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 9,
  },

  segmentButtonActive: {
    backgroundColor: COLORS.surface2,
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
    backgroundColor: COLORS.blue,
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
    borderRadius: 16,
    backgroundColor: COLORS.surface,
  },

  loadListNumber: {
    marginTop: 3,
    color: COLORS.text,
    fontSize: 19,
    fontWeight: "900",
  },

  loadListFooter: {
    marginTop: 14,
    paddingTop: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
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

  detailHeader: {
    minHeight: 76,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
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

  detailTitle: {
    marginTop: 2,
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
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
    borderRadius: 16,
    backgroundColor: COLORS.surface,
  },

  detailSectionTitle: {
    marginBottom: 12,
    color: COLORS.muted,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
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
    borderColor: "#6D3036",
    borderRadius: 13,
    backgroundColor: "#281317",
  },

  declineButtonText: {
    color: "#FCA5A5",
    fontSize: 11,
    fontWeight: "900",
  },

  acceptButton: {
    flex: 1.2,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: COLORS.blue,
  },

  acceptButtonText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  profileContent: {
    padding: 18,
    paddingBottom: 34,
  },

  profileHero: {
    paddingVertical: 24,
    alignItems: "center",
  },

  profileAvatarLarge: {
    width: 82,
    height: 82,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#36506D",
    borderRadius: 41,
    backgroundColor: COLORS.surface2,
  },

  profileAvatarText: {
    color: COLORS.text,
    fontSize: 30,
    fontWeight: "900",
  },

  profileName: {
    marginTop: 14,
    color: COLORS.text,
    fontSize: 21,
    fontWeight: "900",
  },

  profileEmail: {
    marginTop: 4,
    marginBottom: 10,
    color: COLORS.muted,
    fontSize: 12,
  },

  logoutButton: {
    height: 48,
    marginTop: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#613039",
    borderRadius: 12,
    backgroundColor: "#241317",
  },

  logoutText: {
    color: "#FCA5A5",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
});
