import { useState, type FormEvent } from 'react';
import { ApiError } from '../lib/api';

interface Props {
  title: string;
  submitLabel: string;
  withName?: boolean;
  onSubmit: (v: { name: string; email: string; password: string }) => Promise<void>;
  footer: React.ReactNode;
}

export default function AuthForm({ title, submitLabel, withName, onSubmit, footer }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handle(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onSubmit({ name, email, password });
    } catch (err) {
      if (err instanceof ApiError) {
        const first = err.details && Object.values(err.details).flat()[0];
        setError(first ?? err.message);
      } else {
        setError('Something went wrong');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={handle}>
      <h1>{title}</h1>
      {withName && (
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
        </label>
      )}
      <label>
        Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={withName ? 8 : 1}
          autoComplete={withName ? 'new-password' : 'current-password'}
        />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? 'Please wait…' : submitLabel}</button>
      <p className="muted">{footer}</p>
    </form>
  );
}
