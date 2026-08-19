import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap
} from 'react-leaflet'

import L from 'leaflet'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

import {
  useCallback,
  useEffect,
  useState
} from 'react'

import './App.css'
import maverickLogo from './assets/maverick-logo.jpeg'
import Login from './Login'

type ViewName =
  | 'map'
  | 'fleet'
  | 'operations'
  | 'monitors'
  | 'reports'

type DeviceStatus =
  | 'online'
  | 'delayed'
  | 'offline'

type StatusFilter =
  | 'all'
  | DeviceStatus

type MovementStatus =
  | 'moving'
  | 'parked'
  | 'acquiring'
  | 'offline'

type RoutePoint = {
  latitude: number
  longitude: number
  timestamp: string
}

type HistoryPoint = {
  id: number
  latitude: number | null
  longitude: number | null
  timestamp: string
  temperature: number
  altitude: number | null
  speedKph: number | null
  movementStatus: string | null
}

type HistoryRange =
  | 'today'
  | 'yesterday'
  | '7days'
  | 'custom'

type HistoryTrip = {
  id: number
  points: HistoryPoint[]
  start: string
  end: string
  distanceMiles: number
}

const API_BASE = 'https://maverick-1z64.onrender.com'

// Keep Leaflet's default marker assets available for compatibility.
// Maverick uses a custom status-aware trailer icon below.
void markerIcon2x
void markerIcon
void markerShadow

function createTrailerIcon(
  movementStatus: MovementStatus
) {
  return L.divIcon({
    className: 'mav-trailer-marker-wrapper',
    html: `
      <div class="mav-trailer-marker ${movementStatus}">
        <span class="mav-trailer-marker-pulse"></span>
        <span class="mav-trailer-marker-icon">▰</span>
      </div>
    `,
    iconSize: [46, 46],
    iconAnchor: [23, 23],
    popupAnchor: [0, -26]
  })
}

function MapController({
  latitude,
  longitude
}: {
  latitude: number | null
  longitude: number | null
}) {
  const map = useMap()

  useEffect(() => {
    if (
      latitude != null &&
      longitude != null
    ) {
      map.setView(
        [latitude, longitude],
        13
      )
    }
  }, [
    latitude,
    longitude,
    map
  ])

  return null
}

function distanceMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const toRad = (value: number) =>
    value * Math.PI / 180

  const earthRadiusMiles = 3958.7613
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2

  return earthRadiusMiles *
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    )
}

function readStoredUser() {
  try {
    const saved =
      localStorage.getItem(
        'maverick_user'
      )

    return saved
      ? JSON.parse(saved)
      : null
  } catch {
    return null
  }
}

