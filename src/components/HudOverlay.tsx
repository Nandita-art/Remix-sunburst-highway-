import { useState } from 'react';
import {
  Award,
  Camera,
  ChevronUp,
  CircleStop,
  CloudLightning,
  CloudRain,
  CloudSun,
  Coins,
  Eye,
  EyeOff,
  Flag,
  Flame,
  Fuel,
  Gauge,
  Gem,
  Maximize2,
  Minimize2,
  Minus,
  Moon,
  Plus,
  RotateCcw,
  RotateCw,
  SlidersHorizontal,
  Smartphone,
  Sun,
  Sunrise,
  Sunset,
  Timer,
  Trophy,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import type {
  CameraPreset,
  HighwayControlsState,
  HighwayTelemetry,
  TimeOfDayLabel,
  TimeOfDayMode,
  WeatherLabel,
  WeatherMode,
} from '../three/HighwayScene';
import { Speedometer } from './Speedometer';
import { SteeringWheelControl, SteeringWheelIcon } from './SteeringWheel';

interface LevelUpNotice {
  level: number;
  placement?: number;
  completedLevel?: number;
  timeBonus?: number;
}

interface HudOverlayProps {
  controls: HighwayControlsState;
  telemetry: HighwayTelemetry;
  hudCollapsed: boolean;
  levelUpNotice: LevelUpNotice | null;
  timeUpNotice: number | null;
  achievementNotice: { title: string; detail: string } | null;
  tiltEnabled: boolean;
  rotatedPortrait: boolean;
  isPortraitViewport: boolean;
  isFullscreen: boolean;
  onToggleTilt: () => void;
  onToggleHorizontal: () => void;
  onToggleCollapse: () => void;
  onUpdateControls: (patch: Partial<HighwayControlsState>) => void;
  onWheelSteer: (steer: number) => void;
  onGasChange: (pressed: boolean) => void;
  onTriggerBooster: () => void;
  onResetProgress: () => void;
}

function formatOrdinal(n: number): string {
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  return `${n}th`;
}

function formatLevelTimer(seconds: number): string {
  const s = Math.max(0, seconds);
  if (s < 10) return `${s.toFixed(1)}s`;
  if (s < 60) return `${Math.ceil(s)}s`;
  const mins = Math.floor(s / 60);
  const rem = Math.floor(s % 60);
  return `${mins}:${String(rem).padStart(2, '0')}`;
}

const CAR_COLORS: Array<{ label: string; hex: string }> = [
  { label: 'Coral Red', hex: '#FF4757' },
  { label: 'Sunburst Gold', hex: '#F59E0B' },
  { label: 'Ocean Cyan', hex: '#0EA5E9' },
  { label: 'Emerald Mint', hex: '#10B981' },
  { label: 'Cobalt Violet', hex: '#8B5CF6' },
];

const CAMERA_OPTIONS: Array<{ id: CameraPreset; label: string }> = [
  { id: 'chase', label: 'Chase' },
  { id: 'hood', label: 'Hood' },
  { id: 'scenic', label: 'Scenic' },
];

const TIME_OPTIONS: Array<{ id: TimeOfDayMode; label: string }> = [
  { id: 'auto', label: 'Cycle' },
  { id: 'day', label: 'Day' },
  { id: 'sunset', label: 'Dusk' },
  { id: 'night', label: 'Night' },
];

const WEATHER_OPTIONS: Array<{ id: WeatherMode; label: string }> = [
  { id: 'auto', label: 'Auto' },
  { id: 'clear', label: 'Clear' },
  { id: 'rain', label: 'Rain' },
  { id: 'storm', label: 'Storm' },
];

function TimePhaseIcon({ label }: { label: TimeOfDayLabel }) {
  if (label === 'Night') {
    return <Moon className="h-3.5 w-3.5 text-sky-300" aria-hidden="true" />;
  }
  if (label === 'Sunset') {
    return <Sunset className="h-3.5 w-3.5 text-orange-300" aria-hidden="true" />;
  }
  if (label === 'Dawn') {
    return <Sunrise className="h-3.5 w-3.5 text-amber-200" aria-hidden="true" />;
  }
  return <Sun className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />;
}

function WeatherIcon({ label }: { label: WeatherLabel }) {
  if (label === 'Storm') {
    return <CloudLightning className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />;
  }
  if (label === 'Rain') {
    return <CloudRain className="h-3.5 w-3.5 text-sky-300" aria-hidden="true" />;
  }
  return <CloudSun className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />;
}

function cycleNext<T extends string>(list: Array<{ id: T }>, current: T): T {
  const idx = list.findIndex((item) => item.id === current);
  return list[(idx + 1) % list.length].id;
}

export function HudOverlay({
  controls,
  telemetry,
  hudCollapsed,
  levelUpNotice,
  timeUpNotice,
  achievementNotice,
  tiltEnabled,
  rotatedPortrait,
  isPortraitViewport,
  isFullscreen,
  onToggleTilt,
  onToggleHorizontal,
  onToggleCollapse,
  onUpdateControls,
  onWheelSteer,
  onGasChange,
  onTriggerBooster,
  onResetProgress,
}: HudOverlayProps) {
  const [tuneOpen, setTuneOpen] = useState(false);

  const stagePct = Math.min(
    100,
    Math.round((telemetry.stageDistanceM / Math.max(1, telemetry.stageTargetM)) * 100),
  );
  const remainingM = Math.max(0, telemetry.stageTargetM - telemetry.stageDistanceM);
  const timerPct = Math.min(
    100,
    Math.round((telemetry.stageTimeLeftSec / Math.max(1, telemetry.stageTimeLimitSec)) * 100),
  );
  const isTimeCritical = telemetry.stageTimeLeftSec <= 10;
  const isTimeLow = telemetry.stageTimeLeftSec <= 18 && !isTimeCritical;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-2.5 sm:p-4">
      {/* TOP BAR: Compact Telemetry Strip (Left) + Horizontal Icon Rail & Speedometer (Right) */}
      <div className="flex items-start justify-between gap-2">
        {/* Top-Left Compact Telemetry Card */}
        <div className="pointer-events-auto min-w-0 max-w-[300px] sm:max-w-[430px] rounded-xl border border-white/15 bg-slate-900/88 px-2.5 py-2 sm:px-3.5 sm:py-2.5 text-white shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-x-2.5 gap-y-0.5">
            <h1 className="font-display text-sm sm:text-base font-bold tracking-tight text-white leading-tight whitespace-nowrap">
              Sunburst Highway
            </h1>
            <div className="flex items-center gap-1.5">
              <span
                className={`font-speed text-xs font-extrabold whitespace-nowrap ${
                  telemetry.racePosition === 1
                    ? 'text-amber-300'
                    : telemetry.racePosition <= 3
                      ? 'text-cyan-300'
                      : 'text-slate-200'
                }`}
              >
                {formatOrdinal(telemetry.racePosition)}/{telemetry.totalRacers}
              </span>
              <span aria-hidden="true" className="text-slate-600">
                ·
              </span>
              <span className="font-speed text-xs font-bold text-emerald-300 whitespace-nowrap">
                Lvl {telemetry.level}
              </span>
              <span aria-hidden="true" className="text-slate-600">
                ·
              </span>
              <span className="font-speed text-[11px] font-bold text-white whitespace-nowrap">
                {telemetry.score.toLocaleString()} pts
              </span>
              <span
                className={`font-speed text-[11px] font-extrabold whitespace-nowrap ${
                  telemetry.multiplier > 1 ? 'text-cyan-300' : 'text-slate-400'
                }`}
              >
                ×{telemetry.multiplier}
              </span>
            </div>
          </div>

          {/* Horizontal Stat Strip */}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-300">
            <span className="inline-flex items-center gap-1 font-speed font-bold text-yellow-300 whitespace-nowrap">
              <Coins className="h-3 w-3 text-yellow-400" aria-hidden="true" />
              {telemetry.coins}
            </span>
            <span
              className="inline-flex items-center gap-1 font-speed font-bold text-fuchsia-300 whitespace-nowrap"
              title="Rare Diamonds — collect 3 to charge +1 Nitro Booster"
            >
              <Gem className="h-3 w-3 text-fuchsia-400" aria-hidden="true" />
              {telemetry.diamonds}
              <span className="text-[10px] font-semibold text-cyan-200">
                ({telemetry.diamondBoosterProgress}/{telemetry.diamondBoosterGoal})
              </span>
            </span>
            <span className="inline-flex items-center gap-1 font-speed font-bold text-emerald-300 whitespace-nowrap">
              <Flag className="h-3 w-3 text-emerald-400" aria-hidden="true" />
              {telemetry.overtakes}
            </span>
            <span className="font-speed text-sky-200 whitespace-nowrap">
              {telemetry.distanceKm.toFixed(1)}km
            </span>
            <span className="inline-flex items-center gap-1 text-slate-200 whitespace-nowrap">
              <TimePhaseIcon label={telemetry.timeLabel} />
              {telemetry.timeLabel}
            </span>
            <span className="inline-flex items-center gap-1 text-slate-200 whitespace-nowrap">
              <WeatherIcon label={telemetry.weatherLabel} />
              {telemetry.weatherLabel}
            </span>
            {telemetry.boosterTimeLeft > 0 && (
              <span className="inline-flex items-center gap-0.5 font-speed font-bold text-cyan-300 whitespace-nowrap">
                <Zap className="h-3 w-3 text-cyan-300" aria-hidden="true" />
                {telemetry.boosterTimeLeft.toFixed(1)}s
              </span>
            )}
          </div>

          {/* Side-by-Side Horizontal Progress Tracks: Petrol | Timer | Finish */}
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            <div>
              <div className="flex items-center justify-between text-[10px]">
                <span
                  className={`inline-flex items-center gap-0.5 font-medium ${
                    telemetry.fuelPct <= 20 ? 'text-red-300' : 'text-slate-300'
                  }`}
                >
                  <Fuel
                    className={`h-2.5 w-2.5 ${
                      telemetry.fuelPct <= 20
                        ? 'text-red-400'
                        : telemetry.fuelPct <= 40
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                    }`}
                    aria-hidden="true"
                  />
                  Fuel
                </span>
                <span
                  className={`font-speed font-bold ${
                    telemetry.fuelPct <= 20
                      ? 'text-red-300'
                      : telemetry.fuelPct <= 40
                        ? 'text-amber-300'
                        : 'text-emerald-300'
                  }`}
                >
                  {telemetry.fuelPct <= 0 ? '0%' : `${telemetry.fuelPct}%`}
                </span>
              </div>
              <div
                className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800"
                role="progressbar"
                aria-valuenow={telemetry.fuelPct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Petrol fuel level"
              >
                <div
                  className={`h-full rounded-full transition-[width] duration-150 ease-out ${
                    telemetry.fuelPct <= 20
                      ? 'bg-red-500'
                      : telemetry.fuelPct <= 40
                        ? 'bg-amber-400'
                        : 'bg-emerald-400'
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, telemetry.fuelPct))}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-[10px]">
                <span
                  className={`inline-flex items-center gap-0.5 font-medium ${
                    isTimeCritical ? 'text-red-300' : 'text-slate-300'
                  }`}
                >
                  <Timer
                    className={`h-2.5 w-2.5 ${
                      isTimeCritical
                        ? 'text-red-400'
                        : isTimeLow
                          ? 'text-amber-400'
                          : 'text-cyan-300'
                    }`}
                    aria-hidden="true"
                  />
                  Time
                </span>
                <span
                  className={`font-speed font-bold ${
                    isTimeCritical
                      ? 'text-red-300'
                      : isTimeLow
                        ? 'text-amber-300'
                        : 'text-cyan-200'
                  }`}
                >
                  {formatLevelTimer(telemetry.stageTimeLeftSec)}
                </span>
              </div>
              <div
                className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800"
                role="progressbar"
                aria-valuenow={Math.round(telemetry.stageTimeLeftSec)}
                aria-valuemin={0}
                aria-valuemax={telemetry.stageTimeLimitSec}
                aria-label="Level countdown timer"
              >
                <div
                  className={`h-full rounded-full transition-[width] duration-150 ease-out ${
                    isTimeCritical
                      ? 'bg-red-500'
                      : isTimeLow
                        ? 'bg-amber-400'
                        : 'bg-cyan-400'
                  }`}
                  style={{ width: `${Math.max(0, timerPct)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-[10px] text-slate-300">
                <span className="inline-flex items-center gap-0.5 font-medium">
                  <Flag className="h-2.5 w-2.5 text-amber-300" aria-hidden="true" />
                  Finish
                </span>
                <span className="font-speed font-bold text-amber-200">{remainingM}m</span>
              </div>
              <div
                className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800"
                role="progressbar"
                aria-valuenow={telemetry.stageDistanceM}
                aria-valuemin={0}
                aria-valuemax={telemetry.stageTargetM}
                aria-label="Distance to level finish line"
              >
                <div
                  className="h-full rounded-full bg-amber-400 transition-[width] duration-150 ease-out"
                  style={{ width: `${stagePct}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Top-Right Sideways Horizontal Icon Rail + Speedometer */}
        <div className="flex items-start gap-2 shrink-0">
          {/* BGMI-style Horizontal Square Icon Strip */}
          <div className="pointer-events-auto flex flex-wrap max-w-[168px] sm:max-w-none items-center justify-end gap-1 rounded-xl border border-white/15 bg-slate-900/88 p-1 shadow-lg">
            <button
              type="button"
              onClick={() => onUpdateControls({ soundEnabled: !controls.soundEnabled })}
              aria-pressed={controls.soundEnabled}
              title={controls.soundEnabled ? 'Mute sound' : 'Enable sound'}
              aria-label={controls.soundEnabled ? 'Mute sound' : 'Enable sound'}
              className={`inline-flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-amber-400 ${
                controls.soundEnabled
                  ? 'bg-sky-500 text-slate-950'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              {controls.soundEnabled ? (
                <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <VolumeX className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              onClick={() => onUpdateControls({ autoCruise: !controls.autoCruise })}
              aria-pressed={controls.autoCruise}
              title={controls.autoCruise ? 'Auto-Steer On (Steering Wheel)' : 'Auto-Steer Off'}
              aria-label="Toggle auto-steer"
              className={`inline-flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-amber-400 ${
                controls.autoCruise
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              <SteeringWheelIcon className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={onToggleTilt}
              aria-pressed={tiltEnabled}
              title="Toggle phone tilt steering"
              aria-label="Toggle phone tilt steering"
              className={`inline-flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-amber-400 ${
                tiltEnabled
                  ? 'bg-cyan-400 text-slate-950'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() =>
                onUpdateControls({ cameraPreset: cycleNext(CAMERA_OPTIONS, controls.cameraPreset) })
              }
              title={`Camera view: ${controls.cameraPreset}`}
              aria-label={`Cycle camera view (${controls.cameraPreset})`}
              className="inline-flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-slate-800/80 text-sky-300 transition-colors hover:bg-slate-700 hover:text-white focus-visible:outline-2 focus-visible:outline-amber-400"
            >
              <Camera className="h-3.5 w-3.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() =>
                onUpdateControls({ timeMode: cycleNext(TIME_OPTIONS, controls.timeMode) })
              }
              title={`Sky mode: ${controls.timeMode}`}
              aria-label={`Cycle time of day (${controls.timeMode})`}
              className="inline-flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-slate-800/80 text-amber-300 transition-colors hover:bg-slate-700 hover:text-white focus-visible:outline-2 focus-visible:outline-amber-400"
            >
              <TimePhaseIcon label={telemetry.timeLabel} />
            </button>

            <button
              type="button"
              onClick={() =>
                onUpdateControls({ weatherMode: cycleNext(WEATHER_OPTIONS, controls.weatherMode) })
              }
              title={`Weather: ${controls.weatherMode}`}
              aria-label={`Cycle weather (${controls.weatherMode})`}
              className="inline-flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-slate-800/80 text-cyan-300 transition-colors hover:bg-slate-700 hover:text-white focus-visible:outline-2 focus-visible:outline-amber-400"
            >
              <WeatherIcon label={telemetry.weatherLabel} />
            </button>

            <button
              type="button"
              onClick={() => setTuneOpen((prev) => !prev)}
              aria-expanded={tuneOpen}
              title="Garage: Speed, Paint & Sky settings"
              aria-label="Toggle speed and paint settings"
              className={`inline-flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-amber-400 ${
                tuneOpen
                  ? 'bg-amber-400 text-slate-950'
                  : 'bg-slate-800/80 text-slate-200 hover:bg-slate-700 hover:text-white'
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={onToggleHorizontal}
              title={
                isPortraitViewport
                  ? rotatedPortrait
                    ? 'Switch to portrait view'
                    : 'Switch to horizontal view'
                  : isFullscreen
                    ? 'Exit fullscreen'
                    : 'Enter horizontal fullscreen'
              }
              aria-label="Toggle horizontal screen orientation or fullscreen"
              className={`inline-flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-amber-400 ${
                rotatedPortrait || isFullscreen
                  ? 'bg-indigo-500 text-white'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              {isPortraitViewport ? (
                <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
              ) : isFullscreen ? (
                <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              onClick={onResetProgress}
              title="Reset level and progress"
              aria-label="Reset level and progress"
              className="inline-flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-slate-800/80 text-slate-300 transition-colors hover:bg-slate-700 hover:text-white focus-visible:outline-2 focus-visible:outline-amber-400"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={onToggleCollapse}
              aria-expanded={!hudCollapsed}
              title={hudCollapsed ? 'Show driving wheel & pedals' : 'Hide driving wheel & pedals'}
              aria-label={hudCollapsed ? 'Show driving controls' : 'Hide driving controls'}
              className="inline-flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-slate-800/80 text-slate-300 transition-colors hover:bg-slate-700 hover:text-white focus-visible:outline-2 focus-visible:outline-amber-400"
            >
              {hudCollapsed ? (
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>
          </div>

          {/* Radial Speedometer */}
          <Speedometer
            speedKmh={telemetry.speedKmh}
            isBraking={telemetry.isBraking}
            isBoosting={telemetry.isBoosting}
          />
        </div>
      </div>

      {/* GARAGE / TUNE DRAWER (Opens cleanly under Top-Right Rail without blocking center road) */}
      {tuneOpen && (
        <div className="pointer-events-auto absolute right-2.5 top-[106px] sm:right-4 sm:top-[128px] z-30 w-[268px] sm:w-[296px] rounded-xl border border-white/15 bg-slate-900/95 p-3 text-white shadow-2xl">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 font-display text-xs font-bold tracking-wide text-amber-300">
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              GARAGE &amp; CRUISE SETUP
            </span>
            <button
              type="button"
              onClick={() => setTuneOpen(false)}
              aria-label="Close garage drawer"
              className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          {/* Cruise Speed Step & Slider */}
          <div className="mt-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1 text-slate-300">
                <Gauge className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
                Cruise Speed
              </span>
              <span className="font-speed font-bold text-amber-300">
                {Math.round(controls.targetSpeedKmh)} km/h
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  onUpdateControls({
                    targetSpeedKmh: Math.max(40, Math.round(controls.targetSpeedKmh) - 15),
                  })
                }
                aria-label="Decrease cruise speed"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-800 text-slate-200 hover:bg-slate-700"
              >
                <Minus className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <input
                id="speed-slider"
                type="range"
                min={40}
                max={260}
                step={5}
                value={Math.round(controls.targetSpeedKmh)}
                onChange={(e) => onUpdateControls({ targetSpeedKmh: Number(e.target.value) })}
                className="highway-slider w-full"
              />
              <button
                type="button"
                onClick={() =>
                  onUpdateControls({
                    targetSpeedKmh: Math.min(260, Math.round(controls.targetSpeedKmh) + 15),
                  })
                }
                aria-label="Increase cruise speed"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-800 text-slate-200 hover:bg-slate-700"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Camera, Sky & Weather Horizontal Selectors */}
          <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-[11px]">
            <div className="rounded-lg bg-slate-800/80 p-1">
              <span className="block px-1 text-[10px] text-slate-400">Camera</span>
              <div className="mt-1 flex flex-col gap-0.5">
                {CAMERA_OPTIONS.map((cam) => (
                  <button
                    key={cam.id}
                    type="button"
                    onClick={() => onUpdateControls({ cameraPreset: cam.id })}
                    className={`rounded px-1.5 py-0.5 text-left font-semibold ${
                      controls.cameraPreset === cam.id
                        ? 'bg-sky-500 text-slate-950'
                        : 'text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {cam.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg bg-slate-800/80 p-1">
              <span className="block px-1 text-[10px] text-slate-400">Sky</span>
              <div className="mt-1 flex flex-col gap-0.5">
                {TIME_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onUpdateControls({ timeMode: opt.id })}
                    className={`rounded px-1.5 py-0.5 text-left font-semibold ${
                      controls.timeMode === opt.id
                        ? 'bg-amber-400 text-slate-950'
                        : 'text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg bg-slate-800/80 p-1">
              <span className="block px-1 text-[10px] text-slate-400">Weather</span>
              <div className="mt-1 flex flex-col gap-0.5">
                {WEATHER_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onUpdateControls({ weatherMode: opt.id })}
                    className={`rounded px-1.5 py-0.5 text-left font-semibold ${
                      controls.weatherMode === opt.id
                        ? 'bg-cyan-400 text-slate-950'
                        : 'text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Car Paint Swatches */}
          <div className="mt-2.5 flex items-center justify-between">
            <span className="text-xs text-slate-300">Car Paint</span>
            <div className="flex items-center gap-1.5" role="group" aria-label="Car paint color">
              {CAR_COLORS.map((swatch) => {
                const selected = controls.carColor.toLowerCase() === swatch.hex.toLowerCase();
                return (
                  <button
                    key={swatch.hex}
                    type="button"
                    aria-label={`Paint car ${swatch.label}`}
                    aria-pressed={selected}
                    onClick={() => onUpdateControls({ carColor: swatch.hex })}
                    className={`h-5 w-5 rounded-full border-2 transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${
                      selected ? 'scale-110 border-white' : 'border-white/35 hover:scale-105'
                    }`}
                    style={{ backgroundColor: swatch.hex }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* CENTERED FLOATING NOTICES */}
      {(levelUpNotice !== null || timeUpNotice !== null || achievementNotice !== null) && (
        <div className="pointer-events-none absolute inset-x-0 top-20 sm:top-4 z-20 flex flex-col items-center gap-2 px-4">
          {levelUpNotice !== null && (
            <div
              role="status"
              aria-live="polite"
              className="flex items-center gap-2.5 rounded-xl border border-amber-400/45 bg-slate-900/92 px-4 py-2 text-white shadow-xl"
            >
              <Trophy className="h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
              <div className="flex flex-col leading-tight">
                <span className="font-display text-sm font-bold tracking-tight text-amber-200 whitespace-nowrap">
                  {levelUpNotice.completedLevel !== undefined && levelUpNotice.placement !== undefined
                    ? `Level ${levelUpNotice.completedLevel} Finish · ${formatOrdinal(levelUpNotice.placement)} Place!`
                    : `Level ${levelUpNotice.level} Reached`}
                </span>
                <span className="text-[11px] text-emerald-300 whitespace-nowrap">
                  Starting Level {levelUpNotice.level} · +35% Petrol &amp; +1 Nitro
                  {levelUpNotice.timeBonus && levelUpNotice.timeBonus > 0
                    ? ` · +${levelUpNotice.timeBonus} Time Bonus`
                    : ''}
                </span>
              </div>
            </div>
          )}

          {timeUpNotice !== null && (
            <div
              role="status"
              aria-live="polite"
              className="flex items-center gap-2.5 rounded-xl border border-red-400/50 bg-slate-900/94 px-4 py-2 text-white shadow-xl"
            >
              <Timer className="h-4 w-4 shrink-0 text-red-400" aria-hidden="true" />
              <div className="flex flex-col leading-tight">
                <span className="font-display text-sm font-bold tracking-tight text-red-200 whitespace-nowrap">
                  Time&apos;s Up! Retrying Level {timeUpNotice}
                </span>
                <span className="text-[11px] text-amber-200 whitespace-nowrap">
                  Full Petrol &amp; Fresh Stage Timer Restored
                </span>
              </div>
            </div>
          )}

          {achievementNotice && (
            <div
              role="status"
              aria-live="polite"
              className="flex items-center gap-2.5 rounded-xl border border-cyan-400/45 bg-slate-900/92 px-4 py-2 text-white shadow-xl"
            >
              <Award className="h-4 w-4 shrink-0 text-cyan-300" aria-hidden="true" />
              <div className="flex flex-col leading-tight">
                <span className="font-display text-xs font-bold tracking-tight text-cyan-200 whitespace-nowrap">
                  Achievement Unlocked: {achievementNotice.title}
                </span>
                <span className="text-[11px] text-slate-300 whitespace-nowrap">
                  {achievementNotice.detail}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* BOTTOM BGMI SIDE-MOUNTED COCKPIT CONTROLS (Left Steering Wheel + Right Action Pedals) */}
      {!hudCollapsed && (
        <div className="flex items-end justify-between gap-4">
          {/* LEFT SIDE WING: Interactive Steering Wheel + Side Auto-Steer Toggle */}
          <div className="flex items-end gap-2">
            <SteeringWheelControl
              steerRatio={telemetry.steerRatio}
              carColor={controls.carColor}
              autoCruise={controls.autoCruise}
              rotatedPortrait={rotatedPortrait}
              onSteerChange={onWheelSteer}
            />
            <button
              type="button"
              onClick={() => onUpdateControls({ autoCruise: !controls.autoCruise })}
              aria-pressed={controls.autoCruise}
              title="Toggle Auto-Steer assist"
              className={`pointer-events-auto mb-4 inline-flex flex-col items-center justify-center rounded-xl border px-2 py-1.5 text-[10px] font-bold transition-colors focus-visible:outline-2 focus-visible:outline-amber-400 ${
                controls.autoCruise
                  ? 'border-emerald-300/60 bg-emerald-500/90 text-slate-950 shadow-lg'
                  : 'border-white/15 bg-slate-900/80 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <SteeringWheelIcon className="h-4 w-4" />
              <span className="mt-0.5 leading-none">AUTO</span>
            </button>
          </div>

          {/* RIGHT SIDE WING: BGMI-Style Horizontal/Arc Pedals, Boost & Nitro Cluster */}
          <div className="pointer-events-auto flex flex-col items-end gap-2">
            {/* Upper Side Action Pair: Nitro + Boost */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onTriggerBooster}
                disabled={telemetry.boosterCharges <= 0}
                title={`Fire stored Nitro Booster (Shift/F) — Collect ${telemetry.diamondBoosterGoal} Rare Diamonds for +1 Booster (${telemetry.diamondBoosterProgress}/${telemetry.diamondBoosterGoal})`}
                className={`inline-flex h-12 w-16 sm:h-13 sm:w-18 flex-col items-center justify-center rounded-xl border text-[10px] font-bold shadow-lg transition-colors focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                  telemetry.boosterCharges > 0
                    ? 'border-cyan-200/70 bg-cyan-400 text-slate-950 hover:bg-cyan-300 active:scale-95'
                    : 'cursor-not-allowed border-fuchsia-400/30 bg-slate-900/80 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-1">
                  <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="font-speed leading-none">NITRO ×{telemetry.boosterCharges}</span>
                </div>
                <div
                  className="mt-1 flex items-center gap-0.5"
                  aria-label={`Rare diamond booster charge: ${telemetry.diamondBoosterProgress} of ${telemetry.diamondBoosterGoal}`}
                >
                  <Gem
                    className={`h-2.5 w-2.5 ${
                      telemetry.boosterCharges > 0 ? 'text-purple-800' : 'text-fuchsia-300'
                    }`}
                    aria-hidden="true"
                  />
                  {[0, 1, 2].map((idx) => (
                    <span
                      key={idx}
                      className={`h-1.5 w-2.5 rounded-sm ${
                        idx < telemetry.diamondBoosterProgress
                          ? telemetry.boosterCharges > 0
                            ? 'bg-purple-900'
                            : 'bg-fuchsia-400'
                          : telemetry.boosterCharges > 0
                            ? 'bg-slate-950/25'
                            : 'bg-slate-700'
                      }`}
                    />
                  ))}
                </div>
              </button>

              <button
                type="button"
                onClick={() => onUpdateControls({ boosting: !controls.boosting })}
                aria-pressed={controls.boosting}
                title="Toggle Boost Surge (Space)"
                className={`inline-flex h-11 w-14 sm:h-12 sm:w-16 flex-col items-center justify-center rounded-xl border text-[10px] font-bold shadow-lg transition-colors focus-visible:outline-2 focus-visible:outline-amber-400 ${
                  telemetry.isBoosting
                    ? 'border-amber-200/80 bg-amber-400 text-slate-950'
                    : 'border-white/20 bg-slate-900/82 text-slate-200 hover:bg-slate-800 active:scale-95'
                }`}
              >
                <Flame className="h-4 w-4" aria-hidden="true" />
                <span className="font-speed leading-none mt-0.5">BOOST</span>
              </button>
            </div>

            {/* Lower Side Driving Pedals: Brake + Accelerate (Sideways BGMI layout) */}
            <div className="flex items-end gap-2">
              <button
                type="button"
                title="Hold to brake (S / Down Arrow)"
                aria-pressed={telemetry.isBraking}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onUpdateControls({ braking: true });
                }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  onUpdateControls({ braking: false });
                }}
                onPointerLeave={() => {
                  if (controls.braking) onUpdateControls({ braking: false });
                }}
                onPointerCancel={() => onUpdateControls({ braking: false })}
                onKeyDown={(e) => {
                  if (e.code === 'Enter') onUpdateControls({ braking: true });
                }}
                onKeyUp={(e) => {
                  if (e.code === 'Enter') onUpdateControls({ braking: false });
                }}
                className={`inline-flex h-13 w-14 sm:h-14 sm:w-16 flex-col items-center justify-center rounded-2xl border text-[10px] font-bold shadow-xl transition-colors focus-visible:outline-2 focus-visible:outline-red-400 ${
                  telemetry.isBraking
                    ? 'border-red-200/80 bg-red-500 text-white'
                    : 'border-white/20 bg-slate-900/84 text-red-200 hover:bg-slate-800 active:scale-95'
                }`}
              >
                <CircleStop className="h-5 w-5" aria-hidden="true" />
                <span className="font-speed mt-0.5 leading-none">BRAKE</span>
              </button>

              <button
                type="button"
                title="Hold to accelerate (W / Up Arrow)"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onGasChange(true);
                }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  onGasChange(false);
                }}
                onPointerLeave={() => onGasChange(false)}
                onPointerCancel={() => onGasChange(false)}
                onKeyDown={(e) => {
                  if (e.code === 'Enter') onGasChange(true);
                }}
                onKeyUp={(e) => {
                  if (e.code === 'Enter') onGasChange(false);
                }}
                className="inline-flex h-16 w-14 sm:h-20 sm:w-16 flex-col items-center justify-center rounded-2xl border border-emerald-300/45 bg-emerald-500/90 text-slate-950 shadow-xl transition-transform hover:bg-emerald-400 active:scale-95 focus-visible:outline-2 focus-visible:outline-emerald-300"
              >
                <ChevronUp className="h-6 w-6 stroke-[2.6]" aria-hidden="true" />
                <span className="font-speed mt-0.5 text-[11px] font-extrabold leading-none">GAS</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
