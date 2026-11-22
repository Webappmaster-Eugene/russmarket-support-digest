import { randomUUID } from 'node:crypto'
import Link from 'next/link'
import { DigestCopy, DigestCounts, DigestRows, Heading, Pagination } from '@/components/desk'
import { SnapshotForm } from '@/components/forms'
import { formatTimestamp } from '@/digest/time'
import { pageSession } from '@/server/auth'
import { currentDigest } from '@/server/store'

export default async function Home({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { workspace } = await pageSession()
  const digest = await currentDigest(workspace)
  const requested = Number((await searchParams).page)
  const pages = Math.max(1, Math.ceil(digest.items.length / 25))
  const page = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, pages) : 1
  return <>
    <Heading title="Сводка поддержки" detail={formatTimestamp(digest.asOf)}>
      {digest.items.length > 0 && <><DigestCopy digest={digest} /><SnapshotForm snapshotKey={randomUUID()} /></>}
    </Heading>
    <DigestCounts items={digest.items} />
    <section className="panel list-panel" aria-labelledby="queue">
      <div className="panel-heading"><h2 id="queue">Очередь действий</h2><Link href="/cases">Все случаи</Link></div>
      {digest.items.length ? <DigestRows items={digest.items.slice((page - 1) * 25, page * 25)} link />
        : <div className="empty"><p>В очереди пока пусто.</p><Link href="/cases/new">Создать первый случай</Link></div>}
      <Pagination page={page} hasMore={page < pages} query={(p) => `/?page=${p}`} />
    </section>
  </>
}
