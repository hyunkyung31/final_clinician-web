import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import {
  ArrowLeft,
  LogOut,
  Menu,
  MessageSquarePlus,
  Minimize2,
  Search,
  Send,
  UserRound,
  UserPlus,
  UsersRound,
  X,
} from 'lucide-react'
import {
  acceptChatRoomInvite,
  createChatRoom,
  createStaffChatSocket,
  getChatMessages,
  getChatRoom,
  getChatRooms,
  getStaffDoctors,
  getStaffIdentity,
  inviteChatRoomMember,
  leaveChatRoom,
  markChatRoomRead,
  sendChatMessage,
} from '../api/client'
import type { ChatMember, ChatMessage, ChatRoom, StaffDoctor, StaffIdentity } from '../types'

type RoomFilter = 'ALL' | 'DIRECT' | 'GROUP'
type DockView = 'ROOMS' | 'CONVERSATION'

function formatChatTime(value: string) {
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

export function ChatDock({
  open,
  onToggle,
  onUnreadCountChange,
  patientContext,
}: {
  open: boolean
  onToggle: () => void
  onUnreadCountChange?: (count: number) => void
  patientContext?: { name: string; id: string } | null
}) {
  const [rooms, setRooms] = useState<ChatRoom[]>([])
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null)
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [identity, setIdentity] = useState<StaffIdentity | null>(null)
  const [doctors, setDoctors] = useState<StaffDoctor[]>([])
  const [roomFilter, setRoomFilter] = useState<RoomFilter>('ALL')
  const [view, setView] = useState<DockView>('ROOMS')
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [roomInfoOpen, setRoomInfoOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteUserId, setInviteUserId] = useState<number | ''>('')
  const [newRoomType, setNewRoomType] = useState<'DIRECT' | 'GROUP'>('DIRECT')
  const [newRoomTitle, setNewRoomTitle] = useState('')
  const [memberIds, setMemberIds] = useState<number[]>([])
  const messageEndRef = useRef<HTMLDivElement | null>(null)

  const totalUnreadCount = useMemo(
    () => rooms.reduce((sum, room) => sum + room.unreadCount, 0),
    [rooms],
  )
  const roomIdsKey = useMemo(() => rooms.map((room) => room.id).sort((a, b) => a - b).join(','), [rooms])

  const loadRooms = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const [roomItems, me, doctorItems] = await Promise.all([
        getChatRooms(),
        getStaffIdentity(),
        getStaffDoctors(),
      ])
      setRooms(roomItems)
      setIdentity(me)
      setDoctors(
        doctorItems.filter(
          (doctor) => doctor.isActive && doctor.userId !== me.id,
        ),
      )

    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : '채팅방을 불러오지 못했습니다.',
      )
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [])

  const loadConversation = useCallback(
    async (roomId: number, quiet = false) => {
      try {
        let room = await getChatRoom(roomId)
        const invitedMembership = room.members.find(
          (member) =>
            member.userId === identity?.id &&
            member.status === 'INVITED',
        )

        if (invitedMembership?.id) {
          await acceptChatRoomInvite(roomId, invitedMembership.id)
          room = await getChatRoom(roomId)
        }

        setSelectedRoom(room)
        try {
          const roomMessages = await getChatMessages(roomId)
          setMessages(roomMessages)
          const lastMessage = roomMessages.at(-1)
          if (lastMessage) {
            await markChatRoomRead(roomId, lastMessage.id)
            setRooms((current) => current.map((item) => item.id === roomId ? { ...item, unreadCount: 0 } : item))
          }
        } catch (messageError) {
          setMessages([])
          if (!quiet) {
            setError(
              messageError instanceof Error
                ? messageError.message
                : '메시지를 불러오지 못했습니다.',
            )
          }
        }
      } catch (loadError) {
        if (!quiet) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : '대화 내용을 불러오지 못했습니다.',
          )
        }
      }
    },
    [identity?.id],
  )

  useEffect(() => {
    void loadRooms()
  }, [loadRooms])

  useEffect(() => {
    const timer = window.setInterval(() => void loadRooms(true), 60000)
    return () => window.clearInterval(timer)
  }, [loadRooms])

  useEffect(() => {
    const socket = createStaffChatSocket()
    if (!socket) return
    const roomIds = roomIdsKey ? roomIdsKey.split(',').map(Number) : []
    const subscribe = () => roomIds.forEach((roomId) => socket.send(JSON.stringify({ event: 'chat.subscribe', room_id: roomId })))
    socket.addEventListener('open', subscribe)
    socket.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(String(event.data)) as { event?: string; room_id?: number }
        if (payload.event === 'chat.message.created' && payload.room_id) {
          if (view === 'CONVERSATION' && selectedRoomId === payload.room_id) {
            void loadConversation(payload.room_id, true)
          }
          void loadRooms(true)
        } else if (payload.event === 'chat.room.created' || payload.event === 'chat.member.joined') {
          void loadRooms(true)
        }
      } catch {
        // 알 수 없는 이벤트는 다음 서버 동기화 때 반영한다.
      }
    })
    return () => socket.close()
  }, [loadConversation, loadRooms, roomIdsKey, selectedRoomId, view])

  useEffect(() => {
    onUnreadCountChange?.(totalUnreadCount)
  }, [onUnreadCountChange, totalUnreadCount])

  useEffect(() => {
    if (!selectedRoomId || view !== 'CONVERSATION') return
    void loadConversation(selectedRoomId)
    const timer = window.setInterval(
      () => void loadConversation(selectedRoomId, true),
      8000,
    )
    return () => window.clearInterval(timer)
  }, [selectedRoomId, view, loadConversation])

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  const doctorByUserId = useMemo(
    () => new Map(doctors.map((doctor) => [doctor.userId, doctor])),
    [doctors],
  )

  const memberDisplay = (member: ChatMember) => {
    const doctor = doctorByUserId.get(member.userId)
    const apiName = member.name.trim()
    const hasRealApiName = apiName && apiName !== '의료진'

    return {
      name:
        doctor?.name ||
        (hasRealApiName ? apiName : '') ||
        member.username ||
        `의료진 #${member.userId}`,
      detail:
        doctor?.departmentName ||
        member.departmentName ||
        member.title ||
        member.role,
    }
  }

  const roomTitle = (room: ChatRoom) => {
    if (
      room.title &&
      room.title !== '1:1 채팅' &&
      room.title !== '그룹 채팅'
    ) {
      return room.title
    }
    const names = room.members
      .filter((member) => member.userId !== identity?.id)
      .map((member) => memberDisplay(member).name)
    return names.join(', ') || room.title
  }

  const filteredRooms = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return rooms.filter((room) => {
      const matchesType =
        roomFilter === 'ALL' ||
        (roomFilter === 'DIRECT' && room.roomType === 'DIRECT') ||
        (roomFilter === 'GROUP' && room.roomType !== 'DIRECT')
      const matchesSearch =
        !keyword ||
        `${roomTitle(room)} ${room.latestMessage?.text ?? ''}`
          .toLowerCase()
          .includes(keyword)
      return matchesType && matchesSearch
    })
  }, [rooms, roomFilter, search, doctorByUserId, identity?.id])

  const openRoom = (roomId: number) => {
    setSelectedRoomId(roomId)
    setRoomInfoOpen(false)
    setInviteOpen(false)
    setView('CONVERSATION')
  }

  const currentMembership = selectedRoom?.members.find(
    (member) => member.userId === identity?.id,
  )

  const canInvite =
    selectedRoom?.roomType !== 'DIRECT' &&
    currentMembership?.role === 'OWNER'

  const availableInviteDoctors = doctors.filter(
    (doctor) =>
      !selectedRoom?.members.some(
        (member) =>
          member.userId === doctor.userId &&
          member.status !== 'LEFT' &&
          member.status !== 'REMOVED',
      ),
  )

  const submitMessage = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedRoomId || !draft.trim()) return
    const text = draft.trim()
    setDraft('')
    setSending(true)
    try {
      await sendChatMessage(selectedRoomId, text)
      await loadConversation(selectedRoomId)
      void getChatRooms().then(setRooms)
    } catch (sendError) {
      setDraft(text)
      setError(
        sendError instanceof Error
          ? sendError.message
          : '메시지를 전송하지 못했습니다.',
      )
    } finally {
      setSending(false)
    }
  }

  const toggleMember = (userId: number) => {
    setMemberIds((current) => {
      if (current.includes(userId)) {
        return current.filter((id) => id !== userId)
      }
      return newRoomType === 'DIRECT' ? [userId] : [...current, userId]
    })
  }

  const submitRoom = async (event: FormEvent) => {
    event.preventDefault()
    if (memberIds.length === 0) return
    setSending(true)
    try {
      await createChatRoom({
        roomType: newRoomType,
        title: newRoomType === 'GROUP' ? newRoomTitle.trim() : undefined,
        memberUserIds: memberIds,
      })
      setCreateOpen(false)
      setMemberIds([])
      setNewRoomTitle('')
      await loadRooms()
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : '채팅방을 만들지 못했습니다.',
      )
    } finally {
      setSending(false)
    }
  }

  const submitInvite = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedRoomId || !inviteUserId) return
    setSending(true)
    try {
      await inviteChatRoomMember(selectedRoomId, inviteUserId)
      setInviteUserId('')
      setInviteOpen(false)
      await loadConversation(selectedRoomId)
    } catch (inviteError) {
      setError(
        inviteError instanceof Error
          ? inviteError.message
          : '의료진을 초대하지 못했습니다.',
      )
    } finally {
      setSending(false)
    }
  }

  const leaveSelectedRoom = async () => {
    if (!selectedRoomId || !currentMembership?.id) return
    if (!window.confirm(`“${selectedRoom ? roomTitle(selectedRoom) : '채팅방'}”에서 나갈까요?`)) return
    setSending(true)
    try {
      await leaveChatRoom(selectedRoomId, currentMembership.id)
      setSelectedRoomId(null)
      setSelectedRoom(null)
      setMessages([])
      setRoomInfoOpen(false)
      setView('ROOMS')
      await loadRooms()
    } catch (leaveError) {
      setError(
        leaveError instanceof Error
          ? leaveError.message
          : '채팅방에서 나가지 못했습니다.',
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <aside className={`chat-dock ${open ? 'open' : 'collapsed'}`}>
      <header className="chat-dock-header">
        <button
          className="chat-dock-toggle"
          onClick={onToggle}
          type="button"
          title={open ? '채팅 접기' : '채팅 펼치기'}
          aria-label={open ? '채팅 접기' : '채팅 펼치기'}
        >
          <Menu size={18} strokeWidth={1.8} />
          {totalUnreadCount > 0 && (
            <b className="chat-unread-badge">
              {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
            </b>
          )}
        </button>
        {open && (
          <>
            <div className="chat-dock-title">
              <strong>DUGN Assistant</strong>
              {patientContext ? <small>{patientContext.name} · {patientContext.id}</small> : <small>채팅</small>}
            </div>
            <div className="chat-dock-header-actions">
              <button onClick={onToggle} title="최소화" type="button" aria-label="채팅 최소화">
                <Minimize2 size={15} strokeWidth={1.8} />
              </button>
              <button
                onClick={() => {
                  setView('ROOMS')
                  setSelectedRoomId(null)
                  onToggle()
                }}
                title="닫기"
                type="button"
                aria-label="채팅 닫기"
              >
                <X size={15} strokeWidth={1.8} />
              </button>
            </div>
          </>
        )}
      </header>

      {!open && (
        <div className="chat-dock-rail">
          <button onClick={() => { onToggle(); setCreateOpen(true) }} title="새 채팅" type="button">
            <MessageSquarePlus size={19} />
          </button>
          <span />
          {rooms.slice(0, 7).map((room) => {
            const unreadCount = room.unreadCount
            return (
              <button key={room.id} onClick={() => { onToggle(); openRoom(room.id) }} title={roomTitle(room)} type="button">
                {room.roomType === 'DIRECT' ? <UserRound size={17} /> : <UsersRound size={17} />}
                {unreadCount > 0 && (
                  <b className="chat-count-badge chat-rail-unread-badge">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </b>
                )}
              </button>
            )
          })}
        </div>
      )}

      {open && view === 'ROOMS' && (
        <div className="chat-dock-body">
          <button className="chat-dock-new" onClick={() => setCreateOpen(true)} type="button">
            <MessageSquarePlus size={17} />새 채팅
          </button>

          <label className="chat-dock-search">
            <Search size={14} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="채팅방 또는 의료진 검색" />
          </label>

          <nav className="chat-dock-tabs">
            {([
              ['ALL', '전체'],
              ['DIRECT', '개인 채팅'],
              ['GROUP', '단체 채팅'],
            ] as Array<[RoomFilter, string]>).map(([value, label]) => (
              <button key={value} className={roomFilter === value ? 'active' : ''} onClick={() => setRoomFilter(value)} type="button">{label}</button>
            ))}
          </nav>

          {error && <div className="chat-dock-error">{error}<button onClick={() => setError('')} type="button"><X size={13} /></button></div>}

          <div className="chat-dock-room-list">
            {filteredRooms.map((room) => {
              const unreadCount = room.unreadCount
              return (
                <button className={unreadCount > 0 ? 'has-unread' : ''} key={room.id} onClick={() => openRoom(room.id)} type="button">
                  <span className={`chat-dock-avatar ${room.roomType === 'DIRECT' ? 'direct' : 'group'}`}>
                    {room.roomType === 'DIRECT' ? <UserRound size={17} /> : <UsersRound size={17} />}
                  </span>
                  <span className="chat-dock-room-copy">
                    <strong>{roomTitle(room)}</strong>
                    <small>{room.latestMessage?.text || '새 대화를 시작하세요.'}</small>
                  </span>
                  <time>{formatChatTime(room.latestMessage?.createdAt || room.createdAt)}</time>
                  {unreadCount > 0 && (
                    <b className="chat-count-badge chat-room-unread-badge">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </b>
                  )}
                </button>
              )
            })}
            {!loading && filteredRooms.length === 0 && <p className="chat-dock-empty">표시할 채팅방이 없습니다.</p>}
            {loading && <p className="chat-dock-empty">채팅방을 불러오는 중…</p>}
          </div>
        </div>
      )}

      {open && view === 'CONVERSATION' && (
        <div className="chat-dock-conversation">
          <header>
            <button onClick={() => { setView('ROOMS'); setRoomInfoOpen(false) }} type="button"><ArrowLeft size={17} /></button>
            <span>
              <strong>{selectedRoom ? roomTitle(selectedRoom) : '대화'}</strong>
              <small>{selectedRoom?.roomType === 'DIRECT' ? '개인 채팅' : `단체 채팅 · ${selectedRoom?.members.length ?? 0}명`}</small>
            </span>
            <button className={`chat-dock-info-toggle ${roomInfoOpen ? 'active' : ''}`} onClick={() => setRoomInfoOpen((current) => !current)} title="채팅방 정보" type="button"><UsersRound size={17} /></button>
          </header>

          {error && <div className="chat-dock-error">{error}<button onClick={() => setError('')} type="button"><X size={13} /></button></div>}

          {roomInfoOpen ? (
            <div className="chat-dock-room-info">
              <section className="chat-dock-room-summary">
                <span className="chat-dock-avatar group"><UsersRound size={19} /></span>
                <div><strong>{selectedRoom ? roomTitle(selectedRoom) : '채팅방'}</strong><small>{selectedRoom?.members.length ?? 0}명의 참여자</small></div>
              </section>

              <section className="chat-dock-member-section">
                <header><strong>참여자</strong><span>{selectedRoom?.members.length ?? 0}명</span></header>
                <div>
                  {selectedRoom?.members.map((member) => {
                    const display = memberDisplay(member)
                    return (
                      <article key={member.id || member.userId}>
                        <span className="chat-dock-avatar direct"><UserRound size={15} /></span>
                        <div><strong>{member.userId === identity?.id ? '나' : display.name}</strong><small>{display.detail}</small></div>
                        <span className="chat-member-status">{member.role === 'OWNER' ? '방장' : '참여자'}</span>
                      </article>
                    )
                  })}
                </div>
              </section>

              {canInvite && (
                <section className="chat-dock-invite-section">
                  <button onClick={() => setInviteOpen((current) => !current)} type="button"><UserPlus size={15} />의료진 추가 초대</button>
                  {inviteOpen && (
                    <form onSubmit={submitInvite}>
                      <select value={inviteUserId} onChange={(event) => setInviteUserId(Number(event.target.value) || '')} required>
                        <option value="">초대할 의료진을 선택하세요</option>
                        {availableInviteDoctors.map((doctor) => <option key={doctor.userId} value={doctor.userId}>{doctor.name} · {doctor.departmentName}</option>)}
                      </select>
                      <button disabled={sending || !inviteUserId} type="submit">초대</button>
                    </form>
                  )}
                </section>
              )}

              <button className="chat-dock-leave" onClick={() => void leaveSelectedRoom()} disabled={sending || !currentMembership?.id} type="button"><LogOut size={15} />채팅방 나가기</button>
            </div>
          ) : (
            <>
              <>
                  <div className="chat-dock-messages">
                    {messages.map((message) => {
                      const mine = message.senderId === identity?.id
                      const senderDoctor = message.senderId
                        ? doctorByUserId.get(message.senderId)
                        : undefined
                      const senderName =
                        senderDoctor?.name ||
                        (message.senderName !== '의료진'
                          ? message.senderName
                          : message.senderId
                            ? `의료진 #${message.senderId}`
                            : '의료진')
                      return (
                        <article key={message.id} className={mine ? 'mine' : ''}>
                          <span>{mine ? '나' : senderName}</span>
                          <div>{message.isDeleted ? '삭제된 메시지입니다.' : message.text}</div>
                          <time>{formatChatTime(message.createdAt)}</time>
                        </article>
                      )
                    })}
                    {messages.length === 0 && <p className="chat-dock-empty">아직 메시지가 없습니다.</p>}
                    <div ref={messageEndRef} />
                  </div>

                  <form className="chat-dock-compose" onSubmit={submitMessage}>
                    <textarea
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault()
                          event.currentTarget.form?.requestSubmit()
                        }
                      }}
                      placeholder="메시지 입력"
                      maxLength={2000}
                    />
                    <button disabled={sending || !draft.trim()} type="submit"><Send size={16} /></button>
                  </form>
              </>
            </>
          )}
        </div>
      )}

      {open && createOpen && (
        <div className="chat-dock-create">
          <header><strong>새 채팅</strong><button onClick={() => setCreateOpen(false)} type="button"><X size={16} /></button></header>
          <form onSubmit={submitRoom}>
            <div className="chat-dock-type-switch">
              <button className={newRoomType === 'DIRECT' ? 'active' : ''} onClick={() => { setNewRoomType('DIRECT'); setMemberIds([]) }} type="button"><UserRound size={15} />개인</button>
              <button className={newRoomType === 'GROUP' ? 'active' : ''} onClick={() => { setNewRoomType('GROUP'); setMemberIds([]) }} type="button"><UsersRound size={15} />단체</button>
            </div>
            {newRoomType === 'GROUP' && <label>채팅방 이름<input value={newRoomTitle} onChange={(event) => setNewRoomTitle(event.target.value)} maxLength={150} required /></label>}
            <strong className="chat-dock-picker-title">의료진 선택</strong>
            <div className="chat-dock-member-picker">
              {doctors.map((doctor) => (
                <label key={doctor.userId}>
                  <input type="checkbox" checked={memberIds.includes(doctor.userId)} onChange={() => toggleMember(doctor.userId)} />
                  <span className="chat-dock-avatar direct"><UserRound size={15} /></span>
                  <span><b>{doctor.name}</b><small>{doctor.departmentName} {doctor.title}</small></span>
                </label>
              ))}
              {doctors.length === 0 && <p className="chat-dock-empty">선택 가능한 의료진이 없습니다.</p>}
            </div>
            <button className="chat-dock-create-submit" disabled={sending || memberIds.length === 0} type="submit">채팅 시작</button>
          </form>
        </div>
      )}
    </aside>
  )
}
