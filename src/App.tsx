import { useEffect, useMemo, useState } from 'react'
import {
  Baby,
  Bookmark,
  Clock3,
  Compass,
  Database,
  ExternalLink,
  Heart,
  Home,
  Instagram,
  LocateFixed,
  MapPin,
  Menu,
  Navigation,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  SunMedium,
  TentTree,
  X,
} from 'lucide-react'
import { ageOptions, type Place } from './data'
import { MapView } from './MapView'

const regions = ['全部', '北部', '中部', '南部', '東部', '離島'] as const
const settings = ['全部', '室內', '室外', '室內外'] as const
const durations = ['全部', '半日', '一日', '晚上'] as const
const MAX_VISIBLE_PLACES = 120

function compactNumber(value: number) {
  return value >= 10000 ? `${(value / 10000).toFixed(1)}萬` : value.toLocaleString('zh-TW')
}

function PlaceCard({
  place,
  onOpen,
  favorite,
  onFavorite,
}: {
  place: Place
  onOpen: () => void
  favorite: boolean
  onFavorite: () => void
}) {
  return (
    <article className="place-card" onClick={onOpen}>
      <div className="place-image-wrap">
        <img src={place.image} alt="" className="place-image" loading="lazy" />
        <span className="price-tag">{place.priceLabel}</span>
        <button
          className={`heart-button ${favorite ? 'is-favorite' : ''}`}
          onClick={(event) => {
            event.stopPropagation()
            onFavorite()
          }}
          aria-label={favorite ? '取消收藏' : '加入收藏'}
        >
          <Heart size={18} fill={favorite ? 'currentColor' : 'none'} />
        </button>
      </div>
      <div className="place-copy">
        <div className="eyebrow">
          <span>{place.category}</span>
          <span>・</span>
          <span>{place.setting}</span>
        </div>
        <h3>{place.name}</h3>
        <div className="meta-row">
          <span><MapPin size={14} />{place.city} {place.district}</span>
          {place.rating !== null ? (
            <>
              <span><Star size={14} fill="currentColor" />{place.rating}</span>
              <span className="reviews">({compactNumber(place.reviews)})</span>
            </>
          ) : (
            <span className="official-data"><Database size={13} />官方資料</span>
          )}
        </div>
        <p>{place.description}</p>
        <div className="tag-row">
          <span><Baby size={13} />{place.ageMin}–{place.ageMax} 歲</span>
          <span><Clock3 size={13} />{place.duration}</span>
        </div>
      </div>
    </article>
  )
}

