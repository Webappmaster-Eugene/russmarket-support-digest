import { useRef, useState } from 'react'
import type { Digest, DigestItem, Priority } from '@/digest/contract'
import { reportTime } from '@/digest/time'
import { caseLabels, priorityLabels, roleLabels } from '@/components/labels'

const priorities: Priority[] = ['urgent', 'today', 'upcoming', 'none']

function copyText(digest: Digest) {
  const cases = digest.items.map((item) => [
    `${item.id} · ${caseLabels[item.kind]} · ${priorityLabels[item.priority]}`,
    item.reason,
    `CRM: ${item.crm.join(' ')}`,
    ...item.chat.map(({ role, text }) => `Чат, ${roleLabels[role]}: «${text}»`),
    ...(item.chatNote ? [item.chatNote] : []),
    `Проверить: ${item.verify}`,
    `Дальше: ${item.action}`,
  ].join('\n'))
  return [`Сводка поддержки · ${reportTime(digest.asOf)} МСК`, ...cases].join('\n\n')
}

function Status({ priority }: { priority: Priority }) {
  return <span className={`status tone-${priority}`}><span aria-hidden="true" />{priorityLabels[priority]}</span>
}

function CaseDetail({ item }: { item: DigestItem }) {
  return (
    <>
      <header className="detail-head">
        <span className="case-id">{item.id}</span>
        <Status priority={item.priority} />
        <h2>{caseLabels[item.kind]}</h2>
      </header>
      <p className={`case-summary tone-${item.priority}`}>{item.reason}</p>
      <div className="sources">
        <section className="source source-crm" aria-label="Подтверждено в CRM">
          <h3>Запись CRM</h3>
          <ul>{item.crm.map((fact) => <li key={fact}>{fact}</li>)}</ul>
        </section>
        <section className="source source-chat" aria-label="Из рабочего чата">
          <h3>Из чата</h3>
          {item.chat.length === 0 && <p>Сообщений нет.</p>}
          {item.chat.map(({ role, text }, index) => (
            <blockquote key={index}>
              <span className="chat-role">{roleLabels[role]}</span>
              <p>«{text}»</p>
            </blockquote>
          ))}
          {item.chatNote && <p className="chat-note">{item.chatNote}</p>}
        </section>
      </div>
      <div className="actions">
        <div><h3>Что проверить</h3><p>{item.verify}</p></div>
        <div><h3>Что сделать дальше</h3><p>{item.action}</p></div>
      </div>
    </>
  )
}

export function DigestView({ digest, dirty, onEdit }: { digest: Digest; dirty: boolean; onEdit: () => void }) {
  const [selectedId, setSelectedId] = useState(digest.items[0]?.id)
  const [copyStatus, setCopyStatus] = useState('')
  const detail = useRef<HTMLElement>(null)
  const selected = digest.items.find((item) => item.id === selectedId) ?? digest.items[0]
  if (!selected) return null

  const counts = { urgent: 0, today: 0, upcoming: 0, none: 0 }
  for (const item of digest.items) counts[item.priority] += 1

  async function copy() {
    try {
      await navigator.clipboard.writeText(copyText(digest))
      setCopyStatus('Сводка скопирована.')
    } catch {
      setCopyStatus('Не удалось скопировать. Проверьте разрешение для буфера обмена.')
    }
  }

  function select(id: string) {
    setSelectedId(id)
    if (window.matchMedia('(max-width: 820px)').matches) detail.current?.scrollIntoView({ block: 'start' })
  }

  return (
    <>
      <header className="page-heading">
        <div>
          <h1>Сводка поддержки</h1>
          <p className="snapshot"><span aria-hidden="true" />{reportTime(digest.asOf)} МСК</p>
        </div>
        <div className="heading-buttons">
          <button className="button button-secondary" type="button" onClick={copy}>Копировать сводку</button>
          <button className="button button-primary" type="button" onClick={onEdit}>Изменить данные</button>
        </div>
      </header>

      {dirty && <p className="notice">Данные изменились. Запустите расчёт, чтобы обновить сводку.</p>}
      <span className={copyStatus ? 'copy-status' : 'sr-only'} role="status">{copyStatus}</span>

      <div className="totals" aria-label="Количество случаев по срочности">
        {priorities.map((priority) => (
          <div className={`total tone-${priority}`} key={priority}>
            <strong>{counts[priority]}</strong><span>{priorityLabels[priority]}</span>
          </div>
        ))}
      </div>

      <div className="workbench">
        <section className="queue" aria-labelledby="queue-title">
          <header><h2 id="queue-title">Очередь случаев</h2><span>{digest.items.length}</span></header>
          <ol>
            {digest.items.map((item) => (
              <li key={item.id}>
                <button
                  className="queue-row"
                  type="button"
                  aria-pressed={item.id === selected.id}
                  aria-controls="case-detail"
                  onClick={() => select(item.id)}
                >
                  <span className="queue-row-top"><span className="case-id">{item.id}</span><Status priority={item.priority} /></span>
                  <span className="queue-row-title">{caseLabels[item.kind]}</span>
                  <span className="queue-row-reason">{item.reason}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>

        <article className="detail" id="case-detail" ref={detail} aria-label={`Случай ${selected.id}`}>
          <CaseDetail item={selected} />
        </article>
      </div>
    </>
  )
}
