import { redirect } from 'next/navigation'
import { LoginForm } from '@/components/forms'
import { getSession } from '@/server/auth'

export default async function Login() {
  if (await getSession()) redirect('/')
  return <main className="login-page">
    <section className="panel login-panel">
      <div className="wordmark"><span className="mark" aria-hidden="true"><i /><i /><i /></span>Центр поддержки</div>
      <h1>Вход</h1>
      <p>Используйте логин и пароль, которые выдал администратор.</p>
      <LoginForm />
    </section>
  </main>
}
