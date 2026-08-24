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
  useRef,
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


type DispatchStatus =
  | 'ASSIGNED'
  | 'EN_ROUTE_TO_PICKUP'
  | 'AT_PICKUP'
  | 'LOADED'
  | 'IN_TRANSIT'
  | 'AT_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED'

type DispatchStatusEvent = {
  id: number
  status: DispatchStatus
  notes: string | null
  createdAt: string
}

type DispatchRecord = {
  id: number
  loadNumber: string
  status: DispatchStatus
  pickupName: string
  pickupAddress: string
  pickupScheduledAt: string | null
  deliveryName: string
  deliveryAddress: string
  deliveryScheduledAt: string | null
  commodity: string | null
  referenceNumber: string | null
  temperatureSetpointC: number | null
  temperatureMinC: number | null
  temperatureMaxC: number | null
  notes: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  asset: any | null
  statusEvents: DispatchStatusEvent[]
}

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

type HistoryLegId =
  | 'all'
  | 'outbound'
  | 'return'

type HistoryLeg = {
  id: Exclude<HistoryLegId, 'all'>
  label: string
  points: HistoryPoint[]
  start: string
  end: string
  distanceMiles: number
}

type RoadMatchedTrack = {
  id: string
  source: 'match' | 'road' | 'raw'
  confidence: number | null
  coverage: number
  segments: [number, number][][]
}

const API_BASE =
  import.meta.env.DEV
    ? 'http://localhost:3000'
    : 'https://maverick-1z64.onrender.com'

const celsiusToFahrenheit = (
  value: number
) =>
  (value * 9) / 5 + 32

const fahrenheitToCelsius = (
  value: number
) =>
  ((value - 32) * 5) / 9

type BatteryLevel =
  | 'good'
  | 'medium'
  | 'low'
  | 'critical'
  | 'unknown'

const getBatteryLevel = (
  value?: number | null
): BatteryLevel => {
  if (
    value == null ||
    !Number.isFinite(Number(value))
  ) {
    return 'unknown'
  }

  const percent =
    Math.max(
      0,
      Math.min(
        100,
        Number(value)
      )
    )

  if (percent <= 10) {
    return 'critical'
  }

  if (percent <= 20) {
    return 'low'
  }

  if (percent <= 50) {
    return 'medium'
  }

  return 'good'
}

const getBatteryLabel = (
  value?: number | null
) => {
  const level =
    getBatteryLevel(value)

  return level === 'critical'
    ? 'Critical'
    : level === 'low'
      ? 'Low'
      : level === 'medium'
        ? 'Medium'
        : level === 'good'
          ? 'Good'
          : 'Unavailable'
}

// Keep Leaflet's default marker assets available for compatibility.
// Maverick uses a custom status-aware trailer icon below.
void markerIcon2x
void markerIcon
void markerShadow

function createTrailerIcon(
  movementStatus: MovementStatus,
  selected = false,
  hasDispatch = false
) {
  return L.divIcon({
    className: 'mav-trailer-marker-wrapper',
    html: `
      <div class="mav-trailer-marker ${movementStatus}${selected ? ' selected' : ''}${hasDispatch ? ' has-dispatch' : ''}">
        <span class="mav-trailer-marker-pulse"></span>
        <span class="mav-trailer-marker-icon">▰</span>
        ${hasDispatch ? '<span class="mav-trailer-load-badge">L</span>' : ''}
      </div>
    `,
    iconSize: [50, 50],
    iconAnchor: [25, 25],
    popupAnchor: [0, -28]
  })
}

function MapController({
  latitude,
  longitude,
  fleetPoints,
  fleetBoundsKey
}: {
  latitude: number | null
  longitude: number | null
  fleetPoints: [number, number][]
  fleetBoundsKey: string
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
      return
    }

    if (fleetPoints.length === 1) {
      map.setView(
        fleetPoints[0],
        10
      )
      return
    }

    if (fleetPoints.length > 1) {
      map.fitBounds(
        L.latLngBounds(fleetPoints),
        {
          padding: [70, 70],
          maxZoom: 9
        }
      )
    }
  }, [
    latitude,
    longitude,
    fleetBoundsKey,
    map
  ])

  useEffect(() => {
    let resizeTimer: number | undefined

    const refreshMapSize = () => {
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => {
        map.invalidateSize({ animate: false })
      }, 80)
    }

    refreshMapSize()
    window.addEventListener('resize', refreshMapSize)
    window.addEventListener('orientationchange', refreshMapSize)

    return () => {
      window.clearTimeout(resizeTimer)
      window.removeEventListener('resize', refreshMapSize)
      window.removeEventListener('orientationchange', refreshMapSize)
    }
  }, [map])

  return null
}

function ResponsiveMapSize() {
  const map = useMap()

  useEffect(() => {
    let resizeTimer: number | undefined

    const refreshMapSize = () => {
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => {
        map.invalidateSize({ animate: false })
      }, 80)
    }

    refreshMapSize()
    window.addEventListener('resize', refreshMapSize)
    window.addEventListener('orientationchange', refreshMapSize)

    return () => {
      window.clearTimeout(resizeTimer)
      window.removeEventListener('resize', refreshMapSize)
      window.removeEventListener('orientationchange', refreshMapSize)
    }
  }, [map])

  return null
}


function HistoryRouteController({
  points
}: {
  points: [number, number][]
}) {
  const map = useMap()

  useEffect(() => {
    if (points.length === 0) {
      return
    }

    const timer = window.setTimeout(() => {
      map.invalidateSize({ animate: false })

      if (points.length === 1) {
        map.setView(points[0], 15)
        return
      }

      map.fitBounds(
        L.latLngBounds(points),
        {
          padding: [38, 38],
          maxZoom: 16
        }
      )
    }, 120)

    return () => {
      window.clearTimeout(timer)
    }
  }, [map, points])

  return null
}

function bearingDegrees(
  from: [number, number],
  to: [number, number]
) {
  const toRad = (value: number) =>
    value * Math.PI / 180

  const toDeg = (value: number) =>
    value * 180 / Math.PI

  const lat1 = toRad(from[0])
  const lat2 = toRad(to[0])
  const dLon = toRad(to[1] - from[1])

  const y =
    Math.sin(dLon) * Math.cos(lat2)

  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) *
      Math.cos(lat2) *
      Math.cos(dLon)

  return (
    toDeg(Math.atan2(y, x)) + 360
  ) % 360
}

