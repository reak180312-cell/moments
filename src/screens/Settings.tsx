import { useState } from 'react';
import { useStore } from '../data/store';
import { navigate } from '../lib/router';
import { prefs } from '../lib/local';
import { relativeTime } from '../lib/time';
import { setReduceMotion, setTextSize, setTheme, type TextSize, type ThemeChoice } from '../lib/theme';
import { notificationPermission, requestNotifications } from '../lib/reminders';
import { download, downloadJson, eventsToCsv } from '../lib/export';
import { fileToJpegBase64 } from '../lib/image';
import { PageHead } from '../components/moment';
import type { PhotoSlot } from '../lib/github';

const PHOTO_LABELS: { slot: PhotoSlot; label: string }[] = [
  { slot: 'profile', label: 'Profile picture' },
  { slot: 'home', label: 'Home' },
  { slot: 'history', label: 'History' },
  { slot: 'insights', label: 'Insights' },
  { slot: 'encourage', label: 'Encouragement' },
  { slot: 'calendar', label: 'Calendar' },
];

type Tone = 'blue' | 'violet' | 'rose' | 'green' | 'amber';
type IconName = 'people' | 'settings' | 'copy' | 'bolt' | 'check' | 'info' | 'history' | 'sun' | 'insights' | 'download' | 'trash';
import type { FamilyMember, Role } from '../lib/types';
import {
  Avatar, Button, Chip, ConfirmDialog, Field, Fieldset, Icon, Segmented,
  Sheet, SwitchRow, useToast,
} from '../components/ui';

/* A grouped list: the settings themselves do the talking, one line each. */

function RowButton({
  label, value, count, onClick, danger, icon, tone,
}: {
  label: string; value?: string; count?: number; onClick: () => void;
  danger?: boolean; icon?: IconName; tone?: Tone;
}) {
  return (
    <button type="button" className="row-item" onClick={onClick}>
      {icon && (
        <span className={`icon-tile tone-${tone ?? 'blue'}`} aria-hidden="true">
          <Icon name={icon} size={17} />
        </span>
      )}
      <span className="row-main" style={danger ? { color: 'var(--danger)' } : undefined}>{label}</span>
      {count !== undefined && <span className="count-pill">{count}</span>}
      {value && <span className="row-value">{value}</span>}
      <Icon name="chevron" size={16} className="row-chev" />
    </button>
  );
}

type Pane =
  | null | 'name' | 'family' | 'people' | 'children' | 'photo'
  | 'appearance' | 'notifications' | 'export';

