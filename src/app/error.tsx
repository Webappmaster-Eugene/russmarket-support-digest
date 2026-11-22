'use client'

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <section className="panel form-stack">
    <h1>Не удалось загрузить данные</h1>
    <p>Повторите попытку через несколько секунд.</p>
    <div><button className="button primary" onClick={reset}>Повторить</button></div>
  </section>
}
