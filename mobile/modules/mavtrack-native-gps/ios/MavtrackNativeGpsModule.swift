import ExpoModulesCore
import Foundation
import CoreLocation
import Security
import UIKit

// The tracker and its CLLocationManager intentionally outlive the React Native screen/module.
// All tracker methods and CLLocationManager delegate callbacks run on the main queue.
private final class MavtrackLocationEngine: NSObject, CLLocationManagerDelegate {
  static let shared = MavtrackLocationEngine()
  private let defaults = UserDefaults.standard
  private let storagePrefix = "mavtrack.nativeGps.v4."
  private let keychainAccount = "com.mavtrack.driver.nativeGps.telemetryKey"
  private var manager: CLLocationManager?
  private var sending = false
  private var currentTask: URLSessionDataTask?
  private var generation = 0
  private var running = false
  private var deviceId = ""
  private var apiUrl = ""
  // Retain a modern Core Location background activity session while tracking.
  // Stored as AnyObject so the module can keep an iOS 15.1 deployment target
  // while enabling the iOS 17+ API at runtime.
  private var backgroundActivitySession: AnyObject?
  private var uploadBackgroundTask: UIBackgroundTaskIdentifier = .invalid
  private let maxQueue = 400
  private let session: URLSession = {
    let config = URLSessionConfiguration.default
    config.timeoutIntervalForRequest = 20
    config.timeoutIntervalForResource = 40
    config.waitsForConnectivity = false
    return URLSession(configuration: config)
  }()

  private override init() { super.init() }
  private func storage(_ suffix: String) -> String { storagePrefix + suffix }
  private func dateString(_ date: Date = Date()) -> String {
    ISO8601DateFormatter().string(from: date)
  }
  private func set(_ value: Any, _ key: String) { defaults.set(value, forKey: storage(key)) }
  private func string(_ key: String) -> String { defaults.string(forKey: storage(key)) ?? "" }
  private func readQueue() -> [[String: Any]] {
    defaults.array(forKey: storage("queue")) as? [[String: Any]] ?? []
  }
  private func writeQueue(_ items: [[String: Any]]) { set(items, "queue") }
  private func setError(_ value: String) { set("\(dateString()) · \(value)", "lastError") }

