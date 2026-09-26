import { useState } from 'react';
import { useStore } from '../data/store';
import { GH_OWNER, GH_REPO } from '../lib/backend';
import { enterPreview } from '../lib/demo';
import { Button, Card, Field, Spinner } from '../components/ui';

/**
 * Connecting a device to the family's record.
 *
 * The record lives in a private GitHub repository. Each device holds its own
 * access token, kept in that device's own storage and sent nowhere but GitHub.
 * No token is ever in the app's code, so the app can stay a public web page
 * while the record stays private.
 */

/** Pre-filled, so the quick path is: open, scroll, Generate, copy. */
const QUICK_TOKEN_URL =
  'https://github.com/settings/tokens/new?scopes=repo&description=Moments%20app';

/** The tighter path: access to this one repository and nothing else. */
const SCOPED_TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

/**
 * Shown between connecting and the record arriving. It never silently spins
 * forever: if the fetch failed, this says so and offers a way out.
 */
export function ConnectingScreen() {
  const store = useStore();

  return (
    <div className="screen" style={{ paddingTop: '4rem', maxWidth: '26rem' }}>
      <div className="stack-lg">
        {store.error ? (
          <Card>
            <div className="stack">
              <h2>Could not open the record</h2>
              <p role="alert" style={{ color: 'var(--ink-2)', fontSize: '0.875rem' }}>{store.error}</p>
              <p className="help">
                Usually this means the key does not have access to{' '}
                <strong>{GH_OWNER}/{GH_REPO}</strong>, or it has expired.
              </p>
              <Button variant="primary" block onClick={() => void store.sync()}>Try again</Button>
              <Button block onClick={() => void store.signOut()}>Use a different key</Button>
            </div>
          </Card>
        ) : (
          <>
            <Spinner label="Opening your family's record" />
            <p style={{ textAlign: 'center', color: 'var(--ink-3)', fontSize: '0.875rem' }}>
              Opening your family's record…
            </p>
            <Button variant="plain" block onClick={() => void store.signOut()}>
              Use a different key
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export function ConnectScreen() {
  const store = useStore();
  const [token, setToken] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [childName, setChildName] = useState('');
  const [showSteps, setShowSteps] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await store.connectGithub(token, familyName, childName);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="screen" style={{ paddingTop: '2.5rem', maxWidth: '30rem' }}>
      <div className="stack-lg">
        <header className="stack" style={{ gap: '0.375rem' }}>
          <h1 style={{ fontSize: '1.75rem' }}>Moments</h1>
          <p style={{ color: 'var(--ink-2)' }}>
            One shared record for your family, on every device. Connect this device once
            and it stays connected.
          </p>
        </header>

        <Card>
          <form className="stack" onSubmit={connect}>
            <h2>Connect this device</h2>
            <p style={{ color: 'var(--ink-2)', fontSize: '0.875rem' }}>
              Your family's moments live in a private repository on your GitHub account —{' '}
              <strong>{GH_OWNER}/{GH_REPO}</strong>. This device needs its own key to
              reach it.
            </p>

            <Button
              variant="primary" block
              onClick={() => { setShowSteps(true); window.open(QUICK_TOKEN_URL, '_blank', 'noopener'); }}
            >
              Get a key from GitHub
            </Button>

            {showSteps && (
              <div className="stack" style={{ gap: '0.75rem' }}>
                <ol
                  style={{
                    color: 'var(--ink-2)', fontSize: '0.875rem', paddingLeft: '1.25rem',
                    display: 'grid', gap: '0.5rem', margin: 0,
                  }}
                >
                  <li>Sign in to GitHub if it asks.</li>
                  <li>The name and permission are already filled in. Set <strong>Expiration</strong> to <strong>No expiration</strong>, or you will have to do this again later.</li>
                  <li>Scroll to the bottom and press <strong>Generate token</strong>.</li>
                  <li>Copy it, come back here, and paste it below.</li>
                </ol>
                <p className="help">
                  That key can reach all of your repositories. If you would rather it
                  reached only this family's record, make a{' '}
                  <a href={SCOPED_TOKEN_URL} target="_blank" rel="noreferrer">fine-grained token</a>{' '}
                  instead: <strong>Only select repositories</strong> → <strong>{GH_REPO}</strong>,
                  and under Repository permissions set <strong>Contents</strong> to{' '}
                  <strong>Read and write</strong>. If {GH_REPO} does not exist yet, give it{' '}
                  <strong>All repositories</strong> and <strong>Administration: Read and write</strong>{' '}
                  the first time, so the app can create it.
                </p>
              </div>
            )}

            <Field label="Your key" help="It is stored on this device only, never in the app or its code.">
              <input
                className="input"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="github_pat_…"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                required
              />
            </Field>

            <details open>
              <summary style={{ cursor: 'pointer', color: 'var(--ink-2)', fontSize: '0.875rem' }}>
                Setting this up for the first time?
              </summary>
              <div className="stack" style={{ marginTop: '0.75rem' }}>
                <Field label="Family name" help="Only used at the top of your screen.">
                  <input className="input" value={familyName} onChange={(e) => setFamilyName(e.target.value)} placeholder="Our family" />
                </Field>
                <Field label="Child's name" help="You can add another child later.">
                  <input className="input" value={childName} onChange={(e) => setChildName(e.target.value)} placeholder="My child" />
                </Field>
                <p className="help">
                  Leave these blank if someone has already set the family up — you are
                  just joining it.
                </p>
              </div>
            </details>

            {error && (
              <p role="alert" style={{ color: 'var(--danger)', fontSize: '0.875rem' }}>{error}</p>
            )}

            <Button type="submit" variant="primary" size="lg" block disabled={busy || !token.trim()}>
              {busy ? 'Connecting…' : 'Connect'}
            </Button>
          </form>
        </Card>

        <Card className="card--quiet">
          <div className="stack">
            <h2 style={{ fontSize: '1rem' }}>Just want a look first?</h2>
            <p style={{ color: 'var(--ink-2)', fontSize: '0.875rem' }}>
              Open a preview filled with invented sample data. Nothing is saved anywhere
              but this device, and it can be cleared at any time.
            </p>
            <Button onClick={() => { enterPreview(); window.location.reload(); }}>
              Explore the preview
            </Button>
          </div>
        </Card>

        <p style={{ color: 'var(--ink-3)', fontSize: '0.8125rem', textAlign: 'center' }}>
          Nothing your family records is public, and nothing is shared unless you share it
          yourself. No adverts, no tracking, nothing sold.
        </p>
      </div>
    </div>
  );
}
