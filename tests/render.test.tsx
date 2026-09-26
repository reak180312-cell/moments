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

/* ------------------------------------------------------ colour identity */

import { readFileSync } from 'node:fs';
import { Chip } from '../src/components/ui';
import { HELPFUL_SLOT, helpfulClass, triggerClass, triggerSlot } from '../src/lib/palette';

// A colour belongs to the thing, not to where it sits in a list.
assert.equal(triggerClass('Homework'), triggerClass('homework'), 'case does not change identity');
assert.equal(triggerClass('  Tired  '), triggerClass('Tired'), 'nor does stray whitespace');
assert.notEqual(triggerSlot('Homework'), triggerSlot('Tired'), 'the common triggers differ');
assert.notEqual(triggerSlot('Homework'), triggerSlot('School'));
assert.notEqual(triggerSlot('Noise'), triggerSlot('Change of plans'));
assert.equal(triggerSlot('Unknown'), 0, '"Unknown" stays neutral rather than picking a hue');
assert.equal(triggerSlot('Other'), 0);
// A custom trigger is stable across runs and never lands on the reserved slot.
for (const name of ['Getting dressed', 'Dentist', 'Loud hand dryer', 'Swimming']) {
  assert.equal(triggerClass(name), triggerClass(name));
  assert.notEqual(triggerSlot(name), HELPFUL_SLOT, `${name} does not borrow the "helped" hue`);
}
assert.equal(helpfulClass, `c-${HELPFUL_SLOT}`, 'responses share one hue');

// Colour never carries meaning by itself: the chip shows its name beside the dot.
const chip = html(<Chip tone={triggerClass('Homework')} selected onClick={() => {}}>Homework</Chip>);
assert.ok(chip.includes('chip--cat'), 'the chip is toned');
assert.ok(chip.includes('Homework'), 'and still says what it is');
assert.ok(chip.includes('aria-pressed="true"'), 'selection is announced, not just shaded');

const tonedBars = html(
  <RankedBars items={[{ id: 't', label: 'Tired', value: 3, tone: triggerClass('Tired') }]} />
);
assert.ok(tonedBars.includes('Tired') && tonedBars.includes('bar-dot'), 'bars label themselves too');

// No red anywhere in the categorical palette - nothing a child does is an error.
const colourCss = readFileSync('src/styles/colour.css', 'utf8');
const catHexes = [...colourCss.matchAll(/--cat-\d:\s*(#[0-9a-f]{6})/gi)].map((m) => m[1].toLowerCase());
assert.ok(catHexes.length >= 16, `both themes define the palette (${catHexes.length} values)`);
['#e34948', '#e66767', '#d03b3b', '#ff0000'].forEach((red) => {
  assert.ok(!catHexes.includes(red), `${red} is not in the palette`);
});
assert.ok(!/--cat-\d:\s*#(e|f)[0-9a-f]?[0-2]/i.test(colourCss), 'no alarm reds crept in');

console.log('all render checks passed');
