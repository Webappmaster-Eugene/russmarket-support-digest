import type { CaseKind, ChatMessage, SupportCase } from '@/digest/contract'
import { chatRoles, MAX_MESSAGE_LENGTH, MAX_MESSAGES } from '@/digest/input-spec'
import { fromMoscowInput, toMoscowInput } from '@/digest/time'
import { caseLabels, roleLabels } from '@/components/labels'
import { InputField } from '@/components/input-field'

const kinds: CaseKind[] = ['onboarding', 'offboarding', 'delivery']
const initialRoles: Record<CaseKind, ChatMessage['role']> = {
  onboarding: 'employee', offboarding: 'employee', delivery: 'courier',
}

export function emptyCase(kind: CaseKind, id = ''): SupportCase {
  const base = { id, chat: [] }
  if (kind === 'offboarding') return { ...base, kind, crm: { lastDay: '', managerConfirmed: false } }
  if (kind === 'delivery') return { ...base, kind, crm: { status: 'planned' } }
  return { ...base, kind, crm: { startDate: '', documents: 'awaiting' } }
}

type Props = {
  item: SupportCase
  index: number
  issue: (path: string) => string | undefined
  onChange: (item: SupportCase) => void
  onDelete: () => void
}

function CrmFields({ item, issue, onChange }: Pick<Props, 'item' | 'issue' | 'onChange'>) {
  if (item.kind === 'onboarding') return (
    <>
      <InputField label="Дата первого выхода" issue={issue('crm.startDate')}>
        {(props) => <input {...props} type="date" required value={item.crm.startDate}
          onChange={(event) => onChange({ ...item, crm: { ...item.crm, startDate: event.target.value } })} />}
      </InputField>
      <InputField label="Документы" issue={issue('crm.documents')}>
        {(props) => <select {...props} value={item.crm.documents} onChange={(event) => onChange({
          ...item, crm: { ...item.crm, documents: event.target.value === 'confirmed' ? 'confirmed' : 'awaiting' },
        })}><option value="awaiting">Ожидаются</option><option value="confirmed">Подтверждены</option></select>}
      </InputField>
    </>
  )

  if (item.kind === 'offboarding') return (
    <>
      <InputField label="Последний рабочий день" issue={issue('crm.lastDay')}>
        {(props) => <input {...props} type="date" required value={item.crm.lastDay}
          onChange={(event) => onChange({ ...item, crm: { ...item.crm, lastDay: event.target.value } })} />}
      </InputField>
      <InputField label="Подтверждение руководителя" issue={issue('crm.managerConfirmed')}>
        {(props) => <select {...props} value={String(item.crm.managerConfirmed)} onChange={(event) => onChange({
          ...item, crm: { ...item.crm, managerConfirmed: event.target.value === 'true' },
        })}><option value="false">Отсутствует</option><option value="true">Есть</option></select>}
      </InputField>
    </>
  )

  const { status, dueAt, acceptedAt } = item.crm
  return (
    <>
      <InputField label="Статус доставки" issue={issue('crm.status')}>
        {(props) => <select {...props} value={status} onChange={({ target: { value } }) => {
          if (value === 'planned' || value === 'in_transit' || value === 'accepted') {
            onChange({ ...item, crm: { status: value, dueAt, acceptedAt: value === 'accepted' ? acceptedAt : undefined } })
          }
        }}>
          <option value="planned">Запланировано</option><option value="in_transit">В пути</option><option value="accepted">Принято</option>
        </select>}
      </InputField>
      <InputField label={status === 'accepted' ? 'Срок доставки (необязательно)' : 'Срок доставки'} issue={issue('crm.dueAt')}>
        {(props) => <input {...props} type="datetime-local" required={status !== 'accepted'}
          value={dueAt ? toMoscowInput(dueAt) : ''}
          onChange={(event) => onChange({ ...item, crm: { ...item.crm, dueAt: fromMoscowInput(event.target.value) || undefined } })} />}
      </InputField>
      {status === 'accepted' && (
        <InputField label="Время приёмки" issue={issue('crm.acceptedAt')}>
          {(props) => <input {...props} type="datetime-local" required value={acceptedAt ? toMoscowInput(acceptedAt) : ''}
            onChange={(event) => onChange({ ...item, crm: { ...item.crm, acceptedAt: fromMoscowInput(event.target.value) || undefined } })} />}
        </InputField>
      )}
    </>
  )
}

export function CaseEditor({ item, index, issue, onChange, onDelete }: Props) {
  function updateMessage(messageIndex: number, patch: Partial<ChatMessage>) {
    onChange({ ...item, chat: item.chat.map((message, current) => current === messageIndex
      ? { ...message, ...patch } : message) })
  }

  return (
    <section className="editor-case" aria-label={item.id ? `Случай ${item.id}` : `Новый случай ${index + 1}`}>
      <header>
        <h2>{item.id || `Новый случай ${index + 1}`}</h2>
        <button type="button" className="button-text danger-text" onClick={onDelete}>Удалить случай</button>
      </header>
      <div className="fields-grid">
        <InputField label="ID случая" issue={issue('id')}>
          {(props) => <input {...props} required maxLength={32} value={item.id} placeholder="Например, П-10"
            onChange={(event) => onChange({ ...item, id: event.target.value })} />}
        </InputField>
        <InputField label="Тип операции" issue={issue('kind')}>
          {(props) => <select {...props} value={item.kind} onChange={({ target: { value } }) => {
            const kind = kinds.find((option) => option === value)
            if (kind) onChange({ ...emptyCase(kind, item.id), chat: item.chat })
          }}>
            {kinds.map((kind) => <option key={kind} value={kind}>{caseLabels[kind]}</option>)}
          </select>}
        </InputField>
      </div>
      <div className="editor-section">
        <h3>CRM</h3>
        <div className="fields-grid"><CrmFields item={item} issue={issue} onChange={onChange} /></div>
      </div>
      <div className="editor-section">
        <div className="editor-chat-heading">
          <h3>Рабочий чат</h3>
          <button type="button" className="button-text" disabled={item.chat.length >= MAX_MESSAGES} onClick={() => {
            onChange({ ...item, chat: [...item.chat, { role: initialRoles[item.kind], text: '' }] })
          }}>Добавить сообщение</button>
        </div>
        {item.chat.length === 0 && <p className="muted">Сообщений нет.</p>}
        {item.chat.map((message, messageIndex) => (
          <div className="message-editor" key={messageIndex}>
            <InputField label="Автор" issue={issue(`chat.${messageIndex}.role`)}>
              {(props) => <select {...props} value={message.role} onChange={({ target: { value } }) => {
                const role = chatRoles.find((option) => option === value)
                if (role) updateMessage(messageIndex, { role })
              }}>{chatRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select>}
            </InputField>
            <InputField label="Сообщение" issue={issue(`chat.${messageIndex}.text`)}>
              {(props) => <textarea {...props} required maxLength={MAX_MESSAGE_LENGTH} value={message.text} rows={2}
                onChange={(event) => updateMessage(messageIndex, { text: event.target.value })} />}
            </InputField>
            <button type="button" className="button-text danger-text" onClick={() => {
              onChange({ ...item, chat: item.chat.filter((_, current) => current !== messageIndex) })
            }}>Удалить сообщение</button>
          </div>
        ))}
      </div>
    </section>
  )
}