function App() {
  // =====================================================
  // LOGIN / SESSION
  // =====================================================

  const [
    isLoggedIn,
    setIsLoggedIn
  ] = useState(
    () =>
      Boolean(
        localStorage.getItem(
          'maverick_token'
        )
      )
  )

  const [
    currentUser,
    setCurrentUser
  ] = useState<any>(
    () => readStoredUser()
  )

  useEffect(() => {
    const token =
      localStorage.getItem(
        'maverick_token'
      )

    if (!token) {
      setIsLoggedIn(false)
      return
    }

    fetch(
      `${API_BASE}/api/auth/me`,
      {
        headers: {
          Authorization:
            `Bearer ${token}`
        }
      }
    )
      .then(async (res) => {
        const data =
          await res.json()

        if (
          !res.ok ||
          !data.ok
        ) {
          localStorage.removeItem(
            'maverick_token'
          )

          localStorage.removeItem(
            'maverick_user'
          )

          setCurrentUser(null)
          setIsLoggedIn(false)
          return
        }

        localStorage.setItem(
          'maverick_user',
          JSON.stringify(
            data.user
          )
        )

        setCurrentUser(
          data.user
        )

        setIsLoggedIn(true)
      })
      .catch(() => {
        setIsLoggedIn(false)
      })
  }, [])

  // =====================================================
  // DASHBOARD STATE
  // =====================================================

  const [
    activeView,
    setActiveView
  ] = useState<ViewName>('map')

  const [
    apiStatus,
    setApiStatus
  ] = useState('Checking...')

  const [
    telemetry,
    setTelemetry
  ] = useState<any>(null)

  const [
    assets,
    setAssets
  ] = useState<any[]>([])


  const [
    routePoints,
    setRoutePoints
  ] = useState<RoutePoint[]>([])

  const [
    showRoute,
    setShowRoute
  ] = useState(true)

  const [
    historyOpen,
    setHistoryOpen
  ] = useState(false)

  const [
    historyRange,
    setHistoryRange
  ] = useState<HistoryRange>('today')

  const [
    historyCustomDate,
    setHistoryCustomDate
  ] = useState(() => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  })

  const [
    selectedHistoryTripId,
    setSelectedHistoryTripId
  ] = useState<number | 'all'>('all')

  const [
    historyPoints,
    setHistoryPoints
  ] = useState<HistoryPoint[]>([])

  const [
    historyLoading,
    setHistoryLoading
  ] = useState(false)

  const [
    historyError,
    setHistoryError
  ] = useState('')

  const [
    selectedDeviceId,
    setSelectedDeviceId
  ] = useState('TRAILER-001')

  const [
    now,
    setNow
  ] = useState(Date.now())

  const [
    searchTerm,
    setSearchTerm
  ] = useState('')

  const [
    statusFilter,
    setStatusFilter
  ] = useState<StatusFilter>(
    'all'
  )

  const [
    assetTypeFilter,
    setAssetTypeFilter
  ] = useState('all')

  const [
    filtersOpen,
    setFiltersOpen
  ] = useState(true)

  const [
  bottomDockOpen,
  setBottomDockOpen
] = useState(false)

  const [
    detailsOpen,
    setDetailsOpen
  ] = useState(false)

  const [
    renameOpen,
    setRenameOpen
  ] = useState(false)

  const [
    renameValue,
    setRenameValue
  ] = useState('')

  const [
    renameSaving,
    setRenameSaving
  ] = useState(false)

  const [
    renameError,
    setRenameError
  ] = useState('')

  const [
    temperatureLimitsOpen,
    setTemperatureLimitsOpen
  ] = useState(false)

  const [
    temperatureMinF,
    setTemperatureMinF
  ] = useState('')

  const [
    temperatureMaxF,
    setTemperatureMaxF
  ] = useState('')

  const [
    temperatureAlertsEnabled,
    setTemperatureAlertsEnabled
  ] = useState(false)

  const [
    temperatureLimitsSaving,
    setTemperatureLimitsSaving
  ] = useState(false)

  const [
    temperatureLimitsError,
    setTemperatureLimitsError
  ] = useState('')

  const [
    notificationsOpen,
    setNotificationsOpen
  ] = useState(false)

  const [
    helpOpen,
    setHelpOpen
  ] = useState(false)

  const [
    showOnline,
    setShowOnline
  ] = useState(true)

  const [
    showDelayed,
    setShowDelayed
  ] = useState(true)

  const [
    showOffline,
    setShowOffline
  ] = useState(true)

  useEffect(() => {
    const timer =
      setInterval(() => {
        setNow(Date.now())
      }, 5000)

    return () =>
      clearInterval(timer)
  }, [])

  // =====================================================
  // TELEMETRY
  // =====================================================

  const loadTelemetry =
    useCallback(
      async () => {
        const token =
          localStorage.getItem(
            'maverick_token'
          )

        if (!token) {
          setIsLoggedIn(false)
          return
        }

        try {
          const res =
            await fetch(
              `${API_BASE}/api/telemetry/latest`,
              {
                headers: {
                  Authorization:
                    `Bearer ${token}`
                }
              }
            )

          const data =
            await res.json()

          if (
            res.status === 401
          ) {
            localStorage.removeItem(
              'maverick_token'
            )

            localStorage.removeItem(
              'maverick_user'
            )

            setCurrentUser(null)
            setTelemetry(null)
            setIsLoggedIn(false)
            return
          }

          if (data.ok) {
            setTelemetry(
              data.telemetry
            )

            if (
              data.telemetry?.deviceId
            ) {
              setSelectedDeviceId(
                data.telemetry.deviceId
              )
            }

            setApiStatus(
              'online'
            )
          } else {
            setApiStatus(
              'offline'
            )
          }
        } catch {
          setApiStatus(
            'offline'
          )
        }
      },
      []
    )

  useEffect(() => {
    loadTelemetry()

    const interval =
      setInterval(
        loadTelemetry,
        5000
      )

    return () =>
      clearInterval(
        interval
      )
  }, [loadTelemetry])


  // =====================================================
  // LIVE ROUTE FOR THIS BROWSER SESSION
  // =====================================================
  // Every fresh valid GPS position is appended once.
  // This gives us a live breadcrumb trail immediately,
  // without requiring a historical endpoint yet.

  useEffect(() => {
    if (
      !telemetry?.hasCurrentGps ||
      telemetry?.latitude == null ||
      telemetry?.longitude == null
    ) {
      return
    }

    const timestamp =
      telemetry.locationReceivedAt ||
      telemetry.recordedAt ||
      telemetry.receivedAt

    if (!timestamp) {
      return
    }

    const nextPoint: RoutePoint = {
      latitude: Number(telemetry.latitude),
      longitude: Number(telemetry.longitude),
      timestamp: String(timestamp)
    }

    setRoutePoints((current) => {
      const last =
        current[current.length - 1]

      if (
        last?.timestamp ===
        nextPoint.timestamp
      ) {
        return current
      }

      const next = [
        ...current,
        nextPoint
      ]

      return next.slice(-300)
    })
  }, [telemetry])

  const loadAssets =
    useCallback(
      async () => {
        const token =
          localStorage.getItem(
            'maverick_token'
          )

        if (!token) {
          return
        }

        try {
          const res =
            await fetch(
              `${API_BASE}/api/assets`,
              {
                headers: {
                  Authorization:
                    `Bearer ${token}`
                }
              }
            )

          const data =
            await res.json()

          if (res.status === 401) {
            localStorage.removeItem(
              'maverick_token'
            )
            localStorage.removeItem(
              'maverick_user'
            )
            setCurrentUser(null)
            setAssets([])
            setIsLoggedIn(false)
            return
          }

          if (res.ok && data.ok) {
            setAssets(
              data.assets || []
            )
          }
        } catch (error) {
          console.error(
            'Unable to load assets:',
            error
          )
        }
      },
      []
    )

  useEffect(() => {
    if (!isLoggedIn) {
      return
    }

    loadAssets()
  }, [
    isLoggedIn,
    loadAssets
  ])

  // =====================================================
  // DEVICE STATUS
  // =====================================================

  const getDeviceStatus =
    (): DeviceStatus => {
      if (
        !telemetry?.receivedAt
      ) {
        return 'offline'
      }

      const ageMs =
        now -
        new Date(
          telemetry.receivedAt
        ).getTime()

      if (ageMs < 90000) {
        return 'online'
      }

      if (ageMs < 300000) {
        return 'delayed'
      }

      return 'offline'
    }

  const deviceStatus =
    getDeviceStatus()

  const statusLabel =
    deviceStatus === 'online'
      ? 'Online'
      : deviceStatus ===
          'delayed'
        ? 'Delayed'
        : 'Offline'

  const formatDateTime = (
    value?: string | null
  ) => {
    if (!value) {
      return 'Unknown'
    }

    return new Date(
      value
    ).toLocaleString([], {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatAge = (
    value?: string | null
  ) => {
    if (!value) {
      return 'No data'
    }

    const diff =
      Math.max(
        0,
        now -
          new Date(
            value
          ).getTime()
      )

    const seconds =
      Math.floor(
        diff / 1000
      )

    if (seconds < 60) {
      return `${seconds}s ago`
    }

    const minutes =
      Math.floor(
        seconds / 60
      )

    if (minutes < 60) {
      return `${minutes}m ago`
    }

    const hours =
      Math.floor(
        minutes / 60
      )

    if (hours < 24) {
      return `${hours}h ago`
    }

    return `${
      Math.floor(
        hours / 24
      )
    }d ago`
  }

  // =====================================================
  // USER
  // =====================================================

  const userName =
    currentUser?.name ||
    currentUser?.email ||
    'Maverick User'

  const userRole =
    currentUser?.role
      ? String(
          currentUser.role
        )
          .replaceAll(
            '_',
            ' '
          )
          .replace(
            /\b\w/g,
            (letter) =>
              letter.toUpperCase()
          )
      : 'Fleet Operator'

  const userInitials =
    String(userName)
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(
        (part) =>
          part[0]?.toUpperCase()
      )
      .join('') || 'MU'

  // =====================================================
  // CURRENT ASSET VALUES
  // =====================================================

  const temperatureF =
    telemetry?.temperature != null
      ? (
          (
            telemetry.temperature *
              9
          ) /
            5 +
          32
        ).toFixed(1)
      : '--'

  const temperatureLabel =
    deviceStatus === 'online'
      ? 'Temperature'
      : 'Last Temperature'

  const selectedAsset =
    assets.find(
      (asset) =>
        asset.deviceId ===
        selectedDeviceId
    ) ||
    assets.find(
      (asset) =>
        asset.deviceId ===
        telemetry?.deviceId
    )

  const selectedAssetName =
    selectedAsset?.name ||
    telemetry?.deviceId ||
    selectedDeviceId

  const hasLocation =
    telemetry?.latitude != null &&
    telemetry?.longitude != null

  // =====================================================
  // GPS DISPLAY STATE
  // =====================================================
  // Device connectivity and GPS availability are separate.
  // A trailer can be ONLINE while the GNSS is still
  // acquiring a fresh fix. In that case Maverick keeps
  // the previous valid position only as "last known".

  const gpsAcquiring =
    deviceStatus === 'online' &&
    !Boolean(
      telemetry?.hasCurrentGps
    )

  const gpsStatusText =
    telemetry?.hasCurrentGps
      ? 'Current'
      : gpsAcquiring
        ? '🟡 Acquiring location...'
        : hasLocation
          ? 'Last known'
          : 'Unavailable'

  const gpsDetailText =
    telemetry?.hasCurrentGps
      ? 'Current GPS'
      : gpsAcquiring
        ? '🟡 Acquiring GPS location...'
        : hasLocation
          ? 'Last known GPS'
          : 'No GPS'

  const locationLabel =
    telemetry?.hasCurrentGps
      ? 'Location'
      : hasLocation
        ? 'Last known location'
        : 'Location'

  const locationTimeLabel =
    telemetry?.hasCurrentGps
      ? 'Location Updated'
      : 'Last Valid Location'

  const speedKphRaw =
    telemetry?.speedKph != null
      ? Number(telemetry.speedKph)
      : null

  const speedKph =
    speedKphRaw != null &&
    Number.isFinite(speedKphRaw)
      ? Math.max(0, speedKphRaw)
      : 0

  const speedMph =
    speedKph * 0.621371

  const backendMovement =
    String(
      telemetry?.movementStatus || ''
    ).toUpperCase()

  const movementStatus: MovementStatus =
    deviceStatus === 'offline'
      ? 'offline'
      : gpsAcquiring
        ? 'acquiring'
        : backendMovement === 'MOVING' ||
            speedKph >= 5
          ? 'moving'
          : 'parked'

  const movementLabel =
    movementStatus === 'moving'
      ? 'Moving'
      : movementStatus === 'parked'
        ? 'Parked'
        : movementStatus === 'acquiring'
          ? 'Acquiring GPS'
          : 'Offline'

  const trailerIcon =
    createTrailerIcon(
      movementStatus
    )

  const routeLatLngs =
    routePoints.map(
      (point) => [
        point.latitude,
        point.longitude
      ] as [number, number]
    )

  const normalizedSearch =
    searchTerm
      .trim()
      .toLowerCase()

  const matchesSearch =
    !normalizedSearch ||
    String(
      telemetry?.deviceId || ''
    )
      .toLowerCase()
      .includes(
        normalizedSearch
      ) ||
    String(
      selectedAssetName || ''
    )
      .toLowerCase()
      .includes(
        normalizedSearch
      )

  const matchesStatus =
    statusFilter === 'all' ||
    statusFilter ===
      deviceStatus

  const matchesAssetType =
    assetTypeFilter ===
      'all' ||
    assetTypeFilter ===
      'trailer'

  const statusToggleEnabled =
    deviceStatus === 'online'
      ? showOnline
      : deviceStatus ===
          'delayed'
        ? showDelayed
        : showOffline

  const assetVisible =
    Boolean(telemetry) &&
    matchesSearch &&
    matchesStatus &&
    matchesAssetType &&
    statusToggleEnabled

  const markerVisible =
    hasLocation &&
    assetVisible

  const currentTemperatureC =
    telemetry?.temperature != null
      ? Number(telemetry.temperature)
      : null

  const temperatureBelowLimit =
    Boolean(
      selectedAsset
        ?.temperatureAlertsEnabled
    ) &&
    currentTemperatureC != null &&
    selectedAsset?.temperatureMinC != null &&
    currentTemperatureC <
      Number(
        selectedAsset.temperatureMinC
      )

  const temperatureAboveLimit =
    Boolean(
      selectedAsset
        ?.temperatureAlertsEnabled
    ) &&
    currentTemperatureC != null &&
    selectedAsset?.temperatureMaxC != null &&
    currentTemperatureC >
      Number(
        selectedAsset.temperatureMaxC
      )

  const temperatureOutOfRange =
    temperatureBelowLimit ||
    temperatureAboveLimit

  const deviceAlertCount =
    deviceStatus === 'online'
      ? 0
      : 1

  const temperatureAlertCount =
    temperatureOutOfRange
      ? 1
      : 0

  const activeAlertCount =
    deviceAlertCount +
    temperatureAlertCount

  // =====================================================
  // ACTIONS
  // =====================================================

  const handleLogout = () => {
    localStorage.removeItem(
      'maverick_token'
    )

    localStorage.removeItem(
      'maverick_user'
    )

    setCurrentUser(null)
    setTelemetry(null)
    setAssets([])
    setIsLoggedIn(false)
  }

  const handleLogin = () => {
    setCurrentUser(
      readStoredUser()
    )

    setIsLoggedIn(true)
  }

  const openRenameAsset = () => {
    setRenameError('')
    setRenameValue(
      selectedAssetName
    )
    setRenameOpen(true)
  }

  const handleRenameAsset =
    async () => {
      const token =
        localStorage.getItem(
          'maverick_token'
        )

      const cleanName =
        renameValue.trim()

      if (!selectedAsset?.id) {
        setRenameError(
          'Asset information is not loaded yet.'
        )
        return
      }

      if (
        cleanName.length < 2 ||
        cleanName.length > 80
      ) {
        setRenameError(
          'Asset name must be between 2 and 80 characters.'
        )
        return
      }

      if (!token) {
        setRenameError(
          'Your session has expired.'
        )
        return
      }

      setRenameSaving(true)
      setRenameError('')

      try {
        const res =
          await fetch(
            `${API_BASE}/api/assets/${selectedAsset.id}`,
            {
              method: 'PATCH',
              headers: {
                'Content-Type':
                  'application/json',
                Authorization:
                  `Bearer ${token}`
              },
              body: JSON.stringify({
                name: cleanName
              })
            }
          )

        const data =
          await res.json()

        if (res.status === 401) {
          handleLogout()
          return
        }

        if (!res.ok || !data.ok) {
          setRenameError(
            data.message ||
            'Unable to rename asset.'
          )
          return
        }

        setAssets(
          (currentAssets) =>
            currentAssets.map(
              (asset) =>
                asset.id ===
                  data.asset.id
                  ? data.asset
                  : asset
            )
        )

        setRenameOpen(false)
        setRenameValue('')
      } catch {
        setRenameError(
          'Unable to connect to Maverick.'
        )
      } finally {
        setRenameSaving(false)
      }
    }

  const celsiusToFahrenheit = (
    value: number
  ) =>
    (value * 9) / 5 + 32

  const fahrenheitToCelsius = (
    value: number
  ) =>
    ((value - 32) * 5) / 9

  const openTemperatureLimits = () => {
    if (!selectedAsset) {
      return
    }

    setTemperatureLimitsError('')

    setTemperatureMinF(
      selectedAsset.temperatureMinC != null
        ? celsiusToFahrenheit(
            Number(
              selectedAsset.temperatureMinC
            )
          ).toFixed(1)
        : ''
    )

    setTemperatureMaxF(
      selectedAsset.temperatureMaxC != null
        ? celsiusToFahrenheit(
            Number(
              selectedAsset.temperatureMaxC
            )
          ).toFixed(1)
        : ''
    )

    setTemperatureAlertsEnabled(
      Boolean(
        selectedAsset
          .temperatureAlertsEnabled
      )
    )

    setTemperatureLimitsOpen(true)
  }

  const handleSaveTemperatureLimits =
    async () => {
      const token =
        localStorage.getItem(
          'maverick_token'
        )

      if (!selectedAsset?.id) {
        setTemperatureLimitsError(
          'Asset information is not loaded yet.'
        )
        return
      }

      if (!token) {
        setTemperatureLimitsError(
          'Your session has expired.'
        )
        return
      }

      const cleanMin =
        temperatureMinF.trim()

      const cleanMax =
        temperatureMaxF.trim()

      const minF =
        cleanMin === ''
          ? null
          : Number(cleanMin)

      const maxF =
        cleanMax === ''
          ? null
          : Number(cleanMax)

      if (
        minF !== null &&
        !Number.isFinite(minF)
      ) {
        setTemperatureLimitsError(
          'Enter a valid minimum temperature.'
        )
        return
      }

      if (
        maxF !== null &&
        !Number.isFinite(maxF)
      ) {
        setTemperatureLimitsError(
          'Enter a valid maximum temperature.'
        )
        return
      }

      if (
        minF !== null &&
        maxF !== null &&
        minF >= maxF
      ) {
        setTemperatureLimitsError(
          'Minimum temperature must be lower than maximum temperature.'
        )
        return
      }

      if (
        temperatureAlertsEnabled &&
        (
          minF === null ||
          maxF === null
        )
      ) {
        setTemperatureLimitsError(
          'Set both minimum and maximum temperatures before enabling alerts.'
        )
        return
      }

      const temperatureMinC =
        minF === null
          ? null
          : fahrenheitToCelsius(
              minF
            )

      const temperatureMaxC =
        maxF === null
          ? null
          : fahrenheitToCelsius(
              maxF
            )

      setTemperatureLimitsSaving(true)
      setTemperatureLimitsError('')

      try {
        const res =
          await fetch(
            `${API_BASE}/api/assets/${selectedAsset.id}`,
            {
              method: 'PATCH',
              headers: {
                'Content-Type':
                  'application/json',
                Authorization:
                  `Bearer ${token}`
              },
              body: JSON.stringify({
                temperatureMinC,
                temperatureMaxC,
                temperatureAlertsEnabled
              })
            }
          )

        const data =
          await res.json()

        if (res.status === 401) {
          handleLogout()
          return
        }

        if (!res.ok || !data.ok) {
          setTemperatureLimitsError(
            data.message ||
            'Unable to save temperature limits.'
          )
          return
        }

        setAssets(
          (currentAssets) =>
            currentAssets.map(
              (asset) =>
                asset.id ===
                  data.asset.id
                  ? data.asset
                  : asset
            )
        )

        setTemperatureLimitsOpen(false)
      } catch {
        setTemperatureLimitsError(
          'Unable to connect to Maverick.'
        )
      } finally {
        setTemperatureLimitsSaving(false)
      }
    }

  const handleClearTemperatureLimits =
    async () => {
      const token =
        localStorage.getItem(
          'maverick_token'
        )

      if (!selectedAsset?.id || !token) {
        setTemperatureLimitsError(
          'Asset or session information is unavailable.'
        )
        return
      }

      setTemperatureLimitsSaving(true)
      setTemperatureLimitsError('')

      try {
        const res =
          await fetch(
            `${API_BASE}/api/assets/${selectedAsset.id}`,
            {
              method: 'PATCH',
              headers: {
                'Content-Type':
                  'application/json',
                Authorization:
                  `Bearer ${token}`
              },
              body: JSON.stringify({
                temperatureMinC: null,
                temperatureMaxC: null,
                temperatureAlertsEnabled:
                  false
              })
            }
          )

        const data =
          await res.json()

        if (res.status === 401) {
          handleLogout()
          return
        }

        if (!res.ok || !data.ok) {
          setTemperatureLimitsError(
            data.message ||
            'Unable to remove temperature limits.'
          )
          return
        }

        setAssets(
          (currentAssets) =>
            currentAssets.map(
              (asset) =>
                asset.id ===
                  data.asset.id
                  ? data.asset
                  : asset
            )
        )

        setTemperatureMinF('')
        setTemperatureMaxF('')
        setTemperatureAlertsEnabled(
          false
        )
        setTemperatureLimitsOpen(false)
      } catch {
        setTemperatureLimitsError(
          'Unable to connect to Maverick.'
        )
      } finally {
        setTemperatureLimitsSaving(false)
      }
    }

  const getHistoryWindow = (
    range: HistoryRange,
    customDate = historyCustomDate
  ) => {
    const end = new Date()
    const start = new Date()

    if (range === 'today') {
      start.setHours(0, 0, 0, 0)
    } else if (range === 'yesterday') {
      start.setDate(start.getDate() - 1)
      start.setHours(0, 0, 0, 0)
      end.setDate(end.getDate() - 1)
      end.setHours(23, 59, 59, 999)
    } else if (range === 'custom') {
      const [year, month, day] =
        customDate
          .split('-')
          .map(Number)

      const selectedStart =
        new Date(
          year,
          month - 1,
          day,
          0,
          0,
          0,
          0
        )

      const selectedEnd =
        new Date(
          year,
          month - 1,
          day,
          23,
          59,
          59,
          999
        )

      return {
        from: selectedStart.toISOString(),
        to: selectedEnd.toISOString()
      }
    } else {
      start.setDate(start.getDate() - 6)
      start.setHours(0, 0, 0, 0)
    }

    return {
      from: start.toISOString(),
      to: end.toISOString()
    }
  }

  const loadHistory = useCallback(
    async (
      range: HistoryRange =
        historyRange,
      customDate = historyCustomDate
    ) => {
      const token =
        localStorage.getItem(
          'maverick_token'
        )

      const deviceId =
        telemetry?.deviceId ||
        selectedDeviceId

      if (!token || !deviceId) {
        return
      }

      const {
        from,
        to
      } = getHistoryWindow(
        range,
        customDate
      )

      setHistoryLoading(true)
      setHistoryError('')
      setSelectedHistoryTripId('all')

      try {
        const params =
          new URLSearchParams({
            deviceId,
            from,
            to
          })

        const res =
          await fetch(
            `${API_BASE}/api/telemetry/history?${params.toString()}`,
            {
              headers: {
                Authorization:
                  `Bearer ${token}`
              }
            }
          )

        const data =
          await res.json()

        if (res.status === 401) {
          handleLogout()
          return
        }

        if (!res.ok || !data.ok) {
          setHistoryPoints([])
          setHistoryError(
            data.message ||
            'Unable to load trip history.'
          )
          return
        }

        setHistoryPoints(
          (data.points || []).map(
            (point: any) => ({
              id: Number(point.id),
              latitude:
                point.latitude == null
                  ? null
                  : Number(point.latitude),
              longitude:
                point.longitude == null
                  ? null
                  : Number(point.longitude),
              timestamp:
                String(point.timestamp),
              temperature:
                Number(point.temperature),
              altitude:
                point.altitude == null
                  ? null
                  : Number(point.altitude),
              speedKph:
                point.speedKph == null
                  ? null
                  : Number(point.speedKph),
              movementStatus:
                point.movementStatus == null
                  ? null
                  : String(
                      point.movementStatus
                    )
            })
          )
        )
      } catch {
        setHistoryPoints([])
        setHistoryError(
          'Unable to connect to Maverick.'
        )
      } finally {
        setHistoryLoading(false)
      }
    },
    [
      historyRange,
      historyCustomDate,
      selectedDeviceId,
      telemetry?.deviceId
    ]
  )

  const openTripHistory = () => {
    setHistoryOpen(true)
    loadHistory(
      historyRange,
      historyCustomDate
    )
  }

  const handleHistoryRangeChange = (
    range: HistoryRange
  ) => {
    setHistoryRange(range)

    if (range !== 'custom') {
      loadHistory(
        range,
        historyCustomDate
      )
    }
  }

  const historyGpsPoints =
    historyPoints.filter(
      (point) =>
        point.latitude != null &&
        point.longitude != null
    )

  const buildHistoryTrips = (
    points: HistoryPoint[]
  ): HistoryTrip[] => {
    if (points.length < 2) {
      return []
    }

    const trips: HistoryTrip[] = []
    let current: HistoryPoint[] = []

    const flush = () => {
      if (current.length < 2) {
        current = []
        return
      }

      const distance =
        current.reduce(
          (total, point, index) => {
            if (index === 0) {
              return 0
            }

            const previous =
              current[index - 1]

            if (
              previous.latitude == null ||
              previous.longitude == null ||
              point.latitude == null ||
              point.longitude == null
            ) {
              return total
            }

            return total +
              distanceMiles(
                previous.latitude,
                previous.longitude,
                point.latitude,
                point.longitude
              )
          },
          0
        )

      const tripStartMs = new Date(current[0].timestamp).getTime()
      const tripEndMs = new Date(
        current[current.length - 1].timestamp
      ).getTime()
      const durationMinutes = Math.max(
        0,
        (tripEndMs - tripStartMs) / 60000
      )

      // Ignore GPS drift / tiny repositioning. A trip must either
      // cover a meaningful distance for a few minutes, or be
      // clearly long enough to be a real movement segment.
      const isRealTrip =
        (distance >= 0.75 && durationMinutes >= 3) ||
        distance >= 2

      if (isRealTrip) {
        trips.push({
          id: trips.length + 1,
          points: current,
          start: current[0].timestamp,
          end:
            current[
              current.length - 1
            ].timestamp,
          distanceMiles: distance
        })
      }

      current = []
    }

    points.forEach(
      (point, index) => {
        if (index === 0) {
          current = [point]
          return
        }

        const previous =
          points[index - 1]

        const previousTime =
          new Date(
            previous.timestamp
          ).getTime()

        const currentTime =
          new Date(
            point.timestamp
          ).getTime()

        const gapMinutes =
          (currentTime - previousTime) /
          60000

        const stepDistance =
          previous.latitude != null &&
          previous.longitude != null &&
          point.latitude != null &&
          point.longitude != null
            ? distanceMiles(
                previous.latitude,
                previous.longitude,
                point.latitude,
                point.longitude
              )
            : 0

        const movingSignal =
          String(
            point.movementStatus || ''
          ).toUpperCase() === 'MOVING' ||
          (point.speedKph ?? 0) >= 5 ||
          stepDistance >= 0.03

        const shouldBreak =
          gapMinutes > 15 ||
          (!movingSignal &&
            current.length > 1 &&
            gapMinutes > 5)

        if (shouldBreak) {
          flush()
          current = [previous, point]
        } else {
          if (current.length === 0) {
            current = [previous]
          }
          current.push(point)
        }
      }
    )

    flush()
    return trips
  }

  const historyTrips =
    buildHistoryTrips(
      historyGpsPoints
    )

  const displayedHistoryPoints =
    selectedHistoryTripId === 'all'
      ? historyGpsPoints
      : historyTrips.find(
          (trip) =>
            trip.id ===
            selectedHistoryTripId
        )?.points || []

  const historyLatLngs =
    displayedHistoryPoints.map(
      (point) => [
        point.latitude as number,
        point.longitude as number
      ] as [number, number]
    )

  const historyDistanceMiles =
    displayedHistoryPoints.reduce(
      (total, point, index) => {
        if (index === 0) {
          return 0
        }

        const previous =
          displayedHistoryPoints[
            index - 1
          ]

        return total +
          distanceMiles(
            previous.latitude as number,
            previous.longitude as number,
            point.latitude as number,
            point.longitude as number
          )
      },
      0
    )

  const pointsWithSpeed =
    displayedHistoryPoints.filter(
      (point) =>
        point.speedKph != null &&
        Number.isFinite(
          point.speedKph
        )
    )

  const historyAverageSpeedMph =
    pointsWithSpeed.length > 0
      ? pointsWithSpeed.reduce(
          (total, point) =>
            total +
            (point.speedKph as number) *
              0.621371,
          0
        ) /
        pointsWithSpeed.length
      : 0

  const selectedHistoryTrip =
    selectedHistoryTripId === 'all'
      ? null
      : historyTrips.find(
          (trip) =>
            trip.id === selectedHistoryTripId
        ) || null

  const displayedTemperaturePoints =
    selectedHistoryTrip == null
      ? historyPoints
      : historyPoints.filter((point) => {
          const time = new Date(
            point.timestamp
          ).getTime()
          return (
            time >= new Date(
              selectedHistoryTrip.start
            ).getTime() &&
            time <= new Date(
              selectedHistoryTrip.end
            ).getTime()
          )
        })

  const historyTemperaturesF =
    displayedTemperaturePoints
      .map(
        (point) =>
          point.temperature *
            9 /
            5 +
          32
      )
      .filter(Number.isFinite)

  const historyMinTemperatureF =
    historyTemperaturesF.length > 0
      ? Math.min(
          ...historyTemperaturesF
        )
      : null

  const historyMaxTemperatureF =
    historyTemperaturesF.length > 0
      ? Math.max(
          ...historyTemperaturesF
        )
      : null

  const historyAverageTemperatureF =
    historyTemperaturesF.length > 0
      ? historyTemperaturesF.reduce(
          (total, value) =>
            total + value,
          0
        ) /
        historyTemperaturesF.length
      : null

  const temperatureChartWidth = 820
  const temperatureChartHeight = 230
  const temperatureChartPadding = 34

  const temperatureMinLimitF =
    selectedAsset?.temperatureMinC == null
      ? null
      : selectedAsset.temperatureMinC *
          9 /
          5 +
        32

  const temperatureMaxLimitF =
    selectedAsset?.temperatureMaxC == null
      ? null
      : selectedAsset.temperatureMaxC *
          9 /
          5 +
        32

  const chartTemperatures =
    historyTemperaturesF.length > 0
      ? [
          ...historyTemperaturesF,
          ...(temperatureMinLimitF == null
            ? []
            : [temperatureMinLimitF]),
          ...(temperatureMaxLimitF == null
            ? []
            : [temperatureMaxLimitF])
        ]
      : []

  const chartMin =
    chartTemperatures.length > 0
      ? Math.floor(
          Math.min(...chartTemperatures) -
            2
        )
      : 0

  const chartMax =
    chartTemperatures.length > 0
      ? Math.ceil(
          Math.max(...chartTemperatures) +
            2
        )
      : 1

  const chartRange =
    Math.max(
      1,
      chartMax - chartMin
    )

  const temperatureChartPoints =
    displayedTemperaturePoints
      .map((point, index) => {
        const temperatureF =
          point.temperature * 9 / 5 + 32

        const x =
          temperatureChartPadding +
          (displayedTemperaturePoints.length <= 1
            ? 0
            : index /
                (displayedTemperaturePoints.length - 1)) *
            (temperatureChartWidth -
              temperatureChartPadding * 2)

        const y =
          temperatureChartPadding +
          (chartMax - temperatureF) /
            chartRange *
            (temperatureChartHeight -
              temperatureChartPadding * 2)

        return {
          ...point,
          temperatureF,
          x,
          y
        }
      })
      .filter(
        (point) =>
          Number.isFinite(
            point.temperatureF
          )
      )

  const temperaturePolyline =
    temperatureChartPoints
      .map(
        (point) =>
          `${point.x},${point.y}`
      )
      .join(' ')

  const getLimitY = (
    limitF: number
  ) =>
    temperatureChartPadding +
    (chartMax - limitF) /
      chartRange *
      (temperatureChartHeight -
        temperatureChartPadding * 2)

  const openAssetOnMap = () => {
    setSearchTerm('')
    setStatusFilter('all')
    setAssetTypeFilter('all')
    setShowOnline(true)
    setShowDelayed(true)
    setShowOffline(true)
    setFiltersOpen(true)
    setActiveView('map')
  }

  const handleSearchKeyDown = (
    event:
      React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (
      event.key === 'Enter'
    ) {
      setActiveView('map')
      setFiltersOpen(true)
    }
  }

  // =====================================================
  // LOGIN SCREEN
  // =====================================================

  if (!isLoggedIn) {
    return (
      <Login
        onLogin={
          handleLogin
        }
      />
    )
  }

  // =====================================================
  // MAIN DASHBOARD
  // =====================================================

  return (
    <div className="mav-shell">

      {/* ================================= */}
      {/* HEADER */}
      {/* ================================= */}

      <header className="mav-header">

        <button
          className="mav-brand"
          onClick={() =>
            setActiveView('map')
          }
          type="button"
        >
          <img
            src={maverickLogo}
            alt="Maverick"
          />

          <strong>
            MAVERICK
          </strong>
        </button>

        <div className="mav-search">
          <span>⌕</span>

          <input
            type="text"
            value={
              searchTerm
            }
            onChange={
              (event) =>
                setSearchTerm(
                  event.target.value
                )
            }
            onKeyDown={
              handleSearchKeyDown
            }
            placeholder="Search trailer ID"
            aria-label="Search trailers"
          />

          {
            searchTerm && (
              <button
                className="clear-search"
                onClick={() =>
                  setSearchTerm('')
                }
                type="button"
                aria-label="Clear search"
              >
                ×
              </button>
            )
          }
        </div>

        <nav className="mav-nav">
          <button
            className={
              activeView === 'map'
                ? 'active'
                : ''
            }
            onClick={() =>
              setActiveView('map')
            }
          >
            Map
          </button>

          <button
            className={
              activeView === 'fleet'
                ? 'active'
                : ''
            }
            onClick={() =>
              setActiveView('fleet')
            }
          >
            Fleet
          </button>

          <button
            className={
              activeView ===
                'operations'
                ? 'active'
                : ''
            }
            onClick={() =>
              setActiveView(
                'operations'
              )
            }
          >
            Operations
          </button>

          <button
            className={
              activeView ===
                'monitors'
                ? 'active'
                : ''
            }
            onClick={() =>
              setActiveView(
                'monitors'
              )
            }
          >
            Monitors
          </button>

          <button
            className={
              activeView ===
                'reports'
                ? 'active'
                : ''
            }
            onClick={() =>
              setActiveView(
                'reports'
              )
            }
          >
            Reports
          </button>
        </nav>

        <div className="mav-header-actions">
          <button
            className={
              `icon-button ${
                notificationsOpen
                  ? 'active'
                  : ''
              }`
            }
            aria-label="Notifications"
            onClick={() => {
              setNotificationsOpen(
                !notificationsOpen
              )
              setHelpOpen(false)
            }}
            type="button"
          >
            🔔

            {
              activeAlertCount >
                0 && (
                <span className="notification-badge">
                  {
                    activeAlertCount
                  }
                </span>
              )
            }
          </button>

          <button
            className={
              `icon-button ${
                helpOpen
                  ? 'active'
                  : ''
              }`
            }
            aria-label="Help"
            onClick={() => {
              setHelpOpen(
                !helpOpen
              )
              setNotificationsOpen(
                false
              )
            }}
            type="button"
          >
            ?
          </button>

          <div className="user-chip">
            <div className="user-avatar">
              {userInitials}
            </div>

            <div className="user-chip-text">
              <strong>
                {userName}
              </strong>

              <span>
                {userRole}
              </span>
            </div>

            <button
              className="logout-link"
              onClick={
                handleLogout
              }
              type="button"
            >
              Logout
            </button>
          </div>
        </div>

      </header>

      {/* ================================= */}
      {/* STATUS BAR */}
      {/* ================================= */}

      <section className="mav-statusbar">

        <select
          value="all"
          aria-label="Fleet selector"
          onChange={() => {
            setSearchTerm('')
            setStatusFilter('all')
          }}
        >
          <option value="all">
            All Fleets
          </option>
        </select>

        <div className="metric-pill neutral">
          <span className="metric-dot" />

          <strong>
            {telemetry ? 1 : 0}
          </strong>

          Assets
        </div>

        <div className="metric-pill online">
          <span className="metric-dot" />

          <strong>
            {
              deviceStatus ===
                'online' &&
              telemetry
                ? 1
                : 0
            }
          </strong>

          Online
        </div>

        <div className="metric-pill delayed">
          <span className="metric-dot" />

          <strong>
            {
              deviceStatus ===
                'delayed' &&
              telemetry
                ? 1
                : 0
            }
          </strong>

          Delayed
        </div>

        <div className="metric-pill offline">
          <span className="metric-dot" />

          <strong>
            {
              deviceStatus ===
                'offline'
                ? 1
                : 0
            }
          </strong>

          Offline
        </div>

        <div className={`metric-pill movement ${movementStatus}`}>
          <span className="metric-dot" />

          <strong>
            {movementLabel}
          </strong>

          {movementStatus === 'moving'
            ? `${speedMph.toFixed(1)} mph`
            : ''}
        </div>

        <div className="statusbar-spacer" />

        {
          activeView === 'map' && (
            <button
              className="toolbar-button"
              onClick={() =>
                setFiltersOpen(
                  !filtersOpen
                )
              }
              type="button"
            >
              Filters
            </button>
          )
        }

        <button
          className="toolbar-button"
          onClick={() => {
            loadTelemetry()
            loadAssets()
          }}
          type="button"
        >
          Refresh
        </button>

        <div className="map-mode">
          <span>
            API {apiStatus}
          </span>

          <span>•</span>

          <span>
            {
              activeView === 'map'
                ? 'Live Map'
                : activeView
                    .charAt(0)
                    .toUpperCase() +
                  activeView.slice(1)
            }
          </span>
        </div>

      </section>

      {/* ================================= */}
      {/* WORKSPACE */}
      {/* ================================= */}

      <main className="map-workspace">

        {
          activeView === 'map' && (
            <>
              <MapContainer
                center={[
                  39.8283,
                  -98.5795
                ]}
                zoom={4}
                zoomControl={true}
                className="fleet-map"
              >

                <MapController
                  latitude={
                    markerVisible
                      ? telemetry?.latitude ??
                        null
                      : null
                  }
                  longitude={
                    markerVisible
                      ? telemetry?.longitude ??
                        null
                      : null
                  }
                />

                <TileLayer
                  attribution={
                    '&copy; OpenStreetMap contributors'
                  }
                  url={
                    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
                  }
                />

                {
                  showRoute &&
                  routeLatLngs.length > 1 && (
                    <Polyline
                      positions={routeLatLngs}
                      pathOptions={{
                        color: '#22c55e',
                        weight: 4,
                        opacity: 0.82
                      }}
                    />
                  )
                }

                {
                  markerVisible && (
                    <Marker
                      position={[
                        telemetry.latitude,
                        telemetry.longitude
                      ]}
                      icon={
                        trailerIcon
                      }
                      opacity={
                        telemetry.hasCurrentGps
                          ? 1
                          : 0.55
                      }
                    >
                      <Popup>
                        <div
                          className={
                            `map-popup map-popup-${deviceStatus}`
                          }
                        >
                          <strong>
                            {
                              selectedAssetName
                            }
                          </strong>

                          {
                            selectedAssetName !==
                              telemetry.deviceId && (
                              <>
                                <br />
                                Device ID:{' '}
                                {
                                  telemetry.deviceId
                                }
                              </>
                            )
                          }

                          <br />

                          Status:{' '}
                          {statusLabel}

                          <br />

                          Movement:{' '}
                          <strong className={`popup-movement ${movementStatus}`}>
                            {movementLabel}
                          </strong>

                          <br />

                          Speed:{' '}
                          {speedMph.toFixed(1)} mph

                          <br />

                          {temperatureLabel}:{' '}
                          {temperatureF}°F

                          <br />

                          {
                            telemetry.hasCurrentGps
                              ? 'Current GPS location'
                              : gpsAcquiring
                                ? '🟡 Acquiring GPS · showing last known location'
                                : 'Last known location'
                          }

                          <br />

                          Lat:{' '}
                          {
                            telemetry.latitude
                          }

                          <br />

                          Lon:{' '}
                          {
                            telemetry.longitude
                          }

                          {
                            telemetry.locationReceivedAt &&
                            (
                              <>
                                <br />

                                {
                                  telemetry.hasCurrentGps
                                    ? 'Location updated: '
                                    : 'Last valid location: '
                                }

                                {
                                  formatDateTime(
                                    telemetry.locationReceivedAt
                                  )
                                }
                              </>
                            )
                          }
                        </div>
                      </Popup>
                    </Marker>
                  )
                }

              </MapContainer>

              <div className="movement-legend">
                <span className="legend-title">Asset state</span>
                <span><i className="movement-dot moving" /> Moving</span>
                <span><i className="movement-dot parked" /> Parked</span>
                <span><i className="movement-dot acquiring" /> Acquiring</span>
                <span><i className="movement-dot offline" /> Offline</span>
                <button
                  type="button"
                  className={`route-toggle ${showRoute ? 'active' : ''}`}
                  onClick={() => setShowRoute(!showRoute)}
                >
                  {showRoute ? 'Hide route' : 'Show route'}
                </button>
              </div>

              {/* ================================= */}
              {/* FILTERS */}
              {/* ================================= */}

              {
                filtersOpen && (
                  <aside className="floating-panel filter-panel">

                    <div className="panel-title-row">
                      <h3>
                        Fleet Filters
                      </h3>

                      <button
                        className="panel-close"
                        onClick={() =>
                          setFiltersOpen(
                            false
                          )
                        }
                        type="button"
                        aria-label="Close filters"
                      >
                        ×
                      </button>
                    </div>

                    <select
                      value="all"
                      onChange={() =>
                        setSearchTerm('')
                      }
                    >
                      <option value="all">
                        All Fleets
                      </option>
                    </select>

                    <div className="filter-search">
                      <input
                        value={
                          searchTerm
                        }
                        onChange={
                          (event) =>
                            setSearchTerm(
                              event.target.value
                            )
                        }
                        placeholder="Search assets"
                        aria-label="Search assets"
                      />

                      {
                        searchTerm
                          ? (
                            <button
                              className="filter-clear"
                              onClick={() =>
                                setSearchTerm('')
                              }
                              type="button"
                            >
                              ×
                            </button>
                          )
                          : (
                            <span>
                              ⌕
                            </span>
                          )
                      }
                    </div>

                    <select
                      value={
                        assetTypeFilter
                      }
                      onChange={
                        (event) =>
                          setAssetTypeFilter(
                            event.target.value
                          )
                      }
                    >
                      <option value="all">
                        All Asset Types
                      </option>

                      <option value="trailer">
                        Trailer
                      </option>
                    </select>

                    <select
                      value={
                        statusFilter
                      }
                      onChange={
                        (event) =>
                          setStatusFilter(
                            event.target.value as StatusFilter
                          )
                      }
                    >
                      <option value="all">
                        All Statuses
                      </option>

                      <option value="online">
                        Online
                      </option>

                      <option value="delayed">
                        Delayed
                      </option>

                      <option value="offline">
                        Offline
                      </option>
                    </select>

                    <div className="panel-divider" />

                    <h4>
                      Status Legend
                    </h4>

                    <div className="legend-row">
                      <span className="legend-left">
                        <i className="legend-dot online" />
                        Online
                      </span>

                      <strong>
                        {
                          deviceStatus ===
                            'online' &&
                          telemetry
                            ? 1
                            : 0
                        }
                      </strong>
                    </div>

                    <div className="legend-row">
                      <span className="legend-left">
                        <i className="legend-dot delayed" />
                        Delayed
                      </span>

                      <strong>
                        {
                          deviceStatus ===
                            'delayed' &&
                          telemetry
                            ? 1
                            : 0
                        }
                      </strong>
                    </div>

                    <div className="legend-row">
                      <span className="legend-left">
                        <i className="legend-dot offline" />
                        Offline
                      </span>

                      <strong>
                        {
                          deviceStatus ===
                            'offline'
                            ? 1
                            : 0
                        }
                      </strong>
                    </div>

                    <div className="panel-divider" />

                    <h4>
                      Quick Toggles
                    </h4>

                    <label className="toggle-row">
                      <span>
                        <i className="legend-dot online" />
                        Online
                      </span>

                      <input
                        type="checkbox"
                        checked={
                          showOnline
                        }
                        onChange={
                          (event) =>
                            setShowOnline(
                              event.target.checked
                            )
                        }
                      />

                      <i className="toggle" />
                    </label>

                    <label className="toggle-row">
                      <span>
                        <i className="legend-dot delayed" />
                        Delayed
                      </span>

                      <input
                        type="checkbox"
                        checked={
                          showDelayed
                        }
                        onChange={
                          (event) =>
                            setShowDelayed(
                              event.target.checked
                            )
                        }
                      />

                      <i className="toggle" />
                    </label>

                    <label className="toggle-row">
                      <span>
                        <i className="legend-dot offline" />
                        Offline
                      </span>

                      <input
                        type="checkbox"
                        checked={
                          showOffline
                        }
                        onChange={
                          (event) =>
                            setShowOffline(
                              event.target.checked
                            )
                        }
                      />

                      <i className="toggle" />
                    </label>

                    {
                      !assetVisible &&
                      telemetry && (
                        <div className="filter-empty">
                          No asset matches the current filters.
                        </div>
                      )
                    }

                  </aside>
                )
              }

              {/* ================================= */}
              {/* ASSET DETAILS */}
              {/* ================================= */}

              <aside className="floating-panel asset-panel">

                {
                  telemetry &&
                  assetVisible
                    ? (
                      <>
                        <div className="asset-head">

                          <div
                            className={
                              `asset-status-icon ${movementStatus}`
                            }
                          >
                            ◈
                          </div>

                          <div>
                            <strong>
                              {
                                selectedAssetName
                              }
                            </strong>

                            {
                              selectedAssetName !==
                                telemetry.deviceId && (
                                <small className="asset-device-id">
                                  {
                                    telemetry.deviceId
                                  }
                                </small>
                              )
                            }

                            <div
                              className={
                                `asset-state ${deviceStatus}`
                              }
                            >
                              {statusLabel}

                              <span>•</span>

                              {
                                formatAge(
                                  telemetry.receivedAt
                                )
                              }
                            </div>


                            <div className={`movement-state ${movementStatus}`}>
                              <span className="movement-dot" />
                              {movementLabel}
                              {movementStatus === 'moving' && (
                                <>
                                  <span>•</span>
                                  {speedMph.toFixed(1)} mph
                                </>
                              )}
                            </div>
                          </div>

                        </div>

                        <div className="panel-divider" />

                        <dl className="asset-details">

                          <div>
                            <dt>
                              {temperatureLabel}
                            </dt>

                            <dd>
                              {temperatureF}°F
                            </dd>
                          </div>

                          <div>
                            <dt>
                              Movement
                            </dt>

                            <dd>
                              <span className={`inline-movement ${movementStatus}`}>
                                {movementLabel}
                              </span>
                            </dd>
                          </div>

                          <div>
                            <dt>
                              Speed
                            </dt>

                            <dd>
                              {speedMph.toFixed(1)} mph
                            </dd>
                          </div>

                          <div>
                            <dt>
                              GPS
                            </dt>

                            <dd>
                              {
                                gpsStatusText
                              }
                            </dd>
                          </div>

                          <div>
                            <dt>
                              Last Ping
                            </dt>

                            <dd>
                              {
                                formatDateTime(
                                  telemetry.receivedAt
                                )
                              }
                            </dd>
                          </div>

                          <div>
                            <dt>
                              {
                                locationLabel
                              }
                            </dt>

                            <dd className="location-value">
                              {
                                hasLocation
                                  ? (
                                    <>
                                      {
                                        telemetry.latitude.toFixed(
                                          6
                                        )
                                      }
                                      ,{' '}
                                      {
                                        telemetry.longitude.toFixed(
                                          6
                                        )
                                      }
                                    </>
                                  )
                                  : 'No GPS location'
                              }
                            </dd>
                          </div>

                          <div>
                            <dt>
                              {
                                locationTimeLabel
                              }
                            </dt>

                            <dd>
                              {
                                formatDateTime(
                                  telemetry.locationReceivedAt
                                )
                              }
                            </dd>
                          </div>

                        </dl>

                        <div className="asset-action-stack">
                          <button
                            className="view-details-button"
                            onClick={() =>
                              setDetailsOpen(
                                true
                              )
                            }
                            type="button"
                          >
                            View Details
                          </button>

                          <button
                            className="history-button"
                            onClick={
                              openTripHistory
                            }
                            type="button"
                          >
                            Trip History
                          </button>
                        </div>
                      </>
                    )
                    : (
                      <div className="empty-panel">
                        <strong>
                          {
                            telemetry
                              ? 'No matching asset'
                              : 'No telemetry yet'
                          }
                        </strong>

                        <span>
                          {
                            telemetry
                              ? 'Change the search or filters to show TRAILER-001.'
                              : 'Waiting for asset data...'
                          }
                        </span>
                      </div>
                    )
                }

              </aside>

              {/* ================================= */}
              {/* BOTTOM DOCK */}
              {/* ================================= */}

<section
  className={
    `bottom-dock ${
      bottomDockOpen
        ? 'open'
        : 'collapsed'
    }`
  }
>
  <div className="bottom-dock-bar">

    <button
      className="dock-summary-button"
      onClick={() =>
        setNotificationsOpen(true)
      }
      type="button"
    >
      Alerts
      <span
        className={
          activeAlertCount > 0
            ? 'dock-count alert'
            : 'dock-count'
        }
      >
        {activeAlertCount}
      </span>
    </button>

    <button
      className="dock-summary-button"
      onClick={() =>
        setActiveView('fleet')
      }
      type="button"
    >
      My Assets
      <span className="dock-count">
        {assets.length || (telemetry ? 1 : 0)}
      </span>
    </button>

    <div className="dock-bar-spacer" />

    <button
      className="dock-expand-button"
      onClick={() =>
        setBottomDockOpen(
          !bottomDockOpen
        )
      }
      type="button"
    >
      {
        bottomDockOpen
          ? '▼ Collapse'
          : '▲ Expand'
      }
    </button>

  </div>

  {
    bottomDockOpen && (
      <div className="bottom-dock-content">

        <div className="recent-alerts">
          <div className="dock-heading">
            <strong>
              Recent Alerts
            </strong>

            {
              activeAlertCount > 0 && (
                <span className="alert-count visible">
                  {activeAlertCount}
                </span>
              )
            }
          </div>

          {
            activeAlertCount === 0
              ? (
                <div className="no-alerts">
                  No active alerts.
                </div>
              )
              : (
                <>
                  {
                    temperatureOutOfRange && (
                      <button
                        className="alert-item alert-button"
                        onClick={() =>
                          setNotificationsOpen(true)
                        }
                        type="button"
                      >
                        <div className="mini-status offline">
                          !
                        </div>

                        <div>
                          <strong>
                            {
                              temperatureAboveLimit
                                ? 'High Temperature'
                                : 'Low Temperature'
                            }
                          </strong>

                          <span>
                            {selectedAssetName}
                          </span>

                          <small>
                            Current: {temperatureF}°F
                            {' · '}
                            Limit:{' '}
                            {
                              temperatureAboveLimit
                                ? `${celsiusToFahrenheit(
                                    Number(
                                      selectedAsset?.temperatureMaxC
                                    )
                                  ).toFixed(1)}°F max`
                                : `${celsiusToFahrenheit(
                                    Number(
                                      selectedAsset?.temperatureMinC
                                    )
                                  ).toFixed(1)}°F min`
                            }
                          </small>
                        </div>
                      </button>
                    )
                  }

                  {
                    deviceStatus !== 'online' && (
                      <button
                        className="alert-item alert-button"
                        onClick={() =>
                          setNotificationsOpen(true)
                        }
                        type="button"
                      >
                        <div
                          className={
                            `mini-status ${deviceStatus}`
                          }
                        >
                          !
                        </div>

                        <div>
                          <strong>
                            {
                              deviceStatus === 'offline'
                                ? 'Trailer Offline'
                                : 'Telemetry Delayed'
                            }
                          </strong>

                          <span>
                            {selectedAssetName}
                          </span>

                          <small>
                            {
                              telemetry?.receivedAt
                                ? formatAge(
                                    telemetry.receivedAt
                                  )
                                : 'No recent telemetry'
                            }
                          </small>
                        </div>
                      </button>
                    )
                  }
                </>
              )
          }
        </div>

        <div className="my-assets">
          <div className="dock-heading">
            <strong>
              My Assets
            </strong>

            <button
              className="view-all"
              onClick={() =>
                setActiveView('fleet')
              }
              type="button"
            >
              View All
            </button>
          </div>

          <div className="asset-card-row">
            {
              telemetry
                ? (
                  <button
                    className={
                      `asset-mini-card ${deviceStatus}`
                    }
                    onClick={
                      openAssetOnMap
                    }
                    type="button"
                  >
                    <div
                      className={
                        `mini-status ${deviceStatus}`
                      }
                    >
                      ◈
                    </div>

                    <div>
                      <strong>
                        {selectedAssetName}
                      </strong>

                      <span>
                        {statusLabel}
                      </span>

                      <small>
                        {
                          formatAge(
                            telemetry.receivedAt
                          )
                        }
                      </small>
                    </div>
                  </button>
                )
                : (
                  <span className="no-assets">
                    No assets available.
                  </span>
                )
            }
          </div>
        </div>

      </div>
    )
  }

</section>
            </>
          )
        }

        {/* ================================= */}
        {/* FLEET PAGE */}
        {/* ================================= */}

        {
          activeView === 'fleet' && (
            <section className="workspace-page">

              <div className="page-header">
                <div>
                  <span className="page-kicker">
                    Fleet
                  </span>

                  <h1>
                    Fleet Assets
                  </h1>

                  <p>
                    Assets available to your company account.
                  </p>
                </div>

                <button
                  className="primary-action"
                  onClick={
                    openAssetOnMap
                  }
                  type="button"
                >
                  Open Live Map
                </button>
              </div>

              <div className="page-card">

                <div className="table-header">
                  <span>
                    Asset
                  </span>

                  <span>
                    Status
                  </span>

                  <span>
                    Movement
                  </span>

                  <span>
                    Temperature
                  </span>

                  <span>
                    Last Ping
                  </span>

                  <span>
                    Action
                  </span>
                </div>

                {
                  telemetry
                    ? (
                      <div className="fleet-row">
                        <div className="fleet-asset-name">
                          <span
                            className={
                              `mini-status ${deviceStatus}`
                            }
                          >
                            ◈
                          </span>

                          <div>
                            <strong>
                              {
                                selectedAssetName
                              }
                            </strong>

                            <small>
                              {
                                telemetry.deviceId
                              }
                            </small>
                          </div>
                        </div>

                        <span
                          className={
                            `inline-status ${deviceStatus}`
                          }
                        >
                          {statusLabel}
                        </span>

                        <span className={`inline-movement ${movementStatus}`}>
                          {movementLabel}
                          {movementStatus === 'moving'
                            ? ` · ${speedMph.toFixed(1)} mph`
                            : ''}
                        </span>

                        <span>
                          {
                            deviceStatus === 'online'
                              ? `${temperatureF}°F`
                              : `Last ${temperatureF}°F`
                          }
                        </span>

                        <span>
                          {
                            formatDateTime(
                              telemetry.receivedAt
                            )
                          }
                        </span>

                        <div className="row-actions">
                          <button
                            onClick={
                              openAssetOnMap
                            }
                            type="button"
                          >
                            Locate
                          </button>

                          <button
                            onClick={
                              openRenameAsset
                            }
                            type="button"
                            disabled={
                              !selectedAsset
                            }
                          >
                            Rename
                          </button>

                          <button
                            onClick={
                              openTemperatureLimits
                            }
                            type="button"
                            disabled={
                              !selectedAsset
                            }
                          >
                            Temp Limits
                          </button>

                          <button
                            onClick={() =>
                              setDetailsOpen(
                                true
                              )
                            }
                            type="button"
                          >
                            Details
                          </button>
                        </div>
                      </div>
                    )
                    : (
                      <div className="page-empty">
                        No fleet telemetry is available yet.
                      </div>
                    )
                }

              </div>

            </section>
          )
        }

        {/* ================================= */}
        {/* OPERATIONS PAGE */}
        {/* ================================= */}

        {
          activeView ===
            'operations' && (
            <section className="workspace-page">

              <div className="page-header">
                <div>
                  <span className="page-kicker">
                    Operations
                  </span>

                  <h1>
                    Operations Center
                  </h1>

                  <p>
                    Live operational controls using the telemetry currently available.
                  </p>
                </div>
              </div>

              <div className="dashboard-grid">

                <article className="page-card action-card">
                  <span className="card-label">
                    Selected Asset
                  </span>

                  <strong className="large-value">
                    {
                      selectedDeviceId
                    }
                  </strong>

                  <span
                    className={
                      `inline-status ${deviceStatus}`
                    }
                  >
                    {statusLabel}
                  </span>

                  <button
                    className="primary-action"
                    onClick={
                      openAssetOnMap
                    }
                    type="button"
                  >
                    Locate on Map
                  </button>
                </article>

                <article className="page-card action-card">
                  <span className="card-label">
                    Telemetry
                  </span>

                  <strong className="large-value">
                    {temperatureF}°F
                  </strong>

                  <span className="muted-text">
                    Last ping:{' '}
                    {
                      formatAge(
                        telemetry?.receivedAt
                      )
                    }
                  </span>

                  <button
                    className="secondary-action"
                    onClick={
                      loadTelemetry
                    }
                    type="button"
                  >
                    Refresh Now
                  </button>
                </article>

                <article className="page-card action-card">
                  <span className="card-label">
                    Dispatch
                  </span>

                  <strong className="large-value">
                    0
                  </strong>

                  <span className="muted-text">
                    No dispatch jobs are connected to the backend yet.
                  </span>
                </article>

              </div>

            </section>
          )
        }

        {/* ================================= */}
        {/* MONITORS PAGE */}
        {/* ================================= */}

        {
          activeView ===
            'monitors' && (
            <section className="workspace-page">

              <div className="page-header">
                <div>
                  <span className="page-kicker">
                    Monitors
                  </span>

                  <h1>
                    Device Health
                  </h1>

                  <p>
                    Current health snapshot for the connected trailer.
                  </p>
                </div>
              </div>

              <div className="dashboard-grid monitor-grid">

                <article className="page-card monitor-card">
                  <span>
                    API
                  </span>

                  <strong>
                    {apiStatus}
                  </strong>
                </article>

                <article className="page-card monitor-card">
                  <span>
                    Device
                  </span>

                  <strong>
                    {statusLabel}
                  </strong>
                </article>

                <article className="page-card monitor-card">
                  <span>
                    Movement
                  </span>

                  <strong className={`monitor-movement ${movementStatus}`}>
                    {movementLabel}
                  </strong>
                </article>

                <article className="page-card monitor-card">
                  <span>
                    Speed
                  </span>

                  <strong>
                    {speedMph.toFixed(1)} mph
                  </strong>
                </article>

                <article className="page-card monitor-card">
                  <span>
                    {temperatureLabel}
                  </span>

                  <strong>
                    {temperatureF}°F
                  </strong>
                </article>

                <article className="page-card monitor-card">
                  <span>
                    GPS
                  </span>

                  <strong>
                    {
                      gpsStatusText
                    }
                  </strong>
                </article>

              </div>

              <div className="page-card monitor-detail">
                <h2>
                  Latest Telemetry
                </h2>

                <dl className="report-list">
                  <div>
                    <dt>
                      Device ID
                    </dt>

                    <dd>
                      {
                        telemetry?.deviceId ||
                        'Unknown'
                      }
                    </dd>
                  </div>

                  <div>
                    <dt>
                      Last telemetry
                    </dt>

                    <dd>
                      {
                        formatDateTime(
                          telemetry?.receivedAt
                        )
                      }
                    </dd>
                  </div>

                  <div>
                    <dt>
                      Last location
                    </dt>

                    <dd>
                      {
                        formatDateTime(
                          telemetry?.locationReceivedAt
                        )
                      }
                    </dd>
                  </div>
                </dl>
              </div>

            </section>
          )
        }

        {/* ================================= */}
        {/* REPORTS PAGE */}
        {/* ================================= */}

        {
          activeView ===
            'reports' && (
            <section className="workspace-page">

              <div className="page-header">
                <div>
                  <span className="page-kicker">
                    Reports
                  </span>

                  <h1>
                    Current Fleet Snapshot
                  </h1>

                  <p>
                    This report uses the latest telemetry currently provided by the backend.
                  </p>
                </div>

                <button
                  className="primary-action"
                  onClick={() =>
                    window.print()
                  }
                  type="button"
                >
                  Print Report
                </button>
              </div>

              <div className="page-card report-card">

                <dl className="report-list">

                  <div>
                    <dt>
                      Asset
                    </dt>

                    <dd>
                      {
                        selectedAssetName
                      }
                    </dd>
                  </div>

                  <div>
                    <dt>
                      Status
                    </dt>

                    <dd>
                      {statusLabel}
                    </dd>
                  </div>

                  <div>
                    <dt>
                      {temperatureLabel}
                    </dt>

                    <dd>
                      {temperatureF}°F
                    </dd>
                  </div>

                  <div>
                    <dt>
                      Last telemetry
                    </dt>

                    <dd>
                      {
                        formatDateTime(
                          telemetry?.receivedAt
                        )
                      }
                    </dd>
                  </div>

                  <div>
                    <dt>
                      Last location update
                    </dt>

                    <dd>
                      {
                        formatDateTime(
                          telemetry?.locationReceivedAt
                        )
                      }
                    </dd>
                  </div>

                  <div>
                    <dt>
                      Coordinates
                    </dt>

                    <dd>
                      {
                        hasLocation
                          ? `${telemetry.latitude.toFixed(
                              6
                            )}, ${telemetry.longitude.toFixed(
                              6
                            )}`
                          : 'No GPS location'
                      }
                    </dd>
                  </div>

                </dl>

                <p className="report-note">
                  Historical charts and date-range reports will need a backend history endpoint; this page intentionally does not invent historical data.
                </p>

              </div>

            </section>
          )
        }

      </main>

      {/* ================================= */}
      {/* NOTIFICATIONS */}
      {/* ================================= */}

      {
        notificationsOpen && (
          <aside className="header-popover notifications-popover">

            <div className="popover-header">
              <strong>
                Notifications
              </strong>

              <button
                onClick={() =>
                  setNotificationsOpen(
                    false
                  )
                }
                type="button"
              >
                ×
              </button>
            </div>

            {
              activeAlertCount === 0
                ? (
                  <p>
                    No active alerts.
                  </p>
                )
                : (
                  <>
                    {
                      temperatureOutOfRange && (
                        <button
                          className="popover-alert"
                          onClick={() => {
                            setNotificationsOpen(
                              false
                            )
                            setDetailsOpen(true)
                          }}
                          type="button"
                        >
                          <span className="mini-status offline">
                            !
                          </span>

                          <div>
                            <strong>
                              {
                                temperatureAboveLimit
                                  ? 'High Temperature Alert'
                                  : 'Low Temperature Alert'
                              }
                            </strong>

                            <small>
                              {selectedAssetName}
                              {' · '}
                              Current {temperatureF}°F
                              {' · '}
                              {
                                temperatureAboveLimit
                                  ? `Max ${celsiusToFahrenheit(
                                      Number(
                                        selectedAsset?.temperatureMaxC
                                      )
                                    ).toFixed(1)}°F`
                                  : `Min ${celsiusToFahrenheit(
                                      Number(
                                        selectedAsset?.temperatureMinC
                                      )
                                    ).toFixed(1)}°F`
                              }
                            </small>
                          </div>
                        </button>
                      )
                    }

                    {
                      deviceStatus !== 'online' && (
                        <button
                          className="popover-alert"
                          onClick={() => {
                            setNotificationsOpen(
                              false
                            )
                            openAssetOnMap()
                          }}
                          type="button"
                        >
                          <span
                            className={
                              `mini-status ${deviceStatus}`
                            }
                          >
                            !
                          </span>

                          <div>
                            <strong>
                              {
                                deviceStatus ===
                                  'offline'
                                  ? 'Trailer Offline'
                                  : 'Telemetry Delayed'
                              }
                            </strong>

                            <small>
                              {
                                telemetry?.deviceId ||
                                selectedDeviceId
                              }
                              {' · '}
                              {
                                formatAge(
                                  telemetry?.receivedAt
                                )
                              }
                            </small>
                          </div>
                        </button>
                      )
                    }
                  </>
                )
            }

          </aside>
        )
      }

      {/* ================================= */}
      {/* HELP */}
      {/* ================================= */}

      {
        helpOpen && (
          <aside className="header-popover help-popover">

            <div className="popover-header">
              <strong>
                Maverick Help
              </strong>

              <button
                onClick={() =>
                  setHelpOpen(
                    false
                  )
                }
                type="button"
              >
                ×
              </button>
            </div>

            <p>
              Use Map to locate assets, Fleet to view your assigned trailers, Monitors for live device health, and Reports for the current fleet snapshot.
            </p>

            <p>
              Filters and status toggles on the map now control which asset markers are visible.
            </p>

          </aside>
        )
      }

      {/* ================================= */}
      {/* DETAILS MODAL */}
      {/* ================================= */}

      {
        detailsOpen && (
          <div
            className="modal-backdrop"
            onMouseDown={() =>
              setDetailsOpen(
                false
              )
            }
          >
            <section
              className="details-modal"
              onMouseDown={
                (event) =>
                  event.stopPropagation()
              }
            >

              <div className="modal-header">
                <div>
                  <span className="page-kicker">
                    Asset Details
                  </span>

                  <h2>
                    {
                      selectedAssetName
                    }
                  </h2>

                  {
                    telemetry?.deviceId &&
                    selectedAssetName !==
                      telemetry.deviceId && (
                      <small className="modal-device-id">
                        Device ID:{' '}
                        {
                          telemetry.deviceId
                        }
                      </small>
                    )
                  }
                </div>

                <button
                  className="modal-close"
                  onClick={() =>
                    setDetailsOpen(
                      false
                    )
                  }
                  type="button"
                >
                  ×
                </button>
              </div>

              <dl className="report-list">
                <div>
                  <dt>
                    Status
                  </dt>

                  <dd>
                    {statusLabel}
                  </dd>
                </div>

                <div>
                  <dt>
                    Temperature
                  </dt>

                  <dd>
                    {temperatureF}°F
                  </dd>
                </div>

                <div>
                  <dt>
                    Temperature Limits
                  </dt>

                  <dd>
                    {
                      selectedAsset
                        ?.temperatureMinC != null &&
                      selectedAsset
                        ?.temperatureMaxC != null
                        ? `${celsiusToFahrenheit(
                            Number(
                              selectedAsset.temperatureMinC
                            )
                          ).toFixed(1)}°F – ${celsiusToFahrenheit(
                            Number(
                              selectedAsset.temperatureMaxC
                            )
                          ).toFixed(1)}°F`
                        : 'Not configured'
                    }
                  </dd>
                </div>

                <div>
                  <dt>
                    Temperature Alerts
                  </dt>

                  <dd>
                    {
                      selectedAsset
                        ?.temperatureAlertsEnabled
                        ? temperatureOutOfRange
                          ? 'ACTIVE ALERT'
                          : 'Enabled'
                        : 'Disabled'
                    }
                  </dd>
                </div>

                <div>
                  <dt>
                    Movement
                  </dt>

                  <dd>
                    {movementLabel}
                  </dd>
                </div>

                <div>
                  <dt>
                    Speed
                  </dt>

                  <dd>
                    {speedMph.toFixed(1)} mph
                  </dd>
                </div>

                <div>
                  <dt>
                    GPS
                  </dt>

                  <dd>
                    {
                      gpsDetailText
                    }
                  </dd>
                </div>

                <div>
                  <dt>
                    Last telemetry
                  </dt>

                  <dd>
                    {
                      formatDateTime(
                        telemetry?.receivedAt
                      )
                    }
                  </dd>
                </div>

                <div>
                  <dt>
                    {
                      telemetry?.hasCurrentGps
                        ? 'Location updated'
                        : 'Last valid location'
                    }
                  </dt>

                  <dd>
                    {
                      formatDateTime(
                        telemetry?.locationReceivedAt
                      )
                    }
                  </dd>
                </div>

                <div>
                  <dt>
                    {
                      telemetry?.hasCurrentGps
                        ? 'Coordinates'
                        : hasLocation
                          ? 'Last known coordinates'
                          : 'Coordinates'
                    }
                  </dt>

                  <dd>
                    {
                      hasLocation
                        ? `${telemetry.latitude.toFixed(
                            6
                          )}, ${telemetry.longitude.toFixed(
                            6
                          )}`
                        : 'No GPS location'
                    }
                  </dd>
                </div>
              </dl>

              <div className="modal-actions">
                <button
                  className="secondary-action"
                  onClick={() =>
                    setDetailsOpen(
                      false
                    )
                  }
                  type="button"
                >
                  Close
                </button>

                <button
                  className="secondary-action"
                  onClick={() => {
                    setDetailsOpen(false)
                    openTemperatureLimits()
                  }}
                  type="button"
                  disabled={
                    !selectedAsset
                  }
                >
                  Temp Limits
                </button>

                <button
                  className="primary-action"
                  onClick={() => {
                    setDetailsOpen(
                      false
                    )
                    openAssetOnMap()
                  }}
                  type="button"
                >
                  Locate on Map
                </button>
              </div>

            </section>
          </div>
        )
      }

      {/* ================================= */}
      {/* RENAME ASSET MODAL */}
      {/* ================================= */}

      {
        renameOpen && (
          <div
            className="modal-backdrop"
            onMouseDown={() => {
              if (!renameSaving) {
                setRenameOpen(false)
                setRenameError('')
              }
            }}
          >
            <section
              className="details-modal rename-modal"
              onMouseDown={
                (event) =>
                  event.stopPropagation()
              }
            >
              <div className="modal-header">
                <div>
                  <span className="page-kicker">
                    Rename Asset
                  </span>

                  <h2>
                    {
                      telemetry?.deviceId ||
                      selectedDeviceId
                    }
                  </h2>
                </div>

                <button
                  className="modal-close"
                  onClick={() => {
                    setRenameOpen(false)
                    setRenameError('')
                  }}
                  type="button"
                  disabled={
                    renameSaving
                  }
                >
                  ×
                </button>
              </div>

              <div className="rename-form">
                <label
                  htmlFor="asset-name"
                >
                  Display name
                </label>

                <input
                  id="asset-name"
                  type="text"
                  value={
                    renameValue
                  }
                  onChange={
                    (event) =>
                      setRenameValue(
                        event.target.value
                      )
                  }
                  onKeyDown={
                    (event) => {
                      if (
                        event.key ===
                          'Enter' &&
                        !renameSaving
                      ) {
                        handleRenameAsset()
                      }
                    }
                  }
                  maxLength={80}
                  autoFocus
                  placeholder="Example: Reefer Salinas 12"
                />

                <div className="rename-help">
                  <span>
                    The hardware ID remains{' '}
                    <strong>
                      {
                        telemetry?.deviceId ||
                        selectedDeviceId
                      }
                    </strong>.
                  </span>

                  <span>
                    {
                      renameValue.trim().length
                    }/80
                  </span>
                </div>

                {
                  renameError && (
                    <div className="rename-error">
                      {
                        renameError
                      }
                    </div>
                  )
                }
              </div>

              <div className="modal-actions">
                <button
                  className="secondary-action"
                  onClick={() => {
                    setRenameOpen(false)
                    setRenameError('')
                  }}
                  type="button"
                  disabled={renameSaving}
                >
                  Cancel
                </button>

                <button
                  className="primary-action"
                  onClick={handleRenameAsset}
                  type="button"
                  disabled={
                    renameSaving ||
                    renameValue.trim().length < 2
                  }
                >
                  {
                    renameSaving
                      ? 'Saving...'
                      : 'Save Name'
                  }
                </button>
              </div>
            </section>
          </div>
        )
      }

      {/* ================================= */}
      {/* TRIP + TEMPERATURE HISTORY MODAL */}
      {/* ================================= */}

      {
        historyOpen && (
          <div
            className="modal-backdrop"
            onMouseDown={() =>
              setHistoryOpen(false)
            }
          >
            <section
              className="details-modal history-modal"
              onMouseDown={
                (event) =>
                  event.stopPropagation()
              }
            >
              <div className="modal-header">
                <div>
                  <span className="page-kicker">
                    Trip & Temperature History
                  </span>

                  <h2>
                    {selectedAssetName}
                  </h2>

                  <small className="modal-device-id">
                    {
                      telemetry?.deviceId ||
                      selectedDeviceId
                    }
                  </small>
                </div>

                <button
                  className="modal-close"
                  onClick={() =>
                    setHistoryOpen(false)
                  }
                  type="button"
                >
                  ×
                </button>
              </div>

              <div className="history-toolbar">
                <label>
                  Range
                  <select
                    value={historyRange}
                    onChange={
                      (event) =>
                        handleHistoryRangeChange(
                          event.target.value as
                            HistoryRange
                        )
                    }
                  >
                    <option value="today">
                      Today
                    </option>
                    <option value="yesterday">
                      Yesterday
                    </option>
                    <option value="7days">
                      Last 7 days
                    </option>
                    <option value="custom">
                      Custom date
                    </option>
                  </select>
                </label>

                {
                  historyRange ===
                    'custom' && (
                    <label>
                      Date
                      <input
                        className="history-date-input"
                        type="date"
                        value={historyCustomDate}
                        onChange={(event) =>
                          setHistoryCustomDate(
                            event.target.value
                          )
                        }
                      />
                    </label>
                  )
                }

                <button
                  className="secondary-action"
                  onClick={() =>
                    loadHistory(
                      historyRange,
                      historyCustomDate
                    )
                  }
                  type="button"
                  disabled={historyLoading}
                >
                  {
                    historyLoading
                      ? 'Loading...'
                      : historyRange ===
                          'custom'
                        ? 'Load Date'
                        : 'Refresh'
                  }
                </button>
              </div>

              {
                historyError && (
                  <div className="rename-error">
                    {historyError}
                  </div>
                )
              }

              {
                !historyLoading &&
                !historyError &&
                historyPoints.length ===
                  0 && (
                  <div className="history-empty">
                    No telemetry history is available for this range yet.
                  </div>
                )
              }

              {
                historyPoints.length > 0 && (
                  <>
                    <div className="history-stats">
                      <div>
                        <span>
                          GPS Points
                        </span>
                        <strong>
                          {historyGpsPoints.length}
                        </strong>
                      </div>

                      <div>
                        <span>
                          Distance
                        </span>
                        <strong>
                          {
                            historyDistanceMiles
                              .toFixed(1)
                          } mi
                        </strong>
                      </div>

                      <div>
                        <span>
                          Avg Speed
                        </span>
                        <strong>
                          {
                            historyAverageSpeedMph
                              .toFixed(1)
                          } mph
                        </strong>
                      </div>
                    </div>

                    {
                      historyTrips.length > 0 && (
                        <div className="history-trip-strip">
                          <button
                            className={
                              selectedHistoryTripId ===
                                'all'
                                ? 'active'
                                : ''
                            }
                            onClick={() =>
                              setSelectedHistoryTripId(
                                'all'
                              )
                            }
                            type="button"
                          >
                            All activity
                          </button>

                          {
                            historyTrips.map(
                              (trip) => (
                                <button
                                  key={trip.id}
                                  className={
                                    selectedHistoryTripId ===
                                      trip.id
                                      ? 'active'
                                      : ''
                                  }
                                  onClick={() =>
                                    setSelectedHistoryTripId(
                                      trip.id
                                    )
                                  }
                                  type="button"
                                >
                                  Trip {trip.id}
                                  <small>
                                    {trip.distanceMiles.toFixed(1)} mi
                                  </small>
                                </button>
                              )
                            )
                          }
                        </div>
                      )
                    }

                    <div className="history-content-grid">
                      <div className="history-route-column">
                    {
                      historyLatLngs.length > 0 ? (
                        <div className="history-map">
                          <MapContainer
                            key={
                              `${historyRange}-${historyCustomDate}-${selectedHistoryTripId}`
                            }
                            center={
                              historyLatLngs[
                                historyLatLngs.length - 1
                              ]
                            }
                            zoom={12}
                            scrollWheelZoom
                            className="history-leaflet-map"
                          >
                            <TileLayer
                              attribution='&copy; OpenStreetMap contributors'
                              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            />

                            {
                              historyLatLngs.length > 1 && (
                                <Polyline
                                  positions={historyLatLngs}
                                />
                              )
                            }

                            <Marker
                              position={historyLatLngs[0]}
                            >
                              <Popup>
                                Start
                                <br />
                                {
                                  formatDateTime(
                                    displayedHistoryPoints[0]
                                      .timestamp
                                  )
                                }
                              </Popup>
                            </Marker>

                            <Marker
                              position={
                                historyLatLngs[
                                  historyLatLngs.length - 1
                                ]
                              }
                            >
                              <Popup>
                                Last point
                                <br />
                                {
                                  formatDateTime(
                                    displayedHistoryPoints[
                                      displayedHistoryPoints.length - 1
                                    ].timestamp
                                  )
                                }
                              </Popup>
                            </Marker>
                          </MapContainer>
                        </div>
                      ) : (
                        <div className="history-empty compact">
                          Temperature readings exist, but there are no GPS points for this selection.
                        </div>
                      )
                    }

                    {
                      displayedHistoryPoints.length > 0 && (
                        <div className="history-time-row">
                          <span>
                            Start:{' '}
                            <strong>
                              {
                                formatDateTime(
                                  displayedHistoryPoints[0]
                                    .timestamp
                                )
                              }
                            </strong>
                          </span>

                          <span>
                            Last point:{' '}
                            <strong>
                              {
                                formatDateTime(
                                  displayedHistoryPoints[
                                    displayedHistoryPoints.length - 1
                                  ].timestamp
                                )
                              }
                            </strong>
                          </span>
                        </div>
                      )
                    }

                      </div>

                    <div className="temperature-history-section history-temperature-column">
                      <div className="temperature-history-header">
                        <div>
                          <span className="page-kicker">
                            Temperature History
                          </span>
                          <h3>
                            Reefer temperature over time
                          </h3>
                        </div>

                        <span className="temperature-reading-count">
                          {displayedTemperaturePoints.length} readings
                        </span>
                      </div>

                      <div className="temperature-history-stats">
                        <div>
                          <span>Minimum</span>
                          <strong>
                            {
                              historyMinTemperatureF == null
                                ? '--'
                                : historyMinTemperatureF.toFixed(1)
                            }°F
                          </strong>
                        </div>
                        <div>
                          <span>Average</span>
                          <strong>
                            {
                              historyAverageTemperatureF == null
                                ? '--'
                                : historyAverageTemperatureF.toFixed(1)
                            }°F
                          </strong>
                        </div>
                        <div>
                          <span>Maximum</span>
                          <strong>
                            {
                              historyMaxTemperatureF == null
                                ? '--'
                                : historyMaxTemperatureF.toFixed(1)
                            }°F
                          </strong>
                        </div>
                      </div>

                      {
                        temperatureChartPoints.length > 0 && (
                          <div className="temperature-chart-wrap">
                            <svg
                              className="temperature-chart"
                              viewBox={`0 0 ${temperatureChartWidth} ${temperatureChartHeight}`}
                              role="img"
                              aria-label="Temperature history chart"
                            >
                              <line
                                className="temperature-chart-grid"
                                x1={temperatureChartPadding}
                                x2={temperatureChartWidth - temperatureChartPadding}
                                y1={temperatureChartPadding}
                                y2={temperatureChartPadding}
                              />
                              <line
                                className="temperature-chart-grid"
                                x1={temperatureChartPadding}
                                x2={temperatureChartWidth - temperatureChartPadding}
                                y1={temperatureChartHeight - temperatureChartPadding}
                                y2={temperatureChartHeight - temperatureChartPadding}
                              />

                              {
                                temperatureMinLimitF != null && (
                                  <line
                                    className="temperature-limit-line minimum"
                                    x1={temperatureChartPadding}
                                    x2={temperatureChartWidth - temperatureChartPadding}
                                    y1={getLimitY(temperatureMinLimitF)}
                                    y2={getLimitY(temperatureMinLimitF)}
                                  />
                                )
                              }

                              {
                                temperatureMaxLimitF != null && (
                                  <line
                                    className="temperature-limit-line maximum"
                                    x1={temperatureChartPadding}
                                    x2={temperatureChartWidth - temperatureChartPadding}
                                    y1={getLimitY(temperatureMaxLimitF)}
                                    y2={getLimitY(temperatureMaxLimitF)}
                                  />
                                )
                              }

                              <polyline
                                className="temperature-history-line"
                                points={temperaturePolyline}
                              />

                              {
                                temperatureChartPoints.map(
                                  (point, index) => {
                                    const outOfRange =
                                      (temperatureMinLimitF != null &&
                                        point.temperatureF < temperatureMinLimitF) ||
                                      (temperatureMaxLimitF != null &&
                                        point.temperatureF > temperatureMaxLimitF)

                                    const showPoint =
                                      outOfRange ||
                                      index === 0 ||
                                      index === temperatureChartPoints.length - 1 ||
                                      index % Math.max(
                                        1,
                                        Math.ceil(
                                          temperatureChartPoints.length / 45
                                        )
                                      ) === 0

                                    return showPoint ? (
                                      <circle
                                        key={point.id}
                                        className={
                                          outOfRange
                                            ? 'temperature-chart-point alert'
                                            : 'temperature-chart-point'
                                        }
                                        cx={point.x}
                                        cy={point.y}
                                        r={outOfRange ? 4.5 : 3}
                                      >
                                        <title>
                                          {`${formatDateTime(point.timestamp)} • ${point.temperatureF.toFixed(1)}°F${point.speedKph != null ? ` • ${(point.speedKph * 0.621371).toFixed(1)} mph` : ''}${point.movementStatus ? ` • ${String(point.movementStatus)}` : ''}${point.latitude != null && point.longitude != null ? ` • ${Number(point.latitude).toFixed(5)}, ${Number(point.longitude).toFixed(5)}` : ''}`}
                                        </title>
                                      </circle>
                                    ) : null
                                  }
                                )
                              }

                              <text
                                className="temperature-axis-label"
                                x="4"
                                y={temperatureChartPadding + 4}
                              >
                                {chartMax}°F
                              </text>
                              <text
                                className="temperature-axis-label"
                                x="4"
                                y={temperatureChartHeight - temperatureChartPadding + 4}
                              >
                                {chartMin}°F
                              </text>
                            </svg>
                          </div>
                        )
                      }

                      {
                        (temperatureMinLimitF != null ||
                          temperatureMaxLimitF != null) && (
                          <div className="temperature-limit-legend">
                            {
                              temperatureMinLimitF != null && (
                                <span>
                                  Min limit {temperatureMinLimitF.toFixed(1)}°F
                                </span>
                              )
                            }
                            {
                              temperatureMaxLimitF != null && (
                                <span>
                                  Max limit {temperatureMaxLimitF.toFixed(1)}°F
                                </span>
                              )
                            }
                          </div>
                        )
                      }
                    </div>
                    </div>
                  </>
                )
              }
            </section>
          </div>
        )
      }

      {/* ================================= */}
      {/* TEMPERATURE LIMITS MODAL */}
      {/* ================================= */}

      {
        temperatureLimitsOpen && (
          <div
            className="modal-backdrop"
            onMouseDown={() => {
              if (
                !temperatureLimitsSaving
              ) {
                setTemperatureLimitsOpen(
                  false
                )
                setTemperatureLimitsError(
                  ''
                )
              }
            }}
          >
            <section
              className="details-modal rename-modal"
              onMouseDown={
                (event) =>
                  event.stopPropagation()
              }
            >
              <div className="modal-header">
                <div>
                  <span className="page-kicker">
                    Temperature Monitor
                  </span>

                  <h2>
                    {
                      selectedAssetName
                    }
                  </h2>

                  <small className="modal-device-id">
                    Device ID:{' '}
                    {
                      telemetry?.deviceId ||
                      selectedDeviceId
                    }
                  </small>
                </div>

                <button
                  className="modal-close"
                  onClick={() => {
                    setTemperatureLimitsOpen(
                      false
                    )
                    setTemperatureLimitsError(
                      ''
                    )
                  }}
                  type="button"
                  disabled={
                    temperatureLimitsSaving
                  }
                >
                  ×
                </button>
              </div>

              <div className="rename-form">
                <label
                  htmlFor="temperature-min-f"
                >
                  Minimum temperature (°F)
                </label>

                <input
                  id="temperature-min-f"
                  type="number"
                  step="0.1"
                  value={
                    temperatureMinF
                  }
                  onChange={
                    (event) =>
                      setTemperatureMinF(
                        event.target.value
                      )
                  }
                  placeholder="Example: 34"
                  disabled={
                    temperatureLimitsSaving
                  }
                />

                <label
                  htmlFor="temperature-max-f"
                >
                  Maximum temperature (°F)
                </label>

                <input
                  id="temperature-max-f"
                  type="number"
                  step="0.1"
                  value={
                    temperatureMaxF
                  }
                  onChange={
                    (event) =>
                      setTemperatureMaxF(
                        event.target.value
                      )
                  }
                  placeholder="Example: 40"
                  disabled={
                    temperatureLimitsSaving
                  }
                />

                <label className="toggle-row">
                  <span>
                    Enable temperature alerts
                  </span>

                  <input
                    type="checkbox"
                    checked={
                      temperatureAlertsEnabled
                    }
                    onChange={
                      (event) =>
                        setTemperatureAlertsEnabled(
                          event.target.checked
                        )
                    }
                    disabled={
                      temperatureLimitsSaving
                    }
                  />

                  <i className="toggle" />
                </label>

                <div className="rename-help">
                  <span>
                    Maverick stores limits internally in Celsius and displays them here in Fahrenheit.
                  </span>
                </div>

                {
                  temperatureLimitsError && (
                    <div className="rename-error">
                      {
                        temperatureLimitsError
                      }
                    </div>
                  )
                }
              </div>

              <div className="modal-actions temperature-modal-actions">
                <button
                  className="danger-action"
                  onClick={handleClearTemperatureLimits}
                  type="button"
                  disabled={temperatureLimitsSaving}
                >
                  {
                    temperatureLimitsSaving
                      ? 'Removing...'
                      : 'Remove Limits'
                  }
                </button>

                <span className="modal-action-spacer" />

                <button
                  className="secondary-action"
                  onClick={() => {
                    setTemperatureLimitsOpen(
                      false
                    )
                    setTemperatureLimitsError(
                      ''
                    )
                  }}
                  type="button"
                  disabled={
                    temperatureLimitsSaving
                  }
                >
                  Cancel
                </button>

                <button
                  className="primary-action"
                  onClick={
                    handleSaveTemperatureLimits
                  }
                  type="button"
                  disabled={
                    temperatureLimitsSaving
                  }
                >
                  {
                    temperatureLimitsSaving
                      ? 'Saving...'
                      : 'Save Limits'
                  }
                </button>
              </div>
            </section>
          </div>
        )
      }

    </div>
  )
}

export default App
