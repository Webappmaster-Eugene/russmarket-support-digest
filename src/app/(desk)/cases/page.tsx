import Link from 'next/link'
import { DigestRows, Heading, Pagination } from '@/components/desk'
import { caseLabels, priorityLabels } from '@/digest/labels'
import { caseKinds, priorities } from '@/digest/contract'
import { compileDigest } from '@/digest/compile'
import { pageSession } from '@/server/auth'
import { listCases } from '@/server/store'

type Query = { q?: string; kind?: string; priority?: string; archived?: string; page?: string }

export default async function Cases({ searchParams }: { searchParams: Promise<Query> }) {
  const { workspace } = await pageSession()
  const options = await searchParams
  const archived = options.archived === '1'
  const search = typeof options.q === 'string' ? options.q.slice(0, 32) : ''
  const kind = caseKinds.find((item) => item === options.kind) ?? ''
  const priority = priorities.find((item) => item === options.priority) ?? ''
  const cases = await listCases(workspace, archived)
  const { items } = compileDigest({ asOf: new Date().toISOString(), cases })
  const normalizedSearch = search.trim().normalize('NFKC').toLocaleLowerCase('ru-RU')
  const matched = items.filter((item) => (!kind || kind === item.kind) && (!priority || priority === item.priority) &&
    item.id.normalize('NFKC').toLocaleLowerCase('ru-RU').includes(normalizedSearch))
  const pages = Math.max(1, Math.ceil(matched.length / 25))
  const requested = Number(options.page)
  const page = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, pages) : 1
  const query = (p: number) => '/cases?' + new URLSearchParams({
    q: search, kind, priority, archived: archived ? '1' : '', page: String(p),
  }).toString()
  return <>
    <Heading title="Случаи" detail={archived ? 'Архив' : 'Активные случаи'}>
      <Link className="button secondary" href={archived ? '/cases' : '/cases?archived=1'}>
        {archived ? 'Активные случаи' : 'Открыть архив'}
      </Link>
    </Heading>
    <section className="panel list-panel" aria-label="Список случаев">
      <form className="filters" action="/cases">
        {archived && <input type="hidden" name="archived" value="1" />}
        <label className="field">Поиск по ID<input name="q" maxLength={32} defaultValue={search} placeholder="Например, П-08" /></label>
        <label className="field">Тип операции<select name="kind" defaultValue={kind}><option value="">Все типы</option>
          {caseKinds.map((item) => <option key={item} value={item}>{caseLabels[item]}</option>)}
        </select></label>
        <label className="field">Приоритет<select name="priority" defaultValue={priority}><option value="">Все приоритеты</option>
          {priorities.map((item) => <option key={item} value={item}>{priorityLabels[item]}</option>)}
        </select></label>
        <button className="button secondary">Найти</button>
      </form>
      {matched.length ? <DigestRows items={matched.slice((page - 1) * 25, page * 25)} link />
        : <div className="empty">Случаев по этим условиям нет.</div>}
      <Pagination page={page} hasMore={page < pages} query={query} />
    </section>
  </>
}
