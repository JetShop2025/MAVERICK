import { useRef, useState } from "react";
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as Location from "expo-location";

const API_URL = "https://maverick-1z64.onrender.com";
const DEVICE_ID = "TRK-TEST-001";

// IMPORTANT:
// Create mobile/.env and add:
// EXPO_PUBLIC_MOBILE_TELEMETRY_KEY=YOUR_RENDER_MOBILE_TELEMETRY_KEY
const MOBILE_TELEMETRY_KEY =
  process.env.EXPO_PUBLIC_MOBILE_TELEMETRY_KEY ?? "";

type GPSData = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  timestamp: number;
};

export default function App() {
  const [gps, setGps] = useState<GPSData | null>(null);
  const [tracking, setTracking] = useState(false);
  const [status, setStatus] = useState("GPS STOPPED");
  const [serverStatus, setServerStatus] = useState("NOT CONNECTED");
  const [error, setError] = useState("");

  const subscription =
    useRef<Location.LocationSubscription | null>(null);

  const sendTelemetry = async (
    location: Location.LocationObject
  ) => {
    try {
      if (!MOBILE_TELEMETRY_KEY) {
        setServerStatus("KEY MISSING");
        setError(
          "Missing EXPO_PUBLIC_MOBILE_TELEMETRY_KEY in mobile/.env"
        );
        return;
      }

      setServerStatus("SENDING...");

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
            deviceId: DEVICE_ID,
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

      let data: any = null;

      try {
        data = await response.json();
      } catch {
        data = null;
      }

      console.log(
        "MAVTRACK RESPONSE:",
        response.status,
        data
      );

      if (!response.ok || !data?.ok) {
        setServerStatus("SEND FAILED");
        setError(
          data?.message ||
            `MAVTRACK server error (${response.status})`
        );
        return;
      }

      setServerStatus("CONNECTED");
      setError("");
    } catch (err) {
      console.error(
        "Telemetry send error:",
        err
      );

      setServerStatus("OFFLINE");
      setError(
        err instanceof Error
          ? err.message
          : "Unable to connect to MAVTRACK"
      );
    }
  };

  const startTracking = async () => {
    try {
      if (subscription.current) {
        return;
      }

      setError("");
      setStatus("REQUESTING GPS PERMISSION...");

      const permission =
        await Location.requestForegroundPermissionsAsync();

      if (permission.status !== "granted") {
        setStatus("GPS PERMISSION DENIED");
        setError(
          "MAVTRACK needs location permission to track this truck."
        );
        return;
      }

      setStatus("ACQUIRING GPS...");
      setTracking(true);

      subscription.current =
        await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 10000,
            distanceInterval: 5,
          },
          (location) => {
            setGps({
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              accuracy: location.coords.accuracy,
              speed: location.coords.speed,
              heading: location.coords.heading,
              timestamp: location.timestamp,
            });

            setStatus("GPS ACTIVE");

            void sendTelemetry(location);
          }
        );
    } catch (err) {
      console.error(err);

      setTracking(false);
      setStatus("GPS ERROR");
      setError(
        err instanceof Error
          ? err.message
          : "Unknown GPS error"
      );
    }
  };

  const stopTracking = () => {
    if (subscription.current) {
      subscription.current.remove();
      subscription.current = null;
    }

    setTracking(false);
    setStatus("GPS STOPPED");
    setServerStatus("NOT CONNECTED");
  };

  const speedMph =
    gps?.speed != null && gps.speed >= 0
      ? gps.speed * 2.23694
      : 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>MAVTRACK</Text>
        <Text style={styles.subtitle}>DRIVER</Text>
      </View>

      <View style={styles.assetCard}>
        <Text style={styles.label}>
          ASSIGNED TRUCK
        </Text>

        <Text style={styles.truckNumber}>
          {DEVICE_ID}
        </Text>

        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusDot,
              tracking
                ? styles.statusOnline
                : styles.statusOffline,
            ]}
          />
          <Text style={styles.statusText}>
            {status}
          </Text>
        </View>

        <View style={styles.serverRow}>
          <Text style={styles.serverLabel}>
            MAVTRACK SERVER
          </Text>
          <Text
            style={[
              styles.serverValue,
              serverStatus === "CONNECTED"
                ? styles.serverConnected
                : styles.serverDisconnected,
            ]}
          >
            {serverStatus}
          </Text>
        </View>
      </View>

      <View style={styles.gpsCard}>
        <Text style={styles.sectionTitle}>
          GPS LOCATION
        </Text>

        <View style={styles.dataRow}>
          <Text style={styles.dataLabel}>
            Latitude
          </Text>
          <Text style={styles.dataValue}>
            {gps
              ? gps.latitude.toFixed(6)
              : "--"}
          </Text>
        </View>

        <View style={styles.dataRow}>
          <Text style={styles.dataLabel}>
            Longitude
          </Text>
          <Text style={styles.dataValue}>
            {gps
              ? gps.longitude.toFixed(6)
              : "--"}
          </Text>
        </View>

        <View style={styles.dataRow}>
          <Text style={styles.dataLabel}>
            Accuracy
          </Text>
          <Text style={styles.dataValue}>
            {gps?.accuracy != null
              ? `${gps.accuracy.toFixed(1)} m`
              : "--"}
          </Text>
        </View>

        <View style={styles.dataRow}>
          <Text style={styles.dataLabel}>
            Speed
          </Text>
          <Text style={styles.dataValue}>
            {gps
              ? `${speedMph.toFixed(1)} mph`
              : "--"}
          </Text>
        </View>

        <View style={styles.dataRow}>
          <Text style={styles.dataLabel}>
            Heading
          </Text>
          <Text style={styles.dataValue}>
            {gps?.heading != null &&
            gps.heading >= 0
              ? `${gps.heading.toFixed(0)}°`
              : "--"}
          </Text>
        </View>

        <View style={styles.dataRow}>
          <Text style={styles.dataLabel}>
            Last Update
          </Text>
          <Text style={styles.dataValue}>
            {gps
              ? new Date(
                  gps.timestamp
                ).toLocaleTimeString()
              : "--"}
          </Text>
        </View>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>
            {error}
          </Text>
        </View>
      ) : null}

      {!tracking ? (
        <TouchableOpacity
          style={styles.startButton}
          onPress={startTracking}
        >
          <Text style={styles.buttonText}>
            START TRACKING
          </Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.stopButton}
          onPress={stopTracking}
        >
          <Text style={styles.buttonText}>
            STOP TRACKING
          </Text>
        </TouchableOpacity>
      )}

      <Text style={styles.footer}>
        MAVTRACK Driver V1 · {DEVICE_ID}
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#08111F",
    paddingHorizontal: 22,
  },

  header: {
    marginTop: 35,
    marginBottom: 28,
  },

  logo: {
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: 2,
  },

  subtitle: {
    color: "#7D8DA5",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 4,
    marginTop: 3,
  },

  assetCard: {
    backgroundColor: "#101C2D",
    borderRadius: 18,
    padding: 22,
    marginBottom: 16,
  },

  label: {
    color: "#7D8DA5",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
  },

  truckNumber: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "800",
    marginTop: 7,
  },

  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
  },

  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 9,
  },

  statusOnline: {
    backgroundColor: "#22C55E",
  },

  statusOffline: {
    backgroundColor: "#64748B",
  },

  statusText: {
    color: "#CBD5E1",
    fontSize: 12,
    fontWeight: "700",
  },

  serverRow: {
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#1E2B3E",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  serverLabel: {
    color: "#7D8DA5",
    fontSize: 11,
    fontWeight: "700",
  },

  serverValue: {
    fontSize: 11,
    fontWeight: "800",
  },

  serverConnected: {
    color: "#22C55E",
  },

  serverDisconnected: {
    color: "#F59E0B",
  },

  gpsCard: {
    backgroundColor: "#101C2D",
    borderRadius: 18,
    padding: 22,
  },

  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 18,
  },

  dataRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomColor: "#1E2B3E",
    borderBottomWidth: 1,
  },

  dataLabel: {
    color: "#7D8DA5",
    fontSize: 14,
  },

  dataValue: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },

  startButton: {
    marginTop: 24,
    backgroundColor: "#2563EB",
    height: 58,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },

  stopButton: {
    marginTop: 24,
    backgroundColor: "#B91C1C",
    height: 58,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },

  buttonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 15,
    letterSpacing: 1,
  },

  errorBox: {
    backgroundColor: "#40191D",
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
  },

  errorText: {
    color: "#FCA5A5",
    fontSize: 13,
  },

  footer: {
    color: "#475569",
    textAlign: "center",
    marginTop: 20,
    fontSize: 11,
  },
});
