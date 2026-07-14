import { MessageCircleHeart, ShieldAlert, X } from 'lucide-react'
import { Mascot } from './Mascot'

const REPO_URL = 'https://github.com/donald5043/HolidayGoWhere'

export function AuthorNoteDrawer({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop profile-backdrop" onClick={onClose}>
      <aside className="profile-sheet author-sheet" onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="關閉"><X /></button>
        <div className="profile-avatar" aria-hidden="true">
          <Mascot variant="appIcon" className="profile-avatar-img" />
        </div>
        <h2><MessageCircleHeart size={20} />Q 爸的話</h2>

        <div className="author-note-body">
          <p>Hi 大家好,我是這個網站的作者 Q 爸。</p>
          <p>
            我是一名工程師,在育兒路上一邊學習怎麼當爸爸,一邊學著使用 AI。這個網站是我用 Codex 和 Claude
            Code 協作做出來的作品,功能和內容裡藏著不少我天馬行空的想法,偶爾可能會冒出一些「這跟親子有什麼關係?」的功能,還請大家笑一笑就好。
          </p>
          <p>網站背後沒有建立任何資料庫,請放心,我們不會蒐集任何使用者資訊。</p>
          <p>希望這個網站能幫上辛苦的爸爸媽媽們一點忙,如果覺得好用,也歡迎分享給身邊的親朋好友。</p>
        </div>

        <div className="author-note-disclaimer">
          <strong><ShieldAlert size={15} />免責聲明</strong>
          <p>
            網站內容皆整理自台灣政府公開資料,僅供研究與個人參考使用,不得作為任何商業用途。部分內容由 AI
            生成整理,使用前請自行查證,以官方最新資訊為準。
          </p>
        </div>

        <div className="author-note-contact">
          <strong>聯絡我</strong>
          <p>
            想跟我說些什麼,可以透過{' '}
            <a href={REPO_URL} target="_blank" rel="noreferrer">GitHub</a> 找到這個網站的原始碼,在上面留言,我應該會看到 😄
          </p>
        </div>
      </aside>
    </div>
  )
}
