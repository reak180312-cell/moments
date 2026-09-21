import { useEffect, useRef, useState } from 'react';
import { navigate, useRoute } from './lib/router';
import { useStore } from './data/store';
import { Button, Card, Icon, Spinner } from './components/ui';
import { ConflictDialog } from './components/ConflictDialog';
import { QuickRecordSheet } from './components/QuickRecord';
import { AuthScreen } from './screens/Auth';
import { ConnectScreen } from './screens/Connect';
import { OnboardingScreen } from './screens/Onboarding';
import { HomeScreen } from './screens/Home';
import { RecordScreen } from './screens/Record';
import { LiveMomentScreen } from './screens/LiveMoment';
import { HistoryScreen } from './screens/History';
import { CalendarScreen } from './screens/Calendar';
import { InsightsScreen } from './screens/Insights';
import { EventDetailScreen } from './screens/EventDetail';
import { TriggerDetailScreen } from './screens/TriggerDetail';
import { SettingsScreen } from './screens/Settings';
import { ReportsScreen } from './screens/Reports';
import { WeeklySummaryScreen } from './screens/WeeklySummary';
import { useReminders } from './lib/reminders';
import { enterPreview } from './lib/demo';

const TABS = [
  { path: '/', label: 'Home', icon: 'home' as const },
  { path: '/history', label: 'History', icon: 'history' as const },
  { path: '/insights', label: 'Insights', icon: 'insights' as const },
  { path: '/calendar', label: 'Calendar', icon: 'calendar' as const },
  { path: '/settings', label: 'Settings', icon: 'settings' as const },
];

export default function App() {
  const store = useStore();
  const { path, parts, query } = useRoute();
  const [quickOpen, setQuickOpen] = useState(false);

  useReminders();

  if (store.backend === 'none' && !store.preview) return <SetupScreen />;
  if (!store.ready) return <Spinner label="Opening Moments" />;
  if (!store.session) return store.backend === 'github' ? <ConnectScreen /> : <AuthScreen />;
  if (!store.family) {
    return store.loadingRemote ? <Spinner label="Finding your family" /> : <OnboardingScreen />;
  }

  const conflict = store.conflicts[0];

  let screen = <HomeScreen onQuickRecord={() => setQuickOpen(true)} />;
  if (parts[0] === 'history') screen = <HistoryScreen />;
  else if (parts[0] === 'insights') screen = <InsightsScreen />;
  else if (parts[0] === 'calendar') screen = <CalendarScreen />;
  else if (parts[0] === 'settings') screen = <SettingsScreen />;
  else if (parts[0] === 'record') screen = <RecordScreen eventId={query.get('id')} duplicateOf={query.get('duplicate')} />;
  else if (parts[0] === 'live') screen = <LiveMomentScreen draftId={query.get('id')} />;
  else if (parts[0] === 'event' && parts[1]) screen = <EventDetailScreen eventId={parts[1]} />;
  else if (parts[0] === 'trigger' && parts[1]) screen = <TriggerDetailScreen triggerId={parts[1]} />;
  else if (parts[0] === 'reports') screen = <ReportsScreen />;
  else if (parts[0] === 'summary') screen = <WeeklySummaryScreen />;

  const fullScreen = ['record', 'live', 'event', 'trigger', 'reports', 'summary'].includes(parts[0] ?? '');

  return (
    <div className="app-shell">
      <a href="#main" className="sr-only">Skip to content</a>
      <Nav path={path} />
      <main id="main" style={{ flex: 1, minWidth: 0 }}>{screen}</main>
      {!fullScreen && store.perms.add && <RecordFab onQuick={() => setQuickOpen(true)} />}
      {quickOpen && <QuickRecordSheet onClose={() => setQuickOpen(false)} />}
      {conflict && (
        <ConflictDialog
          conflict={conflict}
          onClose={() => store.dismissConflict(conflict.event_id)}
        />
      )}
    </div>
  );
}

function Nav({ path }: { path: string }) {
  return (
    <nav className="nav" aria-label="Main">
      <span className="nav-brand">Moments</span>
      {TABS.map((tab) => {
        const active = tab.path === '/' ? path === '/' : path.startsWith(tab.path);
        return (
          <a
            key={tab.path} href={`#${tab.path}`}
            aria-current={active ? 'page' : undefined}
          >
            <Icon name={tab.icon} size={22} />
            <span>{tab.label}</span>
          </a>
        );
      })}
    </nav>
  );
}

/** Tap records a moment; press and hold opens Quick Record. */
function RecordFab({ onQuick }: { onQuick: () => void }) {
  const timer = useRef<number | null>(null);
  const held = useRef(false);

  const start = () => {
    held.current = false;
    timer.current = window.setTimeout(() => {
      held.current = true;
      if ('vibrate' in navigator) navigator.vibrate?.(12);
      onQuick();
    }, 450);
  };
  const end = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  return (
    <button
      type="button"
      className="fab"
      aria-label="Record a moment. Press and hold for quick record."
      onPointerDown={start}
      onPointerUp={end}
      onPointerLeave={end}
      onPointerCancel={end}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => { if (!held.current) navigate('/record'); }}
    >
      <Icon name="plus" size={28} />
    </button>
  );
}

function SetupScreen() {
  return (
    <div className="screen" style={{ paddingTop: '3rem' }}>
      <div className="stack-lg">
        <div className="stack">
          <h1>Moments</h1>
          <p style={{ color: 'var(--ink-2)' }}>
            One shared, private record for your family - on every device.
          </p>
        </div>
        <Card>
          <div className="stack">
            <h2>Finish connecting your database</h2>
            <p style={{ color: 'var(--ink-2)' }}>
              Moments keeps one copy of your family's information in your own Supabase
              project. Two steps, once:
            </p>
            <ol style={{ color: 'var(--ink-2)', paddingLeft: '1.25rem', display: 'grid', gap: '0.5rem' }}>
              <li>Create a free project at supabase.com, then run <code>supabase/schema.sql</code> in its SQL editor.</li>
              <li>
                Copy <code>.env.example</code> to <code>.env</code>, paste in your project URL and
                anon key, and restart <code>npm run dev</code>.
              </li>
            </ol>
            <p className="help">
              The full walkthrough is in <code>README.md</code>.
            </p>
          </div>
        </Card>
        <Button variant="primary" onClick={() => window.location.reload()}>I've done that - reload</Button>
        <Card className="card--quiet">
          <div className="stack">
            <h2 style={{ fontSize: '1rem' }}>Want to look around first?</h2>
            <p style={{ color: 'var(--ink-2)', fontSize: '0.875rem' }}>
              Open a preview filled with invented sample data. It stays on this device,
              syncs with nothing, and can be cleared at any time.
            </p>
            <Button onClick={() => { enterPreview(); window.location.reload(); }}>
              Explore the preview
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
