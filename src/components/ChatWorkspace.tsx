import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  Circle,
  MessageSquareMore,
  Plus,
  RefreshCw,
  Search,
  Send,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react'
import {
  createChatRoom,
  createStaffChatSocket,
  getChatMessages,
  getChatRoom,
  getChatRooms,
  getStaffDoctors,
  getStaffIdentity,
  markChatRoomRead,
  sendChatMessage,
} from '../api/client'
import type { ChatMember, ChatMessage, ChatRoom, StaffDoctor, StaffIdentity } from '../types'

function formatMessageTime(value: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date)
}

export function ChatWorkspace() {
  const [rooms, setRooms] = useState<ChatRoom[]>([])
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null)
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [identity, setIdentity] = useState<StaffIdentity | null>(null)
  const [doctors, setDoctors] = useState<StaffDoctor[]>([])
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [roomType, setRoomType] = useState<'DIRECT' | 'GROUP'>('DIRECT')
  const [roomTitle, setRoomTitle] = useState('')
  const [memberIds, setMemberIds] = useState<number[]>([])
  const messageEndRef = useRef<HTMLDivElement | null>(null)

  const loadRooms = useCallback(async () => {
    setLoading(true)
    try {
      const [roomItems, me, doctorItems] = await Promise.all([
        getChatRooms(),
        getStaffIdentity(),
        getStaffDoctors(),
      ])
      setRooms(roomItems)
      setIdentity(me)
      setDoctors(doctorItems.filter((doctor) => doctor.isActive && doctor.userId !== me.id))
      setSelectedRoomId((current) => current ?? roomItems[0]?.id ?? null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '채팅방을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadConversation = useCallback(async (roomId: number, quiet = false) => {
    try {
      const [room, messageItems] = await Promise.all([getChatRoom(roomId), getChatMessages(roomId)])
      setSelectedRoom(room)
      setMessages(messageItems)
      const lastMessage = messageItems.at(-1)
      if (lastMessage) {
        await markChatRoomRead(roomId, lastMessage.id)
        setRooms((current) => current.map((item) => item.id === roomId ? { ...item, unreadCount: 0 } : item))
      }
    } catch (loadError) {
      if (!quiet) setError(loadError instanceof Error ? loadError.message : '대화 내용을 불러오지 못했습니다.')
    }
  }, [])

  useEffect(() => { void loadRooms() }, [loadRooms])
  useEffect(() => {
    if (!selectedRoomId) {
      setSelectedRoom(null)
      setMessages([])
      return
    }
    void loadConversation(selectedRoomId)
  }, [selectedRoomId, loadConversation])
  useEffect(() => {
    const socket = createStaffChatSocket()
    if (!socket) return
    const roomIds = rooms.map((room) => room.id)
    socket.addEventListener('open', () => roomIds.forEach((roomId) => socket.send(JSON.stringify({ event: 'chat.subscribe', room_id: roomId }))))
    socket.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(String(event.data)) as { event?: string; room_id?: number }
        if (payload.event === 'chat.message.created' && payload.room_id) {
          if (payload.room_id === selectedRoomId) void loadConversation(payload.room_id, true)
          void getChatRooms().then(setRooms)
        } else if (payload.event === 'chat.room.created' || payload.event === 'chat.member.joined') {
          void loadRooms()
        }
      } catch {
        // 알 수 없는 이벤트는 수동 새로고침으로 복구할 수 있다.
      }
    })
    return () => socket.close()
  }, [loadConversation, loadRooms, rooms.length, selectedRoomId])
  useEffect(() => { messageEndRef.current?.scrollIntoView({ block: 'end' }) }, [messages])

  const doctorByUserId = useMemo(() => new Map(doctors.map((doctor) => [doctor.userId, doctor])), [doctors])
  const memberDisplay = (member: ChatMember) => {
    const doctor = doctorByUserId.get(member.userId)
    const apiName = member.name.trim()
    const hasRealApiName = apiName && apiName !== '의료진'

    return {
      name: doctor?.name || (hasRealApiName ? apiName : '') || member.username || `의료진 #${member.userId}`,
      detail: doctor?.departmentName || member.departmentName || member.title || member.role,
    }
  }
  const filteredRooms = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return rooms
    return rooms.filter((room) => `${room.title} ${room.latestMessage?.text ?? ''}`.toLowerCase().includes(keyword))
  }, [rooms, search])

  const roomDisplayTitle = (room: ChatRoom) => {
    if (room.title && room.title !== '1:1 채팅' && room.title !== '그룹 채팅') return room.title
    const otherMembers = room.members.filter((member) => member.userId !== identity?.id)
    return otherMembers.map((member) => memberDisplay(member).name).join(', ') || room.title
  }

  const submitMessage = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedRoomId || !draft.trim()) return
    const messageText = draft.trim()
    setDraft('')
    setSending(true)
    try {
      await sendChatMessage(selectedRoomId, messageText)
      await loadConversation(selectedRoomId)
      void getChatRooms().then(setRooms)
    } catch (sendError) {
      setDraft(messageText)
      setError(sendError instanceof Error ? sendError.message : '메시지를 전송하지 못했습니다.')
    } finally {
      setSending(false)
    }
  }

  const submitRoom = async (event: FormEvent) => {
    event.preventDefault()
    if (memberIds.length === 0) return
    setSending(true)
    try {
      await createChatRoom({ roomType, title: roomType === 'GROUP' ? roomTitle.trim() : undefined, memberUserIds: memberIds })
      setCreateOpen(false)
      setMemberIds([])
      setRoomTitle('')
      await loadRooms()
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '채팅방을 만들지 못했습니다.')
    } finally {
      setSending(false)
    }
  }

  const toggleMember = (userId: number) => {
    setMemberIds((current) => current.includes(userId) ? current.filter((id) => id !== userId) : roomType === 'DIRECT' ? [userId] : [...current, userId])
  }

  return (
    <section className="feature-page chat-page">
      <header className="feature-header">
        <div><small>CLINICAL MESSENGER</small><h1>채팅</h1></div>
        <div className="feature-header-actions"><span className="feature-live"><i /> WebSocket 실시간 연결</span><button onClick={() => void loadRooms()} title="새로고침" type="button"><RefreshCw size={16} /></button><button className="feature-primary" onClick={() => setCreateOpen(true)} type="button"><Plus size={16} /> 새 채팅</button></div>
      </header>
      {error && <div className="feature-error"><span>{error}</span><button onClick={() => setError('')} type="button"><X size={15} /></button></div>}

      <div className="chat-layout">
        <aside className="feature-card chat-room-panel">
          <label className="feature-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="채팅방 검색" /></label>
          <div className="chat-room-list">
            {filteredRooms.map((room) => <button key={room.id} className={`${selectedRoomId === room.id ? 'active' : ''} ${room.unreadCount > 0 ? 'has-unread' : ''}`} onClick={() => setSelectedRoomId(room.id)} type="button"><span className="chat-avatar">{room.roomType === 'DIRECT' ? <UserRound size={18} /> : <UsersRound size={18} />}</span><span><strong>{roomDisplayTitle(room)}</strong><small>{room.latestMessage?.text || '새 대화를 시작하세요.'}</small></span><time>{formatMessageTime(room.latestMessage?.createdAt || room.createdAt)}</time>{room.unreadCount > 0 && <b className="chat-count-badge">{room.unreadCount > 99 ? '99+' : room.unreadCount}</b>}</button>)}
            {!loading && filteredRooms.length === 0 && <div className="feature-empty"><MessageSquareMore size={28} /><strong>채팅방이 없습니다</strong><span>의료진과 새 대화를 시작하세요.</span></div>}
            {loading && <div className="feature-empty">채팅방을 불러오는 중…</div>}
          </div>
        </aside>

        <main className="feature-card chat-conversation-panel">
          {selectedRoom ? <>
            <header className="chat-conversation-header"><div><span className="chat-avatar">{selectedRoom.roomType === 'DIRECT' ? <UserRound size={18} /> : <UsersRound size={18} />}</span><span><h2>{roomDisplayTitle(selectedRoom)}</h2><small><Circle size={7} fill="currentColor" /> {selectedRoom.members.length}명 · {selectedRoom.status}</small></span></div><span className="chat-sync">실시간 수신</span></header>
            <div className="message-list">
              {messages.map((message) => {
                const mine = message.senderId === identity?.id
                const senderDoctor = message.senderId ? doctorByUserId.get(message.senderId) : undefined
                const senderName = senderDoctor?.name || (message.senderName !== '의료진' ? message.senderName : message.senderId ? `의료진 #${message.senderId}` : '의료진')
                return <article key={message.id} className={mine ? 'mine' : ''}><span>{mine ? '나' : senderName}</span><div>{message.isDeleted ? '삭제된 메시지입니다.' : message.text}</div><time>{formatMessageTime(message.createdAt)}</time></article>
              })}
              {messages.length === 0 && <div className="feature-empty"><MessageSquareMore size={28} /><strong>아직 메시지가 없습니다</strong><span>진료 정보를 안전하게 공유해보세요.</span></div>}
              <div ref={messageEndRef} />
            </div>
            <form className="message-compose" onSubmit={submitMessage}><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} placeholder="메시지를 입력하세요. Shift+Enter로 줄바꿈" maxLength={2000} /><button className="feature-primary" disabled={sending || !draft.trim()} type="submit"><Send size={17} /></button></form>
          </> : <div className="feature-empty"><MessageSquareMore size={32} /><strong>대화를 선택하세요</strong><span>왼쪽 채팅방에서 대화를 선택하거나 새 채팅을 시작하세요.</span></div>}
        </main>

        <aside className="feature-card chat-info-panel">
          <header><h2>대화 정보</h2><span>{selectedRoom?.members.length ?? 0}명</span></header>
          <div className="chat-member-list">{selectedRoom?.members.map((member) => { const display = memberDisplay(member); return <article key={member.id || member.userId}><span className="chat-avatar"><UserRound size={17} /></span><span><strong>{member.userId === identity?.id ? '나' : display.name}</strong><small>{display.detail}</small></span></article> })}</div>
          {selectedRoom?.roomType === 'CONSULTATION' && <div className="chat-consultation-link"><StethoscopeMark />협진 #{selectedRoom.consultationId}</div>}
        </aside>
      </div>

      {createOpen && <div className="feature-modal-backdrop"><form className="feature-modal chat-create-modal" onSubmit={submitRoom}><header><div><small>NEW CONVERSATION</small><h2>새 채팅</h2></div><button onClick={() => setCreateOpen(false)} type="button"><X size={18} /></button></header><label>채팅 유형<select value={roomType} onChange={(event) => { setRoomType(event.target.value as 'DIRECT' | 'GROUP'); setMemberIds([]) }}><option value="DIRECT">1:1 채팅</option><option value="GROUP">그룹 채팅</option></select></label>{roomType === 'GROUP' && <label>채팅방 이름<input value={roomTitle} onChange={(event) => setRoomTitle(event.target.value)} maxLength={150} required /></label>}<div className="member-picker"><strong>의료진 선택</strong>{doctors.map((doctor) => <label key={doctor.userId}><input type="checkbox" checked={memberIds.includes(doctor.userId)} onChange={() => toggleMember(doctor.userId)} /><span><b>{doctor.name}</b><small>{doctor.departmentName} {doctor.title}</small></span></label>)}{doctors.length === 0 && <p>선택할 수 있는 의료진이 없습니다.</p>}</div><footer><button onClick={() => setCreateOpen(false)} type="button">취소</button><button className="feature-primary" disabled={sending || memberIds.length === 0} type="submit">채팅 시작</button></footer></form></div>}
    </section>
  )
}

function StethoscopeMark() {
  return <span aria-hidden="true">+</span>
}
