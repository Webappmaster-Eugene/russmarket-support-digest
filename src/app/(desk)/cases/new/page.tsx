import Link from 'next/link'
import { CaseForm } from '@/components/forms'
import { Heading } from '@/components/desk'
import { pageSession } from '@/server/auth'

export default async function NewCase() {
  await pageSession()
  return <div className="narrow">
    <Link className="breadcrumb" href="/cases">Случаи</Link>
    <Heading title="Новый случай" detail="Заполните карточку по данным CRM. Переписку можно добавить после сохранения." />
    <CaseForm />
  </div>
}
