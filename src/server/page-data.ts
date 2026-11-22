import { notFound } from 'next/navigation'
import { DeskError } from '@/server/errors'
import { uuidInput } from '@/server/forms'

export async function loadRecord<T>(key: string, read: (id: string) => Promise<T>) {
  const parsed = uuidInput.safeParse(key)
  if (!parsed.success) notFound()
  try {
    return await read(parsed.data)
  } catch (error) {
    if (error instanceof DeskError && error.status === 404) notFound()
    throw error
  }
}
