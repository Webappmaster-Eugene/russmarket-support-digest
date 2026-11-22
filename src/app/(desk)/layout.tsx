import Link from 'next/link'
import type { ReactNode } from 'react'
import { DeskNav } from '@/components/desk-nav'
import { pageSession } from '@/server/auth'
import { logoutAction } from '@/server/actions'

export default async function DeskLayout({ children }: { children: ReactNode }) {
  await pageSession()
  return <>
    <a className="skip-link" href="#main">К содержанию</a>
    <header className="masthead">
      <div className="masthead-inner">
        <Link className="wordmark" href="/"><span className="mark" aria-hidden="true"><i /><i /><i /></span>Центр поддержки</Link>
        <DeskNav />
        <div className="masthead-actions">
          <Link className="button primary" href="/cases/new">Новый случай</Link>
          <form action={logoutAction}><button className="button quiet">Выйти</button></form>
        </div>
      </div>
    </header>
    <main className="content" id="main" tabIndex={-1}>{children}</main>
  </>
}
