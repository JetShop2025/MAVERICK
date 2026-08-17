import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
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

const API_BASE =
  window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : 'https://maverick-1z64.onrender.com'

const trailerIcon = L.icon({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
})

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
                  36.320755,
                  -121.249853
                ]}
                zoom={9}
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
                  markerVisible && (
                    <Marker
                      position={[
                        telemetry.latitude,
                        telemetry.longitude
                      ]}
                      icon={
                        trailerIcon
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

                          Temperature:{' '}
                          {temperatureF}°F

                          <br />

                          {
                            telemetry.hasCurrentGps
                              ? 'Current GPS location'
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

                                Location updated:{' '}

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
                              `asset-status-icon ${deviceStatus}`
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
                          </div>

                        </div>

                        <div className="panel-divider" />

                        <dl className="asset-details">

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
                              GPS
                            </dt>

                            <dd>
                              {
                                telemetry.hasCurrentGps
                                  ? 'Current'
                                  : 'Last known'
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
                              Location
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
                              Location Updated
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

                        <span>
                          {temperatureF}°F
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
                    Temperature
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
                      telemetry?.hasCurrentGps
                        ? 'Current'
                        : hasLocation
                          ? 'Last known'
                          : 'Unavailable'
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
                      Temperature
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
                    GPS
                  </dt>

                  <dd>
                    {
                      telemetry?.hasCurrentGps
                        ? 'Current GPS'
                        : hasLocation
                          ? 'Last known GPS'
                          : 'No GPS'
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
                    Location updated
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
                  disabled={
                    renameSaving
                  }
                >
                  Cancel
                </button>

                <button
                  className="primary-action"
                  onClick={
                    handleRenameAsset
                  }
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

              <div className="modal-actions">
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
