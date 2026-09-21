import { useState } from 'react';
import { useStore } from '../data/store';
import { Button, Card, Field, Segmented } from '../components/ui';

export function OnboardingScreen() {
  const { createFamily, joinFamily, signOut } = useStore();
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [familyName, setFamilyName] = useState('');
  const [childName, setChildName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'create') await createFamily(familyName, childName);
      else await joinFamily(code);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen" style={{ paddingTop: '2.5rem', maxWidth: '28rem' }}>
      <div className="stack-lg">
        <header className="stack" style={{ gap: '0.375rem' }}>
          <h1>Set up your family</h1>
          <p style={{ color: 'var(--ink-2)' }}>
            Everything you record lives in one shared space. Only people you invite can
            open it.
          </p>
        </header>

        <Segmented
          label="Set up or join"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'create', label: 'Start a family' },
            { value: 'join', label: 'I have an invite' },
          ]}
        />

        <Card>
          <form className="stack" onSubmit={submit}>
            {mode === 'create' ? (
              <>
                <Field label="Family name" help="Just for the top of your screen.">
                  <input
                    className="input" value={familyName} required
                    onChange={(e) => setFamilyName(e.target.value)}
                    placeholder="The Coopers"
                  />
                </Field>
                <Field label="Child's name" help="You can add another child later.">
                  <input
                    className="input" value={childName} required
                    onChange={(e) => setChildName(e.target.value)}
                    placeholder="Gal"
                  />
                </Field>
              </>
            ) : (
              <Field label="Invite code" help="Ask whoever set up the family for the code.">
                <input
                  className="input" value={code} required
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="A1B2C3D4E5"
                  style={{ letterSpacing: '0.08em', fontVariantNumeric: 'tabular-nums' }}
                />
              </Field>
            )}

            {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: '0.875rem' }}>{error}</p>}

            <Button type="submit" variant="primary" size="lg" block disabled={busy}>
              {busy ? 'One moment…' : mode === 'create' ? 'Create our family space' : 'Join the family'}
            </Button>
          </form>
        </Card>

        <Button variant="plain" block onClick={() => signOut().catch((err) => setError((err as Error).message))}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