  private func saveSecret(_ value: String) -> Bool {
    let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                kSecAttrAccount as String: keychainAccount]
    SecItemDelete(query as CFDictionary)
    var insert = query
    insert[kSecValueData as String] = Data(value.utf8)
    insert[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    return SecItemAdd(insert as CFDictionary, nil) == errSecSuccess
  }
  private func readSecret() -> String? {
    let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                kSecAttrAccount as String: keychainAccount,
                                kSecReturnData as String: true,
                                kSecMatchLimit as String: kSecMatchLimitOne]
    var result: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
          let data = result as? Data else { return nil }
    return String(data: data, encoding: .utf8)
  }
  private func clearSecret() {
    let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                kSecAttrAccount as String: keychainAccount]
    SecItemDelete(query as CFDictionary)
  }

  private func ensureManager() -> CLLocationManager {
    if let manager { return manager }
    let fresh = CLLocationManager()
    fresh.delegate = self
    fresh.desiredAccuracy = kCLLocationAccuracyBestForNavigation
    // Receive every meaningful Core Location update; network throttling happens separately.
    fresh.distanceFilter = kCLDistanceFilterNone
    fresh.activityType = .automotiveNavigation
    fresh.pausesLocationUpdatesAutomatically = false
    fresh.showsBackgroundLocationIndicator = true
    manager = fresh
    return fresh
  }

  private func startBackgroundActivitySession() {
    if #available(iOS 17.0, *) {
      if backgroundActivitySession == nil {
        backgroundActivitySession = CLBackgroundActivitySession()
        set(true, "backgroundActivitySession")
      }
    } else {
      set(false, "backgroundActivitySession")
    }
  }

  private func stopBackgroundActivitySession() {
    if #available(iOS 17.0, *),
       let session = backgroundActivitySession as? CLBackgroundActivitySession {
      session.invalidate()
    }
    backgroundActivitySession = nil
    set(false, "backgroundActivitySession")
  }

  private func beginUploadBackgroundTask() {
    guard uploadBackgroundTask == .invalid else { return }
    uploadBackgroundTask = UIApplication.shared.beginBackgroundTask(
      withName: "MAVTRACK GPS Upload"
    ) { [weak self] in
      self?.setError("UPLOAD_BACKGROUND_TIME_EXPIRED")
      self?.endUploadBackgroundTask()
    }
    set(uploadBackgroundTask != .invalid, "uploadBackgroundTask")
  }

  private func endUploadBackgroundTask() {
    guard uploadBackgroundTask != .invalid else { return }
    UIApplication.shared.endBackgroundTask(uploadBackgroundTask)
    uploadBackgroundTask = .invalid
    set(false, "uploadBackgroundTask")
  }

  private func startLocationServices(_ location: CLLocationManager) {
    startBackgroundActivitySession()
    location.allowsBackgroundLocationUpdates = true
    location.pausesLocationUpdatesAutomatically = false
    location.startUpdatingLocation()

    if CLLocationManager.significantLocationChangeMonitoringAvailable() {
      location.startMonitoringSignificantLocationChanges()
      set(true, "significantChanges")
    } else {
      set(false, "significantChanges")
    }

    // Ask for an immediate fix while the app is foregrounded. Continuous
    // delivery remains driven by startUpdatingLocation().
    location.requestLocation()
  }

  private func stopLocationServices() {
    manager?.stopUpdatingLocation()
    if CLLocationManager.significantLocationChangeMonitoringAvailable() {
      manager?.stopMonitoringSignificantLocationChanges()
    }
    manager?.allowsBackgroundLocationUpdates = false
    set(false, "significantChanges")
    stopBackgroundActivitySession()
  }

  func noteLifecycle(_ value: String) {
    set(value, "lastLifecycle")
    set(dateString(), "lastLifecycleAt")
  }

  // Called from the Expo AppDelegate subscriber as early as possible.
  // If iOS relaunched the app to deliver a location event after the process
  // was reclaimed, recreate Core Location immediately instead of waiting for
  // React Native / JavaScript to finish booting.
  @discardableResult
  func resumeFromAppLifecycle(_ reason: String) -> [String: Any] {
    noteLifecycle(reason)
    return resume()
  }

  func start(device: String, server: String, key: String) throws -> [String: Any] {
    guard !device.isEmpty, !key.isEmpty, let url = URL(string: server), url.scheme == "https" else {
      throw NSError(domain: "MavtrackNativeGps", code: 1,
                    userInfo: [NSLocalizedDescriptionKey: "Missing device, HTTPS API URL, or telemetry key"])
    }
    guard CLLocationManager.locationServicesEnabled() else {
      throw NSError(domain: "MavtrackNativeGps", code: 2,
                    userInfo: [NSLocalizedDescriptionKey: "iOS Location Services are disabled"])
    }
    let location = ensureManager()
    guard location.authorizationStatus == .authorizedAlways else {
      throw NSError(domain: "MavtrackNativeGps", code: 3,
                    userInfo: [NSLocalizedDescriptionKey: "Allow Location Access: Always before START"])
    }
    guard Bundle.main.object(forInfoDictionaryKey: "UIBackgroundModes") as? [String] != nil,
          (Bundle.main.object(forInfoDictionaryKey: "UIBackgroundModes") as? [String])?.contains("location") == true else {
      throw NSError(domain: "MavtrackNativeGps", code: 4,
                    userInfo: [NSLocalizedDescriptionKey: "iOS binary is missing UIBackgroundModes/location"])
    }
    guard saveSecret(key) else {
      throw NSError(domain: "MavtrackNativeGps", code: 5,
                    userInfo: [NSLocalizedDescriptionKey: "Unable to store telemetry credential in iOS Keychain"])
    }
    if !deviceId.isEmpty && deviceId != device {
      // Never mix queued points from a previous truck assignment with a new truck.
      writeQueue([])
      set(0.0, "lastQueuedTime")
    }
    generation += 1
    deviceId = device
    apiUrl = server.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    set(deviceId, "deviceId")
    set(apiUrl, "apiUrl")
    set(true, "active")
    running = true
    set(dateString(), "startedAt")
    set("RUNNING", "engineState")
    startLocationServices(location)
    flushQueue()
    return diagnostics()
  }

  func resume() -> [String: Any] {
    if running { flushQueue(); return diagnostics() }
    guard defaults.bool(forKey: storage("active")),
          let key = readSecret(), !key.isEmpty else { return diagnostics() }
    do {
      return try start(device: string("deviceId"), server: string("apiUrl"), key: key)
    } catch {
      setError("RESUME: \(error.localizedDescription)")
      return diagnostics()
    }
  }

  func stop() -> [String: Any] {
    defaults.set(false, forKey: storage("active"))
    generation += 1
    currentTask?.cancel()
    currentTask = nil
    sending = false
    running = false
    set("STOPPED", "engineState")
    stopLocationServices()
    endUploadBackgroundTask()
    // Discard unsent position data on explicit STOP, never send an old point as trackingActive:true.
    writeQueue([])
    clearSecret()
    return diagnostics()
  }

  func diagnostics() -> [String: Any] {
    let status = manager?.authorizationStatus ?? CLLocationManager.authorizationStatus()
    let permission: String
    switch status {
    case .authorizedAlways: permission = "ALWAYS"
    case .authorizedWhenInUse: permission = "WHEN_IN_USE"
    case .denied: permission = "DENIED"
    case .restricted: permission = "RESTRICTED"
    default: permission = "NOT_DETERMINED"
    }
    let precise: String
    if #available(iOS 14.0, *) {
      precise = manager?.accuracyAuthorization == .fullAccuracy ? "FULL" : "REDUCED"
    } else { precise = "UNKNOWN" }
    return [
      "available": true,
      "running": running,
      "permission": permission,
      "precision": precise,
      "deviceId": deviceId.isEmpty ? string("deviceId") : deviceId,
      "callbacks": defaults.integer(forKey: storage("callbacks")),
      "lastFix": string("lastFix"),
      "lastAttempt": string("lastAttempt"),
      "lastAck": string("lastAck"),
      "lastHttpStatus": defaults.integer(forKey: storage("lastHttpStatus")),
      "lastError": string("lastError"),
      "queued": readQueue().count,
      "lastLatitude": defaults.object(forKey: storage("latitude")) ?? NSNull(),
      "lastLongitude": defaults.object(forKey: storage("longitude")) ?? NSNull(),
      "lastSpeedKph": defaults.object(forKey: storage("speedKph")) ?? NSNull(),
      "backgroundActivitySession": defaults.bool(forKey: storage("backgroundActivitySession")),
      "significantChanges": defaults.bool(forKey: storage("significantChanges")),
      "uploadBackgroundTask": defaults.bool(forKey: storage("uploadBackgroundTask")),
      "engineState": string("engineState"),
      "lastAppState": string("lastAppState"),
      "lastPause": string("lastPause"),
      "lastResume": string("lastResume"),
      "lastLifecycle": string("lastLifecycle"),
      "lastLifecycleAt": string("lastLifecycleAt"),
      "startedAt": string("startedAt")
    ]
  }

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard running, let latest = locations.last, latest.horizontalAccuracy >= 0,
          abs(latest.timestamp.timeIntervalSinceNow) < 120 else { return }
    let appState: String
    switch UIApplication.shared.applicationState {
    case .active: appState = "ACTIVE"
    case .background: appState = "BACKGROUND"
    case .inactive: appState = "INACTIVE"
    @unknown default: appState = "UNKNOWN"
    }
    set(appState, "lastAppState")

    let count = defaults.integer(forKey: storage("callbacks")) + 1
    set(count, "callbacks")
    set(dateString(latest.timestamp), "lastFix")
    set(latest.coordinate.latitude, "latitude")
    set(latest.coordinate.longitude, "longitude")
    let speed = latest.speed >= 0 ? latest.speed * 3.6 : -1
    if speed >= 0 { set(speed, "speedKph") }
    let lastQueuedTime = defaults.double(forKey: storage("lastQueuedTime"))
    let gap: Double = speed >= 5 ? 15 : 55
    if Date().timeIntervalSince1970 - lastQueuedTime < gap { flushQueue(); return }
    var point: [String: Any] = [
      "deviceId": deviceId,
      "latitude": latest.coordinate.latitude,
      "longitude": latest.coordinate.longitude,
      "accuracy": latest.horizontalAccuracy,
      "trackingActive": true,
      "recordedAt": dateString(latest.timestamp)
    ]
    if latest.altitude.isFinite { point["altitude"] = latest.altitude }
    if speed >= 0 { point["speedKph"] = speed }
    if latest.course >= 0 { point["heading"] = latest.course }
    var queue = readQueue()
    if queue.count >= maxQueue {
      setError("QUEUE_FULL: maximum \(maxQueue) pending points; dropping oldest queued fix")
      queue.removeFirst()
    }
    queue.append(point)
    writeQueue(queue)
    set(Date().timeIntervalSince1970, "lastQueuedTime")
    flushQueue()
  }

  func locationManagerDidPauseLocationUpdates(_ manager: CLLocationManager) {
    set(dateString(), "lastPause")
    setError("CORE_LOCATION_PAUSED_UNEXPECTEDLY")
    // We explicitly disable automatic pauses, but restart defensively if the
    // system reports a pause while the tracking session is still active.
    if running {
      manager.startUpdatingLocation()
    }
  }

  func locationManagerDidResumeLocationUpdates(_ manager: CLLocationManager) {
    set(dateString(), "lastResume")
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    setError("CLLocationManager: \(error.localizedDescription)")
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    if running && manager.authorizationStatus != .authorizedAlways {
      setError("LOCATION_PERMISSION_CHANGED: Always access is required")
    }
  }

  private func flushQueue() {
    guard !sending, running, !readQueue().isEmpty, let key = readSecret(),
          let url = URL(string: apiUrl + "/api/mobile/telemetry") else { return }
    let queue = readQueue()
    guard let point = queue.first,
          let payload = try? JSONSerialization.data(withJSONObject: point) else { return }
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.httpBody = payload
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue(key, forHTTPHeaderField: "x-mavtrack-key")
    sending = true
    beginUploadBackgroundTask()
    set(dateString(), "lastAttempt")
    let expectedDevice = deviceId
    let expectedGeneration = generation
    let task = session.dataTask(with: request) { [weak self] _, response, error in
      DispatchQueue.main.async {
        guard let self = self else { return }
        // Never remove a point from a different session if STOP/START happened mid-request.
        guard self.running && self.deviceId == expectedDevice && self.generation == expectedGeneration else {
          self.endUploadBackgroundTask()
          return
        }
        self.sending = false
        self.currentTask = nil
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        self.set(status, "lastHttpStatus")
        self.endUploadBackgroundTask()
        if status >= 200 && status < 300 && error == nil {
          var pending = self.readQueue()
          if !pending.isEmpty { pending.removeFirst() }
          self.writeQueue(pending)
          self.set(self.dateString(), "lastAck")
          self.set("", "lastError")
          self.flushQueue()
        } else {
          self.setError("HTTP \(status): \(error?.localizedDescription ?? "Server did not accept telemetry")")
          // No busy retry loop. Next Core Location event or foreground resume retries queue.
        }
      }
    }
    currentTask = task
    task.resume()
  }
}

