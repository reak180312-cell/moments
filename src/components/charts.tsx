import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Small chart set, built to one spec so every chart in the app reads the same:
 * thin marks, one calm hue, hairline grid, a value on the extreme rather than
 * on every point, a hover read-out, and a "Show the numbers" table so nothing
 * is ever gated behind colour or pointer precision.
 */

export interface Point { label: string; value: number | null; hint?: string }

function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(320);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)));
    ro.observe(el);
    setWidth(Math.max(240, el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const steps = [1, 2, 2.5, 5, 10];
  for (const s of steps) if (value <= s * pow) return s * pow;
  return 10 * pow;
}

export function ChartFrame({
  title, subtitle, children, table, footnote,
}: { title: string; subtitle?: string; children: ReactNode; table?: ReactNode; footnote?: string }) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section className="card chart-card" aria-label={title}>
      <header className="chart-head">
        <h3 className="chart-title">{title}</h3>
        {subtitle && <p className="chart-sub">{subtitle}</p>}
      </header>
      {showTable && table ? table : children}
      {footnote && <p className="chart-sub">{footnote}</p>}
      {table && (
        <button
          type="button" className="btn btn--plain btn--sm"
          style={{ justifySelf: 'start' }}
          onClick={() => setShowTable((v) => !v)}
          aria-expanded={showTable}
        >
          {showTable ? 'Show the chart' : 'Show the numbers'}
        </button>
      )}
    </section>
  );
}

