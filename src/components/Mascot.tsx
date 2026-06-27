type MascotVariant = 'waving' | 'map' | 'favorites' | 'noResults' | 'rainy' | 'appIcon' | 'head'

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