function App() {
  const [places, setPlaces] = useState<Place[]>([])
  const [placesStatus, setPlacesStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState<(typeof regions)[number]>('全部')
  const [age, setAge] = useState<(typeof ageOptions)[number]['value']>('all')
  const [setting, setSetting] = useState<(typeof settings)[number]>('全部')
  const [duration, setDuration] = useState<(typeof durations)[number]>('全部')
  const [showFilters, setShowFilters] = useState(false)
  const [selected, setSelected] = useState<Place | null>(null)
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('holiday-go-where:favorites') || '[]')
    } catch {
      return []
    }
  })

  useEffect(() => {
    localStorage.setItem('holiday-go-where:favorites', JSON.stringify(favorites))
  }, [favorites])

  useEffect(() => {
    let active = true
    import('./generated/places.json')
      .then((module) => {
        if (!active) return
        setPlaces(module.default as Place[])
        setPlacesStatus('ready')
      })
      .catch(() => {
        if (active) setPlacesStatus('error')
      })
    return () => {
      active = false
    }
  }, [])

  const filteredPlaces = useMemo(() => {
    const [minAge, maxAge] = age === 'all' ? [0, 99] : age.split('-').map(Number)
    return places.filter((place) => {
      const textMatches = `${place.name}${place.city}${place.district}${place.category}`
        .toLowerCase()
        .includes(query.toLowerCase())
      const ageMatches = place.ageMin <= maxAge && place.ageMax >= minAge
      return (
        textMatches &&
        (region === '全部' || place.region === region) &&
        ageMatches &&
        (setting === '全部' || place.setting === setting || (setting !== '室內外' && place.setting === '室內外')) &&
        (duration === '全部' || place.duration === duration)
      )
    })
  }, [places, query, region, age, setting, duration])
  const visiblePlaces = useMemo(
    () => filteredPlaces.slice(0, MAX_VISIBLE_PLACES),
    [filteredPlaces],
  )

  const toggleFavorite = (id: string) => {
    setFavorites((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  const clearFilters = () => {
    setRegion('全部')
    setAge('all')
    setSetting('全部')
    setDuration('全部')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="假日去哪兒首頁">
          <span className="brand-mark">🐻</span>
          <span><strong>假日去哪兒</strong><small>和孩子一起發現好地方</small></span>
        </a>
        <div className="desktop-actions">
          <button className="ghost-button"><Bookmark size={18} />我的收藏</button>
          <button className="avatar-button">晴</button>
        </div>
        <button className="mobile-menu" aria-label="開啟選單"><Menu /></button>
      </header>

      <main>
        <section className="hero">
          <div className="hero-art hero-art-left">☁️</div>
          <div className="hero-art hero-art-right">🎈</div>
          <div className="hero-copy">
            <div className="hero-kicker"><Sparkles size={16} /> 今天想帶孩子去哪裡？</div>
            <h1>小小探險，<br /><span>大大回憶。</span></h1>
            <p>依孩子年齡、天氣與時間，找到全家都喜歡的好去處。</p>
          </div>
          <div className="search-panel">
            <label className="search-box">
              <Search size={20} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜尋景點、城市或想玩的活動"
              />
              {query && <button onClick={() => setQuery('')} aria-label="清除搜尋"><X size={17} /></button>}
            </label>
            <button className="filter-toggle" onClick={() => setShowFilters(!showFilters)}>
              <SlidersHorizontal size={18} />更多篩選
            </button>
          </div>
        </section>

        <section className="quick-filters" aria-label="快速篩選">
          <div className="filter-group region-tabs">
            {regions.map((item) => (
              <button key={item} className={region === item ? 'active' : ''} onClick={() => setRegion(item)}>
                {item}
              </button>
            ))}
          </div>
          <div className="filter-group age-tabs">
            {ageOptions.map((item) => (
              <button key={item.value} className={age === item.value ? 'active' : ''} onClick={() => setAge(item.value)}>
                <Baby size={15} />{item.label}
              </button>
            ))}
          </div>
        </section>

        {showFilters && (
          <section className="advanced-filters">
            <div>
              <span className="filter-label"><SunMedium size={16} />空間類型</span>
              <div className="filter-pills">
                {settings.map((item) => <button key={item} className={setting === item ? 'active' : ''} onClick={() => setSetting(item)}>{item}</button>)}
              </div>
            </div>
            <div>
              <span className="filter-label"><Clock3 size={16} />可用時間</span>
              <div className="filter-pills">
                {durations.map((item) => <button key={item} className={duration === item ? 'active' : ''} onClick={() => setDuration(item)}>{item}</button>)}
              </div>
            </div>
            <button className="clear-button" onClick={clearFilters}>清除條件</button>
          </section>
        )}

        <section className="explore-section">
          <div className="section-heading">
            <div>
              <span className="section-kicker"><TentTree size={17} /> 為你精選</span>
              <h2>週末靈感地圖</h2>
              <p>
                找到 <strong>{filteredPlaces.length}</strong> 個適合全家的地點
                {filteredPlaces.length > MAX_VISIBLE_PLACES && `・先顯示前 ${MAX_VISIBLE_PLACES} 筆`}
              </p>
            </div>
            <button className="location-button"><LocateFixed size={17} />我的附近</button>
          </div>

          <div className="explore-grid">
            <div className="map-panel">
              <MapView places={visiblePlaces} selected={selected} onSelect={setSelected} />
              <div className="map-legend"><span /><span>點一下圖標查看景點</span></div>
            </div>
            <div className="results-panel">
              {placesStatus === 'loading' ? (
                <div className="empty-state loading-state">
                  <span>🗺️</span>
                  <h3>正在整理親子景點</h3>
                  <p>載入官方開放資料中，馬上就好。</p>
                </div>
              ) : placesStatus === 'error' ? (
                <div className="empty-state">
                  <span>🛠️</span>
                  <h3>景點資料暫時載入失敗</h3>
                  <p>請確認網路後重新整理頁面。</p>
                  <button onClick={() => window.location.reload()}>重新載入</button>
                </div>
              ) : visiblePlaces.length ? visiblePlaces.map((place) => (
                <PlaceCard
                  key={place.id}
                  place={place}
                  onOpen={() => setSelected(place)}
                  favorite={favorites.includes(place.id)}
                  onFavorite={() => toggleFavorite(place.id)}
                />
              )) : (
                <div className="empty-state">
                  <span>🧸</span>
                  <h3>這組條件還沒有景點</h3>
                  <p>換個地區或放寬孩子年齡試試看。</p>
                  <button onClick={clearFilters}>查看全部景點</button>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      <nav className="bottom-nav" aria-label="主要導覽">
        <a className="active" href="#"><Home size={21} /><span>首頁</span></a>
        <a href="#explore"><Compass size={21} /><span>探索</span></a>
        <a href="#favorites"><Heart size={21} /><span>收藏</span></a>
        <a href="#profile"><Baby size={21} /><span>我的</span></a>
      </nav>

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <aside className="place-detail" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelected(null)} aria-label="關閉"><X /></button>
            <div className="detail-image" style={{ backgroundImage: `url(${selected.image})` }}>
              <span>{selected.category}</span>
            </div>
            <div className="detail-content">
              <div className="detail-title">
                <div>
                  <span className="eyebrow">{selected.city}・{selected.district}</span>
                  <h2>{selected.name}</h2>
                </div>
                <button className={`heart-button detail-heart ${favorites.includes(selected.id) ? 'is-favorite' : ''}`} onClick={() => toggleFavorite(selected.id)}>
                  <Heart fill={favorites.includes(selected.id) ? 'currentColor' : 'none'} />
                </button>
              </div>
              {selected.rating !== null ? (
                <div className="rating-line"><Star size={17} fill="currentColor" /> <strong>{selected.rating}</strong> Google 評分・{compactNumber(selected.reviews)} 則評論</div>
              ) : (
                <div className="rating-line official-line"><Database size={17} />交通部觀光署官方開放資料</div>
              )}
              <p className="detail-description">{selected.description}</p>
              <div className="info-list">
                <div><MapPin /><span><small>地址</small>{selected.address}</span></div>
                <div><Clock3 /><span><small>開放時間</small>{selected.hours}</span></div>
                <div><Baby /><span><small>適合年齡</small>{selected.ageMin}–{selected.ageMax} 歲・{selected.setting}・{selected.duration}</span></div>
                <div><Database /><span><small>資料來源</small>{selected.dataSource}</span></div>
              </div>
              <div className="detail-section">
                <h3>孩子會喜歡</h3>
                <div className="highlight-grid">
                  {selected.highlights.map((item) => <span key={item}>✨ {item}</span>)}
                </div>
              </div>
              <div className="detail-section">
                <h3>親子友善設施</h3>
                <div className="facility-row">
                  {selected.facilities.map((item) => <span key={item}>{item}</span>)}
                </div>
              </div>
              <div className="detail-section">
                <h3>爸媽真實分享</h3>
                <div className="source-list">
                  {selected.sources.map((source) => (
                    <a href={source.url} target="_blank" rel="noreferrer" key={source.url}>
                      {source.type === 'Instagram' ? <Instagram /> : <ExternalLink />}
                      <span><small>{source.type}</small>{source.label}</span>
                      <ExternalLink size={15} />
                    </a>
                  ))}
                </div>
              </div>
              <a className="maps-cta" href={selected.mapsUrl} target="_blank" rel="noreferrer">
                <Navigation size={19} />在 Google 地圖查看路線
              </a>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}

export default App
