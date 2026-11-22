import Link from 'next/link'
import { Heading, Pagination } from '@/components/desk'
import { formatTimestamp } from '@/digest/time'
import { pageSession } from '@/server/auth'
import { listSnapshots } from '@/server/store'

export default async function History({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { workspace } = await pageSession()
  const requested = Number((await searchParams).page)
  const page = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, 10000) : 1
  const entries = await listSnapshots(workspace, (page - 1) * 25)
  return <>
    <Heading title="История сводок" detail="Сохранённые сводки с состоянием случаев на момент расчёта." />
    <section className="panel list-panel" aria-label="Сохранённые сводки">
      {entries.length ? <ul className="case-list">
        {entries.slice(0, 25).map(({ id, asOf, count }) => <li key={id}>
          <div className="case-row"><Link href={`/history/${id}`}>{formatTimestamp(asOf)}</Link><span>Случаев: {count}</span></div>
        </li>)}
      </ul> : <div className="empty">Здесь появятся снимки, которые вы сохраните из сводки.</div>}
      <Pagination page={page} hasMore={entries.length > 25} query={(p) => `/history?page=${p}`} />
    </section>
  </>
}
