'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [['/', 'Сводка'], ['/cases', 'Случаи'], ['/history', 'История']] as const

export function DeskNav() {
  const pathname = usePathname()
  return <nav aria-label="Разделы">
    {links.map(([href, label]) => <Link key={href} href={href}
      aria-current={pathname === href || (href !== '/' && pathname.startsWith(href + '/')) ? 'page' : undefined}>{label}</Link>)}
  </nav>
}
