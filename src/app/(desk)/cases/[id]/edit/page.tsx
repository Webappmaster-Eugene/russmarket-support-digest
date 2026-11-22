import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CaseForm } from '@/components/forms'
import { Heading } from '@/components/desk'
import { toMoscowInput } from '@/digest/time'
import { pageSession } from '@/server/auth'
import { loadRecord } from '@/server/page-data'
import { readCase } from '@/server/store'

export default async function Edit({ params }: { params: Promise<{ id: string }> }) {
  const { workspace } = await pageSession()
  const item = await loadRecord((await params).id, (key) => readCase(workspace, key))
  const link = `/cases/${item.key}`
  if (item.archivedAt) redirect(link)
  const initial: Record<string, string> = { id: item.id, kind: item.kind }
  if (item.kind === 'onboarding') Object.assign(initial, item.crm)
  if (item.kind === 'offboarding') Object.assign(initial, {
    lastDay: item.crm.lastDay, managerConfirmed: item.crm.managerConfirmed ? 'yes' : 'no',
  })
  if (item.kind === 'delivery') Object.assign(initial, {
    status: item.crm.status, dueAt: item.crm.dueAt ? toMoscowInput(item.crm.dueAt) : '',
    acceptedAt: item.crm.acceptedAt ? toMoscowInput(item.crm.acceptedAt) : '',
  })
  return <div className="narrow">
    <Link className="breadcrumb" href={link}>Карточка случая</Link>
    <Heading title={`Редактирование ${item.id}`} />
    <CaseForm initial={initial} record={{ key: item.key, version: item.version }} />
  </div>
}
