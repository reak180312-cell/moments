import { useMemo, useRef, useState } from 'react';
import { useStore } from '../data/store';
import { helpfulClass, matchVocab, triggerClass } from '../lib/palette';
import { Icon } from './ui';

/** How often this family has reached for each word - the suggestion order. */
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


/**
 * Type it, don't hunt for it.
 *
 * The point of this control is that recording a moment means writing what
 * happened, in your own words, without reading a wall of options first.
 *
 * What it quietly does underneath: what you type is matched, ignoring case and
 * spacing, against what the family has written before. Type "homework" and it
 * becomes the same Homework the Insights page has been counting all along. Only
 * a genuinely new word makes a new entry. Without that, "Homework", "homework "
 * and "HOMEWORK" would be three different things and the trigger charts would
 * quietly stop adding up.
 */

export function TagInput({
  kind, selected, onChange, placeholder,
}: {
  kind: 'triggers' | 'helpful';
  selected: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
}) {
  const store = useStore();
  const usage = useVocabUsage(kind);
  const list = kind === 'triggers' ? store.triggers : store.helpful;
  const tone = (name: string) => (kind === 'triggers' ? triggerClass(name) : helpfulClass);

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const chosen = selected
    .map((id) => list.find((v) => v.id === id))
    .filter((v): v is NonNullable<typeof v> => Boolean(v));

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list
      .filter((v) => !v.is_archived && !selected.includes(v.id))
      .filter((v) => (q ? v.name.toLowerCase().includes(q) : true))
      .sort((a, b) => {
        // What you are typing first, then what this family writes most.
        if (q) {
          const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
          const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
          if (aStarts !== bStarts) return aStarts - bStarts;
        }
        return (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0) || a.name.localeCompare(b.name);
      })
      .slice(0, query.trim() ? 6 : 5);
  }, [list, query, selected, usage]);

  const exact = matchVocab(list, query);

  const add = async (name: string) => {
    const clean = name.trim();
    if (!clean) return;
    setError(null);
    try {
      const match = matchVocab(list, clean);
      if (match) {
        if (!selected.includes(match.id)) onChange([...selected, match.id]);
      } else {
        const created = kind === 'triggers'
          ? await store.addTrigger(clean)
          : await store.addHelpful(clean);
        if (created && !selected.includes(created.id)) onChange([...selected, created.id]);
      }
      setQuery('');
      setActive(-1);
      inputRef.current?.focus();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = (id: string) => onChange(selected.filter((x) => x !== id));

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (active >= 0 && suggestions[active]) {
        void add(suggestions[active].name);
      } else {
        void add(query);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(suggestions.length - 1, a + 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(-1, a - 1));
      return;
    }
    if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
      return;
    }
    if (e.key === 'Backspace' && !query && chosen.length) {
      remove(chosen[chosen.length - 1].id);
    }
  };

  const listId = `${kind}-suggestions`;
  const showList = open && suggestions.length > 0;

  return (
    <div className="tag-input">
      {chosen.length > 0 && (
        <ul className="token-row" aria-label="Chosen">
          {chosen.map((v) => (
            <li key={v.id} className={`token ${tone(v.name)}`}>
              <span className="chip-dot" aria-hidden="true" />
              <span>{v.name}</span>
              <button type="button" onClick={() => remove(v.id)} aria-label={`Remove ${v.name}`}>
                <Icon name="close" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="tag-input-field">
        <input
          ref={inputRef}
          className="input"
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label={kind === 'triggers' ? 'What set it off' : 'What helped'}
          value={query}
          placeholder={placeholder}
          autoComplete="off"
          autoCorrect="off"
          spellCheck
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(-1); }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Whatever was typed counts, even if they never pressed enter.
            if (query.trim()) void add(query);
            setTimeout(() => setOpen(false), 140);
          }}
          onKeyDown={onKeyDown}
        />
        {query.trim() && (
          <button type="button" className="tag-input-add" onClick={() => void add(query)}>
            {exact ? 'Add' : 'Add “' + query.trim() + '”'}
          </button>
        )}
      </div>

      {showList && (
        <ul className="suggestions" id={listId} role="listbox">
          {!query.trim() && (
            <li className="suggestions-hint" aria-hidden="true">Written before</li>
          )}
          {suggestions.map((v, i) => (
            <li key={v.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                className={`suggestion ${tone(v.name)} ${i === active ? 'is-active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void add(v.name)}
              >
                <span className="chip-dot" aria-hidden="true" />
                <span>{v.name}</span>
                {usage.get(v.id) ? (
                  <small>{usage.get(v.id)}×</small>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="help">
        {kind === 'triggers'
          ? 'Write it however you like. If you have written it before, it will join up with those.'
          : 'Write whatever seemed to help. Repeating a word joins it up with the last time.'}
      </p>

      {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: '0.8125rem' }}>{error}</p>}
    </div>
  );
}
