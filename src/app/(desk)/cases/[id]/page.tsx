import Link from 'next/link'
import { CaseDecision, Heading } from '@/components/desk'
import { ArchiveForm, MessageForm, ResolveForm } from '@/components/forms'
import { caseLabels, roleLabels } from '@/components/labels'
import { compileDigest, isOpenConflict } from '@/digest/compile'
import { formatTimestamp, toMoscowInput } from '@/digest/time'
import { pageSession } from '@/server/auth'
import { loadRecord } from '@/server/page-data'
import { readCase } from '@/server/store'

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { workspace } = await pageSession()
  const item = await loadRecord((await params).id, (key) => readCase(workspace, key))
  const target = { key: item.key, version: item.version }
  const now = new Date().toISOString()
  const decision = compileDigest({ asOf: now, cases: [item] }).items[0]
  return <>
    <Link className="breadcrumb" href={item.archivedAt ? '/cases?archived=1' : '/cases'}>{item.archivedAt ? 'Архив' : 'Случаи'}</Link>
    <Heading title={item.id} detail={caseLabels[item.kind]}>
      {!item.archivedAt && <Link className="button secondary" href={`/cases/${item.key}/edit`}>Редактировать</Link>}
      {(item.archivedAt || decision?.priority === 'none') && <ArchiveForm target={target} archived={Boolean(item.archivedAt)} />}
    </Heading>
    <div className="case-grid">
      <section className="panel source-panel" aria-label="Данные CRM">
        <h2>Данные CRM</h2>
        <ul className="facts">{decision?.crm.map((fact) => <li key={fact}>{fact}</li>)}</ul>
        {item.archivedAt && <p className="muted">В архиве с {formatTimestamp(item.archivedAt)}</p>}
      </section>
      <section className="panel source-panel" aria-label="Следующее действие">
        {decision && <CaseDecision item={decision} />}
      </section>
    </div>
    <div className="case-grid messages-grid">
      <section className="panel form-stack" aria-labelledby="messages">
        <h2 id="messages">Переписка</h2>
        {decision?.chatNote && <p className="notice">{decision.chatNote}</p>}
        {!item.chat.length && <p className="muted">Сообщений пока нет.</p>}
        {item.chat.map((message) => <article className="message" key={message.key}>
          <header><strong>{roleLabels[message.role]}</strong><time dateTime={message.at}>{formatTimestamp(message.at)}</time></header>
          <p>{message.text}</p>
          {message.resolution && <p className="notice"><strong>Расхождение закрыто.</strong> {message.resolution}</p>}
          {!item.archivedAt && message.key && isOpenConflict(item, message) && <>
            <p className="warning">Проверить расхождение</p>
            <ResolveForm target={target} messageId={message.key} />
          </>}
        </article>)}
      </section>
      {!item.archivedAt && <section className="panel form-stack" aria-labelledby="new-message">
        <h2 id="new-message">Новое сообщение</h2>
        <MessageForm target={target} initialTime={toMoscowInput(now)} />
      </section>}
    </div>
  </>
}
