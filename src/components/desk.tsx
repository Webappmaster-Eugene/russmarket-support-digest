import Link from 'next/link'
import { caseLabels, priorityLabels, roleLabels } from '@/digest/labels'
import { CopyButton } from '@/components/forms'
import { priorities, type Digest, type DigestItem, type Priority } from '@/digest/contract'
import { formatDigestText } from '@/digest/format'

export function Status({ priority }: { priority: Priority }) {
  return <span className={`status tone-${priority}`}><span aria-hidden="true" />{priorityLabels[priority]}</span>
}

export function Heading({ title, detail, children }: { title: string; detail?: string; children?: React.ReactNode }) {
  return <header className="page-heading">
    <div><h1>{title}</h1>{detail && <p>{detail}</p>}</div>
    {children && <div className="heading-actions">{children}</div>}
  </header>
}

export function CaseDecision({ item }: { item: DigestItem }) {
  return <div className="decision">
    <div className="decision-heading"><h2>Следующее действие</h2><Status priority={item.priority} /></div>
    <p className={`case-summary tone-${item.priority}`}>{item.reason}</p>
    <dl><dt>Проверить</dt><dd>{item.verify}</dd><dt>Сделать</dt><dd>{item.action}</dd></dl>
  </div>
}

export function DigestCopy({ digest }: { digest: Digest }) {
  return <CopyButton text={formatDigestText(digest)} />
}

export function DigestRows({ items, link }: { items: DigestItem[]; link?: boolean }) {
  return <ul className="case-list">
    {items.map((item) => <li key={item.key ?? item.id}>
      <div className="case-row">
        <div>
          <span className="case-reference">{item.id}</span>
          <h3>{link && item.key ? <Link href={`/cases/${item.key}`}>{caseLabels[item.kind]}<span className="sr-only"> {item.id}</span></Link> : caseLabels[item.kind]}</h3>
          <p>{item.reason}</p>
        </div>
        <Status priority={item.priority} />
      </div>
      {!link && <div className="snapshot-details">
        <section><h4>Запись CRM</h4><ul>{item.crm.map((fact) => <li key={fact}>{fact}</li>)}</ul></section>
        <section><h4>Из чата</h4>
          {item.chat.map(({ role, text }, i) => <p key={i}>{roleLabels[role]}: «{text}»</p>)}
          {!item.chat.length && <p>Сообщений нет.</p>}
          {item.chatNote && <p>{item.chatNote}</p>}
        </section>
        <section><h4>Следующее действие</h4><p>{item.verify}</p><p>{item.action}</p></section>
      </div>}
    </li>)}
  </ul>
}

export function DigestCounts({ items }: { items: DigestItem[] }) {
  return <dl className="totals">
    {priorities.map((priority) => <div className={`total tone-${priority}`} key={priority}>
      <dt>{priorityLabels[priority]}</dt><dd>{items.filter((item) => item.priority === priority).length}</dd>
    </div>)}
  </dl>
}

export function Pagination({ page, hasMore, query }: { page: number; hasMore: boolean; query: (page: number) => string }) {
  if (page === 1 && !hasMore) return null
  return <nav className="pagination" aria-label="Страницы">
    {page > 1 && <Link href={query(page - 1)}>Назад</Link>}
    <span>Страница {page}</span>
    {hasMore && <Link href={query(page + 1)}>Дальше</Link>}
  </nav>
}
