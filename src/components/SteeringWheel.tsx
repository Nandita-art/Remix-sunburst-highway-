import { useCallback, useRef, useState } from 'react';

interface SteeringWheelIconProps {
  className?: string;
}

/**
 * Crisp racing steering wheel icon for HUD buttons and status indicators.
 */
export function SteeringWheelIcon({ className = 'h-4 w-4' }: SteeringWheelIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.2" />
      <path d="M3.6 10.2h5.2a3.3 3.3 0 0 1 6.4 0h5.2" />
      <path d="M12 14.2V21" />
    </svg>
  );
}

interface SteeringWheelControlProps {
  steerRatio: number; // -1 (left) to +1 (right)
  carColor: string;
  autoCruise: boolean;
  rotatedPortrait: boolean;
  onSteerChange: (steer: number) => void;
}

/**
 * BGMI-style interactive thumb steering wheel for the bottom-left cockpit zone.
 * Supports dragging horizontally across the wheel or holding either side of the rim,
 * and rotates smoothly in real time with steering input.
 */
export function SteeringWheelControl({
  steerRatio,
  carColor,
  autoCruise,
  rotatedPortrait,
  onSteerChange,
}: SteeringWheelControlProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activePointerId = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [localSteer, setLocalSteer] = useState(0);

  const computeSteerFromPointer = useCallback(
    (clientX: number, clientY: number, isInitialPress: boolean): number => {
      const el = containerRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width * 0.5;
      const centerY = rect.top + rect.height * 0.5;

      // When the stage is CSS-rotated 90deg clockwise on a portrait viewport,
      // stage horizontal (+X right) maps along screen +Y.
      const dx = rotatedPortrait ? clientY - centerY : clientX - centerX;
      const effectiveRadius = (rotatedPortrait ? rect.height : rect.width) * 0.42;

      if (Math.abs(dx) < 4) return 0;
      const normalized = Math.max(-1, Math.min(1, dx / Math.max(24, effectiveRadius)));
      if (isInitialPress) {
        // Give a responsive initial turn if tapping left/right rim
        return Math.sign(normalized) * Math.max(0.55, Math.abs(normalized));
      }
      return normalized;
    },
    [rotatedPortrait],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.stopPropagation();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore pointer capture restriction
      }
      activePointerId.current = e.pointerId;
      const next = computeSteerFromPointer(e.clientX, e.clientY, true);
      setDragging(true);
      setLocalSteer(next);
      onSteerChange(next);
    },
    [computeSteerFromPointer, onSteerChange],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (activePointerId.current !== e.pointerId) return;
      e.stopPropagation();
      const next = computeSteerFromPointer(e.clientX, e.clientY, false);
      setLocalSteer(next);
      onSteerChange(next);
    },
    [computeSteerFromPointer, onSteerChange],
  );

  const releaseSteer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (activePointerId.current !== e.pointerId) return;
      e.stopPropagation();
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // ignore
      }
      activePointerId.current = null;
      setDragging(false);
      setLocalSteer(0);
      onSteerChange(0);
    },
    [onSteerChange],
  );

  const displaySteer = dragging ? localSteer : steerRatio;
  const wheelDegrees = Math.max(-62, Math.min(62, displaySteer * 58));

  return (
    <div className="pointer-events-auto flex flex-col items-center gap-1 select-none">
      <div
        ref={containerRef}
        role="slider"
        tabIndex={0}
        aria-label="Steering wheel"
        aria-valuemin={-100}
        aria-valuemax={100}
        aria-valuenow={Math.round(displaySteer * 100)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={releaseSteer}
        onPointerCancel={releaseSteer}
        onKeyDown={(e) => {
          if (e.code === 'ArrowLeft' || e.code === 'KeyA') onSteerChange(-1);
          if (e.code === 'ArrowRight' || e.code === 'KeyD') onSteerChange(1);
        }}
        onKeyUp={(e) => {
          if (
            e.code === 'ArrowLeft' ||
            e.code === 'KeyA' ||
            e.code === 'ArrowRight' ||
            e.code === 'KeyD'
          ) {
            onSteerChange(0);
          }
        }}
        className={`relative h-[108px] w-[108px] sm:h-[132px] sm:w-[132px] touch-none cursor-grab active:cursor-grabbing rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-amber-400 ${
          dragging
            ? 'border-amber-400/75 bg-slate-900/75 shadow-xl'
            : 'border-white/20 bg-slate-900/60 shadow-lg hover:border-white/35'
        }`}
      >
        {/* Subtle Left / Right Steering Direction Cues */}
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] font-bold transition-colors ${
            displaySteer < -0.15 ? 'text-amber-300' : 'text-slate-400/70'
          }`}
        >
          ◀
        </span>
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] font-bold transition-colors ${
            displaySteer > 0.15 ? 'text-amber-300' : 'text-slate-400/70'
          }`}
        >
          ▶
        </span>

        {/* Rotating Sports Steering Wheel SVG */}
        <svg
          viewBox="0 0 120 120"
          className="h-full w-full p-1.5"
          style={{
            transform: `rotate(${wheelDegrees.toFixed(1)}deg)`,
            transition: dragging ? 'none' : 'transform 90ms ease-out',
          }}
          aria-hidden="true"
        >
          {/* Outer Grippy Rim */}
          <circle
            cx="60"
            cy="60"
            r="46"
            fill="none"
            stroke="#0F172A"
            strokeWidth="12"
          />
          <circle
            cx="60"
            cy="60"
            r="46"
            fill="none"
            stroke="#334155"
            strokeWidth="8.5"
          />
          {/* Left & Right Ergonomic Thumb Grips */}
          <path
            d="M 16 47 A 46 46 0 0 0 16 73"
            fill="none"
            stroke="#1E293B"
            strokeWidth="11"
            strokeLinecap="round"
          />
          <path
            d="M 104 47 A 46 46 0 0 1 104 73"
            fill="none"
            stroke="#1E293B"
            strokeWidth="11"
            strokeLinecap="round"
          />
          {/* 12 o'clock Racing Centering Stripe */}
          <path
            d="M 54 14.5 A 46 46 0 0 1 66 14.5"
            fill="none"
            stroke="#FBBF24"
            strokeWidth="8.5"
            strokeLinecap="round"
          />

          {/* Three Racing Spokes */}
          <path
            d="M 19 56 L 46 56 L 46 65 L 20 66 Z"
            fill="#64748B"
            stroke="#0F172A"
            strokeWidth="1.5"
          />
          <path
            d="M 101 56 L 74 56 L 74 65 L 100 66 Z"
            fill="#64748B"
            stroke="#0F172A"
            strokeWidth="1.5"
          />
          <path
            d="M 54 73 L 66 73 L 64 103 L 56 103 Z"
            fill="#475569"
            stroke="#0F172A"
            strokeWidth="1.5"
          />

          {/* Center Hub & Horn Emblem */}
          <circle
            cx="60"
            cy="60"
            r="16.5"
            fill="#1E293B"
            stroke="#94A3B8"
            strokeWidth="2.5"
          />
          <circle
            cx="60"
            cy="60"
            r="9.5"
            fill={carColor}
            stroke="#FFFFFF"
            strokeWidth="1.6"
            opacity="0.92"
          />
          <circle cx="60" cy="60" r="3" fill="#0F172A" />
        </svg>
      </div>

      <span className="font-speed text-[10px] font-bold tracking-wider text-slate-200 drop-shadow">
        {dragging ? 'STEERING' : autoCruise ? 'AUTO STEER' : 'STEER'}
      </span>
    </div>
  );
}
