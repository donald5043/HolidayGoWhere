type MascotVariant =
  | 'waving'
  | 'map'
  | 'favorites'
  | 'noResults'
  | 'rainy'
  | 'appIcon'
  | 'head'
  | 'qBao'
  | 'qMom'
  | 'family'
  | 'surprised'
  | 'thinking'
  | 'camera'
  | 'running'

type MascotProps = {
  variant?: MascotVariant
  className?: string
  alt?: string
  loading?: 'eager' | 'lazy'
}

const mascotSrc: Record<MascotVariant, string> = {
  waving: 'mascot/q-pang-waving-premium.png',
  map: 'mascot/q-pang-map-premium.png',
  favorites: 'mascot/q-pang-favorites.png',
  noResults: 'mascot/q-pang-no-results.png',
  rainy: 'mascot/q-pang-rainy.png',
  appIcon: 'brand/q-pang-app-icon-192.png',
  head: 'brand/q-pang-head-transparent.png',
  qBao: 'mascot/q-bao.png',
  qMom: 'mascot/q-mom.png',
  family: 'mascot/q-pang-family.png',
  surprised: 'mascot/q-pang-surprised.webp',
  thinking: 'mascot/q-pang-thinking.webp',
  camera: 'mascot/q-pang-camera.webp',
  running: 'mascot/q-pang-running.webp',
}

export function Mascot({ variant = 'waving', className = '', alt = '', loading = 'lazy' }: MascotProps) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}${mascotSrc[variant]}`}
      alt={alt}
      className={`mascot-figure mascot-figure--${variant} ${className}`.trim()}
      loading={loading}
      draggable={false}
    />
  )
}