// Expo forwards application lifecycle events to this subscriber. This gives
// the GPS engine a native restore path that does not depend on JavaScript.
// Apple explicitly recommends recreating active location services immediately
// when a background location workflow causes an app relaunch.
public class MavtrackNativeGpsAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    _ = MavtrackLocationEngine.shared.resumeFromAppLifecycle("DID_FINISH_LAUNCHING")
    return true
  }

  public func applicationDidBecomeActive(_ application: UIApplication) {
    _ = MavtrackLocationEngine.shared.resumeFromAppLifecycle("DID_BECOME_ACTIVE")
  }

  public func applicationDidEnterBackground(_ application: UIApplication) {
    _ = MavtrackLocationEngine.shared.resumeFromAppLifecycle("DID_ENTER_BACKGROUND")
  }

  public func applicationWillEnterForeground(_ application: UIApplication) {
    _ = MavtrackLocationEngine.shared.resumeFromAppLifecycle("WILL_ENTER_FOREGROUND")
  }

  public func applicationWillTerminate(_ application: UIApplication) {
    // Do not clear the persisted active flag here. If iOS terminates the
    // process for resources, the next location-driven launch must be able to
    // restore tracking. Explicit STOP is the only action that clears it.
    MavtrackLocationEngine.shared.noteLifecycle("WILL_TERMINATE")
  }
}

public class MavtrackNativeGpsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MavtrackNativeGps")
    AsyncFunction("start") { (deviceId: String, apiUrl: String, telemetryKey: String) throws -> [String: Any] in
      return try MavtrackLocationEngine.shared.start(device: deviceId, server: apiUrl, key: telemetryKey)
    }.runOnQueue(.main)
    AsyncFunction("stop") { () -> [String: Any] in
      return MavtrackLocationEngine.shared.stop()
    }.runOnQueue(.main)
    AsyncFunction("resume") { () -> [String: Any] in
      return MavtrackLocationEngine.shared.resume()
    }.runOnQueue(.main)
    AsyncFunction("diagnostics") { () -> [String: Any] in
      return MavtrackLocationEngine.shared.diagnostics()
    }.runOnQueue(.main)
  }
}
