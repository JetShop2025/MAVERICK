import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import './App.css'
import { useEffect, useState } from 'react'

function App() {
    const [, setApiStatus] = useState('Checking...')
    const [telemetry, setTelemetry] = useState<any>(null)

    const getDeviceStatus = () => {
  if (!telemetry?.receivedAt) {
    return 'offline'
  }

  const ageMs =
    Date.now() -
    new Date(telemetry.receivedAt).getTime()

  if (ageMs < 90000) {
    return 'online'
  }

  if (ageMs < 300000) {
    return 'delayed'
  }

  return 'offline'
}

const deviceStatus = getDeviceStatus()


  useEffect(() => {
  const cargarTelemetria = () => {
    fetch('https://maverick-1z64.onrender.com/api/telemetry/latest')
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          setTelemetry(data.telemetry)
          setApiStatus('online')
        } else {
          setApiStatus('offline')
        }
      })
      .catch(() => {
        setApiStatus('offline')
      })
  }

  cargarTelemetria()

  const intervalo = setInterval(
    cargarTelemetria,
    5000
  )

  return () => clearInterval(intervalo)
}, [])

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>Maverick Tracking System</h1>

        <nav>
          <button className="active">Dashboard</button>
          <button>Trailers</button>
          <button>Dispatch</button>
          <button>Alerts</button>
          <button>Reports</button>
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h2>Fleet Dashboard</h2>
            <p>Live trailer location and temperature monitoring</p>
          </div>

          <div className="status">
            <span className={`dot ${deviceStatus}`}></span>
            Device {deviceStatus}
          </div>
        </header>

        <section className="cards">
          <div className="card">
            <p>Active Trailers</p>
            <strong>12</strong>
          </div>

          <div className="card">
            <p>Moving</p>
            <strong>8</strong>
          </div>

          <div className="card">
            <p>Temperature Alerts</p>
            <strong>2</strong>
          </div>

          <div className="card">
            <p>Offline Devices</p>
            <strong>1</strong>
          </div>
        </section>

        <section className="content-grid">
          <div className="panel map-panel">
            <h3>Live Fleet Map</h3>
            <MapContainer
              center={[36.320755, -121.249853]}
              zoom={13}
              style={{ height: '420px', width: '100%', borderRadius: '12px' }}
>
             <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

 {telemetry && (
  <Marker
    position={[
      telemetry.latitude,
      telemetry.longitude
    ]}
  >
    <Popup>
      <strong>{telemetry.deviceId}</strong>
      <br />
      Temperature: {((telemetry.temperature * 9) / 5 + 32).toFixed(1)} °F
      <br />
      Lat: {telemetry.latitude}
      <br />
      Lon: {telemetry.longitude}
    </Popup>
  </Marker>
)}

            </MapContainer>
          </div>

          <div className="panel">
            <h3>Trailer Status</h3>

            <div className="trailer-row">
              <div>
                <strong>Trailer 1042</strong>
                <p>En route · Fresno, CA</p>
              </div>
              <span>34.8°F</span>
            </div>

            <div className="trailer-row">
              <div>
                <strong>Trailer 1078</strong>
                <p>Loading · Salinas, CA</p>
              </div>
              <span>36.2°F</span>
            </div>

            <div className="trailer-row alert">
              <div>
                <strong>Trailer 1115</strong>
                <p>Temperature alert</p>
              </div>
              <span>44.9°F</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App