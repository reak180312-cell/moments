import assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { DifficultyBadge, DifficultyScale, difficultyWord } from '../src/components/Difficulty';
import { ColumnChart, DataTable, LineChart, RankedBars, TrendMark } from '../src/components/charts';
import { Button, Banner, EmptyState, Segmented, SwitchRow } from '../src/components/ui';

/**
 * A smoke test of the component layer: does it render at all, and does it
 * carry the accessible information that the visual design leans on?
 */

const html = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node);

/* ------------------------------------------------------------ difficulty */

const scale = html(<DifficultyScale value={7} onChange={() => {}} />);
assert.ok(scale.includes('role="radiogroup"'), 'the scale is a radio group');
assert.equal((scale.match(/role="radio"/g) ?? []).length, 10, 'ten steps');
assert.ok(scale.includes('aria-label="7 out of 10, Hard"'), 'each step names its meaning');
assert.ok(scale.includes('aria-checked="true"'), 'the chosen step is announced');
assert.ok(scale.includes('d-7 is-on'), 'the chosen step carries its ramp colour');
assert.ok(scale.includes('is-under'), 'lower steps read as a filled scale');
assert.ok(scale.includes('Extremely difficult'), 'the top of the scale is named, not implied');
assert.ok(!/error|danger|alarm|bad|wrong/i.test(scale), 'nothing frames a high score as a failure');

// Difficulty is never carried by colour alone.
const badge = html(<DifficultyBadge value={9} />);
assert.ok(badge.includes('>9<'), 'the number is present');
assert.ok(badge.includes('Difficulty 9 out of 10, Very hard'), 'and spelled out for screen readers');
assert.ok(html(<DifficultyBadge value={null} />).includes('Difficulty not recorded'));
assert.equal(difficultyWord(1), 'Very mild');
assert.equal(difficultyWord(null), 'Not recorded');

/* ---------------------------------------------------------------- charts */

const columns = html(
  <ColumnChart
    data={[{ label: 'Mon', value: 3 }, { label: 'Tue', value: 0 }, { label: 'Wed', value: 5 }]}
    ariaSummary="Moments per day"
  />
);
assert.ok(columns.includes('role="img"'), 'the chart is one labelled image');
assert.ok(columns.includes('aria-label="Moments per day"'), 'with a summary of what it shows');
assert.equal((columns.match(/<rect[^>]*rx=/g) ?? []).length, 2, 'no bar drawn for an empty day');

const line = html(
  <LineChart
    data={[{ label: 'Jan', value: 6 }, { label: 'Feb', value: null }, { label: 'Mar', value: 4 }]}
    domain={[0, 10]}
    format={(v) => `${v}/10`}
    ariaSummary="Average difficulty"
  />
);
assert.ok(line.includes('aria-label="Average difficulty"'));
assert.ok(line.includes('4/10'), 'the last value is labelled directly');
assert.ok(!line.includes('6/10'), 'but not every point');

const table = html(<DataTable columns={['Day', 'Moments']} rows={[['Mon', 3], ['Tue', 0]]} />);
assert.ok(table.includes('scope="col"') && table.includes('scope="row"'), 'the table view is navigable');

const bars = html(<RankedBars items={[{ label: 'Homework', value: 4 }]} format={(v) => `${v}x`} />);
assert.ok(bars.includes('Homework') && bars.includes('4x'), 'bars label themselves');

const trend = html(<TrendMark direction="up">higher</TrendMark>);
assert.ok(trend.includes('↑') && trend.includes('increased'), 'direction is text as well as an arrow');
assert.ok(!/good|bad|worse|better|improv/i.test(trend), 'a direction is not judged');

/* ------------------------------------------------------------ primitives */

assert.ok(html(<Button variant="primary">Save</Button>).includes('btn--primary'));
assert.ok(html(<Banner icon="info">Offline</Banner>).includes('Offline'));
assert.ok(html(<EmptyState title="Nothing yet" body="Have a rest" />).includes('Nothing yet'));

const seg = html(
  <Segmented
    label="Theme" value="light" onChange={() => {}}
    options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]}
  />
);
assert.ok(seg.includes('aria-pressed="true"'), 'the active segment is announced');

const sw = html(<SwitchRow title="Reduce motion" checked onChange={() => {}} />);
assert.ok(sw.includes('role="switch"') && sw.includes('aria-checked="true"'));

console.log('all render checks passed');
