import { Pane, TileLayer } from 'react-leaflet'

export default function MapBaseLayers({ mode }: { mode: 'street' | 'satellite' }) {
  if (mode === 'street') {
    return (
      <TileLayer
        key="street"
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxNativeZoom={19}
        maxZoom={22}
      />
    )
  }

  return (
    <>
      <TileLayer
        key="satellite"
        attribution="Imagery &copy; Esri"
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        maxNativeZoom={19}
        maxZoom={22}
      />
      {/* Above imagery, below routes and markers; labels never capture clicks.
          Esri schedules these raster reference services to retire in 2028/2029. */}
      <Pane name="satellite-reference" style={{ zIndex: 350, pointerEvents: 'none' }}>
        <TileLayer
          attribution="Labels &copy; Esri, HERE, Garmin, OpenStreetMap contributors"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"
          maxNativeZoom={23}
          maxZoom={22}
        />
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
          maxNativeZoom={23}
          maxZoom={22}
        />
      </Pane>
    </>
  )
}