export function DataTable({
  columns, rows,
}: { columns: string[]; rows: (string | number)[][] }) {
  return (
    <div style={{ maxHeight: '18rem', overflow: 'auto' }}>
      <table className="chart-table">
        <thead>
          <tr>{columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (j === 0 ? <th key={j} scope="row">{cell}</th> : <td key={j}>{cell}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------- columns */

export function ColumnChart({
  data, height = 160, format = (v: number) => String(v), labelEvery,
  emphasiseLast, ariaSummary, colour = 'var(--series-1)',
}: {
  data: Point[]; height?: number; format?: (v: number) => string;
  labelEvery?: number; emphasiseLast?: boolean; ariaSummary?: string; colour?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const padL = 30;
  const padR = 8;
  const padB = 22;
  const padT = 10;
  const plotW = Math.max(40, width - padL - padR);
  const plotH = height - padT - padB;

  const values = data.map((d) => d.value ?? 0);
  const max = niceMax(Math.max(...values, 1));
  const band = plotW / Math.max(1, data.length);
  const barW = Math.min(24, Math.max(3, band - Math.max(2, band * 0.25)));
  const step = labelEvery ?? Math.max(1, Math.ceil(data.length / (width < 420 ? 5 : 9)));
  const peak = values.indexOf(Math.max(...values));

  const x = (i: number) => padL + band * i + (band - barW) / 2;
  const y = (v: number) => padT + plotH - (v / max) * plotH;

  return (
    <div className="chart-wrap" ref={ref}>
      <svg
        className="chart-svg" width={width} height={height}
        role="img" aria-label={ariaSummary ?? 'Column chart'}
        onMouseLeave={() => setHover(null)}
      >
        {[0, max / 2, max].map((tick) => (
          <g key={tick}>
            <line x1={padL} x2={width - padR} y1={y(tick)} y2={y(tick)} stroke="var(--grid)" strokeWidth="1" />
            <text x={padL - 6} y={y(tick) + 4} textAnchor="end" fontSize="10" fill="var(--ink-3)">
              {Number.isInteger(tick) ? tick : tick.toFixed(1)}
            </text>
          </g>
        ))}

        {data.map((d, i) => {
          const v = d.value ?? 0;
          const h = Math.max(v > 0 ? 3 : 0, plotH - (y(v) - padT));
          const isPeak = emphasiseLast ? i === data.length - 1 : i === peak && v > 0;
          return (
            <g key={d.label + i}>
              <rect
                x={padL + band * i} y={padT} width={band} height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
              />
              {v > 0 && (
                <rect
                  x={x(i)} y={y(v)} width={barW} height={h}
                  rx={Math.min(4, barW / 2)}
                  fill={isPeak ? colour : `color-mix(in srgb, ${colour} 52%, transparent)`}
                  pointerEvents="none"
                />
              )}
              {i % step === 0 && (
                <text
                  x={padL + band * i + band / 2} y={height - 6}
                  textAnchor="middle" fontSize="10" fill="var(--ink-3)"
                >
                  {d.label}
                </text>
              )}
            </g>
          );
        })}

        <line x1={padL} x2={width - padR} y1={y(0)} y2={y(0)} stroke="var(--axis)" strokeWidth="1" />
      </svg>

      {hover !== null && data[hover] && (
        <div
          className="chart-tip"
          style={{ left: padL + band * hover + band / 2, top: y(data[hover].value ?? 0) }}
        >
          {data[hover].label}: {format(data[hover].value ?? 0)}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- line */

export function LineChart({
  data, height = 170, format = (v: number) => String(v), domain, ariaSummary, labelEvery,
  colour = 'var(--series-1)',
}: {
  data: Point[]; height?: number; format?: (v: number) => string;
  domain?: [number, number]; ariaSummary?: string; labelEvery?: number; colour?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const padL = 30;
  const padR = 14;
  const padB = 22;
  const padT = 14;
  const plotW = Math.max(40, width - padL - padR);
  const plotH = height - padT - padB;

  const present = data.map((d, i) => ({ ...d, i })).filter((d) => d.value !== null) as (Point & { i: number; value: number })[];
  const lo = domain ? domain[0] : 0;
  const hi = domain ? domain[1] : niceMax(Math.max(...present.map((p) => p.value), 1));
  const step = labelEvery ?? Math.max(1, Math.ceil(data.length / (width < 420 ? 4 : 8)));

  const x = (i: number) => padL + (data.length <= 1 ? plotW / 2 : (plotW * i) / (data.length - 1));
  const y = (v: number) => padT + plotH - ((v - lo) / (hi - lo || 1)) * plotH;

  const path = present.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${x(p.i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = present.length
    ? `${path} L${x(present[present.length - 1].i).toFixed(1)},${y(lo)} L${x(present[0].i).toFixed(1)},${y(lo)} Z`
    : '';
  const last = present[present.length - 1];

  return (
    <div className="chart-wrap" ref={ref}>
      <svg
        className="chart-svg" width={width} height={height}
        role="img" aria-label={ariaSummary ?? 'Line chart'}
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const rel = e.clientX - rect.left - padL;
          const idx = Math.round((rel / plotW) * (data.length - 1));
          setHover(Math.min(data.length - 1, Math.max(0, idx)));
        }}
        onMouseLeave={() => setHover(null)}
      >
        {[lo, (lo + hi) / 2, hi].map((tick) => (
          <g key={tick}>
            <line x1={padL} x2={width - padR} y1={y(tick)} y2={y(tick)} stroke="var(--grid)" strokeWidth="1" />
            <text x={padL - 6} y={y(tick) + 4} textAnchor="end" fontSize="10" fill="var(--ink-3)">
              {Number.isInteger(tick) ? tick : tick.toFixed(1)}
            </text>
          </g>
        ))}

        {area && <path d={area} fill={`color-mix(in srgb, ${colour} 12%, transparent)`} />}
        {path && <path d={path} fill="none" stroke={colour} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}

        {present.map((p) => (
          <circle
            key={p.i} cx={x(p.i)} cy={y(p.value)} r={present.length > 30 ? 0 : 4}
            fill={colour} stroke="var(--surface)" strokeWidth="2"
          />
        ))}

        {last && (
          <text
            x={Math.min(width - 4, x(last.i) + 8)} y={y(last.value) - 10}
            textAnchor="end" fontSize="11" fontWeight="650" fill="var(--ink)"
          >
            {format(last.value)}
          </text>
        )}

        {hover !== null && data[hover]?.value !== null && (
          <line
            x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + plotH}
            stroke="var(--axis)" strokeWidth="1"
          />
        )}

        {data.map((d, i) => (i % step === 0 ? (
          <text key={d.label + i} x={x(i)} y={height - 6} textAnchor="middle" fontSize="10" fill="var(--ink-3)">
            {d.label}
          </text>
        ) : null))}
      </svg>

      {hover !== null && data[hover] && data[hover].value !== null && (
        <div className="chart-tip" style={{ left: x(hover), top: y(data[hover].value as number) }}>
          {data[hover].label}: {format(data[hover].value as number)}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------- ranked bar list */

export function RankedBars({
  items, format = (v: number) => String(v), max: maxOverride, onSelect,
}: {
  items: { id?: string; label: string; value: number; sub?: string; tone?: string }[];
  format?: (v: number) => string;
  max?: number;
  onSelect?: (id: string) => void;
}) {
  const max = maxOverride ?? Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="stack" style={{ gap: '0.625rem' }}>
      {items.map((item) => {
        const row = (
          <>
            <span className="bar-label" title={item.label}>
              {item.tone && <span className="bar-dot" aria-hidden="true" />}
              {item.label}
            </span>
            <span className="bar-track">
              <span
                className="bar-fill"
                style={{ width: `${Math.max(3, (item.value / max) * 100)}%` }}
              />
            </span>
            <span className="bar-value">{format(item.value)}</span>
          </>
        );
        return onSelect && item.id ? (
          <button
            key={item.id} type="button" className={`bar-row ${item.tone ?? ''}`}
            style={{ background: 'none', border: 0, padding: '0.125rem 0', cursor: 'pointer', textAlign: 'left' }}
            onClick={() => onSelect(item.id!)}
            aria-label={`${item.label}, ${format(item.value)}`}
          >
            {row}
          </button>
        ) : (
          <div className={`bar-row ${item.tone ?? ''}`} key={item.label}>{row}</div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------ sparkline */

export function Sparkline({ values, width = 72, height = 22 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * (width - 2) + 1,
    height - 2 - (v / max) * (height - 4),
  ]);
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height} aria-hidden="true" style={{ display: 'block' }}>
      <path d={d} fill="none" stroke="color-mix(in srgb, var(--series-1) 45%, transparent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.5" fill="var(--series-1)" />
    </svg>
  );
}

/* ------------------------------------------------- two-period comparison */

export function ComparisonBars({
  rows, currentLabel, previousLabel,
}: {
  rows: { label: string; current: number | null; previous: number | null; format: (v: number | null) => string }[];
  currentLabel: string;
  previousLabel: string;
}) {
  return (
    <div className="stack">
      <div className="chart-legend">
        <span><i style={{ background: 'var(--series-1)' }} />{currentLabel}</span>
        <span><i style={{ background: 'color-mix(in srgb, var(--ink-3) 45%, transparent)' }} />{previousLabel}</span>
      </div>
      {rows.map((row) => {
        const max = Math.max(row.current ?? 0, row.previous ?? 0, 1);
        return (
          <div key={row.label} className="stack" style={{ gap: '0.25rem' }}>
            <div className="row-between">
              <span style={{ fontSize: '0.875rem', color: 'var(--ink-2)' }}>{row.label}</span>
              <span style={{ fontSize: '0.875rem', fontWeight: 650 }}>{row.format(row.current)}</span>
            </div>
            <div style={{ display: 'grid', gap: '2px' }}>
              <span className="bar-track" style={{ height: '0.625rem' }}>
                <span className="bar-fill" style={{ width: `${((row.current ?? 0) / max) * 100}%` }} />
              </span>
              <span className="bar-track" style={{ height: '0.625rem' }}>
                <span
                  className="bar-fill"
                  style={{
                    width: `${((row.previous ?? 0) / max) * 100}%`,
                    background: 'color-mix(in srgb, var(--ink-3) 45%, transparent)',
                  }}
                />
              </span>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--ink-3)' }}>
              {previousLabel}: {row.format(row.previous)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Direction marker. Never labelled good or bad - only the direction. */
export function TrendMark({ direction, children }: { direction: 'up' | 'down' | 'flat' | 'none'; children?: ReactNode }) {
  const symbol = { up: '↑', down: '↓', flat: '→', none: '·' }[direction];
  const word = { up: 'increased', down: 'decreased', flat: 'stayed similar', none: 'no comparison available' }[direction];
  return (
    <span className="trend" style={{ color: 'var(--ink-2)' }}>
      <span className="arrow" aria-hidden="true">{symbol}</span>
      <span className="sr-only">{word}</span>
      {children}
    </span>
  );
}

/** Live-region announcement used when a chart's range changes. */
export function ChartAnnouncer({ message }: { message: string }) {
  const [text, setText] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setText(message), 250);
    return () => clearTimeout(t);
  }, [message]);
  return <span className="sr-only" aria-live="polite">{text}</span>;
}
