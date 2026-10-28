import { useState } from 'react';
import { t } from '../i18n.js';

const W = 600;
const H = 220;
const PAD = { top: 12, right: 12, bottom: 28, left: 36 };

/** Round the top of the y axis to a tidy number so the ticks are readable. */
function niceMax(value) {
  if (value <= 4) return 4;
  const step = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / step) * step;
}

const shortDate = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;

/**
 * Line chart drawn as plain SVG. Series differ by colour and dash style, there is a legend in HTML, and
 * a table of the same numbers can be shown for people who cannot read the picture.
 */
export function LineChart({ labels, series, summary }) {
  const [table, setTable] = useState(false);
  const top = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const x = (i) => PAD.left + (i * (W - PAD.left - PAD.right)) / Math.max(1, labels.length - 1);
  const y = (v) => PAD.top + (1 - v / top) * (H - PAD.top - PAD.bottom);
  const ticks = [0, top / 2, top];

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} className="chart__svg">
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(tick)}
              y2={y(tick)}
              className="chart__grid"
            />
            <text x={PAD.left - 6} y={y(tick) + 4} textAnchor="end" className="chart__label">
              {tick}
            </text>
          </g>
        ))}
        {labels.map(
          (label, i) =>
            i % 3 === 0 && (
              <text key={label} x={x(i)} y={H - 8} textAnchor="middle" className="chart__label">
                {shortDate(label)}
              </text>
            ),
        )}
        {series.map((s) => (
          <g key={s.key}>
            <polyline
              fill="none"
              stroke={s.color}
              strokeWidth="3"
              strokeDasharray={s.dash}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
            />
            {s.values.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r="3" fill={s.color} />
            ))}
          </g>
        ))}
      </svg>
      <ul className="chart__legend">
        {series.map((s) => (
          <li key={s.key}>
            <svg width="28" height="10" aria-hidden="true">
              <line
                x1="0"
                x2="28"
                y1="5"
                y2="5"
                stroke={s.color}
                strokeWidth="3"
                strokeDasharray={s.dash}
              />
            </svg>
            {s.label}
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="linkbtn"
        aria-expanded={table}
        onClick={() => setTable(!table)}
      >
        {table ? t('Hide table') : t('Show as table')}
      </button>
      {table && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{t('Day')}</th>
                {series.map((s) => (
                  <th key={s.key} scope="col">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {labels.map((label, i) => (
                <tr key={label}>
                  <th scope="row">{shortDate(label)}</th>
                  {series.map((s) => (
                    <td key={s.key}>{s.values[i]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** One stacked horizontal bar with a legend that carries the numbers. */
export function StackBar({ segments, summary }) {
  const total = segments.reduce((n, s) => n + s.value, 0);
  return (
    <div className="chart">
      <div className="stackbar" role="img" aria-label={summary}>
        {total === 0 && <span className="stackbar__empty" />}
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <span
              key={s.key}
              className="stackbar__part"
              style={{ flexGrow: s.value, background: s.color }}
            />
          ))}
      </div>
      <ul className="chart__legend chart__legend--count">
        {segments.map((s) => (
          <li key={s.key}>
            <span className="swatch" style={{ background: s.color }} aria-hidden="true" />
            {s.label} <strong className="mono">{s.value}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal bars, one per row, with the value written out. */
export function BarList({ rows }) {
  return (
    <ul className="barlist">
      {rows.map((row) => (
        <li key={row.key} className={row.muted ? 'is-muted' : undefined}>
          <span className="barlist__name">
            {row.label}
            {row.chip && <span className="chip chip--mute">{row.chip}</span>}
          </span>
          <span className="barlist__track" aria-hidden="true">
            <span
              className="barlist__fill"
              style={{ width: `${Math.round((row.value ?? 0) * 100)}%` }}
            />
          </span>
          <span className="mono small barlist__value">{row.text}</span>
        </li>
      ))}
    </ul>
  );
}
