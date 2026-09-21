import { useState } from 'react';
import { useStore } from '../data/store';
import { Button, Card, Field } from '../components/ui';

export function AuthScreen() {
  const { signIn, signUp } = useStore();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'in') await signIn(email, password);
      else {
        await signUp(email, password, name);
        setSent(true);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen" style={{ paddingTop: '2.5rem', maxWidth: '26rem' }}>
      <div className="stack-lg">
        <header className="stack" style={{ gap: '0.375rem' }}>
          <h1 style={{ fontSize: '1.75rem' }}>Moments</h1>
          <p style={{ color: 'var(--ink-2)' }}>
            A calm, private place for your family to note the hard moments — and to see
            them clearly later.
          </p>
        </header>

        {sent ? (
          <Card>
            <div className="stack">
              <h2>Check your email</h2>
              <p style={{ color: 'var(--ink-2)' }}>
                We sent a confirmation link to <strong>{email}</strong>. Open it on this
                device, then come back and sign in.
              </p>
              <Button onClick={() => { setSent(false); setMode('in'); }}>Back to sign in</Button>
            </div>
          </Card>
        ) : (
          <Card>
            <form className="stack" onSubmit={submit}>
              <h2>{mode === 'in' ? 'Sign in' : 'Create your account'}</h2>

              {mode === 'up' && (
                <Field label="Your name" help="Family members will see this beside moments you record.">
                  <input
                    className="input" value={name} autoComplete="name"
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Mum, Dad, Sam…"
                  />
                </Field>
              )}

              <Field label="Email">
                <input
                  className="input" type="email" value={email} required
                  autoComplete="email" inputMode="email"
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>

              <Field label="Password" help={mode === 'up' ? 'At least 8 characters.' : undefined}>
                <input
                  className="input" type="password" value={password} required
                  minLength={8}
                  autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>

              {error && (
                <p role="alert" style={{ color: 'var(--danger)', fontSize: '0.875rem' }}>{error}</p>
              )}

              <Button type="submit" variant="primary" size="lg" block disabled={busy}>
                {busy ? 'One moment…' : mode === 'in' ? 'Sign in' : 'Create account'}
              </Button>

              <Button
                variant="plain" block
                onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setError(null); }}
              >
                {mode === 'in' ? 'New here? Create an account' : 'I already have an account'}
              </Button>
            </form>
          </Card>
        )}

        <p style={{ color: 'var(--ink-3)', fontSize: '0.8125rem', textAlign: 'center' }}>
          Your family's information stays in your own database, reachable only by the
          people you invite. No adverts, no public profiles, nothing shared by default.
        </p>
      </div>
    </div>
  );
}
