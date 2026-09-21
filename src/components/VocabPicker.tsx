import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { Chip } from './ui';
import type { Vocab } from '../lib/types';

/**
 * Chips for triggers and helpful responses.
 *
 * Order: pinned first, then whatever this family actually uses most, then the
 * rest. The list learns without anyone having to maintain it.
 */

function rank(list: Vocab[], usage: Map<string, number>): Vocab[] {
  return [...list]
    .filter((v) => !v.is_archived)
    .sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      const ua = usage.get(a.id) ?? 0;
      const ub = usage.get(b.id) ?? 0;
      if (ua !== ub) return ub - ua;
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.name.localeCompare(b.name);
    });
}

export function useVocabUsage(kind: 'triggers' | 'helpful') {
  const { allEvents } = useStore();
  return useMemo(() => {
    const counts = new Map<string, number>();
    allEvents.forEach((e) => {
      const ids = kind === 'triggers' ? e.trigger_ids : e.helpful_ids;
      ids.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
    });
    return counts;
  }, [allEvents, kind]);
}

export function VocabPicker({
  kind, selected, onChange, limit = 10, allowCreate = true,
}: {
  kind: 'triggers' | 'helpful';
  selected: string[];
  onChange: (ids: string[]) => void;
  limit?: number;
  allowCreate?: boolean;
}) {
  const store = useStore();
  const usage = useVocabUsage(kind);
  const list = kind === 'triggers' ? store.triggers : store.helpful;
  const ordered = useMemo(() => rank(list, usage), [list, usage]);

  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const visible = expanded ? ordered : ordered.slice(0, limit);
  const hidden = ordered.length - visible.length;
  // A selected option that has scrolled out of the shortlist stays visible.
  const extras = ordered.filter((v) => selected.includes(v.id) && !visible.includes(v));

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  const create = async () => {
    const name = draft.trim();
    if (!name) { setAdding(false); return; }
    try {
      const created = kind === 'triggers' ? await store.addTrigger(name) : await store.addHelpful(name);
      if (created && !selected.includes(created.id)) onChange([...selected, created.id]);
      setDraft('');
      setAdding(false);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="stack" style={{ gap: '0.5rem' }}>
      <div className="chip-wrap">
        {[...visible, ...extras].map((v) => (
          <Chip key={v.id} selected={selected.includes(v.id)} onClick={() => toggle(v.id)}>
            {v.name}
          </Chip>
        ))}

        {hidden > 0 && !expanded && (
          <Chip dashed onClick={() => setExpanded(true)}>
            +{hidden} more
          </Chip>
        )}

        {allowCreate && !adding && (
          <Chip dashed onClick={() => setAdding(true)}>
            + Add your own
          </Chip>
        )}
      </div>

      {adding && (
        <div className="row" style={{ gap: '0.5rem' }}>
          <input
            className="input"
            style={{ flex: 1, minWidth: '10rem' }}
            autoFocus
            value={draft}
            placeholder={kind === 'triggers' ? 'e.g. Getting dressed' : 'e.g. Weighted blanket'}
            aria-label={kind === 'triggers' ? 'New trigger name' : 'New helpful response'}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); void create(); }
              if (e.key === 'Escape') { setAdding(false); setDraft(''); }
            }}
          />
          <button type="button" className="btn btn--primary btn--sm" onClick={() => void create()}>Add</button>
          <button type="button" className="btn btn--plain btn--sm" onClick={() => { setAdding(false); setDraft(''); }}>
            Cancel
          </button>
        </div>
      )}

      {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: '0.8125rem' }}>{error}</p>}
    </div>
  );
}
