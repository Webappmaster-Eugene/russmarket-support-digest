'use client'

import { useRef, useState, type FormEvent } from 'react'
import type { Digest, DigestRequest, DigestResponse, FieldIssue } from '@/digest/contract'
import { example } from '@/digest/example'
import { MAX_CASES } from '@/digest/input-spec'
import { fromMoscowInput, toMoscowInput } from '@/digest/time'
import { CaseEditor, emptyCase } from '@/components/case-editor'
import { DigestView } from '@/components/digest-view'
import { InputField } from '@/components/input-field'

type Row = { key: number; item: DigestRequest['cases'][number] }
const exampleRows = (): Row[] => example.cases.map((item, key) => ({ key, item }))
const exampleTime = toMoscowInput(example.asOf)
const repository = 'https://github.com/Webappmaster-Eugene/russmarket-support-digest'

export function Workspace({ initialDigest }: { initialDigest: Digest }) {
  const [view, setView] = useState<'digest' | 'data'>('digest')
  const [rows, setRows] = useState(exampleRows)
  const [time, setTime] = useState(exampleTime)
  const [digest, setDigest] = useState(initialDigest)
  const [dirty, setDirty] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [issues, setIssues] = useState<FieldIssue[]>([])
  const nextKey = useRef(example.cases.length)
  const summaryTab = useRef<HTMLButtonElement>(null)
  const dataTab = useRef<HTMLButtonElement>(null)

  function openData() {
    setView('data')
    dataTab.current?.focus()
  }

  function issue(path: string) {
    return issues.find((field) => field.path === path)?.message
  }

  function updateRows(next: Row[], structureChanged = false) {
    setRows(next)
    setDirty(true)
    if (structureChanged) {
      setError('')
      setIssues([])
    }
  }

  async function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError('')
    setIssues([])

    try {
      const request: DigestRequest = { asOf: fromMoscowInput(time), cases: rows.map(({ item }) => item) }
      const response = await fetch('/api/digest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })
      const result: DigestResponse = await response.json()
      if ('error' in result) {
        setError(result.error)
        setIssues(result.issues ?? [])
        window.scrollTo({ top: 0 })
        return
      }
      setDigest(result.digest)
      setDirty(false)
      setView('digest')
      window.scrollTo({ top: 0 })
      summaryTab.current?.focus()
    } catch {
      setError('Сводку не удалось загрузить. Проверьте соединение и повторите расчёт.')
      window.scrollTo({ top: 0 })
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="shell">
      <a className="skip-link" href="#main">К содержанию</a>
      <header className="masthead">
        <div className="masthead-inner">
          <div className="wordmark">
            <span className="mark" aria-hidden="true"><i /><i /><i /></span>
            <span>Руссмаркет<span className="wordmark-unit"> / Поддержка</span></span>
          </div>
          <nav aria-label="Разделы">
            <button type="button" ref={summaryTab} aria-current={view === 'digest' ? 'page' : undefined}
              onClick={() => setView('digest')}>Сводка</button>
            <button type="button" ref={dataTab} aria-current={view === 'data' ? 'page' : undefined}
              onClick={() => setView('data')}>Данные</button>
          </nav>
          <span className="demo-label">Демо</span>
        </div>
      </header>

      <main id="main" className="content" tabIndex={-1}>
        {view === 'digest' ? (
          <DigestView digest={digest} dirty={dirty} onEdit={openData} />
        ) : (
          <>
            <header className="page-heading">
              <div>
                <h1>Данные для сводки</h1>
                <p className="page-intro">Редактируйте четыре случая из задания или проверьте свои примеры.</p>
              </div>
              <button type="button" className="button button-secondary" disabled={pending} onClick={() => {
                setTime(exampleTime)
                updateRows(exampleRows(), true)
              }}>Загрузить пример</button>
            </header>

            <form noValidate onSubmit={calculate} aria-busy={pending}>
              {error && <div className="error-panel" role="alert">
                <p>{error}</p>
                {(issue('cases') || issue('')) && <p>{issue('cases') ?? issue('')}</p>}
              </div>}
              <fieldset className="editor" disabled={pending}>
                <section className="editor-meta">
                  <InputField label="Время сводки (МСК)" issue={issue('asOf')}>
                    {(props) => <input {...props} required type="datetime-local" value={time} onChange={(event) => {
                      setTime(event.target.value)
                      setDirty(true)
                    }} />}
                  </InputField>
                  <p>Используйте вымышленные данные. Сроки доставки и время приёмки в форме тоже указываются по Москве.</p>
                </section>
                {rows.length === 0 && <p className="notice">Добавьте хотя бы один случай, чтобы собрать сводку.</p>}
                <div className="editor-list">
                  {rows.map(({ key, item }, index) => (
                    <CaseEditor key={key} item={item} index={index}
                      issue={(path) => issue(`cases.${index}.${path}`)}
                      onChange={(next) => updateRows(rows.map((row) => row.key === key ? { key, item: next } : row))}
                      onDelete={() => updateRows(rows.filter((row) => row.key !== key), true)} />
                  ))}
                </div>
                <div className="editor-buttons">
                  <button className="button button-secondary" type="button" disabled={rows.length >= MAX_CASES}
                    onClick={() => updateRows([...rows, { key: nextKey.current++, item: emptyCase('onboarding') }], true)}>
                    Добавить случай
                  </button>
                  <button className="button button-primary" type="submit">
                    {pending ? 'Считаем сводку…' : 'Пересчитать сводку'}
                  </button>
                </div>
              </fieldset>
            </form>
          </>
        )}
      </main>

      <footer className="footer">
        <span>Тестовое задание по автоматизации рабочих процессов</span>
        <a href={repository}>Код и инструкция</a>
      </footer>
    </div>
  )
}
