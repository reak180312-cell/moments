import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { RANGE_OPTIONS, formatDuration, resolveRange, type RangeKey } from '../lib/time';
import { applyFilters, emptyFilters, filtersActive, forRange, summarise, type EventFilters } from '../lib/stats';
import { LOCATIONS } from '../lib/types';
import { Button, Card, Chip, EmptyState, Field, Fieldset, Icon, Sheet } from '../components/ui';
import { MomentList } from '../components/EventList';

export function HistoryScreen() {
  const store = useStore();
  const [rangeKey, setRangeKey] = useState<RangeKey>('7d');
  const [filters, setFilters] = useState<EventFilters>(emptyFilters);
  const [showFilters, setShowFilters] = useState(false);

  const range = useMemo(() => resolveRange(rangeKey), [rangeKey]);

  const scoped = useMemo(
    () => (store.activeProfileId
      ? store.allEvents.filter((e) => e.profile_id === store.activeProfileId)
      : store.allEvents),
    [store.allEvents, store.activeProfileId]
  );

  const inWindow = useMemo(() => forRange(scoped, range), [scoped, range]);
  const results = useMemo(
    () => applyFilters(inWindow, filters, { trigger: store.triggerName, helpful: store.helpfulName }),
    [inWindow, filters, store.triggerName, store.helpfulName]
  );
  const stats = useMemo(() => summarise(results, store.triggers), [results, store.triggers]);
  const activeCount = filtersActive(filters);

  return (
    <div className="screen">
      <header className="screen-head">
        <div>
          <p className="eyebrow">History</p>
          <h1>{range.label}</h1>
        </div>
      </header>

      <div className="stack-lg">
        <div
          className="chip-wrap"
          role="group" aria-label="Time range"
          style={{ overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: '0.25rem' }}
        >
          {RANGE_OPTIONS.map((o) => (
            <Chip key={o.key} selected={rangeKey === o.key} onClick={() => setRangeKey(o.key)}>
              {o.label}
            </Chip>
          ))}
        </div>

        <div className="row" style={{ gap: '0.5rem', flexWrap: 'nowrap' }}>
          <label className="field" style={{ flex: 1 }}>
            <span className="sr-only">Search moments</span>
            <span style={{ position: 'relative', display: 'block' }}>
              <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)' }}>
                <Icon name="search" size={18} />
              </span>
              <input
                className="input"
                style={{ paddingLeft: '2.5rem' }}
                type="search"
                value={filters.search}
                placeholder="Search notes, triggers, places"
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              />
            </span>
          </label>
          <Button
            icon="filter"
            onClick={() => setShowFilters(true)}
            aria-label={`Filters${activeCount ? `, ${activeCount} active` : ''}`}
          >
            {activeCount ? String(activeCount) : 'Filter'}
          </Button>
        </div>

        <Card className="card--quiet">
          <div className="row" style={{ justifyContent: 'space-between', gap: '1rem' }}>
            <Stat label="Moments" value={String(stats.count)} />
            <Stat label="Avg difficulty" value={stats.avgDifficulty === null ? '—' : `${stats.avgDifficulty}/10`} />
            <Stat label="Total time" value={stats.totalSeconds ? formatDuration(stats.totalSeconds) : '—'} />
          </div>
        </Card>

        {results.length === 0 ? (
          <EmptyState
            emoji="🔍"
            title="Nothing matches yet"
            body={
              activeCount || filters.search
                ? 'Try a wider time range or clear some filters.'
                : 'Moments you record will appear here.'
            }
            action={
              (activeCount > 0 || filters.search) ? (
                <Button onClick={() => setFilters(emptyFilters)}>Clear filters</Button>
              ) : undefined
            }
          />
        ) : (
          <MomentList events={results} groupByDay />
        )}
      </div>

      {showFilters && (
        <FilterSheet
          filters={filters}
          onChange={setFilters}
          onClose={() => setShowFilters(false)}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stack" style={{ gap: 0 }}>
      <span className="tile-label">{label}</span>
      <span style={{ fontWeight: 680, fontSize: '1.125rem' }}>{value}</span>
    </div>
  );
}

function FilterSheet({
  filters, onChange, onClose,
}: { filters: EventFilters; onChange: (f: EventFilters) => void; onClose: () => void }) {
  const store = useStore();
  const [draft, setDraft] = useState(filters);

  const toggle = (key: 'triggerIds' | 'helpfulIds' | 'locations' | 'createdBy', value: string) => {
    const list = draft[key];
    setDraft({
      ...draft,
      [key]: list.includes(value) ? list.filter((x) => x !== value) : [...list, value],
    });
  };

  return (
    <Sheet
      title="Filters"
      onClose={onClose}
      footer={
        <div className="row" style={{ gap: '0.5rem' }}>
          <Button block onClick={() => { setDraft(emptyFilters); onChange(emptyFilters); }}>
            Clear all
          </Button>
          <Button variant="primary" block onClick={() => { onChange(draft); onClose(); }}>
            Show results
          </Button>
        </div>
      }
    >
      <div className="stack-lg">
        <Fieldset label="Difficulty" help={`${draft.difficultyMin} to ${draft.difficultyMax} out of 10`}>
          <div className="row" style={{ gap: '0.75rem' }}>
            <Field label="From">
              <select
                className="select" value={draft.difficultyMin}
                onChange={(e) => setDraft({ ...draft, difficultyMin: Number(e.target.value) })}
              >
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
            <Field label="To">
              <select
                className="select" value={draft.difficultyMax}
                onChange={(e) => setDraft({ ...draft, difficultyMax: Number(e.target.value) })}
              >
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
          </div>
        </Fieldset>

        <Fieldset label="Duration">
          <div className="chip-wrap">
            {[
              { label: 'Any', min: null, max: null },
              { label: 'Under 5 min', min: null, max: 300 },
              { label: '5–15 min', min: 300, max: 900 },
              { label: '15–30 min', min: 900, max: 1800 },
              { label: 'Over 30 min', min: 1800, max: null },
            ].map((o) => (
              <Chip
                key={o.label}
                selected={draft.durationMin === o.min && draft.durationMax === o.max}
                onClick={() => setDraft({ ...draft, durationMin: o.min, durationMax: o.max })}
              >
                {o.label}
              </Chip>
            ))}
          </div>
        </Fieldset>

        <Fieldset label="Triggers">
          <div className="chip-wrap">
            {store.triggers.filter((t) => !t.is_archived).map((t) => (
              <Chip key={t.id} selected={draft.triggerIds.includes(t.id)} onClick={() => toggle('triggerIds', t.id)}>
                {t.name}
              </Chip>
            ))}
          </div>
        </Fieldset>

        <Fieldset label="What helped">
          <div className="chip-wrap">
            {store.helpful.filter((t) => !t.is_archived).map((t) => (
              <Chip key={t.id} selected={draft.helpfulIds.includes(t.id)} onClick={() => toggle('helpfulIds', t.id)}>
                {t.name}
              </Chip>
            ))}
          </div>
        </Fieldset>

        <Fieldset label="Where">
          <div className="chip-wrap">
            {LOCATIONS.map((l) => (
              <Chip key={l} selected={draft.locations.includes(l)} onClick={() => toggle('locations', l)}>
                {l}
              </Chip>
            ))}
          </div>
        </Fieldset>

        <Fieldset label="Recorded by">
          <div className="chip-wrap">
            {store.members.map((m) => (
              <Chip
                key={m.user_id}
                selected={draft.createdBy.includes(m.user_id)}
                onClick={() => toggle('createdBy', m.user_id)}
              >
                {store.nameOf(m.user_id)}
              </Chip>
            ))}
          </div>
        </Fieldset>
      </div>
    </Sheet>
  );
}