function createHistoryDirectionIcon(
  bearing: number
) {
  // The SVG points upward (north), so the CSS rotation can use
  // the geographic bearing directly: 0=N, 90=E, 180=S, 270=W.
  return L.divIcon({
    className:
      'history-direction-marker-wrapper',
    html: `
      <div
        class="history-direction-arrow"
        style="transform: rotate(${bearing.toFixed(1)}deg)"
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M12 2 L20 18 L12 14.5 L4 18 Z"></path>
        </svg>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  })
}

type HistoryDirectionArrow = {
  id: string
  position: [number, number]
  bearing: number
}

function buildHistoryDirectionArrows(
  segments: [number, number][][]
): HistoryDirectionArrow[] {
  const arrows: HistoryDirectionArrow[] = []

  segments.forEach((segment, segmentIndex) => {
    if (segment.length < 2) {
      return
    }

    // Build cumulative distance along the actual displayed geometry.
    const cumulative: number[] = [0]

    for (let i = 1; i < segment.length; i++) {
      cumulative.push(
        cumulative[i - 1] +
        distanceMiles(
          segment[i - 1][0],
          segment[i - 1][1],
          segment[i][0],
          segment[i][1]
        )
      )
    }

    const total =
      cumulative[cumulative.length - 1]

    if (total < 0.08) {
      return
    }

    // Aim for arrows roughly every 0.25 mi, with a sensible
    // minimum/maximum so short trips still show direction and
    // long trips do not become visually crowded.
    const desiredCount = Math.max(
      2,
      Math.min(
        14,
        Math.round(total / 0.25)
      )
    )

    for (
      let arrowIndex = 1;
      arrowIndex <= desiredCount;
      arrowIndex++
    ) {
      const target =
        total *
        (arrowIndex / (desiredCount + 1))

      let pointIndex = 1

      while (
        pointIndex < cumulative.length &&
        cumulative[pointIndex] < target
      ) {
        pointIndex++
      }

      if (pointIndex >= segment.length) {
        pointIndex = segment.length - 1
      }

      const from =
        segment[Math.max(0, pointIndex - 1)]

      const to =
        segment[pointIndex]

      const span =
        cumulative[pointIndex] -
        cumulative[pointIndex - 1]

      const ratio =
        span > 0
          ? Math.max(
              0,
              Math.min(
                1,
                (
                  target -
                  cumulative[pointIndex - 1]
                ) / span
              )
            )
          : 0.5

      const position: [number, number] = [
        from[0] +
          (to[0] - from[0]) * ratio,
        from[1] +
          (to[1] - from[1]) * ratio
      ]

      arrows.push({
        id:
          `history-arrow-${segmentIndex}-${arrowIndex}`,
        position,
        bearing:
          bearingDegrees(from, to)
      })
    }
  })

  return arrows
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
    fleetTelemetry,
    setFleetTelemetry
  ] = useState<Record<string, any | null>>({})



  // =====================================================
  // DISPATCH / OPERATIONS STATE
  // =====================================================

  const [
    dispatches,
    setDispatches
  ] = useState<DispatchRecord[]>([])

  const [
    dispatchLoading,
    setDispatchLoading
  ] = useState(false)

  const [
    dispatchError,
    setDispatchError
  ] = useState('')

  const [
    dispatchSearch,
    setDispatchSearch
  ] = useState('')

  const [
    dispatchStatusFilter,
    setDispatchStatusFilter
  ] = useState<'all' | DispatchStatus>('all')

  const [
    operationsTab,
    setOperationsTab
  ] = useState<'active' | 'history'>('active')

  const [
    newDispatchOpen,
    setNewDispatchOpen
  ] = useState(false)

  const [
    newDispatchSaving,
    setNewDispatchSaving
  ] = useState(false)

  const [
    newDispatchForm,
    setNewDispatchForm
  ] = useState({
    loadNumber: '',
    assetId: '',
    pickupName: '',
    pickupAddress: '',
    pickupScheduledAt: '',
    deliveryName: '',
    deliveryAddress: '',
    deliveryScheduledAt: '',
    commodity: '',
    referenceNumber: '',
    temperatureSetpointF: '',
    temperatureMinF: '',
    temperatureMaxF: '',
    notes: ''
  })

  const [
    editDispatchOpen,
    setEditDispatchOpen
  ] = useState(false)

  const [
    editDispatchSaving,
    setEditDispatchSaving
  ] = useState(false)

  const [
    editingDispatchId,
    setEditingDispatchId
  ] = useState<number | null>(null)

  const [
    editDispatchForm,
    setEditDispatchForm
  ] = useState({
    loadNumber: '',
    assetId: '',
    pickupName: '',
    pickupAddress: '',
    pickupScheduledAt: '',
    deliveryName: '',
    deliveryAddress: '',
    deliveryScheduledAt: '',
    commodity: '',
    referenceNumber: '',
    temperatureSetpointF: '',
    temperatureMinF: '',
    temperatureMaxF: '',
    notes: ''
  })

  const [
    routePoints,
    setRoutePoints
  ] = useState<RoutePoint[]>([])

  const [
    liveRoadSegments,
    setLiveRoadSegments
  ] = useState<[number, number][][]>([])

  const [
    historyRoadTracks,
    setHistoryRoadTracks
  ] = useState<RoadMatchedTrack[]>([])

  const [
    roadMatchLoading,
    setRoadMatchLoading
  ] = useState(false)

  const liveRoadProcessedRef =
    useRef<string | null>(null)

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
    selectedHistoryLegId,
    setSelectedHistoryLegId
  ] = useState<HistoryLegId>('all')

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
    reportRange,
    setReportRange
  ] = useState<HistoryRange>('today')

  const [
    reportCustomDate,
    setReportCustomDate
  ] = useState('')

  const [
    reportPoints,
    setReportPoints
  ] = useState<HistoryPoint[]>([])

  const [
    reportLoading,
    setReportLoading
  ] = useState(false)

  const [
    reportError,
    setReportError
  ] = useState('')

  const [
    reportGeneratedAt,
    setReportGeneratedAt
  ] = useState<string | null>(null)

  const [
    selectedDeviceId,
    setSelectedDeviceId
  ] = useState('')

  const [
    now,
    setNow
  ] = useState(Date.now())

  const [
    searchTerm,
    setSearchTerm
  ] = useState('')

  const [
    assetSearchTerm,
    setAssetSearchTerm
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

  // Clear every device-specific view immediately when the user changes asset.
  useEffect(() => {
    setTelemetry(null)
    setRoutePoints([])
    setLiveRoadSegments([])
    setHistoryPoints([])
    setHistoryRoadTracks([])
    liveRoadProcessedRef.current = null
    setDetailsOpen(false)
    setHistoryOpen(false)
  }, [selectedDeviceId])

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

        // Nothing is selected on initial load.
        if (!selectedDeviceId) {
          setTelemetry(null)
          return
        }

        try {
          const res =
            await fetch(
              `${API_BASE}/api/telemetry/latest?deviceId=${encodeURIComponent(selectedDeviceId)}`,
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

          if (res.ok && data.ok) {
            setTelemetry(
              data.telemetry
            )

            // IMPORTANT:
            // Do not setSelectedDeviceId here.
            // The selected asset belongs to the user's choice,
            // not whichever trailer transmitted most recently.
            setApiStatus(
              'online'
            )
          } else {
            setTelemetry(null)
            setApiStatus(
              res.status === 404
                ? 'online'
                : 'offline'
            )
          }
        } catch {
          setTelemetry(null)
          setApiStatus(
            'offline'
          )
        }
      },
      [selectedDeviceId]
    )

  useEffect(() => {
    if (!selectedDeviceId) {
      return
    }

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
  }, [
    selectedDeviceId,
    loadTelemetry
  ])


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
  // FLEET TELEMETRY
  // =====================================================
  // Fleet view needs the latest reading for every asset,
  // not only the currently selected trailer.

  const loadFleetTelemetry =
    useCallback(
      async () => {
        const token =
          localStorage.getItem(
            'maverick_token'
          )

        if (!token || assets.length === 0) {
          setFleetTelemetry({})
          return
        }

        try {
          const entries =
            await Promise.all(
              assets.map(async (asset) => {
                const res = await fetch(
                  `${API_BASE}/api/telemetry/latest?deviceId=${encodeURIComponent(asset.deviceId)}`,
                  {
                    headers: {
                      Authorization:
                        `Bearer ${token}`
                    }
                  }
                )

                if (res.status === 401) {
                  throw new Error('AUTH_EXPIRED')
                }

                const data =
                  await res.json()

                return [
                  asset.deviceId,
                  res.ok && data.ok
                    ? data.telemetry
                    : null
                ] as const
              })
            )

          setFleetTelemetry(
            Object.fromEntries(entries)
          )
        } catch (error) {
          if (
            error instanceof Error &&
            error.message === 'AUTH_EXPIRED'
          ) {
            handleLogout()
            return
          }

          console.error(
            'Unable to load fleet telemetry:',
            error
          )
        }
      },
      [assets]
    )

  useEffect(() => {
    if (!isLoggedIn || assets.length === 0) {
      return
    }

    loadFleetTelemetry()

    const interval =
      setInterval(
        loadFleetTelemetry,
        5000
      )

    return () =>
      clearInterval(interval)
  }, [
    isLoggedIn,
    assets.length,
    loadFleetTelemetry
  ])


  // =====================================================
  // DISPATCH / OPERATIONS
  // =====================================================

  const dispatchStatusLabel = (
    status: DispatchStatus
  ) =>
    status === 'ASSIGNED'
      ? 'Assigned'
      : status === 'EN_ROUTE_TO_PICKUP'
        ? 'En Route to Pickup'
        : status === 'AT_PICKUP'
          ? 'At Pickup'
          : status === 'LOADED'
            ? 'Loaded'
            : status === 'IN_TRANSIT'
              ? 'In Transit'
              : status === 'AT_DELIVERY'
                ? 'At Delivery'
                : status === 'DELIVERED'
                  ? 'Delivered'
                  : 'Cancelled'

  const dispatchStatusOptions:
    DispatchStatus[] = [
      'ASSIGNED',
      'EN_ROUTE_TO_PICKUP',
      'AT_PICKUP',
      'LOADED',
      'IN_TRANSIT',
      'AT_DELIVERY',
      'DELIVERED',
      'CANCELLED'
    ]

  const loadDispatches =
    useCallback(
      async () => {
        const token =
          localStorage.getItem(
            'maverick_token'
          )

        if (!token) {
          return
        }

        setDispatchLoading(true)
        setDispatchError('')

        try {
          const res =
            await fetch(
              `${API_BASE}/api/dispatches`,
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
            setDispatchError(
              data.message ||
              'Unable to load dispatches.'
            )
            return
          }

          setDispatches(
            data.dispatches || []
          )
        } catch {
          setDispatchError(
            'Unable to connect to Maverick.'
          )
        } finally {
          setDispatchLoading(false)
        }
      },
      []
    )

  useEffect(() => {
    if (!isLoggedIn) {
      return
    }

    loadDispatches()

    const interval =
      setInterval(
        loadDispatches,
        15000
      )

    return () =>
      clearInterval(interval)
  }, [
    isLoggedIn,
    loadDispatches
  ])

  const resetNewDispatchForm = () => {
    setNewDispatchForm({
      loadNumber: '',
      assetId: '',
      pickupName: '',
      pickupAddress: '',
      pickupScheduledAt: '',
      deliveryName: '',
      deliveryAddress: '',
      deliveryScheduledAt: '',
      commodity: '',
      referenceNumber: '',
      temperatureSetpointF: '',
      temperatureMinF: '',
      temperatureMaxF: '',
      notes: ''
    })
  }

  const createDispatch =
    async () => {
      const token =
        localStorage.getItem(
          'maverick_token'
        )

      if (!token) {
        return
      }

      const toCelsius = (
        value: string
      ) => {
        if (!value.trim()) {
          return null
        }

        const fahrenheit =
          Number(value)

        return Number.isFinite(fahrenheit)
          ? (fahrenheit - 32) * 5 / 9
          : null
      }

      if (
        !newDispatchForm.loadNumber.trim() ||
        !newDispatchForm.pickupName.trim() ||
        !newDispatchForm.pickupAddress.trim() ||
        !newDispatchForm.deliveryName.trim() ||
        !newDispatchForm.deliveryAddress.trim()
      ) {
        setDispatchError(
          'Load number, pickup and delivery are required.'
        )
        return
      }

      setNewDispatchSaving(true)
      setDispatchError('')

      try {
        const res =
          await fetch(
            `${API_BASE}/api/dispatches`,
            {
              method: 'POST',
              headers: {
                'Content-Type':
                  'application/json',
                Authorization:
                  `Bearer ${token}`
              },
              body: JSON.stringify({
                loadNumber:
                  newDispatchForm.loadNumber,
                assetId:
                  newDispatchForm.assetId
                    ? Number(
                        newDispatchForm.assetId
                      )
                    : null,
                pickupName:
                  newDispatchForm.pickupName,
                pickupAddress:
                  newDispatchForm.pickupAddress,
                pickupScheduledAt:
                  newDispatchForm.pickupScheduledAt
                    ? new Date(
                        newDispatchForm.pickupScheduledAt
                      ).toISOString()
                    : null,
                deliveryName:
                  newDispatchForm.deliveryName,
                deliveryAddress:
                  newDispatchForm.deliveryAddress,
                deliveryScheduledAt:
                  newDispatchForm.deliveryScheduledAt
                    ? new Date(
                        newDispatchForm.deliveryScheduledAt
                      ).toISOString()
                    : null,
                commodity:
                  newDispatchForm.commodity,
                referenceNumber:
                  newDispatchForm.referenceNumber,
                temperatureSetpointC:
                  toCelsius(
                    newDispatchForm.temperatureSetpointF
                  ),
                temperatureMinC:
                  toCelsius(
                    newDispatchForm.temperatureMinF
                  ),
                temperatureMaxC:
                  toCelsius(
                    newDispatchForm.temperatureMaxF
                  ),
                notes:
                  newDispatchForm.notes
              })
            }
          )

        const data =
          await res.json()

        if (!res.ok || !data.ok) {
          setDispatchError(
            data.message ||
            'Unable to create dispatch.'
          )
          return
        }

        setNewDispatchOpen(false)
        resetNewDispatchForm()
        await loadDispatches()
      } catch {
        setDispatchError(
          'Unable to connect to Maverick.'
        )
      } finally {
        setNewDispatchSaving(false)
      }
    }

  const toDateTimeLocalValue = (
    value?: string | null
  ) => {
    if (!value) {
      return ''
    }

    const date =
      new Date(value)

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return ''
    }

    const pad = (
      number: number
    ) =>
      String(number).padStart(
        2,
        '0'
      )

    return (
      `${date.getFullYear()}-` +
      `${pad(
        date.getMonth() + 1
      )}-` +
      `${pad(
        date.getDate()
      )}T` +
      `${pad(
        date.getHours()
      )}:` +
      `${pad(
        date.getMinutes()
      )}`
    )
  }

  const openEditDispatch = (
    dispatch: DispatchRecord
  ) => {
    setDispatchError('')
    setEditingDispatchId(
      dispatch.id
    )

    setEditDispatchForm({
      loadNumber:
        dispatch.loadNumber || '',
      assetId:
        dispatch.asset?.id != null
          ? String(
              dispatch.asset.id
            )
          : '',
      pickupName:
        dispatch.pickupName || '',
      pickupAddress:
        dispatch.pickupAddress || '',
      pickupScheduledAt:
        toDateTimeLocalValue(
          dispatch.pickupScheduledAt
        ),
      deliveryName:
        dispatch.deliveryName || '',
      deliveryAddress:
        dispatch.deliveryAddress || '',
      deliveryScheduledAt:
        toDateTimeLocalValue(
          dispatch.deliveryScheduledAt
        ),
      commodity:
        dispatch.commodity || '',
      referenceNumber:
        dispatch.referenceNumber || '',
      temperatureSetpointF:
        dispatch.temperatureSetpointC != null
          ? celsiusToFahrenheit(
              Number(
                dispatch.temperatureSetpointC
              )
            ).toFixed(1)
          : '',
      temperatureMinF:
        dispatch.temperatureMinC != null
          ? celsiusToFahrenheit(
              Number(
                dispatch.temperatureMinC
              )
            ).toFixed(1)
          : '',
      temperatureMaxF:
        dispatch.temperatureMaxC != null
          ? celsiusToFahrenheit(
              Number(
                dispatch.temperatureMaxC
              )
            ).toFixed(1)
          : '',
      notes:
        dispatch.notes || ''
    })

    setEditDispatchOpen(true)
  }

  const saveEditedDispatch =
    async () => {
      const token =
        localStorage.getItem(
          'maverick_token'
        )

      if (
        !token ||
        editingDispatchId == null
      ) {
        return
      }

      const toCelsius = (
        value: string
      ) => {
        if (!value.trim()) {
          return null
        }

        const fahrenheit =
          Number(value)

        return Number.isFinite(
          fahrenheit
        )
          ? (
              fahrenheit - 32
            ) * 5 / 9
          : null
      }

      if (
        !editDispatchForm.loadNumber.trim() ||
        !editDispatchForm.pickupName.trim() ||
        !editDispatchForm.pickupAddress.trim() ||
        !editDispatchForm.deliveryName.trim() ||
        !editDispatchForm.deliveryAddress.trim()
      ) {
        setDispatchError(
          'Load number, pickup and delivery are required.'
        )
        return
      }

      const minF =
        editDispatchForm
          .temperatureMinF.trim()
          ? Number(
              editDispatchForm.temperatureMinF
            )
          : null

      const maxF =
        editDispatchForm
          .temperatureMaxF.trim()
          ? Number(
              editDispatchForm.temperatureMaxF
            )
          : null

      if (
        minF != null &&
        maxF != null &&
        (
          !Number.isFinite(minF) ||
          !Number.isFinite(maxF) ||
          minF >= maxF
        )
      ) {
        setDispatchError(
          'Minimum temperature must be lower than maximum temperature.'
        )
        return
      }

      setEditDispatchSaving(true)
      setDispatchError('')

      try {
        const res =
          await fetch(
            `${API_BASE}/api/dispatches/${editingDispatchId}`,
            {
              method: 'PATCH',
              headers: {
                'Content-Type':
                  'application/json',
                Authorization:
                  `Bearer ${token}`
              },
              body: JSON.stringify({
                loadNumber:
                  editDispatchForm.loadNumber,
                assetId:
                  editDispatchForm.assetId
                    ? Number(
                        editDispatchForm.assetId
                      )
                    : null,
                pickupName:
                  editDispatchForm.pickupName,
                pickupAddress:
                  editDispatchForm.pickupAddress,
                pickupScheduledAt:
                  editDispatchForm.pickupScheduledAt
                    ? new Date(
                        editDispatchForm.pickupScheduledAt
                      ).toISOString()
                    : null,
                deliveryName:
                  editDispatchForm.deliveryName,
                deliveryAddress:
                  editDispatchForm.deliveryAddress,
                deliveryScheduledAt:
                  editDispatchForm.deliveryScheduledAt
                    ? new Date(
                        editDispatchForm.deliveryScheduledAt
                      ).toISOString()
                    : null,
                commodity:
                  editDispatchForm.commodity,
                referenceNumber:
                  editDispatchForm.referenceNumber,
                temperatureSetpointC:
                  toCelsius(
                    editDispatchForm.temperatureSetpointF
                  ),
                temperatureMinC:
                  toCelsius(
                    editDispatchForm.temperatureMinF
                  ),
                temperatureMaxC:
                  toCelsius(
                    editDispatchForm.temperatureMaxF
                  ),
                notes:
                  editDispatchForm.notes
              })
            }
          )

        const data =
          await res.json()

        if (!res.ok || !data.ok) {
          setDispatchError(
            data.message ||
            'Unable to update dispatch.'
          )
          return
        }

        setEditDispatchOpen(false)
        setEditingDispatchId(null)

        await loadDispatches()
      } catch {
        setDispatchError(
          'Unable to connect to Maverick.'
        )
      } finally {
        setEditDispatchSaving(false)
      }
    }

  const updateDispatchStatus =
    async (
      dispatchId: number,
      status: DispatchStatus
    ) => {
      const token =
        localStorage.getItem(
          'maverick_token'
        )

      if (!token) {
        return
      }

      setDispatchError('')

      try {
        const res =
          await fetch(
            `${API_BASE}/api/dispatches/${dispatchId}/status`,
            {
              method: 'POST',
              headers: {
                'Content-Type':
                  'application/json',
                Authorization:
                  `Bearer ${token}`
              },
              body: JSON.stringify({
                status
              })
            }
          )

        const data =
          await res.json()

        if (!res.ok || !data.ok) {
          setDispatchError(
            data.message ||
            'Unable to update dispatch status.'
          )
          return
        }

        setDispatches((current) =>
          current.map((item) =>
            item.id === dispatchId
              ? data.dispatch
              : item
          )
        )
      } catch {
        setDispatchError(
          'Unable to connect to Maverick.'
        )
      }
    }

  const activeDispatches =
    dispatches.filter(
      (dispatch) =>
        dispatch.status !== 'DELIVERED' &&
        dispatch.status !== 'CANCELLED'
    )

  const completedDispatches =
    dispatches.filter(
      (dispatch) =>
        dispatch.status === 'DELIVERED' ||
        dispatch.status === 'CANCELLED'
    )

  const selectedActiveDispatch =
    activeDispatches.find(
      (dispatch) =>
        dispatch.asset?.deviceId ===
        (
          selectedDeviceId ||
          telemetry?.deviceId
        )
    ) || null

  const operationsDispatches =
    operationsTab === 'active'
      ? activeDispatches
      : completedDispatches

  const filteredDispatches =
    operationsDispatches.filter(
      (dispatch) => {
        const query =
          dispatchSearch
            .trim()
            .toLowerCase()

        const matchesText =
          !query ||
          dispatch.loadNumber
            .toLowerCase()
            .includes(query) ||
          String(
            dispatch.asset?.name || ''
          )
            .toLowerCase()
            .includes(query) ||
          String(
            dispatch.asset?.deviceId || ''
          )
            .toLowerCase()
            .includes(query) ||
          dispatch.pickupName
            .toLowerCase()
            .includes(query) ||
          dispatch.deliveryName
            .toLowerCase()
            .includes(query)

        const matchesStatus =
          dispatchStatusFilter === 'all' ||
          dispatch.status ===
            dispatchStatusFilter

        return (
          matchesText &&
          matchesStatus
        )
      }
    )

  const availableAssets =
    assets.filter(
      (asset) =>
        !activeDispatches.some(
          (dispatch) =>
            dispatch.asset?.id ===
            asset.id
        )
    )


  // =====================================================
  // DEVICE STATUS
  // =====================================================

  const getDeviceStatusForTelemetry =
    (item: any): DeviceStatus => {
      if (!item?.receivedAt) {
        return 'offline'
      }

      const ageMs =
        now -
        new Date(
          item.receivedAt
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
    getDeviceStatusForTelemetry(
      telemetry
    )

  const statusLabel =
    deviceStatus === 'online'
      ? 'Online'
      : deviceStatus ===
          'delayed'
        ? 'Delayed'
        : 'Offline'

  const getMovementStatusForTelemetry = (
    item: any,
    status: DeviceStatus
  ): MovementStatus => {
    if (status === 'offline') {
      return 'offline'
    }

    if (!Boolean(item?.hasCurrentGps)) {
      return 'acquiring'
    }

    const rawSpeed =
      item?.speedKph != null
        ? Number(item.speedKph)
        : 0

    const safeSpeed =
      Number.isFinite(rawSpeed)
        ? Math.max(0, rawSpeed)
        : 0

    const backendMovement =
      String(
        item?.movementStatus || ''
      ).toUpperCase()

    return (
      backendMovement === 'MOVING' ||
      safeSpeed >= 5
        ? 'moving'
        : 'parked'
    )
  }

  const getDetailedMovementLabel = (
    item: any,
    status: DeviceStatus,
    dispatch?: DispatchRecord | null
  ) => {
    const movement =
      getMovementStatusForTelemetry(
        item,
        status
      )

    const rawSpeedKph =
      item?.speedKph != null
        ? Number(item.speedKph)
        : 0

    const speedMph =
      (
        Number.isFinite(rawSpeedKph)
          ? Math.max(
              0,
              rawSpeedKph
            )
          : 0
      ) * 0.621371

    if (status === 'offline') {
      return 'Offline · last known state'
    }

    if (status === 'delayed') {
      if (movement === 'moving') {
        return `Last seen moving · ${speedMph.toFixed(1)} mph · telemetry delayed`
      }

      if (movement === 'parked') {
        return 'Last seen parked · telemetry delayed'
      }

      return 'Telemetry delayed · movement unavailable'
    }

    if (movement === 'acquiring') {
      if (!dispatch) {
        return 'Acquiring GPS · movement pending'
      }

      return `${dispatchStatusLabel(
        dispatch.status
      )} · Acquiring GPS`
    }

    const statusContext =
      !dispatch
        ? ''
        : dispatch.status ===
            'EN_ROUTE_TO_PICKUP'
          ? 'To pickup'
          : dispatch.status ===
              'AT_PICKUP'
            ? 'At pickup'
            : dispatch.status ===
                'LOADED'
              ? 'Loaded'
              : dispatch.status ===
                  'IN_TRANSIT'
                ? 'In transit'
                : dispatch.status ===
                    'AT_DELIVERY'
                  ? 'At delivery'
                  : dispatch.status ===
                      'DELIVERED'
                    ? 'Delivered'
                    : dispatch.status ===
                        'CANCELLED'
                      ? 'Cancelled'
                      : 'Assigned'

    if (movement === 'moving') {
      return statusContext
        ? `${statusContext} · Moving ${speedMph.toFixed(1)} mph`
        : `Moving · ${speedMph.toFixed(1)} mph`
    }

    if (dispatch?.status === 'IN_TRANSIT') {
      return 'In transit · Stopped'
    }

    if (
      dispatch?.status ===
        'EN_ROUTE_TO_PICKUP'
    ) {
      return 'To pickup · Stopped'
    }

    return statusContext
      ? `${statusContext} · Parked`
      : 'Parked'
  }

  const fleetStatusCounts =
    assets.reduce(
      (counts, asset) => {
        const item =
          fleetTelemetry[
            asset.deviceId
          ]

        const status =
          getDeviceStatusForTelemetry(
            item
          )

        counts[status] += 1
        return counts
      },
      {
        online: 0,
        delayed: 0,
        offline: 0
      } as Record<DeviceStatus, number>
    )

  const fleetMapAssets =
    assets
      .map((asset) => {
        const item =
          fleetTelemetry[
            asset.deviceId
          ] ??
          (
            telemetry?.deviceId ===
              asset.deviceId
              ? telemetry
              : null
          )

        if (
          item?.latitude == null ||
          item?.longitude == null
        ) {
          return null
        }

        const latitude =
          Number(item.latitude)

        const longitude =
          Number(item.longitude)

        if (
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude)
        ) {
          return null
        }

        const status =
          getDeviceStatusForTelemetry(
            item
          )

        const movement =
          getMovementStatusForTelemetry(
            item,
            status
          )

        const activeDispatch =
          activeDispatches.find(
            (dispatch) =>
              dispatch.asset?.deviceId ===
              asset.deviceId
          ) || null

        const selected =
          selectedDeviceId ===
          asset.deviceId

        const statusEnabled =
          status === 'online'
            ? showOnline
            : status === 'delayed'
              ? showDelayed
              : showOffline

        const statusMatches =
          statusFilter === 'all' ||
          statusFilter === status

        const mapFilterSearch =
          searchTerm
            .trim()
            .toLowerCase()

        const searchMatches =
          !mapFilterSearch ||
          String(
            asset.deviceId || ''
          )
            .toLowerCase()
            .includes(
              mapFilterSearch
            ) ||
          String(
            asset.name || ''
          )
            .toLowerCase()
            .includes(
              mapFilterSearch
            )

        return {
          asset,
          item,
          latitude,
          longitude,
          status,
          movement,
          activeDispatch,
          selected,
          visible:
            statusEnabled &&
            statusMatches &&
            searchMatches
        }
      })
      .filter(
        (
          entry
        ): entry is NonNullable<
          typeof entry
        > =>
          Boolean(entry)
      )

  const visibleFleetMapAssets =
    fleetMapAssets.filter(
      (entry) =>
        entry.visible
    )

  const fleetMapPoints =
    visibleFleetMapAssets.map(
      (entry) =>
        [
          entry.latitude,
          entry.longitude
        ] as [number, number]
    )

  const fleetMapBoundsKey =
    fleetMapPoints
      .map(
        ([latitude, longitude]) =>
          `${latitude.toFixed(5)},${longitude.toFixed(5)}`
      )
      .join('|')

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

  const batteryPercentRaw =
    telemetry?.batteryPercent != null
      ? Number(
          telemetry.batteryPercent
        )
      : null

  const batteryPercent =
    batteryPercentRaw != null &&
    Number.isFinite(
      batteryPercentRaw
    )
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round(
              batteryPercentRaw
            )
          )
        )
      : null

  const batteryVoltageRaw =
    telemetry?.batteryVoltage != null
      ? Number(
          telemetry.batteryVoltage
        )
      : null

  const batteryVoltage =
    batteryVoltageRaw != null &&
    Number.isFinite(
      batteryVoltageRaw
    )
      ? batteryVoltageRaw
      : null

  const batteryLevel =
    getBatteryLevel(
      batteryPercent
    )

  const batteryLabel =
    getBatteryLabel(
      batteryPercent
    )

  const selectedAsset =
    assets.find(
      (asset) =>
        asset.deviceId ===
        selectedDeviceId
    )

  const selectedAssetName =
    selectedAsset?.name ||
    selectedDeviceId ||
    'Select an asset'

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

  const requestRoadMatch =
    useCallback(
      async (
        tracks: Array<{
          id: string
          points: Array<{
            latitude: number
            longitude: number
            timestamp: string
          }>
        }>
      ): Promise<RoadMatchedTrack[]> => {
        const token =
          localStorage.getItem(
            'maverick_token'
          )

        if (!token || tracks.length === 0) {
          return []
        }

        const res = await fetch(
          `${API_BASE}/api/road-match`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
              Authorization:
                `Bearer ${token}`
            },
            body: JSON.stringify({ tracks })
          }
        )

        const data = await res.json()

        if (res.status === 401) {
          handleLogout()
          return []
        }

        if (!res.ok || !data.ok) {
          return []
        }

        return (data.tracks || [])
          .map((track: any) => ({
            id: String(track.id),
            source:
              track.source === 'match' ||
              track.source === 'road'
                ? track.source
                : 'raw',
            confidence:
              track.confidence == null
                ? null
                : Number(track.confidence),
            coverage:
              Number(track.coverage || 0),
            segments:
              Array.isArray(track.segments)
                ? track.segments
                    .map((segment: any) =>
                      Array.isArray(segment)
                        ? segment
                            .map((pair: any) => [
                              Number(pair[0]),
                              Number(pair[1])
                            ] as [number, number])
                            .filter(
                              (pair: [number, number]) =>
                                Number.isFinite(pair[0]) &&
                                Number.isFinite(pair[1])
                            )
                        : []
                    )
                    .filter(
                      (segment: [number, number][]) =>
                        segment.length > 1
                    )
                : []
          }))
          .filter(
            (track: RoadMatchedTrack) =>
              track.segments.length > 0
          )
      },
      []
    )


  const routeLatLngs =
    routePoints.map(
      (point) => [
        point.latitude,
        point.longitude
      ] as [number, number]
    )

  useEffect(() => {
    if (routePoints.length < 2) {
      setLiveRoadSegments([])
      liveRoadProcessedRef.current = null
      return
    }

    const lastPoint =
      routePoints[routePoints.length - 1]

    if (
      liveRoadProcessedRef.current ===
      lastPoint.timestamp
    ) {
      return
    }

    liveRoadProcessedRef.current =
      lastPoint.timestamp

    // Use recent context for matching the newest road segment.
    // The previously matched geometry stays on screen, so we do
    // not re-send the entire trip to OSRM every minute.
    const contextPoints =
      routePoints.slice(-6)

    requestRoadMatch([
      {
        id: 'live',
        points: contextPoints
      }
    ])
      .then((matched) => {
        const newest = matched[0]

        if (!newest?.segments?.length) {
          return
        }

        const newestSegment =
          newest.segments[
            newest.segments.length - 1
          ]

        if (!newestSegment?.length) {
          return
        }

        setLiveRoadSegments(
          (current) => [
            ...current,
            newestSegment
          ].slice(-320)
        )
      })
      .catch(() => {
        // Keep the raw breadcrumb as a fallback.
      })
  }, [routePoints, requestRoadMatch])

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

  const assetTemperatureBelowLimit =
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

  const assetTemperatureAboveLimit =
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

  const dispatchTemperatureBelowLimit =
    currentTemperatureC != null &&
    selectedActiveDispatch
      ?.temperatureMinC != null &&
    currentTemperatureC <
      Number(
        selectedActiveDispatch.temperatureMinC
      )

  const dispatchTemperatureAboveLimit =
    currentTemperatureC != null &&
    selectedActiveDispatch
      ?.temperatureMaxC != null &&
    currentTemperatureC >
      Number(
        selectedActiveDispatch.temperatureMaxC
      )

  const assetTemperatureOutOfRange =
    assetTemperatureBelowLimit ||
    assetTemperatureAboveLimit

  const dispatchTemperatureOutOfRange =
    dispatchTemperatureBelowLimit ||
    dispatchTemperatureAboveLimit

  // Asset and Dispatch limits are monitored together.
  // A violation of either one activates the same asset alert.


  const temperatureOutOfRange =
    assetTemperatureOutOfRange ||
    dispatchTemperatureOutOfRange

  const temperatureAboveLimit =
    assetTemperatureAboveLimit ||
    dispatchTemperatureAboveLimit

  const dispatchHasTemperatureLimits =
    Boolean(
      selectedActiveDispatch &&
      (
        selectedActiveDispatch.temperatureMinC != null ||
        selectedActiveDispatch.temperatureMaxC != null
      )
    )

  const temperatureAlertSource =
    assetTemperatureOutOfRange &&
    dispatchTemperatureOutOfRange
      ? 'Asset + Dispatch'
      : dispatchTemperatureOutOfRange
        ? 'Dispatch'
        : assetTemperatureOutOfRange
          ? 'Asset'
          : ''

  const temperatureAlertLimitText = (() => {
    const parts: string[] = []

    if (assetTemperatureBelowLimit) {
      parts.push(
        `Asset min ${celsiusToFahrenheit(
          Number(
            selectedAsset?.temperatureMinC
          )
        ).toFixed(1)}°F`
      )
    }

    if (assetTemperatureAboveLimit) {
      parts.push(
        `Asset max ${celsiusToFahrenheit(
          Number(
            selectedAsset?.temperatureMaxC
          )
        ).toFixed(1)}°F`
      )
    }

    if (dispatchTemperatureBelowLimit) {
      parts.push(
        `Dispatch min ${celsiusToFahrenheit(
          Number(
            selectedActiveDispatch?.temperatureMinC
          )
        ).toFixed(1)}°F`
      )
    }

    if (dispatchTemperatureAboveLimit) {
      parts.push(
        `Dispatch max ${celsiusToFahrenheit(
          Number(
            selectedActiveDispatch?.temperatureMaxC
          )
        ).toFixed(1)}°F`
      )
    }

    return parts.join(' · ')
  })()

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
    setFleetTelemetry({})
    setIsLoggedIn(false)
  }

  const handleLogin = () => {
    setCurrentUser(
      readStoredUser()
    )

    setIsLoggedIn(true)
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

  const openTemperatureLimits = () => {
    if (!selectedAsset) {
      return
    }

    setTemperatureLimitsError('')

    // If an active dispatch defines temperature limits,
    // show those limits here so Asset + Dispatch remain
    // synchronized in the UI.
    const effectiveMinC =
      selectedActiveDispatch
        ?.temperatureMinC != null
        ? Number(
            selectedActiveDispatch.temperatureMinC
          )
        : selectedAsset.temperatureMinC != null
          ? Number(
              selectedAsset.temperatureMinC
            )
          : null

    const effectiveMaxC =
      selectedActiveDispatch
        ?.temperatureMaxC != null
        ? Number(
            selectedActiveDispatch.temperatureMaxC
          )
        : selectedAsset.temperatureMaxC != null
          ? Number(
              selectedAsset.temperatureMaxC
            )
          : null

    setTemperatureMinF(
      effectiveMinC != null
        ? celsiusToFahrenheit(
            effectiveMinC
          ).toFixed(1)
        : ''
    )

    setTemperatureMaxF(
      effectiveMaxC != null
        ? celsiusToFahrenheit(
            effectiveMaxC
          ).toFixed(1)
        : ''
    )

    setTemperatureAlertsEnabled(
      Boolean(
        (
          selectedActiveDispatch &&
          effectiveMinC != null &&
          effectiveMaxC != null
        ) ||
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
        selectedDeviceId ||
        telemetry?.deviceId

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

  const generateReport =
    async () => {
      const token =
        localStorage.getItem(
          'maverick_token'
        )

      const deviceId =
        selectedDeviceId ||
        telemetry?.deviceId

      if (!token) {
        setReportError(
          'Your session has expired.'
        )
        return
      }

      if (!deviceId) {
        setReportError(
          'Select an asset before generating a report.'
        )
        setReportPoints([])
        return
      }

      const {
        from,
        to
      } = getHistoryWindow(
        reportRange,
        reportCustomDate
      )

      setReportLoading(true)
      setReportError('')

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
          setReportPoints([])
          setReportError(
            data.message ||
            'Unable to generate report.'
          )
          return
        }

        const points: HistoryPoint[] =
          (data.points || []).map(
            (point: any) => ({
              id: Number(point.id),
              latitude:
                point.latitude == null
                  ? null
                  : Number(
                      point.latitude
                    ),
              longitude:
                point.longitude == null
                  ? null
                  : Number(
                      point.longitude
                    ),
              timestamp:
                String(point.timestamp),
              temperature:
                Number(
                  point.temperature
                ),
              altitude:
                point.altitude == null
                  ? null
                  : Number(
                      point.altitude
                    ),
              speedKph:
                point.speedKph == null
                  ? null
                  : Number(
                      point.speedKph
                    ),
              movementStatus:
                point.movementStatus == null
                  ? null
                  : String(
                      point.movementStatus
                    )
            })
          )

        setReportPoints(points)
        setReportGeneratedAt(
          new Date().toISOString()
        )
      } catch {
        setReportPoints([])
        setReportError(
          'Unable to connect to Maverick.'
        )
      } finally {
        setReportLoading(false)
      }
    }

  const exportReportPdf = () => {
    if (reportPoints.length === 0) {
      setReportError(
        'Generate the report before exporting it.'
      )
      return
    }

    const originalTitle =
      document.title

    const safeAssetName =
      (
        selectedAsset?.name ||
        selectedDeviceId ||
        'Maverick'
      )
        .replace(
          /[^a-zA-Z0-9-_]+/g,
          '-'
        )

    document.title =
      `Maverick-${safeAssetName}-Telemetry-Report`

    window.print()

    window.setTimeout(() => {
      document.title =
        originalTitle
    }, 500)
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

  const calculateHistoryDistance = (
    points: HistoryPoint[]
  ) =>
    points.reduce(
      (total, point, index) => {
        if (index === 0) {
          return 0
        }

        const previous =
          points[index - 1]

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

  const buildTripLegs = (
    trip: HistoryTrip | null
  ): HistoryLeg[] => {
    if (!trip || trip.points.length < 6) {
      return []
    }

    const startPoint = trip.points[0]

    if (
      startPoint.latitude == null ||
      startPoint.longitude == null
    ) {
      return []
    }

    const distancesFromStart =
      trip.points.map((point) =>
        point.latitude == null ||
        point.longitude == null
          ? 0
          : distanceMiles(
              startPoint.latitude as number,
              startPoint.longitude as number,
              point.latitude,
              point.longitude
            )
      )

    const maxDistance =
      Math.max(...distancesFromStart)

    if (maxDistance < 1) {
      return []
    }

    const nearTurnaroundIndexes =
      distancesFromStart
        .map((value, index) => ({
          value,
          index
        }))
        .filter(
          ({ value }) =>
            value >= maxDistance * 0.97
        )
        .map(({ index }) => index)

    if (nearTurnaroundIndexes.length === 0) {
      return []
    }

    const firstTurn =
      nearTurnaroundIndexes[0]
    const lastTurn =
      nearTurnaroundIndexes[
        nearTurnaroundIndexes.length - 1
      ]
    const turnaroundIndex =
      Math.round(
        (firstTurn + lastTurn) / 2
      )

    const minEdge =
      Math.max(2, Math.floor(trip.points.length * 0.15))
    const maxEdge =
      Math.min(
        trip.points.length - 3,
        Math.ceil(trip.points.length * 0.85)
      )

    if (
      turnaroundIndex < minEdge ||
      turnaroundIndex > maxEdge
    ) {
      return []
    }

    const outboundPoints =
      trip.points.slice(0, turnaroundIndex + 1)
    const returnPoints =
      trip.points.slice(turnaroundIndex)

    const outboundDistance =
      calculateHistoryDistance(outboundPoints)
    const returnDistance =
      calculateHistoryDistance(returnPoints)

    const endPoint =
      trip.points[trip.points.length - 1]
    const endDistanceFromStart =
      endPoint.latitude == null ||
      endPoint.longitude == null
        ? maxDistance
        : distanceMiles(
            startPoint.latitude,
            startPoint.longitude,
            endPoint.latitude,
            endPoint.longitude
          )

    const looksLikeReturn =
      endDistanceFromStart <= maxDistance * 0.65 &&
      outboundDistance >= 0.75 &&
      returnDistance >= 0.75

    if (!looksLikeReturn) {
      return []
    }

    return [
      {
        id: 'outbound',
        label: 'Outbound',
        points: outboundPoints,
        start: outboundPoints[0].timestamp,
        end: outboundPoints[outboundPoints.length - 1].timestamp,
        distanceMiles: outboundDistance
      },
      {
        id: 'return',
        label: 'Return',
        points: returnPoints,
        start: returnPoints[0].timestamp,
        end: returnPoints[returnPoints.length - 1].timestamp,
        distanceMiles: returnDistance
      }
    ]
  }

  const selectedHistoryTrip =
    selectedHistoryTripId === 'all'
      ? null
      : historyTrips.find(
          (trip) =>
            trip.id === selectedHistoryTripId
        ) || null

  const selectedTripLegs =
    buildTripLegs(selectedHistoryTrip)

  const selectedHistoryLeg =
    selectedHistoryLegId === 'all'
      ? null
      : selectedTripLegs.find(
          (leg) =>
            leg.id === selectedHistoryLegId
        ) || null

  const displayedHistoryPoints =
    selectedHistoryTripId === 'all'
      ? historyGpsPoints
      : selectedHistoryLeg?.points ||
        selectedHistoryTrip?.points ||
        []

  const historyLatLngs =
    displayedHistoryPoints.map(
      (point) => [
        point.latitude as number,
        point.longitude as number
      ] as [number, number]
    )

  const rawHistorySegments =
    selectedHistoryTripId === 'all'
      ? historyTrips.map(
          (trip) =>
            trip.points.map(
              (point) => [
                point.latitude as number,
                point.longitude as number
              ] as [number, number]
            )
        )
      : historyLatLngs.length > 1
        ? [historyLatLngs]
        : []

  useEffect(() => {
    if (!historyOpen) {
      setHistoryRoadTracks([])
      return
    }

    const tracks =
      selectedHistoryTripId === 'all'
        ? historyTrips.map((trip) => ({
            id: `trip-${trip.id}`,
            points: trip.points.map((point) => ({
              latitude: point.latitude as number,
              longitude: point.longitude as number,
              timestamp: point.timestamp
            }))
          }))
        : (() => {
            const trip = historyTrips.find(
              (candidate) =>
                candidate.id ===
                selectedHistoryTripId
            )

            const activePoints =
              selectedHistoryLeg?.points ||
              trip?.points ||
              []

            return trip && activePoints.length > 1
              ? [{
                  id: `trip-${trip.id}-${selectedHistoryLegId}`,
                  points: activePoints.map((point) => ({
                    latitude: point.latitude as number,
                    longitude: point.longitude as number,
                    timestamp: point.timestamp
                  }))
                }]
              : []
          })()

    if (tracks.length === 0) {
      setHistoryRoadTracks([])
      return
    }

    let cancelled = false
    setRoadMatchLoading(true)

    requestRoadMatch(tracks)
      .then((matched) => {
        if (!cancelled) {
          setHistoryRoadTracks(matched)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHistoryRoadTracks([])
        }
      })
      .finally(() => {
        if (!cancelled) {
          setRoadMatchLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [
    historyOpen,
    historyPoints,
    selectedHistoryTripId,
    selectedHistoryLegId,
    requestRoadMatch
  ])

  const historyDisplaySegments =
    historyRoadTracks.length > 0
      ? historyRoadTracks.flatMap(
          (track) => track.segments
        )
      : rawHistorySegments

  const historyDirectionArrows =
    buildHistoryDirectionArrows(
      historyDisplaySegments
    )

  const historyDisplayedMapPoints =
    historyDisplaySegments.length > 0
      ? historyDisplaySegments.flat()
      : historyLatLngs

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

  const temperatureHistoryWindow =
    selectedHistoryLeg ||
    selectedHistoryTrip

  const displayedTemperaturePoints =
    temperatureHistoryWindow == null
      ? historyPoints
      : historyPoints.filter((point) => {
          const time = new Date(
            point.timestamp
          ).getTime()
          return (
            time >= new Date(
              temperatureHistoryWindow.start
            ).getTime() &&
            time <= new Date(
              temperatureHistoryWindow.end
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
  const temperatureChartHeight = 250
  const temperatureChartPadding = 38

  const temperatureChartStartMs =
    displayedTemperaturePoints.length > 0
      ? new Date(
          displayedTemperaturePoints[0].timestamp
        ).getTime()
      : 0

  const temperatureChartEndMs =
    displayedTemperaturePoints.length > 0
      ? new Date(
          displayedTemperaturePoints[
            displayedTemperaturePoints.length - 1
          ].timestamp
        ).getTime()
      : temperatureChartStartMs + 1

  const temperatureChartDurationMs =
    Math.max(
      1,
      temperatureChartEndMs -
        temperatureChartStartMs
    )

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

        const pointTimeMs =
          new Date(point.timestamp).getTime()

        const x =
          temperatureChartPadding +
          (pointTimeMs - temperatureChartStartMs) /
            temperatureChartDurationMs *
            (temperatureChartWidth -
              temperatureChartPadding * 2)

        const previousTemperatureF =
          index === 0
            ? null
            : displayedTemperaturePoints[index - 1].temperature * 9 / 5 + 32

        const deltaF =
          previousTemperatureF == null
            ? null
            : temperatureF - previousTemperatureF

        const y =
          temperatureChartPadding +
          (chartMax - temperatureF) /
            chartRange *
            (temperatureChartHeight -
              temperatureChartPadding * 2)

        return {
          ...point,
          temperatureF,
          deltaF,
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

  const temperatureTimeTicks =
    Array.from({ length: 5 }, (_, index) => {
      const ratio = index / 4
      const timestampMs =
        temperatureChartStartMs +
        temperatureChartDurationMs * ratio

      return {
        x:
          temperatureChartPadding +
          ratio *
            (temperatureChartWidth -
              temperatureChartPadding * 2),
        label: new Date(timestampMs)
          .toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit'
          })
      }
    })

  const significantTemperatureChanges =
    temperatureChartPoints
      .filter(
        (point) =>
          point.deltaF != null &&
          Math.abs(point.deltaF) >= 1.5
      )
      .sort(
        (a, b) =>
          Math.abs(b.deltaF as number) -
          Math.abs(a.deltaF as number)
      )
      .slice(0, 8)
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() -
          new Date(b.timestamp).getTime()
      )

  const significantTemperatureChangeIds =
    new Set(
      significantTemperatureChanges.map(
        (point) => point.id
      )
    )

  const reportTemperatureValuesF =
    reportPoints
      .map(
        (point) =>
          celsiusToFahrenheit(
            Number(
              point.temperature
            )
          )
      )
      .filter(
        (value) =>
          Number.isFinite(value)
      )

  const reportGpsPoints =
    reportPoints.filter(
      (point) =>
        point.latitude != null &&
        point.longitude != null
    )

  const reportAverageTempF =
    reportTemperatureValuesF.length > 0
      ? reportTemperatureValuesF.reduce(
          (
            sum,
            value
          ) =>
            sum + value,
          0
        ) /
        reportTemperatureValuesF.length
      : null

  const reportMinTempF =
    reportTemperatureValuesF.length > 0
      ? Math.min(
          ...reportTemperatureValuesF
        )
      : null

  const reportMaxTempF =
    reportTemperatureValuesF.length > 0
      ? Math.max(
          ...reportTemperatureValuesF
        )
      : null

  const reportDistanceMiles =
    reportGpsPoints.reduce(
      (
        total,
        point,
        index
      ) => {
        if (index === 0) {
          return total
        }

        const previous =
          reportGpsPoints[
            index - 1
          ]

        return total +
          distanceMiles(
            Number(
              previous.latitude
            ),
            Number(
              previous.longitude
            ),
            Number(
              point.latitude
            ),
            Number(
              point.longitude
            )
          )
      },
      0
    )

  const reportEffectiveMinC =
    selectedActiveDispatch
      ?.temperatureMinC ??
    selectedAsset
      ?.temperatureMinC ??
    null

  const reportEffectiveMaxC =
    selectedActiveDispatch
      ?.temperatureMaxC ??
    selectedAsset
      ?.temperatureMaxC ??
    null

  const reportOutOfRangeCount =
    reportPoints.filter(
      (point) => {
        const tempC =
          Number(
            point.temperature
          )

        return (
          (
            reportEffectiveMinC != null &&
            tempC <
              Number(
                reportEffectiveMinC
              )
          ) ||
          (
            reportEffectiveMaxC != null &&
            tempC >
              Number(
                reportEffectiveMaxC
              )
          )
        )
      }
    ).length

  const reportPeriod =
    getHistoryWindow(
      reportRange,
      reportCustomDate
    )

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

  const normalizedAssetSearch =
    assetSearchTerm
      .trim()
      .toLowerCase()

  const assetSearchMatches =
    normalizedAssetSearch
      ? assets
          .filter((asset) => {
            const deviceId =
              String(
                asset.deviceId || ''
              ).toLowerCase()

            const name =
              String(
                asset.name || ''
              ).toLowerCase()

            return (
              deviceId.includes(
                normalizedAssetSearch
              ) ||
              name.includes(
                normalizedAssetSearch
              )
            )
          })
          .slice(0, 8)
      : []

  const selectAssetFromSearch = (
    asset: any
  ) => {
    if (!asset?.deviceId) {
      return
    }

    setSelectedDeviceId(
      asset.deviceId
    )
    setAssetSearchTerm('')
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
    if (event.key !== 'Enter') {
      return
    }

    const exactMatch =
      assets.find((asset) => {
        const deviceId =
          String(
            asset.deviceId || ''
          ).toLowerCase()

        const name =
          String(
            asset.name || ''
          ).toLowerCase()

        return (
          deviceId ===
            normalizedAssetSearch ||
          name ===
            normalizedAssetSearch
        )
      })

    const assetToSelect =
      exactMatch ||
      assetSearchMatches[0]

    if (assetToSelect) {
      event.preventDefault()
      selectAssetFromSearch(
        assetToSelect
      )
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

        <div className="mav-search asset-search">
          <span>⌕</span>

          <input
            type="text"
            value={
              assetSearchTerm
            }
            onChange={
              (event) =>
                setAssetSearchTerm(
                  event.target.value
                )
            }
            onKeyDown={
              handleSearchKeyDown
            }
            placeholder="Search trailer ID or asset name"
            aria-label="Search and select trailer"
            autoComplete="off"
          />

          {
            assetSearchTerm && (
              <button
                className="clear-search"
                onClick={() =>
                  setAssetSearchTerm('')
                }
                type="button"
                aria-label="Clear trailer search"
              >
                ×
              </button>
            )
          }

          {
            normalizedAssetSearch && (
              <div className="asset-search-results">
                {
                  assetSearchMatches.length > 0
                    ? assetSearchMatches.map(
                        (asset) => {
                          const item =
                            fleetTelemetry[
                              asset.deviceId
                            ] ?? null

                          const status =
                            getDeviceStatusForTelemetry(
                              item
                            )

                          return (
                            <button
                              key={asset.id}
                              className="asset-search-result"
                              onMouseDown={(event) =>
                                event.preventDefault()
                              }
                              onClick={() =>
                                selectAssetFromSearch(
                                  asset
                                )
                              }
                              type="button"
                            >
                              <span
                                className={
                                  `mini-status ${status}`
                                }
                              >
                                ◈
                              </span>

                              <span className="asset-search-result-copy">
                                <strong>
                                  {
                                    asset.name ||
                                    asset.deviceId
                                  }
                                </strong>

                                <small>
                                  {asset.deviceId}
                                </small>
                              </span>

                              <em>
                                {
                                  status === 'online'
                                    ? 'Online'
                                    : status === 'delayed'
                                      ? 'Delayed'
                                      : 'Offline'
                                }
                              </em>
                            </button>
                          )
                        }
                      )
                    : (
                      <div className="asset-search-empty">
                        No trailer found
                      </div>
                    )
                }
              </div>
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

        <div
          className={
            `selected-asset-chip ${
              selectedDeviceId
                ? 'active'
                : 'empty'
            }`
          }
          title={
            selectedDeviceId
              ? 'Selected asset'
              : 'Use Search Trailer ID above to select an asset'
          }
        >
          <span className="selected-asset-chip-icon">
            ◈
          </span>

          <span className="selected-asset-chip-copy">
            <strong>
              {
                selectedAsset
                  ? (
                    selectedAsset.name ||
                    selectedAsset.deviceId
                  )
                  : 'No asset selected'
              }
            </strong>

            {
              selectedAsset &&
              selectedAsset.name !==
                selectedAsset.deviceId && (
                <small>
                  {selectedAsset.deviceId}
                </small>
              )
            }
          </span>

          {
            selectedDeviceId && (
              <button
                type="button"
                aria-label="Clear selected asset"
                onClick={() => {
                  setSelectedDeviceId('')
                  setAssetSearchTerm('')
                  setSearchTerm('')
                }}
              >
                ×
              </button>
            )
          }
        </div>

        <div className="metric-pill neutral">
          <span className="metric-dot" />

          <strong>
            {assets.length}
          </strong>

          Assets
        </div>

        <div className="metric-pill online">
          <span className="metric-dot" />

          <strong>
            {fleetStatusCounts.online}
          </strong>

          Online
        </div>

        <div className="metric-pill delayed">
          <span className="metric-dot" />

          <strong>
            {fleetStatusCounts.delayed}
          </strong>

          Delayed
        </div>

        <div className="metric-pill offline">
          <span className="metric-dot" />

          <strong>
            {fleetStatusCounts.offline}
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
                  fleetPoints={
                    fleetMapPoints
                  }
                  fleetBoundsKey={
                    fleetMapBoundsKey
                  }
                />

                <ResponsiveMapSize />

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
                  liveRoadSegments.length > 0
                    ? liveRoadSegments.map(
                        (segment, index) => (
                          <Polyline
                            key={`live-road-${index}`}
                            positions={segment}
                            pathOptions={{
                              color: '#22c55e',
                              weight: 5,
                              opacity: 0.9
                            }}
                          />
                        )
                      )
                    : showRoute &&
                      routeLatLngs.length > 1
                      ? (
                        <Polyline
                          positions={routeLatLngs}
                          pathOptions={{
                            color: '#22c55e',
                            weight: 4,
                            opacity: 0.65,
                            dashArray: '6 7'
                          }}
                        />
                      )
                      : null
                }

                {
                  visibleFleetMapAssets.map(
                    (entry) => {
                      const {
                        asset,
                        item,
                        latitude,
                        longitude,
                        status,
                        movement,
                        activeDispatch,
                        selected
                      } = entry

                      const assetName =
                        asset.name ||
                        asset.deviceId

                      const statusText =
                        status === 'online'
                          ? 'Online'
                          : status === 'delayed'
                            ? 'Delayed'
                            : 'Offline'

                      const movementText =
                        movement === 'moving'
                          ? 'Moving'
                          : movement === 'parked'
                            ? 'Parked'
                            : movement === 'acquiring'
                              ? 'Acquiring GPS'
                              : 'Offline'

                      const speedMphForAsset =
                        item?.speedKph != null
                          ? Math.max(
                              0,
                              Number(
                                item.speedKph
                              )
                            ) * 0.621371
                          : 0

                      const tempFForAsset =
                        item?.temperature != null
                          ? celsiusToFahrenheit(
                              Number(
                                item.temperature
                              )
                            )
                          : null

                      return (
                        <Marker
                          key={
                            asset.deviceId
                          }
                          position={[
                            latitude,
                            longitude
                          ]}
                          icon={
                            createTrailerIcon(
                              movement,
                              selected,
                              Boolean(
                                activeDispatch
                              )
                            )
                          }
                          opacity={
                            item?.hasCurrentGps
                              ? 1
                              : 0.62
                          }
                          eventHandlers={{
                            click: () => {
                              setSelectedDeviceId(
                                asset.deviceId
                              )
                              setAssetSearchTerm('')
                              setSearchTerm('')
                              setStatusFilter('all')
                              setAssetTypeFilter('all')
                              setShowOnline(true)
                              setShowDelayed(true)
                              setShowOffline(true)
                              setActiveView('map')
                            }
                          }}
                        >
                          <Popup>
                            <div
                              className={
                                `map-popup map-popup-${status}`
                              }
                            >
                              <strong>
                                {assetName}
                              </strong>

                              {
                                assetName !==
                                  asset.deviceId && (
                                  <>
                                    <br />
                                    Device ID:{' '}
                                    {
                                      asset.deviceId
                                    }
                                  </>
                                )
                              }

                              <br />
                              Status:{' '}
                              <strong>
                                {statusText}
                              </strong>

                              {
                                activeDispatch && (
                                  <>
                                    <br />
                                    Load:{' '}
                                    <strong>
                                      {
                                        activeDispatch.loadNumber
                                      }
                                    </strong>
                                    {' · '}
                                    {
                                      dispatchStatusLabel(
                                        activeDispatch.status
                                      )
                                    }
                                  </>
                                )
                              }

                              <br />
                              Movement:{' '}
                              <strong
                                className={
                                  `popup-movement ${movement}`
                                }
                              >
                                {movementText}
                              </strong>

                              <br />
                              Speed:{' '}
                              {
                                speedMphForAsset.toFixed(
                                  1
                                )
                              } mph

                              <br />
                              Temperature:{' '}
                              {
                                tempFForAsset != null
                                  ? `${tempFForAsset.toFixed(1)}°F`
                                  : 'No data'
                              }

                              <br />
                              {
                                item?.hasCurrentGps
                                  ? 'Current GPS location'
                                  : 'Last known location'
                              }

                              <br />
                              Last Ping:{' '}
                              {
                                item?.receivedAt
                                  ? formatAge(
                                      item.receivedAt
                                    )
                                  : 'No data'
                              }
                            </div>
                          </Popup>
                        </Marker>
                      )
                    }
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

              <aside
                className={
                  `floating-panel asset-panel ${
                    temperatureOutOfRange
                      ? 'temperature-alert'
                      : ''
                  }`
                }
              >

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

                        {
                          selectedActiveDispatch && (
                            <div className="asset-dispatch-banner">
                              <div className="asset-dispatch-banner-top">
                                <span className="asset-dispatch-kicker">
                                  LOAD ASSIGNED
                                </span>

                                <span
                                  className={
                                    `dispatch-status-pill ${selectedActiveDispatch.status.toLowerCase()}`
                                  }
                                >
                                  {
                                    dispatchStatusLabel(
                                      selectedActiveDispatch.status
                                    )
                                  }
                                </span>
                              </div>

                              <div className="asset-dispatch-main">
                                <div>
                                  <strong>
                                    {
                                      selectedActiveDispatch.loadNumber
                                    }
                                  </strong>

                                  <small>
                                    {
                                      selectedActiveDispatch.pickupName
                                    }
                                    {' → '}
                                    {
                                      selectedActiveDispatch.deliveryName
                                    }
                                  </small>
                                </div>

                                <button
                                  type="button"
                                  onClick={() =>
                                    setActiveView(
                                      'operations'
                                    )
                                  }
                                >
                                  Open Dispatch
                                </button>
                              </div>
                            </div>
                          )
                        }

                        <div className="panel-divider" />

                        <dl className="asset-details">

                          <div
                            className={
                              temperatureOutOfRange
                                ? 'asset-temperature-row alert'
                                : 'asset-temperature-row'
                            }
                          >
                            <dt>
                              {temperatureLabel}
                            </dt>

                            <dd>
                              <strong>
                                {temperatureF}°F
                              </strong>

                              {
                                temperatureOutOfRange && (
                                  <small className="temperature-alert-note">
                                    ⚠ Outside {
                                      temperatureAlertSource
                                    } limits
                                  </small>
                                )
                              }
                            </dd>
                          </div>

                          <div className="asset-battery-row">
                            <dt>
                              Battery
                            </dt>

                            <dd>
                              <div className="battery-monitor">
                                <div className="battery-monitor-top">
                                  <strong>
                                    {
                                      batteryPercent != null
                                        ? `${batteryPercent}%`
                                        : '—'
                                    }
                                  </strong>

                                  <span
                                    className={
                                      `battery-state ${batteryLevel}`
                                    }
                                  >
                                    {batteryLabel}
                                  </span>
                                </div>

                                <div
                                  className="battery-track"
                                  aria-label={
                                    batteryPercent != null
                                      ? `Battery ${batteryPercent}%`
                                      : 'Battery unavailable'
                                  }
                                >
                                  <span
                                    className={
                                      `battery-fill ${batteryLevel}`
                                    }
                                    style={{
                                      width:
                                        batteryPercent != null
                                          ? `${batteryPercent}%`
                                          : '0%'
                                    }}
                                  />
                                </div>

                                <div className="battery-monitor-bottom">
                                  <span>
                                    {
                                      batteryVoltage != null
                                        ? `${batteryVoltage.toFixed(2)} V`
                                        : 'Voltage unavailable'
                                    }
                                  </span>

                                  <span>
                                    Internal battery
                                  </span>
                                </div>
                              </div>
                            </dd>
                          </div>

                          <div>
                            <dt>
                              Asset Temp Limits
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

                          {
                            selectedActiveDispatch && (
                              <div
                                className={
                                  dispatchTemperatureOutOfRange
                                    ? 'dispatch-temperature-limits alert'
                                    : 'dispatch-temperature-limits'
                                }
                              >
                                <dt>
                                  Dispatch Temp Limits
                                </dt>

                                <dd>
                                  {
                                    selectedActiveDispatch
                                      .temperatureMinC != null &&
                                    selectedActiveDispatch
                                      .temperatureMaxC != null
                                      ? `${celsiusToFahrenheit(
                                          Number(
                                            selectedActiveDispatch.temperatureMinC
                                          )
                                        ).toFixed(1)}°F – ${celsiusToFahrenheit(
                                          Number(
                                            selectedActiveDispatch.temperatureMaxC
                                          )
                                        ).toFixed(1)}°F`
                                      : dispatchHasTemperatureLimits
                                        ? [
                                            selectedActiveDispatch.temperatureMinC != null
                                              ? `Min ${celsiusToFahrenheit(
                                                  Number(
                                                    selectedActiveDispatch.temperatureMinC
                                                  )
                                                ).toFixed(1)}°F`
                                              : null,
                                            selectedActiveDispatch.temperatureMaxC != null
                                              ? `Max ${celsiusToFahrenheit(
                                                  Number(
                                                    selectedActiveDispatch.temperatureMaxC
                                                  )
                                                ).toFixed(1)}°F`
                                              : null
                                          ]
                                            .filter(Boolean)
                                            .join(' · ')
                                        : 'Not configured'
                                  }

                                  {
                                    selectedActiveDispatch
                                      .temperatureSetpointC != null && (
                                      <small className="dispatch-setpoint">
                                        Set point {
                                          celsiusToFahrenheit(
                                            Number(
                                              selectedActiveDispatch.temperatureSetpointC
                                            )
                                          ).toFixed(1)
                                        }°F
                                      </small>
                                    )
                                  }
                                </dd>
                              </div>
                            )
                          }

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

              <div className="page-card fleet-table-card">

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
                  assets.length > 0
                    ? assets.map((asset) => {
                        const item =
                          fleetTelemetry[asset.deviceId] ??
                          (telemetry?.deviceId === asset.deviceId
                            ? telemetry
                            : null)

                        const rowStatus =
                          getDeviceStatusForTelemetry(item)

                        const rowStatusLabel =
                          rowStatus === 'online'
                            ? 'Online'
                            : rowStatus === 'delayed'
                              ? 'Delayed'
                              : 'Offline'

                        const rowDispatch =
                          activeDispatches.find(
                            (dispatch) =>
                              dispatch.asset
                                ?.deviceId ===
                              asset.deviceId
                          ) || null

                        const rowMovement =
                          getMovementStatusForTelemetry(
                            item,
                            rowStatus
                          )

                        const rowMovementLabel =
                          getDetailedMovementLabel(
                            item,
                            rowStatus,
                            rowDispatch
                          )

                        const rowTemperatureF =
                          item?.temperature != null
                            ? (
                                (Number(item.temperature) * 9) / 5 +
                                32
                              ).toFixed(1)
                            : '--'

                        return (
                          <div
                            className="fleet-row"
                            key={asset.id}
                          >
                            <div className="fleet-asset-name">
                              <span
                                className={
                                  `mini-status ${rowStatus}`
                                }
                              >
                                ◈
                              </span>

                              <div>
                                <strong>
                                  {asset.name || asset.deviceId}
                                </strong>

                                <small>
                                  {asset.deviceId}
                                </small>
                              </div>
                            </div>

                            <span
                              className={
                                `inline-status ${rowStatus}`
                              }
                            >
                              {rowStatusLabel}
                            </span>

                            <span
                              className={
                                `inline-movement ${rowMovement}`
                              }
                            >
                              {rowMovementLabel}
                            </span>

                            <span>
                              {item
                                ? rowStatus === 'online'
                                  ? `${rowTemperatureF}°F`
                                  : `Last ${rowTemperatureF}°F`
                                : 'No data'}
                            </span>

                            <span>
                              {item?.receivedAt
                                ? formatDateTime(item.receivedAt)
                                : 'No telemetry'}
                            </span>

                            <div className="row-actions">
                              <button
                                onClick={() => {
                                  setSelectedDeviceId(
                                    asset.deviceId
                                  )
                                  setSearchTerm('')
                                  setStatusFilter('all')
                                  setAssetTypeFilter('all')
                                  setShowOnline(true)
                                  setShowDelayed(true)
                                  setShowOffline(true)
                                  setFiltersOpen(true)
                                  setActiveView('map')
                                }}
                                type="button"
                              >
                                Locate
                              </button>

                              <button
                                onClick={() => {
                                  setSelectedDeviceId(
                                    asset.deviceId
                                  )
                                  setRenameError('')
                                  setRenameValue(
                                    asset.name || asset.deviceId
                                  )
                                  setRenameOpen(true)
                                }}
                                type="button"
                              >
                                Rename
                              </button>

                              <button
                                onClick={() => {
                                  setSelectedDeviceId(
                                    asset.deviceId
                                  )
                                  setTemperatureLimitsError('')
                                  setTemperatureMinF(
                                    asset.temperatureMinC != null
                                      ? celsiusToFahrenheit(
                                          Number(asset.temperatureMinC)
                                        ).toFixed(1)
                                      : ''
                                  )
                                  setTemperatureMaxF(
                                    asset.temperatureMaxC != null
                                      ? celsiusToFahrenheit(
                                          Number(asset.temperatureMaxC)
                                        ).toFixed(1)
                                      : ''
                                  )
                                  setTemperatureAlertsEnabled(
                                    Boolean(
                                      asset.temperatureAlertsEnabled
                                    )
                                  )
                                  setTemperatureLimitsOpen(true)
                                }}
                                type="button"
                              >
                                Temp Limits
                              </button>

                              <button
                                onClick={() => {
                                  setSelectedDeviceId(
                                    asset.deviceId
                                  )
                                  setDetailsOpen(true)
                                }}
                                type="button"
                              >
                                Details
                              </button>
                            </div>
                          </div>
                        )
                      })
                    : (
                      <div className="page-empty">
                        No assets are available for this company.
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
            <section className="workspace-page operations-page">

              <div className="page-header operations-header">
                <div>
                  <span className="page-kicker">
                    Operations
                  </span>

                  <h1>
                    Dispatch Center
                  </h1>

                  <p>
                    Assign assets, manage loads and monitor live trailer telemetry from one workspace.
                  </p>
                </div>

                <button
                  className="primary-action"
                  onClick={() => {
                    setDispatchError('')
                    setNewDispatchOpen(true)
                  }}
                  type="button"
                >
                  + New Dispatch
                </button>
              </div>

              <div className="operations-kpis">
                <article className="page-card operations-kpi">
                  <span>Active Loads</span>
                  <strong>{activeDispatches.length}</strong>
                  <small>
                    Assigned through delivery
                  </small>
                </article>

                <article className="page-card operations-kpi">
                  <span>In Transit</span>
                  <strong>
                    {
                      dispatches.filter(
                        (item) =>
                          item.status ===
                          'IN_TRANSIT'
                      ).length
                    }
                  </strong>
                  <small>
                    Currently moving between facilities
                  </small>
                </article>

                <article className="page-card operations-kpi">
                  <span>At Facility</span>
                  <strong>
                    {
                      dispatches.filter(
                        (item) =>
                          item.status ===
                            'AT_PICKUP' ||
                          item.status ===
                            'AT_DELIVERY'
                      ).length
                    }
                  </strong>
                  <small>
                    Pickup or delivery activity
                  </small>
                </article>

                <article className="page-card operations-kpi">
                  <span>Available Assets</span>
                  <strong>
                    {availableAssets.length}
                  </strong>
                  <small>
                    Ready for assignment
                  </small>
                </article>
              </div>

              <div
                className="operations-tabs"
                role="tablist"
                aria-label="Operations load views"
              >
                <button
                  className={
                    operationsTab === 'active'
                      ? 'operations-tab active'
                      : 'operations-tab'
                  }
                  onClick={() => {
                    setOperationsTab('active')
                    setDispatchStatusFilter('all')
                  }}
                  role="tab"
                  aria-selected={
                    operationsTab === 'active'
                  }
                  type="button"
                >
                  <span>Active Loads</span>
                  <strong>
                    {activeDispatches.length}
                  </strong>
                </button>

                <button
                  className={
                    operationsTab === 'history'
                      ? 'operations-tab active'
                      : 'operations-tab'
                  }
                  onClick={() => {
                    setOperationsTab('history')
                    setDispatchStatusFilter('all')
                  }}
                  role="tab"
                  aria-selected={
                    operationsTab === 'history'
                  }
                  type="button"
                >
                  <span>Load History</span>
                  <strong>
                    {completedDispatches.length}
                  </strong>
                </button>
              </div>

              <div className="operations-toolbar page-card">
                <div className="operations-search">
                  <span>⌕</span>
                  <input
                    value={dispatchSearch}
                    onChange={(event) =>
                      setDispatchSearch(
                        event.target.value
                      )
                    }
                    placeholder="Search load, asset, pickup or delivery"
                    aria-label="Search dispatches"
                  />
                </div>

                <select
                  value={dispatchStatusFilter}
                  onChange={(event) =>
                    setDispatchStatusFilter(
                      event.target.value as
                        'all' | DispatchStatus
                    )
                  }
                  aria-label="Dispatch status filter"
                >
                  <option value="all">
                    All Statuses
                  </option>

                  {
                    dispatchStatusOptions
                      .filter((status) =>
                        operationsTab === 'active'
                          ? (
                              status !== 'DELIVERED' &&
                              status !== 'CANCELLED'
                            )
                          : (
                              status === 'DELIVERED' ||
                              status === 'CANCELLED'
                            )
                      )
                      .map(
                        (status) => (
                          <option
                            key={status}
                            value={status}
                          >
                            {
                              dispatchStatusLabel(
                                status
                              )
                            }
                          </option>
                        )
                      )
                  }
                </select>

                <button
                  className="secondary-action"
                  onClick={loadDispatches}
                  type="button"
                  disabled={dispatchLoading}
                >
                  {
                    dispatchLoading
                      ? 'Refreshing...'
                      : 'Refresh'
                  }
                </button>
              </div>

              {
                dispatchError && (
                  <div className="operations-error">
                    {dispatchError}
                  </div>
                )
              }

              <div className="operations-layout">
                <div className="operations-main">
                  <div className="operations-section-heading">
                    <div>
                      <span className="page-kicker">
                        {
                          operationsTab === 'active'
                            ? 'Loads'
                            : 'Archive'
                        }
                      </span>
                      <h2>
                        {
                          operationsTab === 'active'
                            ? 'Dispatch Board'
                            : 'Load History'
                        }
                      </h2>
                    </div>

                    <span>
                      {filteredDispatches.length}
                      {' '}
                      dispatch
                      {
                        filteredDispatches.length === 1
                          ? ''
                          : 'es'
                      }
                    </span>
                  </div>

                  <div className="dispatch-list">
                    {
                      filteredDispatches.length > 0
                        ? filteredDispatches.map(
                            (dispatch) => {
                              const item =
                                dispatch.asset?.deviceId
                                  ? fleetTelemetry[
                                      dispatch.asset.deviceId
                                    ] ?? null
                                  : null

                              const rowStatus =
                                getDeviceStatusForTelemetry(
                                  item
                                )

                              const rowTempF =
                                item?.temperature != null
                                  ? (
                                      Number(
                                        item.temperature
                                      ) *
                                        9 /
                                        5 +
                                      32
                                    ).toFixed(1)
                                  : '--'

                              const rowSpeedMph =
                                item?.speedKph != null &&
                                Number.isFinite(
                                  Number(
                                    item.speedKph
                                  )
                                )
                                  ? Math.max(
                                      0,
                                      Number(
                                        item.speedKph
                                      )
                                    ) *
                                    0.621371
                                  : 0

                              const dispatchTempMinF =
                                dispatch.temperatureMinC != null
                                  ? (
                                      Number(
                                        dispatch.temperatureMinC
                                      ) *
                                        9 /
                                        5 +
                                      32
                                    )
                                  : null

                              const dispatchTempMaxF =
                                dispatch.temperatureMaxC != null
                                  ? (
                                      Number(
                                        dispatch.temperatureMaxC
                                      ) *
                                        9 /
                                        5 +
                                      32
                                    )
                                  : null

                              const numericTempF =
                                item?.temperature != null
                                  ? Number(
                                      item.temperature
                                    ) *
                                      9 /
                                      5 +
                                    32
                                  : null

                              const temperatureAlert =
                                numericTempF != null &&
                                (
                                  (
                                    dispatchTempMinF != null &&
                                    numericTempF <
                                      dispatchTempMinF
                                  ) ||
                                  (
                                    dispatchTempMaxF != null &&
                                    numericTempF >
                                      dispatchTempMaxF
                                  )
                                )

                              return (
                                <article
                                  className="page-card dispatch-card"
                                  key={dispatch.id}
                                >
                                  <div className="dispatch-card-top">
                                    <div>
                                      <span className="dispatch-load-label">
                                        Load
                                      </span>

                                      <h3>
                                        {dispatch.loadNumber}
                                      </h3>

                                      <span
                                        className={
                                          `dispatch-status-pill ${dispatch.status.toLowerCase()}`
                                        }
                                      >
                                        {
                                          dispatchStatusLabel(
                                            dispatch.status
                                          )
                                        }
                                      </span>

                                      {
                                        operationsTab === 'history' && (
                                          <small className="dispatch-completed-at">
                                            {
                                              dispatch.status === 'CANCELLED'
                                                ? 'Cancelled'
                                                : 'Completed'
                                            }
                                            {' · '}
                                            {
                                              formatDateTime(
                                                dispatch.completedAt ||
                                                dispatch.updatedAt
                                              )
                                            }
                                          </small>
                                        )
                                      }
                                    </div>

                                    <div className="dispatch-asset-summary">
                                      <strong>
                                        {
                                          dispatch.asset?.name ||
                                          'Unassigned'
                                        }
                                      </strong>

                                      <small>
                                        {
                                          dispatch.asset?.deviceId ||
                                          'No asset'
                                        }
                                      </small>

                                      <span
                                        className={
                                          `inline-status ${rowStatus}`
                                        }
                                      >
                                        {
                                          rowStatus === 'online'
                                            ? 'Online'
                                            : rowStatus === 'delayed'
                                              ? 'Delayed'
                                              : 'Offline'
                                        }
                                      </span>
                                    </div>
                                  </div>

                                  <div className="dispatch-route">
                                    <div>
                                      <span>Pickup</span>
                                      <strong>
                                        {dispatch.pickupName}
                                      </strong>
                                      <small>
                                        {dispatch.pickupAddress}
                                      </small>
                                      <small>
                                        {
                                          dispatch.pickupScheduledAt
                                            ? formatDateTime(
                                                dispatch.pickupScheduledAt
                                              )
                                            : 'No appointment'
                                        }
                                      </small>
                                    </div>

                                    <div className="dispatch-route-arrow">
                                      →
                                    </div>

                                    <div>
                                      <span>Delivery</span>
                                      <strong>
                                        {dispatch.deliveryName}
                                      </strong>
                                      <small>
                                        {dispatch.deliveryAddress}
                                      </small>
                                      <small>
                                        {
                                          dispatch.deliveryScheduledAt
                                            ? formatDateTime(
                                                dispatch.deliveryScheduledAt
                                              )
                                            : 'No appointment'
                                        }
                                      </small>
                                    </div>
                                  </div>

                                  {
                                    operationsTab === 'history' && (
                                      <div className="dispatch-history-note">
                                        Load record preserved. Device values below are the asset's current telemetry, not the completed load's historical telemetry.
                                      </div>
                                    )
                                  }

                                  <div className="dispatch-live-grid">
                                    <div>
                                      <span>Device</span>
                                      <strong
                                        className={
                                          `dispatch-value ${rowStatus}`
                                        }
                                      >
                                        {
                                          rowStatus === 'online'
                                            ? 'Online'
                                            : rowStatus === 'delayed'
                                              ? 'Delayed'
                                              : 'Offline'
                                        }
                                      </strong>
                                    </div>

                                    <div>
                                      <span>Movement</span>
                                      <strong>
                                        {
                                          getDetailedMovementLabel(
                                            item,
                                            rowStatus,
                                            dispatch
                                          )
                                        }
                                      </strong>
                                    </div>

                                    <div>
                                      <span>Speed</span>
                                      <strong>
                                        {
                                          `${rowSpeedMph.toFixed(1)} mph`
                                        }
                                      </strong>
                                    </div>

                                    <div>
                                      <span>Temperature</span>
                                      <strong
                                        className={
                                          temperatureAlert
                                            ? 'dispatch-value alert'
                                            : ''
                                        }
                                      >
                                        {rowTempF}°F
                                      </strong>
                                    </div>

                                    <div>
                                      <span>Last Ping</span>
                                      <strong>
                                        {
                                          item?.receivedAt
                                            ? formatAge(
                                                item.receivedAt
                                              )
                                            : 'No data'
                                        }
                                      </strong>
                                    </div>
                                  </div>

                                  {
                                    temperatureAlert && (
                                      <div className="dispatch-temp-alert">
                                        ⚠ Temperature outside dispatch limits
                                      </div>
                                    )
                                  }

                                  <div className="dispatch-card-footer">
                                    <div className="dispatch-meta">
                                      {
                                        dispatch.referenceNumber && (
                                          <span>
                                            Ref: {dispatch.referenceNumber}
                                          </span>
                                        )
                                      }

                                      {
                                        dispatch.commodity && (
                                          <span>
                                            {dispatch.commodity}
                                          </span>
                                        )
                                      }
                                    </div>

                                    <div className="dispatch-actions">
                                      <button
                                        className="secondary-action dispatch-edit-button"
                                        onClick={() =>
                                          openEditDispatch(
                                            dispatch
                                          )
                                        }
                                        type="button"
                                      >
                                        Edit Load
                                      </button>

                                      {
                                        dispatch.asset?.deviceId && (
                                          <button
                                            className="secondary-action"
                                            onClick={() => {
                                              setSelectedDeviceId(
                                                dispatch.asset.deviceId
                                              )
                                              setActiveView('map')
                                            }}
                                            type="button"
                                          >
                                            View Map
                                          </button>
                                        )
                                      }

                                      <select
                                        value={dispatch.status}
                                        onChange={(event) =>
                                          updateDispatchStatus(
                                            dispatch.id,
                                            event.target.value as DispatchStatus
                                          )
                                        }
                                        aria-label={
                                          `Status for ${dispatch.loadNumber}`
                                        }
                                      >
                                        {
                                          dispatchStatusOptions.map(
                                            (status) => (
                                              <option
                                                key={status}
                                                value={status}
                                              >
                                                {
                                                  dispatchStatusLabel(
                                                    status
                                                  )
                                                }
                                              </option>
                                            )
                                          )
                                        }
                                      </select>
                                    </div>
                                  </div>

                                  {
                                    dispatch.statusEvents?.length > 0 && (
                                      <details className="dispatch-history">
                                        <summary>
                                          Status History
                                        </summary>

                                        <div>
                                          {
                                            dispatch.statusEvents
                                              .slice(0, 8)
                                              .map((event) => (
                                                <p key={event.id}>
                                                  <strong>
                                                    {
                                                      dispatchStatusLabel(
                                                        event.status
                                                      )
                                                    }
                                                  </strong>
                                                  <span>
                                                    {
                                                      formatDateTime(
                                                        event.createdAt
                                                      )
                                                    }
                                                  </span>
                                                </p>
                                              ))
                                          }
                                        </div>
                                      </details>
                                    )
                                  }
                                </article>
                              )
                            }
                          )
                        : (
                          <div className="page-card page-empty">
                            {
                              dispatchLoading
                                ? 'Loading dispatches...'
                                : operationsTab === 'active'
                                  ? 'No active loads match the current filters.'
                                  : 'No completed or cancelled loads match the current filters.'
                            }
                          </div>
                        )
                    }
                  </div>
                </div>

                <aside className="operations-side">
                  <div className="page-card available-assets-card">
                    <div className="operations-section-heading compact">
                      <div>
                        <span className="page-kicker">
                          Fleet
                        </span>
                        <h2>
                          Available Assets
                        </h2>
                      </div>
                    </div>

                    {
                      availableAssets.length > 0
                        ? availableAssets.map(
                            (asset) => {
                              const item =
                                fleetTelemetry[
                                  asset.deviceId
                                ] ?? null

                              const status =
                                getDeviceStatusForTelemetry(
                                  item
                                )

                              return (
                                <button
                                  className="available-asset-row"
                                  key={asset.id}
                                  onClick={() => {
                                    setNewDispatchForm(
                                      (current) => ({
                                        ...current,
                                        assetId:
                                          String(asset.id)
                                      })
                                    )
                                    setNewDispatchOpen(true)
                                  }}
                                  type="button"
                                >
                                  <span
                                    className={
                                      `mini-status ${status}`
                                    }
                                  >
                                    ◈
                                  </span>

                                  <span>
                                    <strong>
                                      {
                                        asset.name ||
                                        asset.deviceId
                                      }
                                    </strong>
                                    <small>
                                      {asset.deviceId}
                                    </small>
                                  </span>

                                  <em>
                                    {
                                      status === 'online'
                                        ? 'Online'
                                        : status === 'delayed'
                                          ? 'Delayed'
                                          : 'Offline'
                                    }
                                  </em>
                                </button>
                              )
                            }
                          )
                        : (
                          <p className="muted-text">
                            No unassigned assets.
                          </p>
                        )
                    }
                  </div>
                </aside>
              </div>

              {
                newDispatchOpen && (
                  <div
                    className="modal-backdrop"
                    onMouseDown={() => {
                      if (!newDispatchSaving) {
                        setNewDispatchOpen(false)
                      }
                    }}
                  >
                    <section
                      className="details-modal dispatch-modal"
                      onMouseDown={(event) =>
                        event.stopPropagation()
                      }
                    >
                      <div className="modal-header">
                        <div>
                          <span className="page-kicker">
                            Operations
                          </span>

                          <h2>
                            New Dispatch
                          </h2>
                        </div>

                        <button
                          className="modal-close"
                          onClick={() =>
                            setNewDispatchOpen(false)
                          }
                          type="button"
                          disabled={newDispatchSaving}
                        >
                          ×
                        </button>
                      </div>

                      <div className="dispatch-form-grid">
                        <label>
                          <span>Load Number *</span>
                          <input
                            value={
                              newDispatchForm.loadNumber
                            }
                            onChange={(event) =>
                              setNewDispatchForm(
                                (current) => ({
                                  ...current,
                                  loadNumber:
                                    event.target.value
                                })
                              )
                            }
                            placeholder="MAV-00021"
                          />
                        </label>

                        <label>
                          <span>Asset</span>
                          <select
                            value={
                              newDispatchForm.assetId
                            }
                            onChange={(event) =>
                              setNewDispatchForm(
                                (current) => ({
                                  ...current,
                                  assetId:
                                    event.target.value
                                })
                              )
                            }
                          >
                            <option value="">
                              Unassigned
                            </option>

                            {
                              availableAssets.map(
                                (asset) => (
                                  <option
                                    key={asset.id}
                                    value={asset.id}
                                  >
                                    {
                                      asset.name ||
                                      asset.deviceId
                                    }
                                    {' ('}
                                    {asset.deviceId}
                                    {')'}
                                  </option>
                                )
                              )
                            }
                          </select>
                        </label>

                        <label>
                          <span>Pickup Facility *</span>
                          <input
                            value={
                              newDispatchForm.pickupName
                            }
                            onChange={(event) =>
                              setNewDispatchForm(
                                (current) => ({
                                  ...current,
                                  pickupName:
                                    event.target.value
                                })
                              )
                            }
                            placeholder="Taylor Farms"
                          />
                        </label>

                        <label>
                          <span>Pickup Appointment</span>
                          <input
                            type="datetime-local"
                            value={
                              newDispatchForm.pickupScheduledAt
                            }
                            onChange={(event) =>
                              setNewDispatchForm(
                                (current) => ({
                                  ...current,
                                  pickupScheduledAt:
                                    event.target.value
                                })
                              )
                            }
                          />
                        </label>

                        <label className="span-2">
                          <span>Pickup Address *</span>
                          <input
                            value={
                              newDispatchForm.pickupAddress
                            }
                            onChange={(event) =>
                              setNewDispatchForm(
                                (current) => ({
                                  ...current,
                                  pickupAddress:
                                    event.target.value
                                })
                              )
                            }
                            placeholder="Salinas, CA"
                          />
                        </label>

                        <label>
                          <span>Delivery Facility *</span>
                          <input
                            value={
                              newDispatchForm.deliveryName
                            }
                            onChange={(event) =>
                              setNewDispatchForm(
                                (current) => ({
                                  ...current,
                                  deliveryName:
                                    event.target.value
                                })
                              )
                            }
                            placeholder="Distribution Center"
                          />
                        </label>

                        <label>
                          <span>Delivery Appointment</span>
                          <input
                            type="datetime-local"
                            value={
                              newDispatchForm.deliveryScheduledAt
                            }
                            onChange={(event) =>
                              setNewDispatchForm(
                                (current) => ({
                                  ...current,
                                  deliveryScheduledAt:
                                    event.target.value
                                })
                              )
                            }
                          />
                        </label>

                        <label className="span-2">
                          <span>Delivery Address *</span>
                          <input
                            value={
                              newDispatchForm.deliveryAddress
                            }
                            onChange={(event) =>
                              setNewDispatchForm(
                                (current) => ({
                                  ...current,
                                  deliveryAddress:
                                    event.target.value
                                })
                              )
                            }
                            placeholder="Los Angeles, CA"
                          />
                        </label>

                        <label>
                          <span>Commodity</span>
                          <input
                            value={
                              newDispatchForm.commodity
                            }
                            onChange={(event) =>
                              setNewDispatchForm(
                                (current) => ({
                                  ...current,
                                  commodity:
                                    event.target.value
                                })
                              )
                            }
                            placeholder="Produce"
                          />
                        </label>

                        <label>
                          <span>Reference / PO</span>
                          <input
                            value={
                              newDispatchForm.referenceNumber
                            }
                            onChange={(event) =>
                              setNewDispatchForm(
                                (current) => ({
                                  ...current,
                                  referenceNumber:
                                    event.target.value
                                })
                              )
                            }
                            placeholder="PO-829183"
                          />
                        </label>

                        <label>
                          <span>Set Point °F</span>
                          <input
                            inputMode="decimal"
                            value={
                              newDispatchForm.temperatureSetpointF
                            }
                            onChange={(event) =>
                              setNewDispatchForm(
                                (current) => ({
                                  ...current,
                                  temperatureSetpointF:
                                    event.target.value
                                })
                              )
                            }
                            placeholder="34"
                          />
                        </label>

                        <label>
                          <span>Minimum °F</span>
                          <input
                            inputMode="decimal"
                            value={
                              newDispatchForm.temperatureMinF
                            }
                            onChange={(event) =>
                              setNewDispatchForm(
                                (current) => ({
                                  ...current,
                                  temperatureMinF:
                                    event.target.value
                                })
                              )
                            }
                            placeholder="32"
                          />
                        </label>

                        <label>
                          <span>Maximum °F</span>
                          <input
                            inputMode="decimal"
                            value={
                              newDispatchForm.temperatureMaxF
                            }
                            onChange={(event) =>
                              setNewDispatchForm(
                                (current) => ({
                                  ...current,
                                  temperatureMaxF:
                                    event.target.value
                                })
                              )
                            }
                            placeholder="38"
                          />
                        </label>

                        <label className="span-2">
                          <span>Notes</span>
                          <textarea
                            value={
                              newDispatchForm.notes
                            }
                            onChange={(event) =>
                              setNewDispatchForm(
                                (current) => ({
                                  ...current,
                                  notes:
                                    event.target.value
                                })
                              )
                            }
                            placeholder="Load notes, driver instructions, appointment details..."
                          />
                        </label>
                      </div>

                      {
                        dispatchError && (
                          <div className="operations-error">
                            {dispatchError}
                          </div>
                        )
                      }

                      <div className="modal-actions">
                        <button
                          className="secondary-action"
                          onClick={() =>
                            setNewDispatchOpen(false)
                          }
                          type="button"
                          disabled={newDispatchSaving}
                        >
                          Cancel
                        </button>

                        <button
                          className="primary-action"
                          onClick={createDispatch}
                          type="button"
                          disabled={newDispatchSaving}
                        >
                          {
                            newDispatchSaving
                              ? 'Creating...'
                              : 'Create Dispatch'
                          }
                        </button>
                      </div>
                    </section>
                  </div>
                )
              }

              {
                editDispatchOpen && (
                  <div
                    className="modal-backdrop"
                    onMouseDown={() => {
                      if (!editDispatchSaving) {
                        setEditDispatchOpen(false)
                      }
                    }}
                  >
                    <section
                      className="details-modal dispatch-modal"
                      onMouseDown={(event) =>
                        event.stopPropagation()
                      }
                    >
                      <div className="modal-header">
                        <div>
                          <span className="page-kicker">
                            Operations
                          </span>

                          <h2>
                            Edit Dispatch
                          </h2>
                        </div>

                        <button
                          className="modal-close"
                          onClick={() =>
                            setEditDispatchOpen(false)
                          }
                          type="button"
                          disabled={editDispatchSaving}
                        >
                          ×
                        </button>
                      </div>

                      <div className="dispatch-form-grid">
                        <label>
                          <span>Load Number *</span>
                          <input
                            value={
                              editDispatchForm.loadNumber
                            }
                            onChange={(event) =>
                              setEditDispatchForm(
                                (current) => ({
                                  ...current,
                                  loadNumber:
                                    event.target.value
                                })
                              )
                            }
                            placeholder="MAV-00021"
                          />
                        </label>

                        <label>
                          <span>Asset</span>
                          <select
                            value={
                              editDispatchForm.assetId
                            }
                            onChange={(event) =>
                              setEditDispatchForm(
                                (current) => ({
                                  ...current,
                                  assetId:
                                    event.target.value
                                })
                              )
                            }
                          >
                            <option value="">
                              Unassigned
                            </option>

                            {
                              assets.map(
                                (asset) => (
                                  <option
                                    key={asset.id}
                                    value={asset.id}
                                  >
                                    {
                                      asset.name ||
                                      asset.deviceId
                                    }
                                    {' ('}
                                    {asset.deviceId}
                                    {')'}
                                  </option>
                                )
                              )
                            }
                          </select>
                        </label>

                        <label>
                          <span>Pickup Facility *</span>
                          <input
                            value={
                              editDispatchForm.pickupName
                            }
                            onChange={(event) =>
                              setEditDispatchForm(
                                (current) => ({
                                  ...current,
                                  pickupName:
                                    event.target.value
                                })
                              )
                            }
                            placeholder="Taylor Farms"
                          />
                        </label>

                        <label>
                          <span>Pickup Appointment</span>
                          <input
                            type="datetime-local"
                            value={
                              editDispatchForm.pickupScheduledAt
                            }
                            onChange={(event) =>
                              setEditDispatchForm(
                                (current) => ({
                                  ...current,
                                  pickupScheduledAt:
                                    event.target.value
                                })
                              )
                            }
                          />
                        </label>

                        <label className="span-2">
                          <span>Pickup Address *</span>
                          <input
                            value={
                              editDispatchForm.pickupAddress
                            }
                            onChange={(event) =>
                              setEditDispatchForm(
                                (current) => ({
                                  ...current,
                                  pickupAddress:
                                    event.target.value
                                })
                              )
                            }
                            placeholder="Salinas, CA"
                          />
                        </label>

                        <label>
                          <span>Delivery Facility *</span>
                          <input
                            value={
                              editDispatchForm.deliveryName
                            }
                            onChange={(event) =>
                              setEditDispatchForm(
                                (current) => ({
                                  ...current,
                                  deliveryName:
                                    event.target.value
                                })
                              )
                            }
                            placeholder="Distribution Center"
                          />
                        </label>

                        <label>
                          <span>Delivery Appointment</span>
                          <input
                            type="datetime-local"
                            value={
                              editDispatchForm.deliveryScheduledAt
                            }
                            onChange={(event) =>
                              setEditDispatchForm(
                                (current) => ({
                                  ...current,
                                  deliveryScheduledAt:
                                    event.target.value
                                })
                              )
                            }
                          />
                        </label>

                        <label className="span-2">
                          <span>Delivery Address *</span>
                          <input
                            value={
                              editDispatchForm.deliveryAddress
                            }
                            onChange={(event) =>
                              setEditDispatchForm(
                                (current) => ({
                                  ...current,
                                  deliveryAddress:
                                    event.target.value
                                })
                              )
                            }
                            placeholder="Los Angeles, CA"
                          />
                        </label>

                        <label>
                          <span>Commodity</span>
                          <input
                            value={
                              editDispatchForm.commodity
                            }
                            onChange={(event) =>
                              setEditDispatchForm(
                                (current) => ({
                                  ...current,
                                  commodity:
                                    event.target.value
                                })
                              )
                            }
                            placeholder="Produce"
                          />
                        </label>

                        <label>
                          <span>Reference / PO</span>
                          <input
                            value={
                              editDispatchForm.referenceNumber
                            }
                            onChange={(event) =>
                              setEditDispatchForm(
                                (current) => ({
                                  ...current,
                                  referenceNumber:
                                    event.target.value
                                })
                              )
                            }
                            placeholder="PO-829183"
                          />
                        </label>

                        <label>
                          <span>Set Point °F</span>
                          <input
                            inputMode="decimal"
                            value={
                              editDispatchForm.temperatureSetpointF
                            }
                            onChange={(event) =>
                              setEditDispatchForm(
                                (current) => ({
                                  ...current,
                                  temperatureSetpointF:
                                    event.target.value
                                })
                              )
                            }
                            placeholder="34"
                          />
                        </label>

                        <label>
                          <span>Minimum °F</span>
                          <input
                            inputMode="decimal"
                            value={
                              editDispatchForm.temperatureMinF
                            }
                            onChange={(event) =>
                              setEditDispatchForm(
                                (current) => ({
                                  ...current,
                                  temperatureMinF:
                                    event.target.value
                                })
                              )
                            }
                            placeholder="32"
                          />
                        </label>

                        <label>
                          <span>Maximum °F</span>
                          <input
                            inputMode="decimal"
                            value={
                              editDispatchForm.temperatureMaxF
                            }
                            onChange={(event) =>
                              setEditDispatchForm(
                                (current) => ({
                                  ...current,
                                  temperatureMaxF:
                                    event.target.value
                                })
                              )
                            }
                            placeholder="38"
                          />
                        </label>

                        <label className="span-2">
                          <span>Notes</span>
                          <textarea
                            value={
                              editDispatchForm.notes
                            }
                            onChange={(event) =>
                              setEditDispatchForm(
                                (current) => ({
                                  ...current,
                                  notes:
                                    event.target.value
                                })
                              )
                            }
                            placeholder="Load notes, driver instructions, appointment details..."
                          />
                        </label>
                      </div>

                      {
                        dispatchError && (
                          <div className="operations-error">
                            {dispatchError}
                          </div>
                        )
                      }

                      <div className="modal-actions">
                        <button
                          className="secondary-action"
                          onClick={() =>
                            setEditDispatchOpen(false)
                          }
                          type="button"
                          disabled={editDispatchSaving}
                        >
                          Cancel
                        </button>

                        <button
                          className="primary-action"
                          onClick={saveEditedDispatch}
                          type="button"
                          disabled={editDispatchSaving}
                        >
                          {
                            editDispatchSaving
                              ? 'Saving...'
                              : 'Save Changes'
                          }
                        </button>
                      </div>
                    </section>
                  </div>
                )
              }

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
            <section className="workspace-page reports-page">

              <div className="page-header reports-page-header">
                <div>
                  <span className="page-kicker">
                    Reports
                  </span>

                  <h1>
                    Fleet Telemetry Reports
                  </h1>

                  <p>
                    Generate structured location and temperature reports from stored Maverick telemetry.
                  </p>
                </div>

                <button
                  className="primary-action"
                  onClick={
                    exportReportPdf
                  }
                  type="button"
                  disabled={
                    reportPoints.length === 0
                  }
                >
                  Export PDF
                </button>
              </div>

              <div className="report-builder page-card">

                <div className="report-builder-controls">
                  <label>
                    <span>
                      Asset
                    </span>

                    <div className="report-selected-asset">
                      <strong>
                        {
                          selectedAsset
                            ? (
                              selectedAsset.name ||
                              selectedAsset.deviceId
                            )
                            : 'No asset selected'
                        }
                      </strong>

                      <small>
                        {
                          selectedDeviceId ||
                          'Use Search Trailer ID above'
                        }
                      </small>
                    </div>
                  </label>

                  <label>
                    <span>
                      Date range
                    </span>

                    <select
                      value={
                        reportRange
                      }
                      onChange={
                        (event) =>
                          setReportRange(
                            event.target.value as HistoryRange
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
                    reportRange ===
                      'custom' && (
                      <label>
                        <span>
                          Date
                        </span>

                        <input
                          type="date"
                          value={
                            reportCustomDate
                          }
                          onChange={
                            (event) =>
                              setReportCustomDate(
                                event.target.value
                              )
                          }
                        />
                      </label>
                    )
                  }

                  <button
                    className="primary-action"
                    onClick={
                      generateReport
                    }
                    type="button"
                    disabled={
                      reportLoading ||
                      !selectedDeviceId
                    }
                  >
                    {
                      reportLoading
                        ? 'Generating...'
                        : 'Generate Report'
                    }
                  </button>
                </div>

                {
                  reportError && (
                    <div className="report-error">
                      {reportError}
                    </div>
                  )
                }

              </div>

              {
                reportPoints.length > 0 && (
                  <section className="report-export-sheet">

                    <div className="report-document-header">
                      <div>
                        <span>
                          MAVERICK
                        </span>

                        <h2>
                          Location & Temperature Report
                        </h2>
                      </div>

                      <div className="report-document-meta">
                        <strong>
                          {
                            selectedAsset
                              ? (
                                selectedAsset.name ||
                                selectedAsset.deviceId
                              )
                              : selectedDeviceId
                          }
                        </strong>

                        <small>
                          Device ID: {
                            selectedDeviceId
                          }
                        </small>

                        <small>
                          Generated: {
                            formatDateTime(
                              reportGeneratedAt
                            )
                          }
                        </small>
                      </div>
                    </div>

                    <div className="report-period">
                      <div>
                        <span>
                          Report Period
                        </span>

                        <strong>
                          {
                            formatDateTime(
                              reportPeriod.from
                            )
                          }
                          {' → '}
                          {
                            formatDateTime(
                              reportPeriod.to
                            )
                          }
                        </strong>
                      </div>

                      <div>
                        <span>
                          Current Status
                        </span>

                        <strong>
                          {statusLabel}
                        </strong>
                      </div>

                      <div>
                        <span>
                          Dispatch
                        </span>

                        <strong>
                          {
                            selectedActiveDispatch
                              ? `${selectedActiveDispatch.loadNumber} · ${dispatchStatusLabel(
                                  selectedActiveDispatch.status
                                )}`
                              : 'No active dispatch'
                          }
                        </strong>
                      </div>
                    </div>

                    <div className="report-summary-grid">
                      <div>
                        <span>
                          Telemetry Readings
                        </span>
                        <strong>
                          {
                            reportPoints.length
                          }
                        </strong>
                      </div>

                      <div>
                        <span>
                          GPS Locations
                        </span>
                        <strong>
                          {
                            reportGpsPoints.length
                          }
                        </strong>
                      </div>

                      <div>
                        <span>
                          Distance
                        </span>
                        <strong>
                          {
                            `${reportDistanceMiles.toFixed(1)} mi`
                          }
                        </strong>
                      </div>

                      <div>
                        <span>
                          Average Temp
                        </span>
                        <strong>
                          {
                            reportAverageTempF != null
                              ? `${reportAverageTempF.toFixed(1)}°F`
                              : '--'
                          }
                        </strong>
                      </div>

                      <div>
                        <span>
                          Minimum Temp
                        </span>
                        <strong>
                          {
                            reportMinTempF != null
                              ? `${reportMinTempF.toFixed(1)}°F`
                              : '--'
                          }
                        </strong>
                      </div>

                      <div>
                        <span>
                          Maximum Temp
                        </span>
                        <strong>
                          {
                            reportMaxTempF != null
                              ? `${reportMaxTempF.toFixed(1)}°F`
                              : '--'
                          }
                        </strong>
                      </div>

                      <div
                        className={
                          reportOutOfRangeCount > 0
                            ? 'report-summary-alert'
                            : ''
                        }
                      >
                        <span>
                          Temp Exceptions
                        </span>
                        <strong>
                          {
                            reportOutOfRangeCount
                          }
                        </strong>
                      </div>

                      <div>
                        <span>
                          Temp Limits
                        </span>
                        <strong>
                          {
                            reportEffectiveMinC != null ||
                            reportEffectiveMaxC != null
                              ? `${
                                  reportEffectiveMinC != null
                                    ? `${celsiusToFahrenheit(
                                        Number(
                                          reportEffectiveMinC
                                        )
                                      ).toFixed(1)}°F`
                                    : '--'
                                } – ${
                                  reportEffectiveMaxC != null
                                    ? `${celsiusToFahrenheit(
                                        Number(
                                          reportEffectiveMaxC
                                        )
                                      ).toFixed(1)}°F`
                                    : '--'
                                }`
                              : 'Not configured'
                          }
                        </strong>
                      </div>
                    </div>

                    <div className="report-section-title">
                      <div>
                        <span className="page-kicker">
                          Detail
                        </span>
                        <h3>
                          Telemetry Timeline
                        </h3>
                      </div>

                      <small>
                        Temperature, location, movement and speed
                      </small>
                    </div>

                    <div className="report-table-wrap">
                      <table className="report-data-table">
                        <thead>
                          <tr>
                            <th>
                              Date / Time
                            </th>
                            <th>
                              Temp
                            </th>
                            <th>
                              Location
                            </th>
                            <th>
                              Movement
                            </th>
                            <th>
                              Speed
                            </th>
                            <th>
                              Altitude
                            </th>
                          </tr>
                        </thead>

                        <tbody>
                          {
                            reportPoints.map(
                              (
                                point,
                                index
                              ) => {
                                const pointTempF =
                                  celsiusToFahrenheit(
                                    Number(
                                      point.temperature
                                    )
                                  )

                                const pointOutOfRange =
                                  (
                                    reportEffectiveMinC != null &&
                                    Number(
                                      point.temperature
                                    ) <
                                      Number(
                                        reportEffectiveMinC
                                      )
                                  ) ||
                                  (
                                    reportEffectiveMaxC != null &&
                                    Number(
                                      point.temperature
                                    ) >
                                      Number(
                                        reportEffectiveMaxC
                                      )
                                  )

                                const pointSpeedMph =
                                  point.speedKph != null
                                    ? Math.max(
                                        0,
                                        Number(
                                          point.speedKph
                                        )
                                      ) *
                                      0.621371
                                    : 0

                                const pointMovement =
                                  String(
                                    point.movementStatus ||
                                    ''
                                  ).toUpperCase()

                                return (
                                  <tr
                                    key={
                                      `${point.id}-${index}`
                                    }
                                  >
                                    <td>
                                      {
                                        formatDateTime(
                                          point.timestamp
                                        )
                                      }
                                    </td>

                                    <td
                                      className={
                                        pointOutOfRange
                                          ? 'report-temp-alert'
                                          : ''
                                      }
                                    >
                                      {
                                        pointTempF.toFixed(
                                          1
                                        )
                                      }°F
                                    </td>

                                    <td>
                                      {
                                        point.latitude != null &&
                                        point.longitude != null
                                          ? `${Number(
                                              point.latitude
                                            ).toFixed(5)}, ${Number(
                                              point.longitude
                                            ).toFixed(5)}`
                                          : 'No GPS'
                                      }
                                    </td>

                                    <td>
                                      {
                                        pointMovement ===
                                          'MOVING'
                                          ? 'Moving'
                                          : pointMovement ===
                                              'PARKED'
                                            ? 'Parked'
                                            : pointMovement ||
                                              'Unknown'
                                      }
                                    </td>

                                    <td>
                                      {
                                        `${pointSpeedMph.toFixed(
                                          1
                                        )} mph`
                                      }
                                    </td>

                                    <td>
                                      {
                                        point.altitude != null
                                          ? `${Number(
                                              point.altitude
                                            ).toFixed(1)} m`
                                          : '--'
                                      }
                                    </td>
                                  </tr>
                                )
                              }
                            )
                          }
                        </tbody>
                      </table>
                    </div>

                    <div className="report-footer-note">
                      <span>
                        Maverick Fleet Telemetry
                      </span>

                      <span>
                        Location points are based on current or recorded GNSS telemetry received by Maverick.
                      </span>
                    </div>

                  </section>
                )
              }

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
                                temperatureAlertLimitText ||
                                'Configured temperature limits'
                              }
                              {
                                temperatureAlertSource
                                  ? ` · ${temperatureAlertSource}`
                                  : ''
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
                    Asset Temperature Limits
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
                    Dispatch Temperature Limits
                  </dt>

                  <dd>
                    {
                      selectedActiveDispatch
                        ? (
                          selectedActiveDispatch
                            .temperatureMinC != null &&
                          selectedActiveDispatch
                            .temperatureMaxC != null
                            ? `${celsiusToFahrenheit(
                                Number(
                                  selectedActiveDispatch.temperatureMinC
                                )
                              ).toFixed(1)}°F – ${celsiusToFahrenheit(
                                Number(
                                  selectedActiveDispatch.temperatureMaxC
                                )
                              ).toFixed(1)}°F`
                            : 'Not configured'
                        )
                        : 'No active dispatch'
                    }
                  </dd>
                </div>

                <div>
                  <dt>
                    Temperature Monitoring
                  </dt>

                  <dd
                    className={
                      temperatureOutOfRange
                        ? 'temperature-status-active'
                        : ''
                    }
                  >
                    {
                      temperatureOutOfRange
                        ? `ACTIVE ALERT · ${temperatureAlertSource}`
                        : (
                            Boolean(
                              selectedAsset
                                ?.temperatureAlertsEnabled
                            ) ||
                            dispatchHasTemperatureLimits
                          )
                          ? 'Monitoring'
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
              <div className="modal-header history-hero-header">
                <div className="history-asset-summary">
                  <div className="history-asset-icon" aria-hidden="true">▰</div>
                  <div>
                    <span className="page-kicker">Trip & Temperature History</span>
                    <div className="history-asset-title-row">
                      <h2>{selectedAssetName}</h2>
                      <span className={`history-status-pill ${deviceStatus}`}>
                        {statusLabel}
                      </span>
                    </div>
                    <small className="modal-device-id">
                      {telemetry?.deviceId || selectedDeviceId}
                    </small>
                  </div>
                </div>

                <button
                  className="modal-close"
                  onClick={() => setHistoryOpen(false)}
                  type="button"
                  aria-label="Close history"
                >
                  ×
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
                    <div className="history-controls-panel">
                      <div className="history-control-group history-trip-group">
                        <span className="history-control-label">Trip</span>
                        <div className="history-trip-strip">
                          <button
                            className={selectedHistoryTripId === 'all' ? 'active' : ''}
                            onClick={() => {
                              setSelectedHistoryTripId('all')
                              setSelectedHistoryLegId('all')
                            }}
                            type="button"
                          >
                            <strong>All activity</strong>
                          </button>
                          {historyTrips.map((trip) => (
                            <button
                              key={trip.id}
                              className={selectedHistoryTripId === trip.id ? 'active' : ''}
                              onClick={() => {
                                setSelectedHistoryTripId(trip.id)
                                setSelectedHistoryLegId('all')
                              }}
                              type="button"
                            >
                              <strong>Trip {trip.id}</strong>
                              <small>{trip.distanceMiles.toFixed(1)} mi</small>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="history-control-group history-direction-group">
                        <span className="history-control-label">Direction</span>
                        <div className="history-leg-strip">
                          <button
                            type="button"
                            className={selectedHistoryLegId === 'all' ? 'active' : ''}
                            onClick={() => setSelectedHistoryLegId('all')}
                            disabled={!selectedHistoryTrip || selectedTripLegs.length !== 2}
                          >
                            <strong>Entire trip</strong>
                          </button>
                          {selectedHistoryTrip && selectedTripLegs.length === 2 && selectedTripLegs.map((leg) => (
                            <button
                              key={leg.id}
                              type="button"
                              className={selectedHistoryLegId === leg.id ? `active ${leg.id}` : leg.id}
                              onClick={() => setSelectedHistoryLegId(leg.id)}
                            >
                              <strong>{leg.label}</strong>
                              <small>
                                {leg.distanceMiles.toFixed(1)} mi · {new Date(leg.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}–{new Date(leg.end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                              </small>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="history-control-group history-range-group">
                        <span className="history-control-label">Date range</span>
                        <div className="history-range-controls">
                          <select
                            aria-label="History range"
                            value={historyRange}
                            onChange={(event) => handleHistoryRangeChange(event.target.value as HistoryRange)}
                          >
                            <option value="today">Today</option>
                            <option value="yesterday">Yesterday</option>
                            <option value="7days">Last 7 days</option>
                            <option value="custom">Custom date</option>
                          </select>
                          {historyRange === 'custom' && (
                            <input
                              className="history-date-input"
                              aria-label="History date"
                              type="date"
                              value={historyCustomDate}
                              onChange={(event) => setHistoryCustomDate(event.target.value)}
                            />
                          )}
                          <button
                            className="secondary-action history-refresh-button"
                            onClick={() => loadHistory(historyRange, historyCustomDate)}
                            type="button"
                            disabled={historyLoading}
                          >
                            {historyLoading ? 'Loading...' : historyRange === 'custom' ? 'Load Date' : 'Refresh'}
                          </button>
                        </div>
                      </div>
                    </div>

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

                    <div className="history-content-grid">
                      <div className="history-route-column">
                        <div className="history-road-status">
                          {
                            roadMatchLoading
                              ? 'Aligning route to roads…'
                              : historyRoadTracks.length > 0
                                ? 'Road-matched route · arrows show travel direction'
                                : 'Road matching unavailable · showing raw GPS path'
                          }
                        </div>
                    {
                      historyLatLngs.length > 0 ? (
                        <div className="history-map">
                          <MapContainer
                            key={
                              `${historyRange}-${historyCustomDate}-${selectedHistoryTripId}-${selectedHistoryLegId}`
                            }
                            center={
                              historyLatLngs[
                                historyLatLngs.length - 1
                              ]
                            }
                            zoom={13}
                            scrollWheelZoom
                            className="history-leaflet-map"
                          >
                            <ResponsiveMapSize />
                            <HistoryRouteController
                              points={
                                historyDisplayedMapPoints
                              }
                            />

                            <TileLayer
                              attribution='&copy; OpenStreetMap contributors'
                              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            />

                            {
                              historyDisplaySegments.map(
                                (segment, index) => (
                                  <Polyline
                                    key={`history-road-${index}`}
                                    positions={segment}
                                    pathOptions={{
                                      color:
                                        historyRoadTracks.length > 0
                                          ? '#3b82f6'
                                          : '#64748b',
                                      weight:
                                        historyRoadTracks.length > 0
                                          ? 6
                                          : 4,
                                      opacity:
                                        historyRoadTracks.length > 0
                                          ? 0.96
                                          : 0.72,
                                      lineCap: 'round',
                                      lineJoin: 'round'
                                    }}
                                  />
                                )
                              )
                            }

                            {
                              !roadMatchLoading &&
                              historyDirectionArrows.map(
                                (arrow) => (
                                  <Marker
                                    key={arrow.id}
                                    position={arrow.position}
                                    icon={
                                      createHistoryDirectionIcon(
                                        arrow.bearing
                                      )
                                    }
                                    interactive={false}
                                    keyboard={false}
                                  />
                                )
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

                      <div className="temperature-chart-note">
                        Time is shown along the bottom. Changes of ±1.5°F or more are highlighted.
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
                                temperatureTimeTicks.map((tick) => (
                                  <g key={tick.label + tick.x}>
                                    <line
                                      className="temperature-time-grid"
                                      x1={tick.x}
                                      x2={tick.x}
                                      y1={temperatureChartPadding}
                                      y2={temperatureChartHeight - temperatureChartPadding}
                                    />
                                    <text
                                      className="temperature-time-label"
                                      x={tick.x}
                                      y={temperatureChartHeight - 8}
                                      textAnchor="middle"
                                    >
                                      {tick.label}
                                    </text>
                                  </g>
                                ))
                              }

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
                                      <g key={point.id}>
                                        <circle
                                          className={
                                            outOfRange
                                              ? 'temperature-chart-point alert'
                                              : significantTemperatureChangeIds.has(point.id)
                                                ? 'temperature-chart-point change'
                                                : 'temperature-chart-point'
                                          }
                                          cx={point.x}
                                          cy={point.y}
                                          r={
                                            outOfRange || significantTemperatureChangeIds.has(point.id)
                                              ? 4.5
                                              : 3
                                          }
                                        >
                                          <title>
                                            {`${formatDateTime(point.timestamp)} • ${point.temperatureF.toFixed(1)}°F${point.deltaF != null ? ` • Change ${point.deltaF >= 0 ? '+' : ''}${point.deltaF.toFixed(1)}°F` : ''}${point.speedKph != null ? ` • ${(point.speedKph * 0.621371).toFixed(1)} mph` : ''}${point.movementStatus ? ` • ${String(point.movementStatus)}` : ''}${point.latitude != null && point.longitude != null ? ` • ${Number(point.latitude).toFixed(5)}, ${Number(point.longitude).toFixed(5)}` : ''}`}
                                          </title>
                                        </circle>
                                        {
                                          significantTemperatureChangeIds.has(point.id) &&
                                          point.deltaF != null && (
                                            <text
                                              className={
                                                point.deltaF >= 0
                                                  ? 'temperature-change-label rise'
                                                  : 'temperature-change-label drop'
                                              }
                                              x={point.x}
                                              y={
                                                point.deltaF >= 0
                                                  ? Math.max(14, point.y - 10)
                                                  : Math.min(temperatureChartHeight - 28, point.y + 16)
                                              }
                                              textAnchor="middle"
                                            >
                                              {point.deltaF >= 0 ? '+' : ''}{point.deltaF.toFixed(1)}°
                                            </text>
                                          )
                                        }
                                      </g>
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
                    {
                      selectedActiveDispatch &&
                      dispatchHasTemperatureLimits
                        ? 'Temperature Monitor · Dispatch Synced'
                        : 'Temperature Monitor'
                    }
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

                {
                  selectedActiveDispatch &&
                  dispatchHasTemperatureLimits && (
                    <div className="temperature-limit-source">
                      <strong>
                        Active Dispatch Limits
                      </strong>

                      <span>
                        {
                          selectedActiveDispatch
                            .loadNumber
                        }
                        {' · '}
                        {
                          selectedActiveDispatch
                            .temperatureMinC != null
                            ? `${celsiusToFahrenheit(
                                Number(
                                  selectedActiveDispatch.temperatureMinC
                                )
                              ).toFixed(1)}°F min`
                            : 'No minimum'
                        }
                        {' · '}
                        {
                          selectedActiveDispatch
                            .temperatureMaxC != null
                            ? `${celsiusToFahrenheit(
                                Number(
                                  selectedActiveDispatch.temperatureMaxC
                                )
                              ).toFixed(1)}°F max`
                            : 'No maximum'
                        }
                      </span>

                      <small>
                        These dispatch limits are currently applied to this asset. Saving here copies the displayed values into the asset limits; removing asset limits does not remove the active dispatch limits.
                      </small>
                    </div>
                  )
                }

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
