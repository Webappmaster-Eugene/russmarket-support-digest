import { Workspace } from '@/components/workspace'
import { compileDigest } from '@/digest/compile'
import { example } from '@/digest/example'

export default function Home() {
  return <Workspace initialDigest={compileDigest(example)} />
}
