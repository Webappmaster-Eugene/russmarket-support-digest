import { example } from '@/digest/example'

export const exampleRequest = {
  asOf: example.asOf,
  cases: example.cases.map(({ chat, ...record }) => ({ record, chat })),
}
