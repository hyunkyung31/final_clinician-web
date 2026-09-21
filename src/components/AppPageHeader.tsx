import type { ReactNode } from 'react'
import { LogOut, Menu } from 'lucide-react'

interface AppPageHeaderProps {
  title: string
  subtitle?: string
  userName: string
  userDepartment?: string
  chatOpen: boolean
  chatUnreadCount: number
  onToggleChat: () => void
  onLogout: () => void
  children?: ReactNode
}

export function AppPageHeader({
  title,
  subtitle,
  userName,
  userDepartment,
  chatOpen,
  chatUnreadCount,
  onToggleChat,
  onLogout,
  children,
}: AppPageHeaderProps) {
  const name = userName || '의료진'
  return (
    <header className="app-page-header">
      <div className="page-header-main">
        <h1>{title}</h1>
        {subtitle ? <small>{subtitle}</small> : null}
      </div>
      <div className="page-header-actions utility-actions">
        {children}
        <span className="utility-user" title={userDepartment ? `${name} · ${userDepartment}` : name}>
          <strong>{name}</strong>
          {userDepartment ? <small>{userDepartment}</small> : null}
        </span>
        <button
          className={`utility-button ${chatOpen ? 'active' : ''}`}
          onClick={onToggleChat}
          type="button"
          title={chatOpen ? '채팅 접기' : '채팅 열기'}
          aria-label={chatOpen ? '채팅 접기' : '채팅 열기'}
          aria-pressed={chatOpen}
        >
          <Menu size={16} strokeWidth={1.8} />
          {chatUnreadCount > 0 && (
            <b className="utility-badge">{chatUnreadCount > 99 ? '99+' : chatUnreadCount}</b>
          )}
        </button>
        <button
          className="utility-button"
          onClick={onLogout}
          type="button"
          title="로그아웃"
          aria-label="로그아웃"
        >
          <LogOut size={16} strokeWidth={1.8} />
        </button>
      </div>
    </header>
  )
}
