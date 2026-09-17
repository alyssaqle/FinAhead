import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { RunwayScale, RunwaySeries } from '../domain/buildRunwaySeries'
import { formatCurrency } from '../domain/money'
import { formatShortDate } from '../domain/dateUtils'

interface CashRunwayChartProps {
  /** The forecast being drawn. Points come from the forecast engine. */
  series: RunwaySeries
  /**
   * The forecast before a scenario was added, drawn as a restrained dashed
   * line on the same vertical scale for comparison.
   */
  baseline?: RunwaySeries
  /** Overrides the vertical scale, so two charts can share one. */
  scale?: RunwayScale
  /** `hero` is the full surface; `compact` is the preview. */
  variant?: 'hero' | 'compact'
  /** Names the chart for assistive technology. */
  title: string
}

const HEIGHT = { hero: 190, compact: 120 }
const PAD_X = { hero: 26, compact: 18 }
const PAD_TOP = 16
const PAD_BOTTOM = 26
const FALLBACK_WIDTH = 640

/**
 * The cash runway: today, the obligations that come off the balance, the
 * projected low, then payday.
 *
 * Every coordinate is derived from the series at render time — there are no
 * hard-coded paths, balances or positions, and the chart performs no financial
 * arithmetic of its own.
 *
 * The graphic is `aria-hidden`; the interactive layer above it is a row of real
 * `<button>` elements, one per event, so hover, keyboard focus and touch all go
 * through the same code path and the same state. A visually hidden list repeats
 * every figure as text, so nothing here is only available by pointing at it.
 */
