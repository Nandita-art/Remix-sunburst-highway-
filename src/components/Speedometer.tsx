interface SpeedometerProps {
  speedKmh: number;
  isBraking: boolean;
  isBoosting: boolean;
}

const MAX_SPEED = 320;
const START_ANGLE = 140; // degrees (bottom-left, 0° = 3 o'clock)
const SWEEP_ANGLE = 260; // total arc degrees clockwise to 400° (bottom-right)
const CX = 80;
const CY = 80;
const RADIUS = 60;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

const ARC_PATH = describeArc(CX, CY, RADIUS, START_ANGLE, START_ANGLE + SWEEP_ANGLE);
const ARC_LENGTH = 2 * Math.PI * RADIUS * (SWEEP_ANGLE / 360);

const TICKS = Array.from({ length: 17 }, (_, idx) => {
  const value = idx * 20;
  const fraction = value / MAX_SPEED;
  const angle = START_ANGLE + fraction * SWEEP_ANGLE;
  const isMajor = value % 40 === 0;
  const isRedline = value >= 240;
  const outer = polarToCartesian(CX, CY, RADIUS - 3, angle);
  const inner = polarToCartesian(CX, CY, RADIUS - (isMajor ? 11 : 7), angle);
  const labelPos = polarToCartesian(CX, CY, RADIUS - 21, angle);
  return { value, angle, isMajor, isRedline, outer, inner, labelPos };
});

export function Speedometer({ speedKmh, isBraking, isBoosting }: SpeedometerProps) {
  const clamped = Math.max(0, Math.min(MAX_SPEED, speedKmh));
  const fraction = clamped / MAX_SPEED;
  const needleAngle = START_ANGLE + fraction * SWEEP_ANGLE;
  const dashOffset = ARC_LENGTH * (1 - fraction);

  const arcColor = isBraking
    ? '#EF4444'
    : isBoosting || clamped >= 210
      ? '#F59E0B'
      : '#38BDF8';

  const statusText = isBraking ? 'BRAKE' : isBoosting ? 'BOOST' : 'KM/H';
  const statusClass = isBraking
    ? 'text-red-400'
    : isBoosting
      ? 'text-amber-300'
      : 'text-slate-400';

  return (
    <div
      className="pointer-events-auto shrink-0 flex flex-col items-center rounded-xl border border-white/15 bg-slate-900/90 px-2 pt-1.5 pb-1 sm:px-2.5 sm:pt-2 sm:pb-1.5 text-white shadow-xl"
      aria-label={`Speedometer: ${Math.round(clamped)} kilometers per hour${isBraking ? ', braking' : isBoosting ? ', boosting' : ''}`}
    >
      <div className="relative h-[78px] w-[88px] sm:h-[106px] sm:w-[118px]">
        <svg
          viewBox="0 0 160 144"
          className="h-full w-full overflow-visible"
          role="img"
          aria-hidden="true"
        >
          {/* Background Dial Track */}
          <path
            d={ARC_PATH}
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="8"
            strokeLinecap="round"
          />

          {/* Subtle Redline Zone Highlight (240 - 320 km/h) */}
          <path
            d={describeArc(
              CX,
              CY,
              RADIUS,
              START_ANGLE + (240 / MAX_SPEED) * SWEEP_ANGLE,
              START_ANGLE + SWEEP_ANGLE,
            )}
            fill="none"
            stroke="rgba(239,68,68,0.32)"
            strokeWidth="8"
            strokeLinecap="round"
          />

          {/* Active Speed Progress Arc */}
          <path
            d={ARC_PATH}
            fill="none"
            stroke={arcColor}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={ARC_LENGTH}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 75ms ease-out, stroke 150ms ease' }}
          />

          {/* Major & Minor Speed Ticks + Numeric Labels */}
          {TICKS.map((t) => (
            <g key={t.value}>
              <line
                x1={t.outer.x}
                y1={t.outer.y}
                x2={t.inner.x}
                y2={t.inner.y}
                stroke={
                  t.isRedline
                    ? 'rgba(248,113,113,0.85)'
                    : t.isMajor
                      ? 'rgba(248,250,252,0.8)'
                      : 'rgba(148,163,184,0.45)'
                }
                strokeWidth={t.isMajor ? 2 : 1.2}
                strokeLinecap="round"
              />
              {t.isMajor && (
                <text
                  x={t.labelPos.x}
                  y={t.labelPos.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={t.isRedline ? '#FCA5A5' : '#CBD5E1'}
                  fontSize="8.5"
                  fontWeight="700"
                  className="font-speed"
                >
                  {t.value}
                </text>
              )}
            </g>
          ))}

          {/* Rotating Analog Needle */}
          <g
            style={{
              transform: `rotate(${needleAngle}deg)`,
              transformOrigin: `${CX}px ${CY}px`,
              transition: 'transform 75ms ease-out',
            }}
          >
            <polygon
              points={`${CX - 8},${CY - 2.4} ${CX + 50},${CY - 0.8} ${CX + 50},${CY + 0.8} ${CX - 8},${CY + 2.4}`}
              fill={isBraking ? '#F87171' : '#FBBF24'}
            />
          </g>

          {/* Center Cap */}
          <circle cx={CX} cy={CY} r="6.5" fill="#1E293B" stroke="#E2E8F0" strokeWidth="2" />
        </svg>

        {/* Crisp Digital Readout & Mode Label */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0.5 flex flex-col items-center">
          <span
            className={`font-speed text-base sm:text-xl font-bold leading-none tracking-tight ${
              isBraking ? 'text-red-400' : isBoosting ? 'text-amber-300' : 'text-white'
            }`}
          >
            {Math.round(clamped)}
          </span>
          <span className={`font-speed mt-0.5 text-[8px] sm:text-[9px] font-bold tracking-widest ${statusClass}`}>
            {statusText}
          </span>
        </div>
      </div>
    </div>
  );
}
