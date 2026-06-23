import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { CircleMarker, MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { Place } from './data'
import { classifyRestaurant, CATEGORY_EMOJI } from './services/restaurantClassifier'

type Props = {
  places: Place[]
  selected: Place | null
  onSelect: (place: Place) => void
  userLocation: { lat: number; lng: number } | null
  focusKey: number
  onViewportChange: (viewport: MapViewport) => void
}

export type MapViewport = {
  center: { lat: number; lng: number }
  bounds: {
    north: number
    south: number
    east: number
    west: number
  }
  zoom: number
}

const taiwanCenter: [number, number] = [23.6978, 120.9605]

function createPlaceIcon(place: Place, selected: boolean) {
  let emoji: string
  if (place.placeType === '餐飲') {
    const score = classifyRestaurant(place)
    emoji = CATEGORY_EMOJI[score.restaurantCategory]
  } else {
    emoji =
      place.category === '自然放電'
        ? '🌳'
        : place.category === '美感散步'
          ? '🎨'
          : '🚀'
  }

  return L.divIcon({
    className: 'leaflet-place-icon-wrap',
    html: `<span class="leaflet-place-icon${selected ? ' is-selected' : ''}" style="--pin-color:${place.accent}"><b>${emoji}</b></span>`,
    iconSize: [48, 52],
    iconAnchor: [24, 46],
    tooltipAnchor: [0, -42],
  })
}

function FitPlaces({
  places,
  userLocation,
  focusKey,
}: {
  places: Place[]
  userLocation: { lat: number; lng: number } | null
  focusKey: number
}) {
  const map = useMap()

  useEffect(() => {
    if (userLocation) {
      map.flyTo([userLocation.lat, userLocation.lng], 12, { duration: 0.8 })
      return
    }
    if (!places.length) return
    if (places.length === 1) {
      map.flyTo([places[0].lat, places[0].lng], 13, { duration: 0.7 })
      return
    }

    map.fitBounds(
      places.map((place) => [place.lat, place.lng] as [number, number]),
      { padding: [45, 45], maxZoom: 11 },
    )
  }, [focusKey, map])

  return null
}

function TrackMapViewport({ onChange }: { onChange: (viewport: MapViewport) => void }) {
  const userMoving = useRef(false)
  const map = useMapEvents({
    dragstart: () => {
      userMoving.current = true
    },
    zoomstart: (event) => {
      if ('originalEvent' in event && event.originalEvent) {
        userMoving.current = true
      }
    },
    moveend: () => {
      if (!userMoving.current) return
      userMoving.current = false
      const center = map.getCenter()
      const bounds = map.getBounds()
      onChange({
        center: { lat: center.lat, lng: center.lng },
        bounds: {
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest(),
        },
        zoom: map.getZoom(),
      })
    },
  })

  return null
}

function KeepMapSized() {
  const map = useMap()

  useEffect(() => {
    const container = map.getContainer()
    let frame = 0
    const refresh = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => map.invalidateSize({ pan: false }))
    }
    const observer = new ResizeObserver(refresh)
    observer.observe(container)
    window.addEventListener('resize', refresh)
    window.addEventListener('orientationchange', refresh)
    const timers = [0, 150, 500].map((delay) => window.setTimeout(refresh, delay))

    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      timers.forEach(window.clearTimeout)
      window.removeEventListener('resize', refresh)
      window.removeEventListener('orientationchange', refresh)
    }
  }, [map])

  return null
}

export function MapView({
  places,
  selected,
  onSelect,
  userLocation,
  focusKey,
  onViewportChange,
}: Props) {
  return (
    <MapContainer
      center={taiwanCenter}
      zoom={7}
      minZoom={6}
      maxZoom={18}
      scrollWheelZoom
      className="open-map"
      zoomControl
      preferCanvas
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
        updateWhenIdle
        keepBuffer={1}
      />
      <KeepMapSized />
      <FitPlaces places={places} userLocation={userLocation} focusKey={focusKey} />
      <TrackMapViewport onChange={onViewportChange} />
      {userLocation && (
        <CircleMarker
          center={[userLocation.lat, userLocation.lng]}
          radius={9}
          pathOptions={{
            color: '#ffffff',
            weight: 4,
            fillColor: '#3185fc',
            fillOpacity: 1,
          }}
        >
          <Tooltip direction="top" offset={[0, -8]} opacity={0.95}>
            你的位置
          </Tooltip>
        </CircleMarker>
      )}
      {places.map((place) => (
        <Marker
          key={place.id}
          position={[place.lat, place.lng]}
          icon={createPlaceIcon(place, selected?.id === place.id)}
          eventHandlers={{ click: () => onSelect(place) }}
          title={place.name}
        >
          <Tooltip direction="top" offset={[0, -12]} opacity={0.95}>
            <strong>{place.name}</strong>
            <br />
            {place.city}・{place.category}
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  )
}
