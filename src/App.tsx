import { useCallback, useEffect, useRef, useState } from 'react';
import { HudOverlay } from './components/HudOverlay';
import {
  HighwayScene,
  levelFinishDistanceFor,
  levelTargetFor,
  levelTimeLimitFor,
  type HighwayControlsState,
  type HighwayTelemetry,
  type SavedProgress,
} from './three/HighwayScene';

const STORAGE_KEY = 'sunburst_highway_progress_v1';

const INITIAL_CONTROLS: HighwayControlsState = {
  targetSpeedKmh: 135,
  autoCruise: true,
  boosting: false,
  braking: false,
  cameraPreset: 'chase',
  carColor: '#FF4757',
  soundEnabled: false,
  timeMode: 'auto',
  weatherMode: 'auto',
};

function loadSavedProgress(): SavedProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        level: 1,
        levelCoins: 0,
        coins: 0,
        diamonds: 0,
        overtakes: 0,
        score: 0,
        stageDistanceM: 0,
        distanceKm: 0,
      };
    }
    const parsed = JSON.parse(raw) as Partial<SavedProgress>;
    const level = typeof parsed.level === 'number' && parsed.level >= 1 ? Math.floor(parsed.level) : 1;
    const coins = typeof parsed.coins === 'number' && parsed.coins >= 0 ? Math.floor(parsed.coins) : 0;
    const diamonds =
      typeof parsed.diamonds === 'number' && parsed.diamonds >= 0 ? Math.floor(parsed.diamonds) : 0;
    const diamondBoosterProgress =
      typeof parsed.diamondBoosterProgress === 'number' && parsed.diamondBoosterProgress >= 0
        ? Math.floor(parsed.diamondBoosterProgress) % 3
        : 0;
    const overtakes =
      typeof parsed.overtakes === 'number' && parsed.overtakes >= 0 ? Math.floor(parsed.overtakes) : 0;
    const score = typeof parsed.score === 'number' && parsed.score >= 0 ? Math.floor(parsed.score) : 0;
    const stageDistanceM =
      typeof parsed.stageDistanceM === 'number' && parsed.stageDistanceM >= 0
        ? Math.floor(parsed.stageDistanceM)
        : 0;
    const stageTimeLeftSec =
      typeof parsed.stageTimeLeftSec === 'number' && parsed.stageTimeLeftSec > 0
        ? parsed.stageTimeLeftSec
        : undefined;
    const levelCoins =
      typeof parsed.levelCoins === 'number' && parsed.levelCoins >= 0
        ? Math.floor(parsed.levelCoins)
        : 0;
    const distanceKm =
      typeof parsed.distanceKm === 'number' && parsed.distanceKm >= 0 ? parsed.distanceKm : 0;
    return {
      level,
      levelCoins,
      coins,
      diamonds,
      diamondBoosterProgress,
      overtakes,
      score,
      stageDistanceM,
      stageTimeLeftSec,
      distanceKm,
    };
  } catch {
    return {
      level: 1,
      levelCoins: 0,
      coins: 0,
      diamonds: 0,
      diamondBoosterProgress: 0,
      overtakes: 0,
      score: 0,
      stageDistanceM: 0,
      distanceKm: 0,
    };
  }
}

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<HighwayScene | null>(null);
  const levelBannerTimerRef = useRef<number | null>(null);
  const achievementTimerRef = useRef<number | null>(null);
  const timeUpTimerRef = useRef<number | null>(null);

  const initialProgressRef = useRef<SavedProgress>(loadSavedProgress());

  const [controls, setControls] = useState<HighwayControlsState>(INITIAL_CONTROLS);
  const [telemetry, setTelemetry] = useState<HighwayTelemetry>(() => {
    const limitSec = levelTimeLimitFor(initialProgressRef.current.level);
    const savedTime = initialProgressRef.current.stageTimeLeftSec;
    return {
      speedKmh: 135,
      distanceKm: initialProgressRef.current.distanceKm,
      coins: initialProgressRef.current.coins,
      diamonds: initialProgressRef.current.diamonds ?? 0,
      diamondBoosterProgress: initialProgressRef.current.diamondBoosterProgress ?? 0,
      diamondBoosterGoal: 3,
      overtakes: initialProgressRef.current.overtakes ?? 0,
      score: initialProgressRef.current.score ?? 0,
      multiplier: 1,
      fuelPct: 100,
      boosterTimeLeft: 0,
      boosterCharges: 1,
      level: initialProgressRef.current.level,
      levelCoins: initialProgressRef.current.levelCoins,
      levelTarget: levelTargetFor(initialProgressRef.current.level),
      stageDistanceM: initialProgressRef.current.stageDistanceM ?? 0,
      stageTargetM: levelFinishDistanceFor(initialProgressRef.current.level),
      stageTimeLeftSec:
        typeof savedTime === 'number' && savedTime > 0 && savedTime <= limitSec
          ? savedTime
          : limitSec,
      stageTimeLimitSec: limitSec,
      racePosition: 5,
      totalRacers: 5,
      timeLabel: 'Day',
      timePhase: 0.22,
      weatherLabel: 'Clear',
      steerRatio: 0,
      isBraking: false,
      isBoosting: false,
    };
  });
  const [hudCollapsed, setHudCollapsed] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  const [levelUpNotice, setLevelUpNotice] = useState<{
    level: number;
    placement?: number;
    completedLevel?: number;
    timeBonus?: number;
  } | null>(null);
  const [timeUpNotice, setTimeUpNotice] = useState<number | null>(null);
  const [achievementNotice, setAchievementNotice] = useState<{ title: string; detail: string } | null>(
    null,
  );
  const [tiltEnabled, setTiltEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return false;
    const reqPerm = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> })
      .requestPermission;
    return typeof reqPerm !== 'function';
  });
  const [isPortraitViewport, setIsPortraitViewport] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerHeight > window.innerWidth;
  });
  const [forceHorizontal, setForceHorizontal] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const autoSteerHandedOffRef = useRef(false);

  const isRotatedStage = isPortraitViewport && forceHorizontal;

  // Track viewport orientation & fullscreen state so horizontal cockpit stays crisp
  useEffect(() => {
    const syncViewport = () => {
      setIsPortraitViewport(window.innerHeight > window.innerWidth);
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    syncViewport();
    window.addEventListener('resize', syncViewport);
    window.addEventListener('orientationchange', syncViewport);
    document.addEventListener('fullscreenchange', syncViewport);
    return () => {
      window.removeEventListener('resize', syncViewport);
      window.removeEventListener('orientationchange', syncViewport);
      document.removeEventListener('fullscreenchange', syncViewport);
    };
  }, []);

  // Sync control changes to Three.js scene without tearing down WebGL
  const handleUpdateControls = useCallback((patch: Partial<HighwayControlsState>) => {
    if (patch.autoCruise === true) {
      autoSteerHandedOffRef.current = false;
    }
    setControls((prev) => {
      const next = { ...prev, ...patch };
      sceneRef.current?.updateControls(next);
      return next;
    });
  }, []);

  const handleResetProgress = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore storage failure
    }
    sceneRef.current?.resetProgress();
    setLevelUpNotice(null);
    setTimeUpNotice(null);
    setAchievementNotice(null);
  }, []);

  const handleTriggerBooster = useCallback(() => {
    sceneRef.current?.triggerBoosterCharge();
  }, []);

  const handleWheelSteer = useCallback(
    (steer: number) => {
      sceneRef.current?.setInputState({ wheelSteer: steer });
      if (Math.abs(steer) > 0.12 && controls.autoCruise && !autoSteerHandedOffRef.current) {
        autoSteerHandedOffRef.current = true;
        handleUpdateControls({ autoCruise: false });
      }
    },
    [controls.autoCruise, handleUpdateControls],
  );

  const handleGasChange = useCallback((pressed: boolean) => {
    sceneRef.current?.setInputState({ up: pressed });
  }, []);

  const handleToggleHorizontal = useCallback(async () => {
    if (isPortraitViewport) {
      setForceHorizontal((prev) => !prev);
      return;
    }
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
        const orientation = screen.orientation as ScreenOrientation & {
          lock?: (mode: string) => Promise<void>;
        };
        if (orientation?.lock) {
          await orientation.lock('landscape').catch(() => {});
        }
      }
    } catch {
      // Ignore fullscreen denial in embedded iframes
    }
  }, [isPortraitViewport]);

  // Mount Three.js scene once in isolated container
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const highway = new HighwayScene(
      container,
      INITIAL_CONTROLS,
      (nextTelemetry) => setTelemetry(nextTelemetry),
      (lost) => setContextLost(lost),
      initialProgressRef.current,
      (progress) => {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
        } catch {
          // ignore storage quota errors
        }
      },
      (newLevel, placement, completedLevel, timeBonus) => {
        setTimeUpNotice(null);
        setLevelUpNotice({ level: newLevel, placement, completedLevel, timeBonus });
        if (levelBannerTimerRef.current !== null) {
          window.clearTimeout(levelBannerTimerRef.current);
        }
        levelBannerTimerRef.current = window.setTimeout(() => {
          setLevelUpNotice(null);
        }, 3100);
      },
      (title, detail) => {
        setAchievementNotice({ title, detail });
        if (achievementTimerRef.current !== null) {
          window.clearTimeout(achievementTimerRef.current);
        }
        achievementTimerRef.current = window.setTimeout(() => {
          setAchievementNotice(null);
        }, 3200);
      },
      (timedOutLevel) => {
        setTimeUpNotice(timedOutLevel);
        if (timeUpTimerRef.current !== null) {
          window.clearTimeout(timeUpTimerRef.current);
        }
        timeUpTimerRef.current = window.setTimeout(() => {
          setTimeUpNotice(null);
        }, 2800);
      },
    );
    sceneRef.current = highway;

    return () => {
      if (levelBannerTimerRef.current !== null) {
        window.clearTimeout(levelBannerTimerRef.current);
      }
      if (achievementTimerRef.current !== null) {
        window.clearTimeout(achievementTimerRef.current);
      }
      if (timeUpTimerRef.current !== null) {
        window.clearTimeout(timeUpTimerRef.current);
      }
      highway.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Keyboard controls: WASD / Arrows to drive, S / Down / B to Brake, Space to Boost, H to toggle HUD
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const code = e.code;
      if (code === 'KeyA' || code === 'ArrowLeft') {
        sceneRef.current?.setInputState({ left: true });
      } else if (code === 'KeyD' || code === 'ArrowRight') {
        sceneRef.current?.setInputState({ right: true });
      } else if (code === 'KeyW' || code === 'ArrowUp') {
        sceneRef.current?.setInputState({ up: true });
      } else if (code === 'KeyS' || code === 'ArrowDown' || code === 'KeyB') {
        sceneRef.current?.setInputState({ down: true, brake: true });
      } else if (code === 'Space') {
        if (document.activeElement?.tagName !== 'BUTTON') {
          e.preventDefault();
        }
        sceneRef.current?.setInputState({ boost: true });
      } else if (code === 'ShiftLeft' || code === 'ShiftRight' || code === 'KeyF') {
        if (!e.repeat) {
          sceneRef.current?.triggerBoosterCharge();
        }
      } else if (code === 'KeyH') {
        setHudCollapsed((prev) => !prev);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const code = e.code;
      if (code === 'KeyA' || code === 'ArrowLeft') {
        sceneRef.current?.setInputState({ left: false });
      } else if (code === 'KeyD' || code === 'ArrowRight') {
        sceneRef.current?.setInputState({ right: false });
      } else if (code === 'KeyW' || code === 'ArrowUp') {
        sceneRef.current?.setInputState({ up: false });
      } else if (code === 'KeyS' || code === 'ArrowDown' || code === 'KeyB') {
        sceneRef.current?.setInputState({ down: false, brake: false });
      } else if (code === 'Space') {
        sceneRef.current?.setInputState({ boost: false });
      }
    };

    const onBlur = () => {
      sceneRef.current?.setInputState({
        left: false,
        right: false,
        up: false,
        down: false,
        boost: false,
        brake: false,
        wheelSteer: 0,
      });
      handleUpdateControls({ braking: false });
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [handleUpdateControls]);

  // Mobile Device Tilt Steering (Portrait gamma / Landscape beta)
  const requestTiltPermissionIfNeeded = useCallback(async (): Promise<boolean> => {
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) {
      return false;
    }
    const reqPerm = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> })
      .requestPermission;
    if (typeof reqPerm === 'function') {
      try {
        const res = await reqPerm();
        const granted = res === 'granted';
        setTiltEnabled(granted);
        return granted;
      } catch {
        setTiltEnabled(false);
        return false;
      }
    }
    return true;
  }, []);

  const handleToggleTilt = useCallback(async () => {
    if (tiltEnabled) {
      setTiltEnabled(false);
      sceneRef.current?.setInputState({ tiltSteer: 0 });
      return;
    }
    const ok = await requestTiltPermissionIfNeeded();
    if (ok) {
      setTiltEnabled(true);
    }
  }, [tiltEnabled, requestTiltPermissionIfNeeded]);

  useEffect(() => {
    if (!tiltEnabled || typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) {
      sceneRef.current?.setInputState({ tiltSteer: 0 });
      return;
    }

    const onDeviceOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma === null && e.beta === null) return;

      const angle =
        window.screen?.orientation?.angle ??
        (typeof (window as unknown as { orientation?: number }).orientation === 'number'
          ? (window as unknown as { orientation: number }).orientation
          : 0);

      let rawTiltDeg = 0;
      if (isRotatedStage && angle === 0) {
        // Phone physically held sideways to match 90deg clockwise horizontal stage
        rawTiltDeg = -(e.beta ?? 0);
      } else if (angle === 90) {
        rawTiltDeg = e.beta ?? 0;
      } else if (angle === -90 || angle === 270) {
        rawTiltDeg = -(e.beta ?? 0);
      } else if (angle === 180) {
        rawTiltDeg = -(e.gamma ?? 0);
      } else {
        rawTiltDeg = e.gamma ?? 0;
      }

      const absDeg = Math.abs(rawTiltDeg);
      const deadzone = 3.5;
      const maxTilt = 26;

      if (absDeg <= deadzone) {
        sceneRef.current?.setInputState({ tiltSteer: 0 });
        return;
      }

      if (absDeg > 8.5 && !autoSteerHandedOffRef.current) {
        autoSteerHandedOffRef.current = true;
        handleUpdateControls({ autoCruise: false });
      }

      const norm = Math.min(1, (absDeg - deadzone) / (maxTilt - deadzone));
      const curved = Math.sign(rawTiltDeg) * Math.pow(norm, 1.15);
      sceneRef.current?.setInputState({ tiltSteer: curved });
    };

    window.addEventListener('deviceorientation', onDeviceOrientation);
    return () => {
      window.removeEventListener('deviceorientation', onDeviceOrientation);
      sceneRef.current?.setInputState({ tiltSteer: 0 });
    };
  }, [tiltEnabled, isRotatedStage, handleUpdateControls]);

  // Touch / Pointer steering directly on canvas left/right halves (also primes iOS tilt permission)
  const handleCanvasPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (!tiltEnabled && e.pointerType !== 'mouse') {
        void requestTiltPermissionIfNeeded();
      }
      const isLeft = isRotatedStage
        ? e.clientY < window.innerHeight * 0.5
        : e.clientX < window.innerWidth * 0.5;
      sceneRef.current?.setInputState({ left: isLeft, right: !isLeft });
    },
    [tiltEnabled, isRotatedStage, requestTiltPermissionIfNeeded],
  );

  const handleCanvasPointerUp = useCallback(() => {
    sceneRef.current?.setInputState({ left: false, right: false });
  }, []);

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-slate-950">
      {/* Horizontal Stage Wrapper: native full viewport on landscape/desktop, rotated 90deg horizontal cockpit on portrait mobile */}
      <div
        className={isRotatedStage ? 'fixed overflow-hidden' : 'relative h-full w-full'}
        style={
          isRotatedStage
            ? {
                width: '100dvh',
                height: '100dvw',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%) rotate(90deg)',
              }
            : undefined
        }
      >
        {/* Dedicated isolated WebGL canvas mount */}
        <div
          ref={mountRef}
          onPointerDown={handleCanvasPointerDown}
          onPointerUp={handleCanvasPointerUp}
          onPointerCancel={handleCanvasPointerUp}
          className="h-full w-full cursor-grab active:cursor-grabbing"
        />

        {/* Graceful fallback if WebGL context is lost */}
        {contextLost && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-sky-900/95 p-6 text-center text-white">
            <div className="max-w-sm rounded-2xl border border-white/15 bg-slate-900 px-6 py-5 shadow-xl">
              <h2 className="font-display text-lg font-bold">Graphics Context Paused</h2>
              <p className="mt-2 text-sm text-slate-300">
                Waiting for the WebGL graphics context to restore. If it does not resume automatically, reload the page.
              </p>
            </div>
          </div>
        )}

        {/* BGMI-Style Horizontal Racing Cockpit HUD Overlay */}
        <HudOverlay
          controls={controls}
          telemetry={telemetry}
          hudCollapsed={hudCollapsed}
          levelUpNotice={levelUpNotice}
          timeUpNotice={timeUpNotice}
          achievementNotice={achievementNotice}
          tiltEnabled={tiltEnabled}
          rotatedPortrait={isRotatedStage}
          isPortraitViewport={isPortraitViewport}
          isFullscreen={isFullscreen}
          onToggleTilt={handleToggleTilt}
          onToggleHorizontal={handleToggleHorizontal}
          onToggleCollapse={() => setHudCollapsed((prev) => !prev)}
          onUpdateControls={handleUpdateControls}
          onWheelSteer={handleWheelSteer}
          onGasChange={handleGasChange}
          onTriggerBooster={handleTriggerBooster}
          onResetProgress={handleResetProgress}
        />
      </div>
    </main>
  );
}