export function CashRunwayChart({
  series,
  baseline,
  scale,
  variant = 'hero',
  title,
}: CashRunwayChartProps) {
  const headingId = useId()
  const plotRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(FALLBACK_WIDTH)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  // Measure so markers stay circular and the hit targets line up exactly with
  // the drawn points at any width.
  useLayoutEffect(() => {
    const element = plotRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(entry.contentRect.width, 240))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // A scenario being added or removed changes the points underneath; drop any
  // selection rather than leaving it pointing at a different event.
  useEffect(() => setActiveIndex(null), [series])

  const height = HEIGHT[variant]
  const padX = PAD_X[variant]
  const { points, lowIndex, paydayIndex } = series

  const bounds = scale ?? { min: series.min, max: series.max }
  const top = Math.max(bounds.max, 0)
  const bottom = bounds.min
  const span = top - bottom || 1

  const x = (index: number) =>
    points.length === 1
      ? width / 2
      : padX + (index / (points.length - 1)) * (width - padX * 2)
  const y = (balance: number) =>
    PAD_TOP + (1 - (balance - bottom) / span) * (height - PAD_TOP - PAD_BOTTOM)

  const coords = points.map((point, index) => ({ x: x(index), y: y(point.balance) }))
  const line = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')
  const area = `${coords[0].x},${height - PAD_BOTTOM} ${line} ${
    coords[coords.length - 1].x
  },${height - PAD_BOTTOM}`

  const zeroY = bottom < 0 ? y(0) : null

  /*
   * The comparison line is placed by matching each baseline point to the same
   * event in the main series, not by its own index. A scenario adds a point,
   * so index-for-index would slide the whole dashed line sideways and invite a
   * reader to compare two different dates.
   */
  const baselineLine = baseline
    ? baseline.points
        .map((point) => {
          const matched = points.findIndex((candidate) => candidate.id === point.id)
          const anchor =
            matched >= 0
              ? matched
              : points.findIndex((candidate) => candidate.date >= point.date)
          return `${x(anchor >= 0 ? anchor : points.length - 1).toFixed(1)},${y(
            point.balance,
          ).toFixed(1)}`
        })
        .join(' ')
    : null

  // Default state is the projected low; hover, focus and tap replace it.
  const shownIndex = activeIndex ?? lowIndex
  const shown = points[shownIndex]
  const isDefaultState = activeIndex === null

  /*
   * Today, the low and payday are named under the axis; other events keep a
   * small marker only. The low and payday are often adjacent, so a label is
   * dropped rather than allowed to collide — the projected low wins, because
   * it is what the screen is about.
   */
  // Narrow charts drop the dates from the axis; below that, a label is dropped
  // rather than overlapped. On a wide chart the projected low outranks payday;
  // on a narrow one payday wins, because the low is already the headline.
  const terseLabels = variant === 'compact' || width < 560
  const MIN_LABEL_GAP = terseLabels ? 62 : 116
  const axisLabels = [
    { index: 0, text: 'Today', priority: 1 },
    ...(lowIndex !== 0
      ? [{ index: lowIndex, text: 'Projected low', priority: terseLabels ? 2 : 3 }]
      : []),
    ...(paydayIndex !== null && paydayIndex !== lowIndex
      ? [{ index: paydayIndex, text: 'Payday', priority: terseLabels ? 3 : 2 }]
      : []),
  ]
    .sort((a, b) => b.priority - a.priority)
    .reduce<{ index: number; text: string }[]>((kept, candidate) => {
      const collides = kept.some(
        (label) => Math.abs(x(label.index) - x(candidate.index)) < MIN_LABEL_GAP,
      )
      return collides ? kept : [...kept, candidate]
    }, [])
    .sort((a, b) => a.index - b.index)

  return (
    <figure className={`runway runway--${variant}`} aria-labelledby={headingId}>
      <figcaption id={headingId} className="visually-hidden">
        {title}
      </figcaption>

      {/* Headline — always visible, so the figures are never hover-only. */}
      <div className="runway__headline">
        <p className="runway__headline-label">
          {isDefaultState ? 'Projected low before payday' : shown.headline}
        </p>
        <p
          className="runway__headline-amount tabular"
          data-negative={shown.balance < 0}
          key={shownIndex}
        >
          {formatCurrency(shown.balance)}
        </p>
        <p className="runway__headline-detail">{shown.detail}</p>
      </div>

      <div className="runway__plot" ref={plotRef} style={{ height }}>
        <svg
          className="runway__svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          aria-hidden="true"
          focusable="false"
        >
          {zeroY !== null ? (
            <>
              <line
                className="runway__zero"
                x1={padX - 8}
                x2={width - padX + 8}
                y1={zeroY}
                y2={zeroY}
              />
              <text className="runway__zero-label" x={padX - 8} y={zeroY - 5}>
                $0
              </text>
            </>
          ) : null}

          {baselineLine ? (
            <polyline className="runway__baseline" points={baselineLine} />
          ) : null}

          <polygon className="runway__area" points={area} />
          <polyline className="runway__line" points={line} />

          {/* Vertical guide for the active point. */}
          {!isDefaultState ? (
            <line
              className="runway__guide"
              x1={coords[shownIndex].x}
              x2={coords[shownIndex].x}
              y1={PAD_TOP - 8}
              y2={height - PAD_BOTTOM}
            />
          ) : null}

          {/* Emphasised segment into the active point. */}
          {!isDefaultState && shownIndex > 0 ? (
            <polyline
              className="runway__segment"
              points={`${coords[shownIndex - 1].x},${coords[shownIndex - 1].y} ${
                coords[shownIndex].x
              },${coords[shownIndex].y}`}
            />
          ) : null}

          {points.map((point, index) => {
            const isActive = index === shownIndex
            const isNamed = point.isLowPoint || point.isPayday || index === 0
            return (
              <circle
                key={point.id}
                className="runway__dot"
                cx={coords[index].x}
                cy={coords[index].y}
                r={isActive ? 6.5 : isNamed ? 5 : 3.5}
                data-low={point.isLowPoint}
                data-payday={point.isPayday}
                data-scenario={point.isScenario}
                data-active={isActive}
                data-negative={point.balance < 0}
              />
            )
          })}

          {axisLabels.map((label) => (
            <text
              key={label.text}
              className="runway__axis"
              x={Math.min(Math.max(coords[label.index].x, 22), width - 22)}
              y={height - 8}
              textAnchor="middle"
              data-emphasis={label.text === 'Projected low'}
            >
              {terseLabels
                ? label.text
                : `${label.text} · ${formatShortDate(points[label.index].date)}`}
            </text>
          ))}
        </svg>

        {/*
          Interaction layer: one real button per point, full plot height and at
          least a finger wide, so touch does not require hitting the dot.
        */}
        <div
          className="runway__hits"
          onPointerLeave={() => setActiveIndex(null)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) {
              setActiveIndex(null)
            }
          }}
        >
          {points.map((point, index) => (
            <button
              key={point.id}
              type="button"
              className="runway__hit"
              style={{
                left: `${(coords[index].x / width) * 100}%`,
                width: `${Math.max((width / points.length / width) * 100, 9)}%`,
              }}
              aria-pressed={index === shownIndex}
              aria-label={point.description}
              /*
               * Selection follows real pointer movement rather than
               * `pointerenter`. Navigating with the mouse at rest over a button
               * fires a synthetic enter on whatever lands underneath it, which
               * would open the forecast with an arbitrary point selected
               * instead of the projected low.
               */
              onPointerMove={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
              onClick={() => setActiveIndex(index)}
            >
              <span className="runway__hit-ring" aria-hidden="true" />
            </button>
          ))}
        </div>

        {!isDefaultState ? (
          <div
            className="runway__tooltip"
            role="status"
            style={{
              left: `${Math.min(
                Math.max((coords[shownIndex].x / width) * 100, 16),
                84,
              )}%`,
            }}
          >
            <span className="runway__tooltip-label">{shown.label}</span>
            <span className="tabular">{formatCurrency(shown.balance)}</span>
          </div>
        ) : null}
      </div>

      {/* Text equivalent: the same figures, readable without the graphic. */}
      <ul className="visually-hidden">
        {points.map((point) => (
          <li key={point.id}>{point.description}</li>
        ))}
      </ul>
    </figure>
  )
}
