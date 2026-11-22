'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { fields, readCaseFields, readOperation, uuidInput } from '@/server/forms'
import { errorDetails, parse } from '@/server/errors'
import { pageSession, signIn, signOut } from '@/server/auth'
import { changeCase, createCase, saveSnapshot } from '@/server/store'
import type { FieldIssue } from '@/digest/contract'

export type FormState = {
  error?: string
  issues?: FieldIssue[]
  values?: Record<string, string>
}

export async function loginAction(_previous: FormState, data: FormData): Promise<FormState> {
  const values = fields(data)
  try {
    const { login, password } = parse(
      z.object({
        login: z.string().trim().toLowerCase().min(1, 'Укажите логин.').max(64),
        password: z.string().min(1, 'Укажите пароль.').max(128),
      }),
      values,
    )
    await signIn(login, password)
  } catch (error) {
    const failure = errorDetails(error)
    return { error: failure.error, issues: failure.issues, values: { login: values.login ?? '' } }
  }
  redirect('/')
}

export async function logoutAction() {
  await signOut()
  redirect('/login')
}

export async function caseAction(_previous: FormState, data: FormData): Promise<FormState> {
  const session = await pageSession()
  const values = fields(data)
  let key: string
  try {
    if (values.action === 'create') {
      key = await createCase(session.workspace, readCaseFields(values))
    } else {
      key = parse(uuidInput, values.key)
      await changeCase(session.workspace, key, readOperation(values))
    }
  } catch (error) {
    const failure = errorDetails(error)
    return { error: failure.error, issues: failure.issues, values }
  }
  redirect(`/cases/${key}`)
}

export async function snapshotAction(_previous: FormState, data: FormData): Promise<FormState> {
  const session = await pageSession()
  let key: string
  try {
    key = await saveSnapshot(session.workspace, parse(uuidInput, data.get('key')))
  } catch (error) {
    const failure = errorDetails(error)
    return { error: failure.error, issues: failure.issues }
  }
  redirect(`/history/${key}`)
}
