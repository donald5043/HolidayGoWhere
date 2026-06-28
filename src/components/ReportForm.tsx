import { type Dispatch, type SetStateAction } from 'react'
import { ThumbsDown, ThumbsUp } from 'lucide-react'
import type { FamilyAmenityKey } from '../data'

export function ReportForm({
  reportLiked,
  setReportLiked,
  reportAmenities,
  setReportAmenities,
  reportNote,
  setReportNote,
  synced,
  onCancel,
  onSave,
}: {
  reportLiked: boolean
  setReportLiked: Dispatch<SetStateAction<boolean>>
  reportAmenities: Partial<Record<FamilyAmenityKey, boolean>>
  setReportAmenities: Dispatch<SetStateAction<Partial<Record<FamilyAmenityKey, boolean>>>>
  reportNote: string
  setReportNote: Dispatch<SetStateAction<string>>
  synced: boolean
  onCancel: () => void
  onSave: () => void
}) {
  return (
    <div className="report-form">
      <div className="report-choice">
        <button className={reportLiked ? 'active' : ''} onClick={() => setReportLiked(true)}><ThumbsUp size={13} /> 孩子喜歡</button>
        <button className={!reportLiked ? 'active' : ''} onClick={() => setReportLiked(false)}><ThumbsDown size={13} /> 體驗普通</button>
      </div>
      <strong>這次有看到哪些設施？</strong>
      <div className="report-amenities">
        {[
          ['nursingRoom', '育嬰室'],
          ['diaperTable', '尿布台'],
          ['familyRestroom', '親子廁所'],
          ['accessibility', '無障礙'],
          ['parking', '停車'],
          ['strollerFriendly', '推車友善'],
        ].map(([key, label]) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={reportAmenities[key as FamilyAmenityKey] === true}
              onChange={(event) => setReportAmenities((current) => ({
                ...current,
                [key]: event.target.checked,
              }))}
            />
            {label}
          </label>
        ))}
      </div>
      <textarea
        value={reportNote}
        onChange={(event) => setReportNote(event.target.value)}
        placeholder="例如：週六下午人很多、推車可走、停車等了 20 分鐘…"
        maxLength={240}
      />
      <div className="report-actions">
        <button onClick={onCancel}>取消</button>
        <button className="primary" onClick={onSave}>{synced ? '儲存並同步' : '儲存在這支手機'}</button>
      </div>
      <small>{synced ? '回報將同步至雲端，可跨裝置查看。' : '目前回報只保存在此裝置，不會公開上傳。'}</small>
    </div>
  )
}
