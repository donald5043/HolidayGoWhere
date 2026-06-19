import { useEffect } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { Place } from './data'

type Props = {
  places: Place[]
  selected: Place | null
  onSelect: (place: Place) => void
}

const taiwanCenter: [number, number] = [23.6978, 120.9605]

function createPlaceIcon(place: Place, selected: boolean) {
  const emoji =
    place.category === '自然放電'
      ? '🌳'
      : place.category === '美感散步'
        ? '🎨'
        : '🚀'

  return L.divIcon({
    className: 'leaflet-place-icon-wrap',
    html: `<span class="leaflet-place-icon${selected ? ' is-selected' : ''}" style="--pin-color:${place.accent}"><b>${emoji}</b></span>`,
    iconSize: [48, 52],
    iconAnchor: [24, 46],
    tooltipAnchor: [0, -42],
  })
}

function FitPlaces({ places }: { places: Place[] }) {
  const map = useMap()

  useEffect(() => {
    if (!places.length) return
    if (places.length === 1) {
      map.flyTo([places[0].lat, places[0].lng], 13, { duration: 0.7 })
      return
    }

    map.fitBounds(
      places.map((place) => [place.lat, place.lng] as [number, number]),
      { padding: [45, 45], maxZoom: 11 },
    )
  }, [map, places])

  return null
}

export function MapView({ places, selected, onSelect }: Props) {
  return (
    <MapContainer
      center={taiwanCenter}
      zoom={7}
      minZoom={6}
      maxZoom={18}
      scrollWheelZoom
      className="open-map"
      zoomControl
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <FitPlaces places={places} />
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
