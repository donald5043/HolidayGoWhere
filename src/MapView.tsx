import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { Place } from './data'
import { classifyRestaurant, CATEGORY_EMOJI } from './services/restaurantClassifier'

type Props = {
  places: Place[]
  selected: Place | null
  onSelect: (place: Place) => void
  onOpenPlace: (place: Place) => void
  userLocation: { lat: number; lng: number } | null
  focusKey: number
  onViewportChange: (viewport: MapViewport) => void
  interactive?: boolean
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
const qBaoMarkerUrl = `${import.meta.env.BASE_URL}mascot/q-bao.png`

function markerTone(place: Place) {
  if (place.placeType === '餐飲') return '#789B8D'
  if (place.weekendEvent) return '#E9A93A'
  if (place.rainyDay || place.setting === '室內') return '#5B8FF0'
  return place.accent || '#D9775F'
}

function markerLabel(place: Place) {
  if (place.placeType === '餐飲') {
    const score = classifyRestaurant(place)
    return CATEGORY_EMOJI[score.restaurantCategory]
  }
  if (place.rainyDay || place.setting === '室內') return '☂'
  if (place.weekendEvent) return '★'
  return 'Q'
}

function createPlaceIcon(place: Place, selected: boolean) {
  const color = markerTone(place)
  const label = markerLabel(place)

  return L.divIcon({
    className: 'leaflet-place-icon-wrap',
    html: `
      <span class="leaflet-place-pin${selected ? ' is-selected' : ''}" style="--pin-color:${color}">
        <span class="leaflet-place-pin__face">
          <img src="${qBaoMarkerUrl}" alt="" loading="lazy" />
        </span>
        <b>${label}</b>
      </span>
    `,
    iconSize: [44, 52],
    iconAnchor: [22, 48],
    popupAnchor: [0, -44],
    tooltipAnchor: [0, -44],
  })
}

function FitPlaces({
  places,
  selected,
  userLocation,
  focusKey,
}: {
  places: Place[]
  selected: Place | null
  userLocation: { lat: number; lng: number } | null
  focusKey: number
}) {
  const map = useMap()
  const placePoints = useMemo(
    () => places.map((place) => [place.lat, place.lng] as [number, number]),
    [places],
  )
  const selectedLat = selected?.lat
  const selectedLng = selected?.lng
  const userLat = userLocation?.lat
  const userLng = userLocation?.lng

  useEffect(() => {
    if (selectedLat !== undefined && selectedLng !== undefined) {
      map.flyTo([selectedLat + 0.0008, selectedLng], Math.max(map.getZoom(), 15), { duration: 0.55 })
      return
    }
    if (userLat !== undefined && userLng !== undefined) {
      map.flyTo([userLat, userLng], 12, { duration: 0.8 })
      return
    }
    if (!placePoints.length) return
    if (placePoints.length === 1) {
      map.flyTo(placePoints[0], 13, { duration: 0.7 })
      return
    }

    map.fitBounds(
      placePoints,
      { padding: [45, 45], maxZoom: 11 },
    )
  }, [focusKey, map, placePoints, selectedLat, selectedLng, userLat, userLng])

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

function familyBadgeText(place: Place) {
  if (place.familyAmenities?.strollerFriendly === 'confirmed') return '推車友善'
  if (place.familyAmenities?.parking === 'confirmed') return '停車線索'
  if (place.familyAmenities?.nursingRoom === 'confirmed' || place.familyAmenities?.diaperTable === 'confirmed') return '育兒設施'
  if (place.rainyDay) return '雨天備案'
  return place.setting
}

function PlaceMarker({
  place,
  selected,
  onSelect,
  onOpenPlace,
}: {
  place: Place
  selected: boolean
  onSelect: (place: Place) => void
  onOpenPlace: (place: Place) => void
}) {
  const markerRef = useRef<L.Marker | null>(null)

  useEffect(() => {
    if (selected) {
      window.setTimeout(() => markerRef.current?.openPopup(), 120)
    }
  }, [selected])

  return (
    <Marker
      ref={markerRef}
      position={[place.lat, place.lng]}
      icon={createPlaceIcon(place, selected)}
      eventHandlers={{ click: () => onSelect(place) }}
      title={place.name}
      zIndexOffset={selected ? 900 : 0}
    >
      <Popup className="place-map-popup" maxWidth={260} minWidth={210}>
        <div className="map-popup-card">
          <strong>{place.name}</strong>
          <div className="map-popup-meta">
            <span>{place.city}</span>
            <span>{place.category}</span>
          </div>
          <div className="map-popup-badges">
            <span>{familyBadgeText(place)}</span>
            <span>{place.ageMin}–{place.ageMax} 歲</span>
          </div>
          <button type="button" onClick={() => onOpenPlace(place)}>
            查看詳情
          </button>
        </div>
      </Popup>
    </Marker>
  )
}

function MapInteractionController({ interactive }: { interactive: boolean }) {
  const map = useMap()

  useEffect(() => {
    const handlers = [
      map.dragging,
      map.touchZoom,
      map.scrollWheelZoom,
      map.doubleClickZoom,
      map.boxZoom,
      map.keyboard,
    ]

    handlers.forEach((handler) => {
      if (interactive) {
        handler.enable()
      } else {
        handler.disable()
      }
    })

    return () => {
      handlers.forEach((handler) => handler.enable())
    }
  }, [interactive, map])

  return null
}

export function MapView({
  places,
  selected,
  onSelect,
  onOpenPlace,
  userLocation,
  focusKey,
  onViewportChange,
  interactive = true,
}: Props) {
  return (
    <MapContainer
      center={taiwanCenter}
      zoom={7}
      minZoom={6}
      maxZoom={18}
      scrollWheelZoom={interactive}
      className="open-map"
      dragging={interactive}
      touchZoom={interactive}
      doubleClickZoom={interactive}
      boxZoom={interactive}
      keyboard={interactive}
      zoomControl={interactive}
      preferCanvas
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        maxZoom={19}
        updateWhenIdle
        keepBuffer={1}
      />
      <KeepMapSized />
      <MapInteractionController interactive={interactive} />
      <FitPlaces places={places} selected={selected} userLocation={userLocation} focusKey={focusKey} />
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
        <PlaceMarker
          key={place.id}
          place={place}
          selected={selected?.id === place.id}
          onSelect={onSelect}
          onOpenPlace={onOpenPlace}
        />
      ))}
    </MapContainer>
  )
}
