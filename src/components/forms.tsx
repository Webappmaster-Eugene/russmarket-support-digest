'use client'

import { useActionState, useState, type ReactNode } from 'react'
import { caseAction, loginAction, snapshotAction, type FormState } from '@/server/actions'
import { InputField } from '@/components/input-field'
import { caseLabels, roleLabels } from '@/components/labels'
import { caseKinds, chatRoles } from '@/digest/contract'

const blank: FormState = {}
const issue = (state: FormState, path: string) => state.issues?.find((item) => item.path === path)?.message

function Notice({ state }: { state: FormState }) {
  return state.error ? <p className="error-panel" role="alert">{state.error}</p> : null
}

function Submit({ pending, children, pendingLabel = 'Сохраняем…' }: { pending: boolean; children: ReactNode; pendingLabel?: string }) {
  return <button className="button primary" disabled={pending}>{pending ? pendingLabel : children}</button>
}

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, blank)
  return <form action={action} className="form-stack">
    <Notice state={state} />
    <InputField label="Логин" issue={issue(state, 'login')}>
      {(props) => <input {...props} name="login" defaultValue={state.values?.login} required maxLength={64} autoComplete="username" />}
    </InputField>
    <InputField label="Пароль" issue={issue(state, 'password')}>
      {(props) => <input {...props} name="password" type="password" required maxLength={128} autoComplete="current-password" />}
    </InputField>
    <Submit pending={pending} pendingLabel="Входим…">Войти</Submit>
  </form>
}

export function CaseForm({ initial = {}, record }: {
  initial?: Record<string, string>
  record?: { key: string; version: number }
}) {
  const [state, action, pending] = useActionState(caseAction, blank)
  const [draft, setDraft] = useState<Record<string, string>>({ kind: 'onboarding', documents: 'awaiting', managerConfirmed: 'no', status: 'planned', ...initial })
  const values = draft
  const kind = caseKinds.find((item) => item === draft.kind) ?? 'onboarding'
  function control(name: string) {
    return { name, value: values[name] ?? '', onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setDraft((current) => ({ ...current, [name]: event.target.value }))
    } }
  }
  function select(name: string, label: string, options: [string, string][]) {
    return <InputField label={label} issue={issue(state, name === 'kind' ? name : `crm.${name}`)}>
      {(props) => <select {...props} {...control(name)}>
        {options.map(([key, title]) => <option key={key} value={key}>{title}</option>)}
      </select>}
    </InputField>
  }
  function date(name: string, label: string, type: 'date' | 'datetime-local', required = true) {
    return <InputField label={label} issue={issue(state, `crm.${name}`)}>
      {(props) => <input {...props} {...control(name)} type={type} required={required} />}
    </InputField>
  }
  return <form action={action} className="form-stack">
    <Notice state={state} />
    <input type="hidden" name="action" value={record ? 'edit' : 'create'} />
    {record && <>
      <input type="hidden" name="key" value={record.key} />
      <input type="hidden" name="version" value={record.version} />
      <input type="hidden" name="kind" value={draft.kind} />
    </>}
    <section className="panel form-stack" aria-labelledby="identity">
      <h2 id="identity">Случай</h2>
      <div className="form-grid">
        {record
          ? <div className="field"><span>Тип операции</span><strong>{caseLabels[kind]}</strong></div>
          : select('kind', 'Тип операции', caseKinds.map((kind) => [kind, caseLabels[kind]]))}
        <InputField label="ID случая" issue={issue(state, 'id')}>
          {(props) => <input {...props} {...control('id')} required maxLength={32} placeholder="Например, П-108" />}
        </InputField>
      </div>
    </section>
    <section className="panel form-stack" aria-labelledby="crm-fields">
      <h2 id="crm-fields">Данные CRM</h2>
      <div className="form-grid">
        {draft.kind === 'onboarding' && <>
          {date('startDate', 'Дата первого выхода', 'date')}
          {select('documents', 'Документы', [['awaiting', 'Ожидаются'], ['confirmed', 'Подтверждены']])}
        </>}
        {draft.kind === 'offboarding' && <>
          {date('lastDay', 'Последний рабочий день', 'date')}
          {select('managerConfirmed', 'Подтверждение руководителя', [['no', 'Отсутствует'], ['yes', 'Получено']])}
        </>}
        {draft.kind === 'delivery' && <>
          {select('status', 'Статус доставки', [['planned', 'Запланирована'], ['in_transit', 'В пути'], ['accepted', 'Принято']])}
          {date('dueAt', draft.status === 'accepted' ? 'Срок доставки, МСК (необязательно)' : 'Срок доставки, МСК', 'datetime-local', draft.status !== 'accepted')}
          {draft.status === 'accepted' && date('acceptedAt', 'Время приёмки, МСК', 'datetime-local')}
        </>}
      </div>
    </section>
    <div className="form-actions"><Submit pending={pending}>Сохранить случай</Submit></div>
  </form>
}