export function SettingsScreen() {
  const store = useStore();
  const toast = useToast();

  const [pane, setPane] = useState<Pane>(null);
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
  const child = store.profiles.find((p) => p.id === store.activeProfileId);
  const childName = child?.name ?? 'your child';
  const profileFace = store.photoOf('profile');
  const triggerCount = store.triggers.filter((t) => !t.is_archived).length;
  const helpfulCount = store.helpful.filter((t) => !t.is_archived).length;

  const exportEverything = async () => {
    setBusy(true);
    try {
      const data = await store.exportFamilyData();
      downloadJson(`moments-export-${new Date().toISOString().slice(0, 10)}.json`, data);
      toast('Saved to this device.');
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
    toast('Saved to this device.');
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

  const themeLabel = theme === 'system' ? 'System' : theme === 'light' ? 'Light' : 'Dark';
  const syncLabel = !store.online
    ? 'Offline'
    : store.pendingCount > 0
      ? `${store.pendingCount} waiting`
      : store.lastSyncedAt ? relativeTime(store.lastSyncedAt) : 'Not synced yet';

  return (
    <div className="screen">
      <PageHead title="Settings" subtitle={`Manage your family, ${childName}, and app preferences.`} />

      <div className="stack">
        {child && (
          <div className="profile-card">
            {profileFace && <img className="profile-bg" src={profileFace} alt="" />}
            <span className="profile-scrim" aria-hidden="true" />
            {profileFace
              ? <img className="profile-face" src={profileFace} alt="" />
              : <span className="profile-face" style={{ display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.25)', fontSize: '1.5rem', fontWeight: 700 }}>{child.name[0]}</span>}
            <div className="profile-text">
              <h2>{child.name}</h2>
              {child.description && <p>{child.description}</p>}
            </div>
          </div>
        )}

        <section className="group-card">
          <h2>Our family</h2>
          {store.perms.manage && (
            <RowButton tone="blue" icon="people" label="Family name" value={store.family?.name} onClick={() => setPane('family')} />
          )}
          <RowButton tone="violet" icon="people" label="People" value={`${store.members.length}`} onClick={() => setPane('people')} />
          <RowButton tone="blue" icon="settings" label="Your name" value={store.me?.display_name} onClick={() => setPane('name')} />
        </section>

        <section className="group-card">
          <h2>Child &amp; journaling</h2>
          <RowButton
            tone="rose" icon="people"
            label={store.profiles.length > 1 ? 'Children' : 'Child'}
            value={store.profiles.map((p) => p.name).join(', ')}
            onClick={() => setPane('children')}
          />
          {store.backend === 'github' && (
            <RowButton
              tone="green" icon="copy" label="Photos"
              value={Object.keys(store.photos).length ? 'Set' : 'None'}
              onClick={() => setPane('photo')}
            />
          )}
          <RowButton tone="rose" icon="bolt" label="Triggers" count={triggerCount} onClick={() => setManagingVocab('triggers')} />
          <RowButton tone="green" icon="check" label="What helped" count={helpfulCount} onClick={() => setManagingVocab('helpful')} />
        </section>

        <section className="group-card">
          <h2>App preferences</h2>
          <RowButton
            tone="blue" icon="info" label="Notifications"
            value={notifyOpen || notifyWeekly ? 'On' : 'Off'}
            onClick={() => setPane('notifications')}
          />
          <RowButton tone="violet" icon="history" label="Sync" value={syncLabel} onClick={() => void store.sync()} />
          <RowButton tone="amber" icon="sun" label="Appearance" value={themeLabel} onClick={() => setPane('appearance')} />
        </section>

        <section className="group-card">
          <h2>Data &amp; privacy</h2>
          <RowButton tone="blue" icon="insights" label="Reports" onClick={() => navigate('/reports')} />
          <RowButton tone="green" icon="download" label="Export my data" onClick={() => setPane('export')} />
          {store.preview ? (
            <RowButton tone="rose" icon="trash" label="Clear the sample data" danger onClick={() => void store.resetPreview()} />
          ) : (
            <RowButton tone="rose" icon="trash" label="Delete my data" danger onClick={() => setConfirmDelete(true)} />
          )}
        </section>

        <Button
          variant="plain" block
          onClick={() => store.signOut().catch((e) => toast((e as Error).message))}
        >
          Sign out
        </Button>

        <p className="help" style={{ textAlign: 'center' }}>
          Moments keeps a record. It does not assess or diagnose anything.
        </p>
      </div>

      {/* ------------------------------------------------------------ panes */}

      {pane === 'name' && (
        <Sheet
          title="Your name" onClose={() => setPane(null)}
          footer={
            <Button
              variant="primary" size="lg" block disabled={!name.trim()}
              onClick={() => store.updateMyName(name)
                .then(() => { toast('Saved.'); setPane(null); })
                .catch((e) => toast(e.message))}
            >
              Save
            </Button>
          }
        >
          <input className="input" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
        </Sheet>
      )}

      {pane === 'family' && (
        <Sheet
          title="Family name" onClose={() => setPane(null)}
          footer={
            <Button
              variant="primary" size="lg" block disabled={!familyName.trim()}
              onClick={() => store.renameFamily(familyName)
                .then(() => { toast('Saved.'); setPane(null); })
                .catch((e) => toast(e.message))}
            >
              Save
            </Button>
          }
        >
          <input className="input" value={familyName} autoFocus onChange={(e) => setFamilyName(e.target.value)} />
        </Sheet>
      )}

      {pane === 'people' && (
        <Sheet
          title="People" onClose={() => setPane(null)}
          footer={store.perms.manage
            ? <Button variant="primary" size="lg" block onClick={() => { setPane(null); setInviting(true); }}>
                Invite someone
              </Button>
            : undefined}
        >
          <div className="rows">
            {store.members.map((m) => (
              <div key={m.id} className="row-item">
                <Avatar name={store.nameOf(m.user_id)} />
                <span className="row-main">
                  {store.nameOf(m.user_id)}
                  <span className="row-value" style={{ display: 'block' }}>
                    {roleWord(m.role)} · {permissionSummary(m)}
                  </span>
                </span>
                {store.perms.manage && m.role !== 'owner' && (
                  <Button size="sm" variant="plain" onClick={() => { setPane(null); setEditingMember(m); }}>
                    Change
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Sheet>
      )}

      {pane === 'children' && (
        <Sheet
          title={store.profiles.length > 1 ? 'Children' : 'Child'} onClose={() => setPane(null)}
          footer={store.perms.manage
            ? <Button
                variant="primary" size="lg" block
                onClick={() => {
                  const child = window.prompt('Name of the child to add');
                  if (child) store.addProfile(child).then(() => toast('Added.')).catch((e) => toast(e.message));
                }}
              >
                Add another child
              </Button>
            : undefined}
        >
          <div className="rows">
            {store.profiles.map((p) => (
              <div key={p.id} className="row-item">
                <Avatar name={p.name} hue={p.colour_hue} />
                <span className="row-main">{p.name}</span>
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
                {store.perms.manage && (
                  <Button
                    size="sm" variant="plain"
                    onClick={() => {
                      const next = window.prompt('A sentence about them', p.description ?? '');
                      if (next !== null) store.describeProfile(p.id, next).catch((e) => toast(e.message));
                    }}
                  >
                    Describe
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Sheet>
      )}

      {pane === 'photo' && (
        <Sheet title="Photos" onClose={() => setPane(null)}>
          <div className="stack-lg">
            {PHOTO_LABELS.map(({ slot, label }) => {
              const current = store.photoOf(slot);
              return (
                <div key={slot} className="stack" style={{ gap: '0.5rem' }}>
                  <span className="form-label">{label}</span>
                  {current && (
                    <img
                      src={current} alt=""
                      style={{
                        width: '100%', aspectRatio: slot === 'profile' ? '1 / 1' : '2.4 / 1',
                        maxHeight: slot === 'profile' ? '7rem' : undefined,
                        objectFit: 'cover', objectPosition: 'center 20%',
                        borderRadius: '14px', background: 'var(--surface-2)',
                      }}
                    />
                  )}
                  <div className="row" style={{ gap: '0.5rem' }}>
                    <label className="btn btn--sm" style={{ cursor: 'pointer' }}>
                      {current ? 'Change' : 'Choose'}
                      <input
                        type="file" accept="image/*" className="sr-only"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (!file) return;
                          setBusy(true);
                          try {
                            await store.setPhoto(slot, await fileToJpegBase64(file));
                            toast('Updated on every device.');
                          } catch (err) {
                            toast((err as Error).message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      />
                    </label>
                    {current && (
                      <Button
                        size="sm" variant="plain" disabled={busy}
                        onClick={() => store.setPhoto(slot, null).then(() => toast('Removed.')).catch((e) => toast(e.message))}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
            <p className="help">Kept in your private record, never in the app's public code.</p>
          </div>
        </Sheet>
      )}

      {pane === 'appearance' && (
        <Sheet title="Appearance" onClose={() => setPane(null)}>
          <div className="stack-lg">
            <Fieldset label="Theme">
              <Segmented
                label="Theme" value={theme}
                onChange={(v) => { setThemeState(v); setTheme(v); }}
                options={[
                  { value: 'system', label: 'System' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
              />
            </Fieldset>

            <Fieldset label="Text size">
              <Segmented
                label="Text size" value={textSize}
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
              checked={motion}
              onChange={(v) => { setMotionState(v); setReduceMotion(v); }}
            />
          </div>
        </Sheet>
      )}

      {pane === 'notifications' && (
        <Sheet title="Notifications" onClose={() => setPane(null)}>
          <div className="rows">
            <SwitchRow
              title="Unfinished moments"
              checked={notifyOpen}
              onChange={async (v) => {
                setNotifyOpen(v);
                prefs.set('notifyOpenMoment', v);
                if (v && notificationPermission() === 'default') await requestNotifications();
              }}
            />
            <SwitchRow
              title="Weekly summary"
              checked={notifyWeekly}
              onChange={async (v) => {
                setNotifyWeekly(v);
                prefs.set('notifyWeekly', v);
                if (v && notificationPermission() === 'default') await requestNotifications();
              }}
            />
          </div>
          <p className="help" style={{ marginTop: '0.75rem' }}>
            They never name a score, a trigger or a note.
          </p>
        </Sheet>
      )}

      {pane === 'export' && (
        <Sheet title="Export my data" onClose={() => setPane(null)}>
          <div className="stack">
            <Button variant="primary" size="lg" block disabled={busy} onClick={() => void exportEverything()}>
              Everything, as JSON
            </Button>
            <Button size="lg" block onClick={exportCsv}>Moments, as CSV</Button>
            <p className="help">Saved to this device. Moments never sends it anywhere.</p>
          </div>
        </Sheet>
      )}

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
            store.backend === 'github'
              ? 'This removes every moment from the record, for everyone, and disconnects this device. Git keeps the earlier commits — delete the repository on GitHub to remove every trace.'
              : isOwner
                ? 'This deletes every moment, note and member, for everyone. It cannot be undone.'
                : 'You will be removed from this family and this device cleared.'
          }
          confirmLabel={store.backend === 'github' ? 'Erase' : isOwner ? 'Delete' : 'Leave'}
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
            <p className="invite-code">{code}</p>
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
