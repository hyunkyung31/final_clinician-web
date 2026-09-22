import type { ReactNode } from 'react'
import { LogOut } from 'lucide-react'

interface AppPageHeaderProps {
  title: string
  subtitle?: string
  userName: string
  userDepartment?: string
  onLogout: () => void
  children?: ReactNode
}

export function AppPageHeader({
  title,
  subtitle,
  userName,
  userDepartment,
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