type CaseTarget = { key: string; version: number }

function OperationFields({ target, action }: { target: CaseTarget; action: string }) {
  return <>
    <input type="hidden" name="key" value={target.key} />
    <input type="hidden" name="version" value={target.version} />
    <input type="hidden" name="action" value={action} />
  </>
}

export function MessageForm({ target, initialTime }: { target: CaseTarget; initialTime: string }) {
  const [state, action, pending] = useActionState(caseAction, blank)
  return <form action={action} className="form-stack">
    <OperationFields target={target} action="message" />
    <Notice state={state} />
    <div className="form-grid">
      <InputField label="Автор сообщения" issue={issue(state, 'value.role')}>
        {(props) => <select {...props} name="role" defaultValue={state.values?.role ?? 'other'}>
          {chatRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
        </select>}
      </InputField>
      <InputField label="Время сообщения, МСК" issue={issue(state, 'value.at') ?? issue(state, 'at')}>
        {(props) => <input {...props} name="at" type="datetime-local" defaultValue={state.values?.at ?? initialTime} required />}
      </InputField>
    </div>
    <InputField label="Текст сообщения" issue={issue(state, 'value.text')}>
      {(props) => <textarea {...props} name="text" rows={3} maxLength={2000} required defaultValue={state.values?.text} />}
    </InputField>
    <label className="checkbox"><input type="checkbox" name="conflict" defaultChecked={state.values?.conflict === 'on'} />Отметить расхождение с CRM</label>
    <div className="form-actions"><Submit pending={pending}>Добавить сообщение</Submit></div>
  </form>
}

export function ResolveForm({ target, messageId }: { target: CaseTarget; messageId: string }) {
  const [state, action, pending] = useActionState(caseAction, blank)
  return <form action={action} className="form-stack resolve-form">
    <OperationFields target={target} action="resolve" />
    <input type="hidden" name="messageId" value={messageId} />
    <Notice state={state} />
    <InputField label="Пояснение к расхождению" issue={issue(state, 'resolution')}>
      {(props) => <textarea {...props} name="resolution" rows={2} maxLength={500} required defaultValue={state.values?.resolution} />}
    </InputField>
    <div><Submit pending={pending}>Закрыть расхождение</Submit></div>
  </form>
}

export function ArchiveForm({ target, archived }: { target: CaseTarget; archived: boolean }) {
  const [state, action, pending] = useActionState(caseAction, blank)
  return <form action={action} className="form-stack">
    <OperationFields target={target} action={archived ? 'restore' : 'archive'} />
    <Notice state={state} />
    <button className="button secondary" disabled={pending}>
      {archived ? 'Восстановить случай' : 'Перенести в архив'}
    </button>
  </form>
}

export function SnapshotForm({ snapshotKey }: { snapshotKey: string }) {
  const [state, action, pending] = useActionState(snapshotAction, blank)
  return <form action={action} className="form-stack compact">
    <input type="hidden" name="key" value={snapshotKey} />
    <Notice state={state} />
    <Submit pending={pending}>Сохранить сводку</Submit>
  </form>
}

export function CopyButton({ text }: { text: string }) {
  const [message, setMessage] = useState('')
  return <div className="copy-control">
    <button className="button secondary" type="button" onClick={async () => {
      try {
        await navigator.clipboard.writeText(text)
        setMessage('Сводка скопирована.')
      } catch {
        setMessage('Разрешите доступ к буферу обмена и повторите.')
      }
    }}>Копировать</button>
    <span className={message ? 'copy-message' : 'sr-only'} role="status">{message}</span>
  </div>
}
