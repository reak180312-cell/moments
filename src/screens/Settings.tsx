import { useState } from 'react';
import { useStore } from '../data/store';
import { navigate } from '../lib/router';
import { prefs } from '../lib/local';
import { relativeTime } from '../lib/time';
import { setReduceMotion, setTextSize, setTheme, type TextSize, type ThemeChoice } from '../lib/theme';
import { notificationPermission, requestNotifications } from '../lib/reminders';
import { download, downloadJson, eventsToCsv } from '../lib/export';
import type { FamilyMember, Role } from '../lib/types';
import {
  Avatar, Button, Card, Chip, ConfirmDialog, Field, Fieldset, Icon, Segmented,
  Sheet, SwitchRow, useToast,
} from '../components/ui';

export function SettingsScreen() {
  const store = useStore();
  const toast = useToast();

  const [name, setName] = useState(store.me?.display_name ?? '');
  const [familyName, setFamilyName] = useState(store.family?.name ?? '');
  const [editingMember, setEditingMember] = useState<FamilyMember | null>(null);
  const [inviting, setInviting] = useState(false);
  const [managingVocab, setManagingVocab] = useState<'triggers' | 'helpful' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const [theme, setThemeState] = useState<ThemeChoice>(() => prefs.get('theme', 'system'));
  const [textSize, setTextSizeState] = useState<TextSize>(() => prefs.get('textSize', 'normal'));
  const [motion, setMotionState] = useState<boolean>(() => prefs.get('reduceMotion', false));
  const [notifyOpen, setNotifyOpen] = useState<boolean>(() => prefs.get('notifyOpenMoment', true));
  const [notifyWeekly, setNotifyWeekly] = useState<boolean>(() => prefs.get('notifyWeekly', false));

  const isOwner = store.family?.owner_id === store.session?.user.id;

  const exportEverything = async () => {
    setBusy(true);
    try {
      const data = await store.exportFamilyData();
      downloadJson(`moments-export-${new Date().toISOString().slice(0, 10)}.json`, data);
      toast('Export saved to this device.');
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    const csv = eventsToCsv(store.allEvents, {
      trigger: store.triggerName,
      helpful: store.helpfulName,
      person: (id) => store.nameOf(id),
    });
    download(`moments-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8');
    toast('CSV saved to this device.');
  };

  const deleteData = async () => {
    setBusy(true);
    try {
      const result = await store.deleteMyData(isOwner);
      setConfirmDelete(false);
      toast(
        result === 'records_erased' ? 'Every record has been erased.'
          : result === 'family_deleted' ? 'Everything has been deleted.'
            : 'You have left the family.'
      );
      if (store.backend !== 'github') await store.signOut().catch(() => {});
      window.location.reload();
    } catch (err) {
      toast((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <header className="screen-head">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>{store.family?.name}</h1>
        </div>
      </header>

      <div className="stack-lg">
        {/* --------------------------------------------------------- you */}
        <Card>
          <h2 className="section-title" style={{ marginTop: 0 }}>You</h2>
          <div className="stack">
            <Field label="Your name">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <div className="row">
              <Button
                disabled={name.trim() === store.me?.display_name || !name.trim()}
                onClick={() => store.updateMyName(name).then(() => toast('Name updated.')).catch((e) => toast(e.message))}
              >
                Save name
              </Button>
              <span className="help">{store.me?.email}</span>
            </div>
          </div>
        </Card>

        {/* ------------------------------------------------------ profiles */}
        <Card>
          <h2 className="section-title" style={{ marginTop: 0 }}>Child profile</h2>
          <div className="stack">
            {store.profiles.map((p) => (
              <div key={p.id} className="row-between">
                <div className="row" style={{ gap: '0.625rem' }}>
                  <Avatar name={p.name} hue={p.colour_hue} />
                  <span>{p.name}</span>
                </div>
                <div className="row" style={{ gap: '0.375rem' }}>
                  {store.profiles.length > 1 && (
                    <Chip
                      selected={store.activeProfileId === p.id}
                      onClick={() => store.setActiveProfile(p.id)}
                    >
                      {store.activeProfileId === p.id ? 'Showing' : 'Show'}
                    </Chip>
                  )}
                  {store.perms.manage && (
                    <Button
                      size="sm" variant="plain"
                      onClick={() => {
                        const next = window.prompt('Name', p.name);
                        if (next) store.renameProfile(p.id, next).catch((e) => toast(e.message));
                      }}
                    >
                      Rename
                    </Button>
                  )}
                </div>
              </div>
            ))}

            {store.perms.manage && (
              <Button
                size="sm" icon="plus"
                style={{ justifySelf: 'start' }}
                onClick={() => {
                  const child = window.prompt('Name of the child to add');
                  if (child) store.addProfile(child).then(() => toast('Profile added.')).catch((e) => toast(e.message));
                }}
              >
                Add another child
              </Button>
            )}
            <p className="help">
              Every moment is filed under a child, so adding another later keeps the two
              records separate.
            </p>
          </div>
        </Card>

        {/* -------------------------------------------------------- family */}
        <Card>
          <h2 className="section-title" style={{ marginTop: 0 }}>Family</h2>
          <div className="stack">
            {store.perms.manage && (
              <div className="stack">
                <Field label="Family name">
                  <input className="input" value={familyName} onChange={(e) => setFamilyName(e.target.value)} />
                </Field>
                <Button
                  size="sm"
                  style={{ justifySelf: 'start' }}
                  disabled={familyName.trim() === store.family?.name || !familyName.trim()}
                  onClick={() => store.renameFamily(familyName).then(() => toast('Saved.')).catch((e) => toast(e.message))}
                >
                  Save
                </Button>
              </div>
            )}

            <div className="list" style={{ marginTop: '0.5rem' }}>
              {store.members.map((m) => (
                <div key={m.id} className="list-row" style={{ cursor: 'default' }}>
                  <Avatar name={store.nameOf(m.user_id)} />
                  <span className="list-main">
                    <span>{store.nameOf(m.user_id)}</span>
                    <span className="list-sub">{roleWord(m.role)} · {permissionSummary(m)}</span>
                  </span>
                  {store.perms.manage && m.role !== 'owner' && (
                    <Button size="sm" variant="plain" onClick={() => setEditingMember(m)}>Change</Button>
                  )}
                </div>
              ))}
            </div>

            {store.perms.manage && (
              <Button icon="people" style={{ justifySelf: 'start' }} onClick={() => setInviting(true)}>
                Invite someone
              </Button>
            )}
          </div>
        </Card>

        {/* --------------------------------------------------- vocabulary */}
        <Card>
          <h2 className="section-title" style={{ marginTop: 0 }}>Triggers and responses</h2>
          <div className="list">
            <button type="button" className="list-row" onClick={() => setManagingVocab('triggers')}>
              <span className="list-main">
                <span>Triggers</span>
                <span className="list-sub">{store.triggers.filter((t) => !t.is_archived).length} in use</span>
              </span>
              <Icon name="chevron" size={18} className="chev" />
            </button>
            <button type="button" className="list-row" onClick={() => setManagingVocab('helpful')}>
              <span className="list-main">
                <span>What helped</span>
                <span className="list-sub">{store.helpful.filter((t) => !t.is_archived).length} in use</span>
              </span>
              <Icon name="chevron" size={18} className="chev" />
            </button>
          </div>
        </Card>

        {/* -------------------------------------------------------- sync */}
        <Card>
          <h2 className="section-title" style={{ marginTop: 0 }}>Sync</h2>
          <div className="stack">
            <p style={{ color: 'var(--ink-2)', fontSize: '0.875rem' }}>
              {store.online ? 'Connected.' : 'Offline — changes are saved here and upload automatically.'}
              {store.lastSyncedAt && ` Last synced ${relativeTime(store.lastSyncedAt)}.`}
            </p>
            {store.pendingCount > 0 && (
              <p style={{ color: 'var(--ink-2)', fontSize: '0.875rem' }}>
                {store.pendingCount} change{store.pendingCount === 1 ? '' : 's'} waiting to upload.
              </p>
            )}
            <Button
              size="sm" style={{ justifySelf: 'start' }}
              onClick={() => store.sync().then(() => toast('Up to date.'))}
            >
              Sync now
            </Button>
          </div>
        </Card>

        {/* --------------------------------------------------- appearance */}
        <Card>
          <h2 className="section-title" style={{ marginTop: 0 }}>Appearance</h2>
          <div className="stack">
            <Fieldset label="Theme">
              <Segmented
                label="Theme"
                value={theme}
                onChange={(v) => { setThemeState(v); setTheme(v); }}
                options={[
                  { value: 'system', label: 'System' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
              />
            </Fieldset>

            <Fieldset label="Text size" help="Moments also follows your device's own text size setting.">
              <Segmented
                label="Text size"
                value={textSize}
                onChange={(v) => { setTextSizeState(v); setTextSize(v); }}
                options={[
                  { value: 'normal', label: 'Normal' },
                  { value: 'large', label: 'Large' },
                  { value: 'larger', label: 'Larger' },
                ]}
              />
            </Fieldset>

            <SwitchRow
              title="Reduce motion"
              description="Turns off the small animations."
              checked={motion}
              onChange={(v) => { setMotionState(v); setReduceMotion(v); }}
            />
          </div>
        </Card>

        {/* ------------------------------------------------ notifications */}
        <Card>
          <h2 className="section-title" style={{ marginTop: 0 }}>Notifications</h2>
          <SwitchRow
            title="Unfinished moments"
            description="A nudge if a moment has been running for over 30 minutes."
            checked={notifyOpen}
            onChange={async (v) => {
              setNotifyOpen(v);
              prefs.set('notifyOpenMoment', v);
              if (v && notificationPermission() === 'default') await requestNotifications();
            }}
          />
          <SwitchRow
            title="Weekly summary"
            description="A note on Mondays that the week's summary is ready."
            checked={notifyWeekly}
            onChange={async (v) => {
              setNotifyWeekly(v);
              prefs.set('notifyWeekly', v);
              if (v && notificationPermission() === 'default') await requestNotifications();
            }}
          />
          <p className="help" style={{ marginTop: '0.75rem' }}>
            Notifications never contain anything about a moment — no score, no trigger, no
            note. They only say that something is waiting in the app. They come from this
            device while Moments is open or in the background, so nothing is sent through
            anyone else's service.
          </p>
        </Card>

        {/* ------------------------------------------------ privacy & data */}
        <Card>
          <h2 className="section-title" style={{ marginTop: 0 }}>Your data</h2>
          <div className="stack">
            {store.preview && (
              <p style={{ color: 'var(--ink-2)', fontSize: '0.875rem' }}>
                <strong>This is a preview.</strong> The moments, the names and the child are
                invented, and they live only in this browser. Clearing the sample data below
                removes every trace of it.
              </p>
            )}
            {store.backend === 'github' && (
              <p style={{ color: 'var(--ink-2)', fontSize: '0.875rem' }}>
                Your record is stored in a private repository on your own GitHub account
                (<a href={store.repoUrl} target="_blank" rel="noreferrer">{store.repoUrl.replace('https://github.com/', '')}</a>),
                reachable only by the people you invite to it. This device holds its own
                key, kept here and sent nowhere but GitHub. Every change is a commit, so
                the record also keeps its own history.
              </p>
            )}
            <p style={{ color: 'var(--ink-2)', fontSize: '0.875rem' }}>
              This information belongs to your family. It is stored in your own database,
              reachable only by the people invited here, over an encrypted connection. There
              are no adverts, no public profiles, no public links, and nothing is ever sold
              or shared.
            </p>

            <div className="row" style={{ gap: '0.5rem' }}>
              <Button icon="download" disabled={busy} onClick={() => void exportEverything()}>
                Export my data
              </Button>
              <Button icon="download" onClick={exportCsv}>Export as CSV</Button>
            </div>

            <Button icon="download" style={{ justifySelf: 'start' }} onClick={() => navigate('/reports')}>
              Make a report
            </Button>

            {store.preview ? (
              <Button variant="danger" style={{ justifySelf: 'start' }} onClick={() => void store.resetPreview()}>
                Clear the sample data
              </Button>
            ) : (
              <Button variant="danger" style={{ justifySelf: 'start' }} onClick={() => setConfirmDelete(true)}>
                Delete my data
              </Button>
            )}
          </div>
        </Card>

        <Button
          variant="plain" block
          onClick={() => store.signOut().catch((e) => toast((e as Error).message))}
        >
          Sign out
        </Button>

        <p className="help" style={{ textAlign: 'center' }}>
          Moments keeps a record. It does not assess or diagnose anything, and it is not a
          substitute for the people who know and support your child.
        </p>
      </div>

      {editingMember && (
        <MemberSheet member={editingMember} onClose={() => setEditingMember(null)} />
      )}
      {inviting && <InviteSheet onClose={() => setInviting(false)} />}
      {managingVocab && (
        <VocabSheet kind={managingVocab} onClose={() => setManagingVocab(null)} />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title={store.backend === 'github' ? 'Erase every record?' : isOwner ? 'Delete everything?' : 'Leave this family?'}
          body={
            store.backend === 'github' ? (
              <>
                This removes every moment, note and setting from the repository, for
                everyone, and disconnects this device. Export your data first if you might
                want it.
                <br /><br />
                One thing to be clear about: the files go, but git keeps the earlier
                commits. To remove every last trace, delete the repository itself in
                GitHub's settings afterwards.
              </>
            ) : isOwner
              ? 'You own this family space, so this deletes every moment, note and member for everyone. It cannot be undone. Export your data first if you might want it.'
              : 'You will be removed from this family and this device will be cleared. The family keeps its own records.'
          }
          confirmLabel={store.backend === 'github' ? 'Erase everything' : isOwner ? 'Delete everything' : 'Leave family'}
          destructive
          onConfirm={() => void deleteData()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

function roleWord(role: Role): string {
  return role === 'owner' ? 'Owner' : role === 'viewer' ? 'Viewer' : 'Family member';
}

function permissionSummary(m: FamilyMember): string {
  if (m.role === 'owner') return 'Everything';
  const parts: string[] = [];
  if (m.can_view) parts.push('view');
  if (m.can_add) parts.push('add');
  if (m.can_edit) parts.push('edit');
  if (m.can_delete) parts.push('delete');
  if (m.can_view_stats) parts.push('statistics');
  if (m.can_manage_members) parts.push('manage people');
  return parts.length ? parts.join(', ') : 'no access';
}

function MemberSheet({ member, onClose }: { member: FamilyMember; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const [draft, setDraft] = useState(member);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await store.updateMember(member.id, {
        role: draft.role,
        can_view: draft.can_view,
        can_add: draft.can_add,
        can_edit: draft.can_edit,
        can_delete: draft.can_delete,
        can_view_stats: draft.can_view_stats,
        can_manage_members: draft.can_manage_members,
      });
      toast('Saved.');
      onClose();
    } catch (err) {
      toast((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={store.nameOf(member.user_id)}
      onClose={onClose}
      footer={
        <Button variant="primary" size="lg" block disabled={busy} onClick={() => void save()}>
          Save changes
        </Button>
      }
    >
      <div className="stack-lg">
        <Fieldset label="Role">
          <Segmented
            label="Role"
            value={draft.role}
            onChange={(role: Role) => setDraft({
              ...draft,
              role,
              can_add: role !== 'viewer' && draft.can_add,
              can_edit: role !== 'viewer' && draft.can_edit,
              can_delete: role !== 'viewer' && draft.can_delete,
            })}
            options={[
              { value: 'member', label: 'Family member' },
              { value: 'viewer', label: 'Viewer' },
            ]}
          />
        </Fieldset>

        <div>
          <span className="label">What they can do</span>
          <SwitchRow title="View moments" checked={draft.can_view} onChange={(v) => setDraft({ ...draft, can_view: v })} />
          <SwitchRow title="Add moments" checked={draft.can_add} onChange={(v) => setDraft({ ...draft, can_add: v })} />
          <SwitchRow title="Edit moments" checked={draft.can_edit} onChange={(v) => setDraft({ ...draft, can_edit: v })} />
          <SwitchRow title="Delete moments" checked={draft.can_delete} onChange={(v) => setDraft({ ...draft, can_delete: v })} />
          <SwitchRow title="See statistics" checked={draft.can_view_stats} onChange={(v) => setDraft({ ...draft, can_view_stats: v })} />
          <SwitchRow title="Manage family members" checked={draft.can_manage_members} onChange={(v) => setDraft({ ...draft, can_manage_members: v })} />
        </div>

        <p className="help">
          These are enforced by the database, not just hidden in the app.
        </p>

        <Button variant="danger" block onClick={() => setConfirmRemove(true)}>
          Remove from family
        </Button>
      </div>

      {confirmRemove && (
        <ConfirmDialog
          title="Remove this person?"
          body="They will lose access to the family's moments. Anything they recorded stays in the record."
          confirmLabel="Remove"
          destructive
          onConfirm={() => {
            store.removeMember(member.id)
              .then(() => { toast('Removed.'); onClose(); })
              .catch((e) => toast(e.message));
          }}
          onCancel={() => setConfirmRemove(false)}
        />
      )}
    </Sheet>
  );
}

function InviteSheet({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const [role, setRole] = useState<Role>('member');
  const [label, setLabel] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      setCode(await store.createInvite(role, label));
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const invite = async () => {
    setBusy(true);
    try {
      await store.inviteGithubUser(username, role);
      toast(`${username.trim()} has been invited.`);
      onClose();
    } catch (err) {
      toast((err as Error).message);
      setBusy(false);
    }
  };

  if (store.backend === 'github') {
    return (
      <Sheet title="Invite someone" onClose={onClose}>
        <div className="stack-lg">
          <p style={{ color: 'var(--ink-2)', fontSize: '0.875rem' }}>
            Your family's record lives in a private repository. Inviting someone gives
            their GitHub account access to it — and to nothing else of yours.
          </p>

          <Field label="Their GitHub username" help="They will get an invitation from GitHub to accept.">
            <input
              className="input" value={username} placeholder="octocat"
              autoCapitalize="none" autoCorrect="off" spellCheck={false}
              onChange={(e) => setUsername(e.target.value)}
            />
          </Field>

          <Fieldset label="What can they do?">
            <Segmented
              label="Role" value={role} onChange={setRole}
              options={[
                { value: 'member', label: 'Family member' },
                { value: 'viewer', label: 'Viewer' },
              ]}
            />
          </Fieldset>

          <p className="help">
            Be aware: with this setup, anyone invited to the repository can read and write
            everything in it. The role above shapes what the app shows them, but it is an
            agreement between you, not a rule the server enforces. The Supabase setup in
            the README is the one that enforces it.
          </p>

          <Button variant="primary" size="lg" block disabled={busy || !username.trim()} onClick={() => void invite()}>
            {busy ? 'Inviting…' : 'Send the invitation'}
          </Button>

          <p className="help">
            Once they accept, they open this same link on their phone and connect it with
            their own GitHub key. Then you are both looking at the same record.
          </p>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title="Invite someone" onClose={onClose}>
      <div className="stack-lg">
        {code ? (
          <div className="stack">
            <p style={{ color: 'var(--ink-2)' }}>
              Share this code with them privately. It works once and expires in 14 days.
            </p>
            <Card className="card--quiet">
              <p style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '0.12em', textAlign: 'center' }}>
                {code}
              </p>
            </Card>
            <Button
              icon="copy" block
              onClick={() => {
                navigator.clipboard?.writeText(code).then(
                  () => toast('Code copied.'),
                  () => toast('Copy it by hand — clipboard access was refused.')
                );
              }}
            >
              Copy code
            </Button>
            <p className="help">
              Send it the way you would send anything private. Moments does not email it
              for you, and there is no public link.
            </p>
          </div>
        ) : (
          <div className="stack">
            <Fieldset label="What can they do?">
              <Segmented
                label="Role"
                value={role}
                onChange={setRole}
                options={[
                  { value: 'member', label: 'Family member' },
                  { value: 'viewer', label: 'Viewer' },
                ]}
              />
              <p className="help">
                {role === 'member'
                  ? 'Can view, add and edit moments. You can fine-tune this afterwards.'
                  : 'Can view moments and statistics, but not change anything.'}
              </p>
            </Fieldset>

            <Field label="Who is it for?" help="Just a reminder for you — optional.">
              <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Grandma" />
            </Field>

            <Button variant="primary" size="lg" block disabled={busy} onClick={() => void create()}>
              {busy ? 'Creating…' : 'Create invite code'}
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

function VocabSheet({ kind, onClose }: { kind: 'triggers' | 'helpful'; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const [draft, setDraft] = useState('');
  const list = kind === 'triggers' ? store.triggers : store.helpful;
  const table = kind === 'triggers' ? 'triggers' : 'helpful_actions';

  const add = async () => {
    if (!draft.trim()) return;
    try {
      if (kind === 'triggers') await store.addTrigger(draft);
      else await store.addHelpful(draft);
      setDraft('');
    } catch (err) {
      toast((err as Error).message);
    }
  };

  return (
    <Sheet title={kind === 'triggers' ? 'Triggers' : 'What helped'} onClose={onClose}>
      <div className="stack-lg">
        <div className="row" style={{ gap: '0.5rem' }}>
          <input
            className="input" style={{ flex: 1 }} value={draft}
            placeholder="Add your own"
            aria-label="Add your own"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add(); } }}
          />
          <Button variant="primary" onClick={() => void add()}>Add</Button>
        </div>

        <div className="list">
          {[...list]
            .sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned) || a.name.localeCompare(b.name))
            .map((v) => (
              <div key={v.id} className="list-row" style={{ cursor: 'default' }}>
                <span className="list-main">
                  <span style={{ opacity: v.is_archived ? 0.5 : 1 }}>{v.name}</span>
                  <span className="list-sub">
                    {v.is_pinned ? 'Pinned to the top' : v.is_default ? 'Suggested' : 'Added by your family'}
                    {v.is_archived ? ' · hidden' : ''}
                  </span>
                </span>
                {store.perms.edit && (
                  <div className="row" style={{ gap: '0.25rem' }}>
                    <Button
                      size="sm" variant="plain"
                      onClick={() => void store.updateVocab(table, v.id, { is_pinned: !v.is_pinned })}
                    >
                      {v.is_pinned ? 'Unpin' : 'Pin'}
                    </Button>
                    <Button
                      size="sm" variant="plain"
                      onClick={() => void store.updateVocab(table, v.id, { is_archived: !v.is_archived })}
                    >
                      {v.is_archived ? 'Show' : 'Hide'}
                    </Button>
                  </div>
                )}
              </div>
            ))}
        </div>

        <p className="help">
          Hiding an option keeps it out of the picker without touching any moment that
          already used it.
        </p>
      </div>
    </Sheet>
  );
}
