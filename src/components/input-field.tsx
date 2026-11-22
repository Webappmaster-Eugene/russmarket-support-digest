import { useId, type ReactNode } from 'react'

type FieldProps = { id: string; 'aria-invalid'?: true; 'aria-describedby'?: string }

export function InputField({ label, issue, children }: {
  label: string
  issue?: string
  children: (props: FieldProps) => ReactNode
}) {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(issue ? { id, 'aria-invalid': true, 'aria-describedby': `${id}-error` } : { id })}
      {issue && <p id={`${id}-error`} className="field-error">{issue}</p>}
    </div>
  )
}
