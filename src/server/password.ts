import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

const parameters = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }
const dummy = '00000000000000000000000000000000.' + '0'.repeat(128)

function derive(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, parameters, (error, hash) => error ? reject(error) : resolve(hash))
  })
}

export const validPasswordHash = (value: string) => /^[0-9a-f]{32}\.[0-9a-f]{128}$/u.test(value)

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  return `${salt}.${(await derive(password, salt)).toString('hex')}`
}

export async function verifyPassword(password: string, stored?: string) {
  const [salt, hash] = (stored || dummy).split('.')
  if (!salt || !hash || !validPasswordHash(stored || dummy)) return false
  const matches = timingSafeEqual(await derive(password, salt), Buffer.from(hash, 'hex'))
  return Boolean(stored && matches)
}
