export default function FormField({ label, name, error, children, required = false }) {
  const errorId = `${name}-error`;
  return <label className="auth-field" htmlFor={name}>{label}{required && <span aria-hidden="true"> *</span>}
    {children}
    {error && <small id={errorId} className="field-error">{error}</small>}
  </label>;
}
