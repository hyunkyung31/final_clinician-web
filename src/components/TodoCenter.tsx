import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { AlertTriangle, CalendarDays, ListTodo, LoaderCircle, Plus, Trash2, X } from 'lucide-react'
import { createStaffTodo, deleteStaffTodo, getStaffTodos, updateStaffTodo } from '../api/client'
import type { StaffTodo } from '../types'

const TODO_CHANGED_EVENT = 'angiocad:todos-changed'

function localDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isDone(todo: StaffTodo) {
  return ['DONE', 'COMPLETED'].includes(todo.status.toUpperCase())
}

export function TodoCenter() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<StaffTodo[]>([])
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState(() => localDateKey())
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState<number | 'new' | null>(null)
  const [error, setError] = useState('')
  const centerRef = useRef<HTMLDivElement | null>(null)

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      setItems(await getStaffTodos())
      setError('')
    } catch (loadError) {
      if (!quiet) setError(loadError instanceof Error ? loadError.message : 'To-do를 불러오지 못했습니다.')
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(true), 60000)
    return () => window.clearInterval(timer)
  }, [load])

  useEffect(() => {
    const openTodos = () => {
      setOpen(true)
      window.dispatchEvent(new CustomEvent('angiocad:close-notifications'))
    }
    const closeTodos = () => setOpen(false)
    const closeFromOutside = (event: MouseEvent) => {
      if (!centerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeFromEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', closeFromOutside)
    document.addEventListener('keydown', closeFromEscape)
    window.addEventListener('angiocad:open-todos', openTodos)
    window.addEventListener('angiocad:close-todos', closeTodos)
    return () => {
      document.removeEventListener('mousedown', closeFromOutside)
      document.removeEventListener('keydown', closeFromEscape)
      window.removeEventListener('angiocad:open-todos', openTodos)
      window.removeEventListener('angiocad:close-todos', closeTodos)
    }
  }, [])

  const todayItems = useMemo(() => {
    const today = localDateKey()
    return items
      .filter((todo) => todo.dueAt
        ? localDateKey(new Date(todo.dueAt)) === today
        : !isDone(todo) || localDateKey(new Date(todo.completedAt)) === today)
      .sort((a, b) => Number(isDone(a)) - Number(isDone(b)))
  }, [items])
  const pendingCount = todayItems.filter((todo) => !isDone(todo)).length

  const notifyChanged = () => window.dispatchEvent(new CustomEvent(TODO_CHANGED_EVENT))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim()) return
    setSavingId('new')
    setError('')
    try {
      const created = await createStaffTodo({
        title: title.trim(),
        dueAt: dueDate ? new Date(`${dueDate}T18:00:00`).toISOString() : null,
      })
      setItems((current) => [created, ...current])
      setTitle('')
      notifyChanged()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'To-do를 등록하지 못했습니다.')
    } finally {
      setSavingId(null)
    }
  }

  const toggle = async (todo: StaffTodo) => {
    setSavingId(todo.id)
    setError('')
    try {
      const updated = await updateStaffTodo(todo.id, { status: isDone(todo) ? 'TODO' : 'DONE' })
      setItems((current) => current.map((item) => item.id === updated.id ? updated : item))
      notifyChanged()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'To-do 상태를 변경하지 못했습니다.')
    } finally {
      setSavingId(null)
    }
  }

  const remove = async (todo: StaffTodo) => {
    if (!window.confirm(`“${todo.title}” To-do를 삭제할까요?`)) return
    setSavingId(todo.id)
    try {
      await deleteStaffTodo(todo.id)
      setItems((current) => current.filter((item) => item.id !== todo.id))
      notifyChanged()
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'To-do를 삭제하지 못했습니다.')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="todo-center" ref={centerRef}>
      <button
        className={`todo-trigger ${open ? 'active' : ''}`}
        onClick={() => setOpen((current) => {
          if (!current) window.dispatchEvent(new CustomEvent('angiocad:close-notifications'))
          return !current
        })}
        title="오늘 To-do"
        aria-label={`오늘 미완료 To-do ${pendingCount}건`}
        aria-expanded={open}
        type="button"
      >
        <ListTodo size={18} strokeWidth={1.8} />
        {pendingCount > 0 && <b>{pendingCount > 99 ? '99+' : pendingCount}</b>}
      </button>

      {open && (
        <section className="todo-popover" role="dialog" aria-label="오늘 To-do">
          <header>
            <div><strong>오늘 To-do</strong><span>미완료 {pendingCount}건</span></div>
            <button onClick={() => setOpen(false)} title="닫기" type="button"><X size={16} /></button>
          </header>

          <form className="todo-quick-form" onSubmit={submit}>
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={150} placeholder="할 일을 입력하세요" aria-label="새 To-do" />
            <label title="마감일"><CalendarDays size={14} /><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
            <button disabled={!title.trim() || savingId === 'new'} type="submit">{savingId === 'new' ? <LoaderCircle className="spin" size={15} /> : <Plus size={15} />}추가</button>
          </form>

          {error && <div className="todo-popover-error"><AlertTriangle size={14} /><span>{error}</span></div>}

          <div className="todo-popover-list">
            {todayItems.map((todo) => {
              const done = isDone(todo)
              return (
                <article className={done ? 'completed' : ''} key={todo.id}>
                  <button className="todo-checkbox" onClick={() => void toggle(todo)} disabled={savingId === todo.id} aria-label={done ? '완료 취소' : '완료 처리'} type="button"><i /></button>
                  <span><strong>{todo.title}</strong><small>{todo.description || (todo.dueAt ? `${localDateKey(new Date(todo.dueAt))}까지` : '오늘 할 일')}</small></span>
                  <button className="todo-delete" onClick={() => void remove(todo)} disabled={savingId === todo.id} title="삭제" type="button"><Trash2 size={14} /></button>
                </article>
              )
            })}
            {!loading && todayItems.length === 0 && <div className="todo-popover-empty"><ListTodo size={25} /><strong>오늘 To-do가 없습니다</strong><span>위 입력창에서 바로 추가할 수 있습니다.</span></div>}
            {loading && <div className="todo-popover-empty">To-do를 불러오는 중…</div>}
          </div>
        </section>
      )}
    </div>
  )
}
