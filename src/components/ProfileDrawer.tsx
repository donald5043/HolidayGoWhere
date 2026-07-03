import { Heart, SlidersHorizontal, X, type LucideIcon } from 'lucide-react'
import { Mascot } from './Mascot'

export function ProfileDrawer({
  onClose,
  personalityProfile,
  favoritesCount,
  clickHistoryCount,
  age,
  onViewFavorites,
  onAdjustPreferences,
}: {
  onClose: () => void
  personalityProfile: { icon: LucideIcon; label: string; desc: string } | null
  favoritesCount: number
  clickHistoryCount: number
  age: string
  onViewFavorites: () => void
  onAdjustPreferences: () => void
}) {
  return (
    <div className="modal-backdrop profile-backdrop" onClick={onClose}>
      <aside className="profile-sheet" onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="關閉"><X /></button>
        <div className="profile-avatar" aria-hidden="true">
          <Mascot variant="appIcon" className="profile-avatar-img" />
        </div>
        <h2>我的親子小檔案</h2>
        <p>你的收藏與偏好會保存在這支手機裡。</p>
        {personalityProfile && (
          <div className="profile-persona">
            <span className="profile-persona-emoji"><personalityProfile.icon size={24} /></span>
            <div>
              <strong>{personalityProfile.label}</strong>
              <span>{personalityProfile.desc}</span>
            </div>
          </div>
        )}
        <div className="profile-stats">
          <div><strong>{favoritesCount}</strong><span>收藏景點</span></div>
          <div><strong>{clickHistoryCount}</strong><span>探索紀錄</span></div>
          <div><strong>{age === 'all' ? '全部' : age}</strong><span>孩子年齡</span></div>
        </div>
        <button className="profile-action" onClick={onViewFavorites}>
          <Heart size={18} />查看我的收藏
        </button>
        <button className="profile-action secondary" onClick={onAdjustPreferences}>
          <SlidersHorizontal size={18} />調整家庭偏好
        </button>
      </aside>
    </div>
  )
}
