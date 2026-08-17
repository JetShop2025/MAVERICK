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

import { useEffect, useState } from 'react'

import './App.css'
import maverickLogo from './assets/maverick-logo.jpeg'
import Login from './Login'


// =====================================================
// ICONO DEL TRAILER
// =====================================================

const trailerIcon = L.icon({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
})


// =====================================================
// CONTROLADOR DEL MAPA
// =====================================================

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
        15
      )
    }
  }, [
    latitude,
    longitude,
    map
  ])

  return null
}


// =====================================================
// APP
// =====================================================

function App() {

  // ---------------------------------
  // LOGIN
  // ---------------------------------
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
    'https://maverick-1z64.onrender.com/api/auth/me',
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  )
    .then(async (res) => {
      const data =
        await res.json()

      if (!res.ok || !data.ok) {
        localStorage.removeItem(
          'maverick_token'
        )

        localStorage.removeItem(
          'maverick_user'
        )

        setIsLoggedIn(false)
        return
      }

      localStorage.setItem(
        'maverick_user',
        JSON.stringify(data.user)
      )

      setIsLoggedIn(true)
    })
    .catch(() => {
      setIsLoggedIn(false)
    })
}, [])


  // ---------------------------------
  // TELEMETRIA
  // ---------------------------------

  const [
    ,
    setApiStatus
  ] = useState('Checking...')

  const [
    telemetry,
    setTelemetry
  ] = useState<any>(null)


  // ---------------------------------
  // TRAILER SELECCIONADO
  // ---------------------------------

  const [
    selectedDeviceId,
    setSelectedDeviceId
  ] = useState('TRAILER-001')


  // ---------------------------------
  // RELOJ PARA ACTUALIZAR STATUS
  // ---------------------------------

  const [
    ,
    setNow
  ] = useState(Date.now())


  useEffect(() => {

    const timer =
      setInterval(() => {

        setNow(
          Date.now()
        )

      }, 5000)

    return () =>
      clearInterval(timer)

  }, [])


  // =====================================================
  // STATUS DEL DISPOSITIVO
  // =====================================================

  const getDeviceStatus = () => {

    if (
      !telemetry?.receivedAt
    ) {
      return 'offline'
    }

    const ageMs =
      Date.now() -
      new Date(
        telemetry.receivedAt
      ).getTime()


    // Menos de 90 segundos
    if (ageMs < 90000) {
      return 'online'
    }


    // Entre 90 segundos y 5 minutos
    if (ageMs < 300000) {
      return 'delayed'
    }


    // Mas de 5 minutos
    return 'offline'
  }


  const deviceStatus =
    getDeviceStatus()


  // =====================================================
  // FORMATEAR FECHA Y HORA
  // =====================================================

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


  // =====================================================
  // CARGAR TELEMETRIA
  // =====================================================

  useEffect(() => {

    const cargarTelemetria =
      () => {

        const token =
  localStorage.getItem(
    'maverick_token'
  )

fetch(
  'https://maverick-1z64.onrender.com/api/telemetry/latest',
  {
    headers: {
      Authorization: `Bearer ${token}`
    }
  }
)

          .then(
            (res) =>
              res.json()
          )

          .then(
            (data) => {

              if (data.ok) {

                setTelemetry(
                  data.telemetry
                )

                setApiStatus(
                  'online'
                )

              } else {

                setApiStatus(
                  'offline'
                )
              }
            }
          )

          .catch(
            () => {

              setApiStatus(
                'offline'
              )
            }
          )
      }


    cargarTelemetria()


    const intervalo =
      setInterval(
        cargarTelemetria,
        5000
      )


    return () =>
      clearInterval(
        intervalo
      )

  }, [])


  // =====================================================
  // LOGIN
  // =====================================================

  if (!isLoggedIn) {

    return (
      <Login
        onLogin={() =>
          setIsLoggedIn(true)
        }
      />
    )
  }


  // =====================================================
  // DASHBOARD
  // =====================================================

  return (

    <div className="app">

      {/* ================================= */}
      {/* SIDEBAR */}
      {/* ================================= */}

      <aside className="sidebar">

        <img
          src={maverickLogo}
          alt="Maverick Logo"
          className="logo"
        />


        <nav>

          <button className="active">
            Dashboard
          </button>

          <button>
            Trailers
          </button>

          <button>
            Dispatch
          </button>

          <button>
            Alerts
          </button>

          <button>
            Reports
          </button>

        </nav>

      </aside>


      {/* ================================= */}
      {/* MAIN */}
      {/* ================================= */}

      <main className="main">


        {/* ================================= */}
        {/* TOPBAR */}
        {/* ================================= */}

        <header className="topbar">

          <div>

            <h2>
              FLEET DASHBOARD
            </h2>

            <p>
              Live Trailer Location and
              Temperature Monitoring
            </p>

          </div>


          <div className="topbar-actions">

  <div
    className={
      `status status-${deviceStatus}`
    }
  >
    <span
      className={
        `dot ${deviceStatus}`
      }
    />

    <span>
      Device {deviceStatus}
    </span>
  </div>

  <div className="user-menu">

    <div className="user-info">
      <strong>
        Maverick User
      </strong>

      <span>
        Fleet Operator
      </span>
    </div>

    <button
  className="logout-button"
  onClick={() => {
    localStorage.removeItem(
      'maverick_token'
    )

    localStorage.removeItem(
      'maverick_user'
    )

    setIsLoggedIn(false)
  }}
>
  Logout
</button>

  </div>

</div>

        </header>


        {/* ================================= */}
        {/* CARDS */}
        {/* ================================= */}

        <section className="cards">


          <div className="card">

            <p>
              Active Trailers
            </p>

            <strong>
              {
                telemetry &&
                deviceStatus !== 'offline'
                  ? 1
                  : 0
              }
            </strong>

          </div>


          <div className="card">

            <p>
              Online Devices
            </p>

            <strong>
              {
                deviceStatus === 'online'
                  ? 1
                  : 0
              }
            </strong>

          </div>


          <div className="card">

            <p>
              Delayed Devices
            </p>

            <strong>
              {
                deviceStatus === 'delayed'
                  ? 1
                  : 0
              }
            </strong>

          </div>


          <div className="card">

            <p>
              Offline Devices
            </p>

            <strong>
              {
                deviceStatus === 'offline'
                  ? 1
                  : 0
              }
            </strong>

          </div>

        </section>


        {/* ================================= */}
        {/* MAPA + STATUS */}
        {/* ================================= */}

        <section className="content-grid">


          {/* ================================= */}
          {/* MAPA */}
          {/* ================================= */}

          <div className="panel map-panel">

            <h3>
              Live Fleet Map
            </h3>


            <div className="asset-selector">

              <label
                htmlFor="asset-select"
              >
                Locate Asset:
              </label>


              <select
                id="asset-select"
                value={
                  selectedDeviceId
                }
                onChange={
                  (e) =>
                    setSelectedDeviceId(
                      e.target.value
                    )
                }
              >

                <option
                  value="TRAILER-001"
                >
                  TRAILER-001
                </option>

              </select>

            </div>


            <MapContainer
              center={[
                36.320755,
                -121.249853
              ]}
              zoom={13}
              style={{
                height: '600px',
                width: '100%',
                borderRadius: '12px'
              }}
            >

              <MapController
                latitude={
                  telemetry?.latitude ??
                  null
                }
                longitude={
                  telemetry?.longitude ??
                  null
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
                telemetry?.latitude != null &&
                telemetry?.longitude != null &&
                (

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
                            telemetry.deviceId
                          }
                        </strong>

                        <br />


                        <span>
                          Status:{' '}
                          {deviceStatus}
                        </span>

                        <br />


                        Temperature:{' '}

                        {
                          (
                            (
                              telemetry.temperature *
                              9
                            ) /
                            5 +
                            32
                          ).toFixed(1)
                        }

                        {' '}°F

                        <br />


                        {
                          (
                            telemetry.hasCurrentGps ===
                              false ||
                            deviceStatus !==
                              'online'
                          ) && (

                            <>

                              <strong>
                                Last known location
                              </strong>

                              <br />

                            </>

                          )
                        }


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
                          (
                            telemetry.hasCurrentGps ===
                              false ||
                            deviceStatus !==
                              'online'
                          ) &&
                          telemetry.locationReceivedAt &&
                          (

                            <>

                              <br />

                              <span>

                                Location updated:{' '}

                                {
                                  formatDateTime(
                                    telemetry.locationReceivedAt
                                  )
                                }

                              </span>

                            </>

                          )
                        }

                      </div>

                    </Popup>

                  </Marker>

                )
              }

            </MapContainer>

          </div>


          {/* ================================= */}
          {/* TRAILER STATUS */}
          {/* ================================= */}

          <div className="panel">

            <h3>
              Trailer Status
            </h3>


            {
              telemetry
                ? (

                  <div
                    className={
                      `trailer-row ${
                        deviceStatus ===
                        'offline'
                          ? 'alert'
                          : ''
                      }`
                    }
                  >


                    <div>

                      <strong>
                        {
                          telemetry.deviceId
                        }
                      </strong>


                      <p>

                        {
                          deviceStatus ===
                          'online'
                            ? 'Online'
                            : deviceStatus ===
                              'delayed'
                            ? 'Delayed'
                            : 'Offline'
                        }

                      </p>


                      <p>

                        {
                          telemetry.hasCurrentGps
                            ? 'Current GPS location'
                            : 'Last known location'
                        }

                      </p>


                      <p>

                        Last telemetry:{' '}

                        {
                          formatDateTime(
                            telemetry.receivedAt
                          )
                        }

                      </p>


                      {
                        telemetry.latitude !=
                          null &&
                        telemetry.longitude !=
                          null &&
                        (

                          <p>

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

                          </p>

                        )
                      }


                      {
                        telemetry.locationReceivedAt &&
                        (

                          <p>

                            Location updated:{' '}

                            {
                              formatDateTime(
                                telemetry.locationReceivedAt
                              )
                            }

                          </p>

                        )
                      }

                    </div>


                    {/* ================================= */}
                    {/* TEMPERATURA */}
                    {/* ================================= */}

                    <div className="trailer-temp">

                      <span>

                        {
                          (
                            (
                              telemetry.temperature *
                              9
                            ) /
                            5 +
                            32
                          ).toFixed(1)
                        }

                        °F

                      </span>


                      {
                        deviceStatus ===
                          'offline' &&
                        (

                          <p className="last-reading-label">

                            Last recorded
                            temperature

                          </p>

                        )
                      }

                    </div>

                  </div>

                )
                : (

                  <p>
                    Waiting for telemetry...
                  </p>

                )
            }

          </div>

        </section>

      </main>

    </div>
  )
}

export default App