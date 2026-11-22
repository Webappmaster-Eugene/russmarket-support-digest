import { z } from 'zod'
import type { FieldIssue } from '@/digest/contract'

export class DeskError extends Error {
  constructor(readonly status: number, message: string, readonly issues: FieldIssue[] = []) {
    super(message)
  }
}

export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (result.success) return result.data
  throw new DeskError(422, 'Проверьте введённые данные.', result.error.issues.map(({ path, message }) => ({
    path: path.join('.'), message,
  })))
}

export function errorDetails(error: unknown) {
  if (error instanceof DeskError) return { status: error.status, error: error.message, issues: error.issues }
  if (typeof error === 'object' && error && 'code' in error) {
    if (error.code === '23505') return { status: 409, error: 'Такой ID уже есть.', issues: [{ path: 'id', message: 'Укажите другой ID.' }] }
    if (error.code === '40001') return { status: 409, error: 'Данные изменились. Повторите операцию.', issues: [] }
  }
  console.error('Support desk operation failed', error instanceof Error ? error.name : 'UnknownError')
  return { status: 503, error: 'Сервис временно недоступен. Попробуйте ещё раз.', issues: [] }
}
