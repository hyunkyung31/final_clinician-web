import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Bell,
  BrainCircuit,
  CalendarDays,
  CheckCheck,
  ClipboardPlus,
  FileText,
  MessageSquareMore,
  RefreshCw,
  Stethoscope,
  X,
  type LucideIcon,
} from 'lucide-react'
import {
  getStaffNotifications,
  getStaffNotificationUnreadCount,
  markAllStaffNotificationsRead,
  markStaffNotificationRead,
} from '../api/client'
import type { StaffNotification } from '../types'

const notificationIcons: Array<[string[], LucideIcon]> = [
  [['CONSULT', 'COLLAB'], Stethoscope],
  [['CHAT', 'MESSAGE'], MessageSquareMore],
  [['SCHEDULE', 'APPOINT'], CalendarDays],
  [['AI', 'ANALYSIS'], BrainCircuit],
  [['REPORT'], FileText],
  [['ORDER', 'EXAM'], ClipboardPlus],
]

function notificationIcon(item: StaffNotification) {
  const key = `${item.type} ${item.referenceType}`.toUpperCase()
  return notificationIcons.find(([keywords]) =>
    keywords.some((keyword) => key.includes(keyword)),
  )?.[1] ?? Bell
}

function formatNotificationTime(value: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function NotificationCenter({
  onOpenNotification,
}: {
  onOpenNotification: (notification: StaffNotification) => void
}) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<StaffNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const centerRef = useRef<HTMLDivElement | null>(null)

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    const [listResult, countResult] = await Promise.allSettled([
      getStaffNotifications(),
      getStaffNotificationUnreadCount(),
    ])

    if (listResult.status === 'fulfilled') {
      setItems(listResult.value)
      setError('')
    } else if (!quiet) {
      const message = listResult.reason instanceof Error
        ? listResult.reason.message
        : '알림 목록을 불러오지 못했습니다.'
      setError(
        message.includes('401') || message.includes('인증')
          ? '직원 알림 API 라우팅 연결이 필요합니다.'
          : message,
      )
    }

    if (countResult.status === 'fulfilled') {
      setUnreadCount(countResult.value)
    } else if (listResult.status === 'fulfilled') {
      setUnreadCount(listResult.value.filter((item) => !item.isRead).length)
    }

    if (!quiet) setLoading(false)
  }, [])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(true), 30000)
    return () => window.clearInterval(timer)
  }, [load])

  useEffect(() => {
    const closeNotifications = () => setOpen(false)
    const openNotifications = () => {
      setOpen(true)
      window.dispatchEvent(new CustomEvent('angiocad:close-todos'))
    }
    const closeFromOutside = (event: MouseEvent) => {
      if (!centerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeFromEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', closeFromOutside)
    document.addEventListener('keydown', closeFromEscape)
    window.addEventListener('angiocad:close-notifications', closeNotifications)
    window.addEventListener('angiocad:open-notifications', openNotifications)
    return () => {
      document.removeEventListener('mousedown', closeFromOutside)
      document.removeEventListener('keydown', closeFromEscape)
      window.removeEventListener('angiocad:close-notifications', closeNotifications)
      window.removeEventListener('angiocad:open-notifications', openNotifications)
    }
  }, [])

  const recentItems = useMemo(() => items.slice(0, 30), [items])

  const openItem = async (item: StaffNotification) => {
    if (!item.isRead) {
      try {
        await markStaffNotificationRead(item.recipientId)
        setItems((current) => current.map((entry) =>
          entry.recipientId === item.recipientId ? { ...entry, isRead: true } : entry,
        ))
        setUnreadCount((current) => Math.max(0, current - 1))
      } catch {
        // 참조 화면 이동은 읽음 처리 실패와 분리한다.
      }
    }
    onOpenNotification(item)
    setOpen(false)
  }

  const markAllRead = async () => {
    try {
      await markAllStaffNotificationsRead()
      setItems((current) => current.map((item) => ({ ...item, isRead: true })))
      setUnreadCount(0)
    } catch (readError) {
      setError(
        readError instanceof Error
          ? readError.message
          : '알림을 읽음 처리하지 못했습니다.',
      )
    }
  }

  return (
    <div className="notification-center" ref={centerRef}>
      <button
        className={`utility-button notification-trigger ${open ? 'active' : ''}`}
        onClick={() => setOpen((current) => {
          if (!current) window.dispatchEvent(new CustomEvent('angiocad:close-todos'))
          return !current
        })}
        title="업무 알림"
        aria-label={`업무 알림 ${unreadCount}건`}
        aria-expanded={open}
        type="button"
      >
        <Bell size={16} strokeWidth={1.8} />
        {unreadCount > 0 && (
          <b className="utility-badge">{unreadCount > 99 ? '99+' : unreadCount}</b>
        )}
      </button>

      {open && (
        <section className="notification-popover" role="dialog" aria-label="업무 알림센터">
          <header>
            <div>
              <strong>업무 알림</strong>
              <span>미확인 {unreadCount}건</span>
            </div>
            <div>
              <button onClick={() => void load()} title="새로고침" type="button"><RefreshCw size={15} /></button>
              <button onClick={() => setOpen(false)} title="닫기" type="button"><X size={16} /></button>
            </div>
          </header>

          <div className="notification-filter-row">
            <span>최근 알림</span>
            <button onClick={() => void markAllRead()} disabled={!unreadCount} type="button"><CheckCheck size={14} />모두 읽음</button>
          </div>

          {error && (
            <div className="notification-error">
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="notification-list">
            {recentItems.map((item) => {
              const Icon = notificationIcon(item)
              return (
                <button
                  className={`${item.isRead ? 'read' : 'unread'} priority-${item.priority.toLowerCase()}`}
                  key={item.recipientId}
                  onClick={() => void openItem(item)}
                  type="button"
                >
                  <span className="notification-item-icon"><Icon size={17} /></span>
                  <span className="notification-copy">
                    <strong>{item.title}</strong>
                    <small>{item.body || '세부 내용이 없습니다.'}</small>
                    <time>{formatNotificationTime(item.createdAt)}</time>
                  </span>
                  {!item.isRead && <i />}
                </button>
              )
            })}
            {!loading && !error && recentItems.length === 0 && (
              <div className="notification-empty"><Bell size={26} /><strong>새 알림이 없습니다</strong><span>협진·오더·일정·AI 알림이 이곳에 표시됩니다.</span></div>
            )}
            {loading && <div className="notification-empty">알림을 불러오는 중…</div>}
          </div>
          <footer className="notification-footer">전체보기</footer>
        </section>
      )}
    </div>
  )
}
