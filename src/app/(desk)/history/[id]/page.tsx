import Link from 'next/link'
import { DigestCopy, DigestCounts, DigestRows, Heading } from '@/components/desk'
import { formatTimestamp } from '@/digest/time'
import { pageSession } from '@/server/auth'
import { loadRecord } from '@/server/page-data'
import { readSnapshot } from '@/server/store'

export default async function Snapshot({ params }: { params: Promise<{ id: string }> }) {
  const { workspace } = await pageSession()
  const digest = await loadRecord((await params).id, (key) => readSnapshot(workspace, key))
  return <>
    <Link className="breadcrumb" href="/history">История</Link>
    <Heading title="Сохранённая сводка" detail={formatTimestamp(digest.asOf)}><DigestCopy digest={digest} /></Heading>
    <DigestCounts items={digest.items} />
    <section className="panel list-panel" aria-label="Случаи в сводке"><DigestRows items={digest.items} /></section>
  </>
}
