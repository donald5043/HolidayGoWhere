const MASCOT_FILES = {
  full: 'qpang_full.png',
  waving: 'qpang_waving.png',
  camera: 'qpang_camera.png',
  map: 'qpang_map.png',
  jumping: 'qpang_jumping.png',
  logo: 'qpang_logo.png',
  icon: 'qpang_icon.png',
} as const

export type MascotPose = keyof typeof MASCOT_FILES

const PLACEHOLDER = `${import.meta.env.BASE_URL}mascot/placeholder.svg`

type Props = {
  pose?: MascotPose
  className?: string
  alt?: string
}

/**
 * Renders a Q胖 mascot image. Until the real PNG art is dropped into
 * /public/mascot/, it gracefully falls back to placeholder.svg so the
 * UI never shows a broken image.
 */
export function Mascot({ pose = 'full', className, alt = '' }: Props) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}mascot/${MASCOT_FILES[pose]}`}
      alt={alt}
      className={className}
      draggable={false}
      onError={(e) => {
        const img = e.currentTarget
        if (!img.src.endsWith('placeholder.svg')) img.src = PLACEHOLDER
      }}
    />
  )
}
