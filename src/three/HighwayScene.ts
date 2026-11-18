import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  createBoosterPickupGroup,
  createBoostPadGroup,
  createCloudGroup,
  createCoinGeometries,
  createDiamondGeometries,
  createFinishLineGroup,
  createFoliageGeometries,
  createHighwayArch,
  createMountainPeakGeometry,
  createPetrolPickupGroup,
  createRaceCar,
  createSideTerrainGeometry,
  createTrafficCar,
  groundHeightAt,
  type CoinGeometries,
  type DiamondGeometries,
  type RaceCarHandle,
  type TrafficCarArchetype,
  type TrafficCarHandle,
  type TreePartGeometries,
} from './models';
import { createProceduralTextures, type ProceduralTextureSet } from './textures';
import { ProceduralEngineAudio } from './audio';

export type CameraPreset = 'chase' | 'hood' | 'scenic';
export type TimeOfDayMode = 'auto' | 'day' | 'sunset' | 'night';
export type TimeOfDayLabel = 'Dawn' | 'Day' | 'Sunset' | 'Night';
export type WeatherMode = 'auto' | 'clear' | 'rain' | 'storm';
export type WeatherLabel = 'Clear' | 'Rain' | 'Storm';

export interface HighwayControlsState {
  targetSpeedKmh: number;
  autoCruise: boolean;
  boosting: boolean;
  braking: boolean;
  cameraPreset: CameraPreset;
  carColor: string;
  soundEnabled: boolean;
  timeMode: TimeOfDayMode;
  weatherMode: WeatherMode;
}

export interface HighwayTelemetry {
  speedKmh: number;
  distanceKm: number;
  coins: number;
  diamonds: number;
  diamondBoosterProgress: number;
  diamondBoosterGoal: number;
  overtakes: number;
  score: number;
  multiplier: number;
  fuelPct: number;
  boosterTimeLeft: number;
  boosterCharges: number;
  level: number;
  levelCoins: number;
  levelTarget: number;
  stageDistanceM: number;
  stageTargetM: number;
  stageTimeLeftSec: number;
  stageTimeLimitSec: number;
  racePosition: number;
  totalRacers: number;
  timeLabel: TimeOfDayLabel;
  timePhase: number;
  weatherLabel: WeatherLabel;
  steerRatio: number;
  isBraking: boolean;
  isBoosting: boolean;
}

export interface SavedProgress {
  level: number;
  levelCoins: number;
  coins: number;
  diamonds?: number;
  diamondBoosterProgress?: number;
  overtakes?: number;
  score?: number;
  stageDistanceM?: number;
  stageTimeLeftSec?: number;
  distanceKm: number;
}

export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  boost: boolean;
  brake: boolean;
  tiltSteer: number; // -1 (left) to +1 (right) from mobile device tilt
  wheelSteer: number; // -1 (left) to +1 (right) from on-screen steering wheel
}

interface RecycledProp {
  x: number;
  y: number;
  z: number;
  rotY: number;
  scale: number;
}

interface CloudInstance {
  group: THREE.Group;
  driftSpeed: number;
  baseY: number;
  bobPhase: number;
}

interface SpeedParticle {
  x: number;
  y: number;
  z: number;
  speedMul: number;
}

interface CoinItem {
  active: boolean;
  x: number;
  z: number;
  phase: number;
}

interface BurstParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
}

interface TrafficVehicle {
  handle: TrafficCarHandle;
  lane: -1 | 1;
  x: number;
  z: number;
  baseSpeedUnits: number;
  speedUnits: number;
  wheelSpin: number;
  isBraking: boolean;
  bumpCooldown: number;
  laneChangeCooldown: number;
  passedAwarded: boolean;
}

interface AiRacerVehicle {
  handle: RaceCarHandle;
  name: string;
  x: number;
  z: number;
  targetX: number;
  stageProgressM: number;
  skillOffset: number;
  speedUnits: number;
  wheelSpin: number;
  boostTimer: number;
  nextBoostIn: number;
  bumpCooldown: number;
  laneTimer: number;
}

interface GroupPickup {
  group: THREE.Group;
  active: boolean;
  x: number;
  z: number;
  phase: number;
}

interface RainDrop {
  x: number;
  y: number;
  z: number;
  speedY: number;
}

interface AtmosphereKeyframe {
  phase: number;
  skyTop: THREE.Color;
  skyMid: THREE.Color;
  skyHorizon: THREE.Color;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  keyColor: THREE.Color;
  keyIntensity: number;
  rimColor: THREE.Color;
  rimIntensity: number;
  cloudColor: THREE.Color;
  cloudEmissive: THREE.Color;
  cloudEmissiveIntensity: number;
  exposure: number;
  nightFactor: number;
}

// Pre-allocated math helpers for zero GC inside the render loop
const _dummy = new THREE.Object3D();
const _targetCamPos = new THREE.Vector3();
const _targetLookAt = new THREE.Vector3();
const _currentLookAt = new THREE.Vector3(0, 1.4, -18);
const _color = new THREE.Color();

const _skyTop = new THREE.Color();
const _skyMid = new THREE.Color();
const _skyHorizon = new THREE.Color();
const _hemiSky = new THREE.Color();
const _hemiGround = new THREE.Color();
const _keyColor = new THREE.Color();
const _rimColor = new THREE.Color();
const _cloudColor = new THREE.Color();
const _cloudEmissive = new THREE.Color();
const _sunDir = new THREE.Vector3();
const _stormSkyTop = new THREE.Color('#1E293B');
const _stormSkyMid = new THREE.Color('#334155');
const _stormSkyHorizon = new THREE.Color('#64748B');
const _stormCloudColor = new THREE.Color('#475569');

const ROAD_LENGTH = 360;
const ROAD_CENTER_Z = -150; // Covers z from +30 to -330
const PROP_Z_MIN = -315;
const PROP_Z_MAX = 25;
const PROP_Z_SPAN = PROP_Z_MAX - PROP_Z_MIN; // 340

const VALLEY_MTN_Z_MIN = -360;
const VALLEY_MTN_Z_MAX = 60;
const VALLEY_MTN_Z_SPAN = VALLEY_MTN_Z_MAX - VALLEY_MTN_Z_MIN; // 420

const DAY_CYCLE_SECONDS = 72; // Full Dawn -> Day -> Sunset -> Night -> Dawn cycle
const WEATHER_CYCLE_SECONDS = 54;
const COIN_COUNT = 22;
const DIAMOND_COUNT = 3;
const DIAMOND_BOOSTER_GOAL = 3;
const PETROL_COUNT = 3;
const BOOSTER_COUNT = 5;
const BOOST_PAD_COUNT = 4;
const RAIN_COUNT = 180;
const BURST_POOL_SIZE = 40;
const TRAFFIC_COUNT = 16;
const LANE_OFFSET_X = 3.1;

const ATMOSPHERE_KEYS: AtmosphereKeyframe[] = [
  {
    // 0.00 Dawn
    phase: 0.0,
    skyTop: new THREE.Color('#2563EB'),
    skyMid: new THREE.Color('#FB7185'),
    skyHorizon: new THREE.Color('#FDE68A'),
    hemiSky: new THREE.Color('#FDBA74'),
    hemiGround: new THREE.Color('#166534'),
    hemiIntensity: 0.85,
    keyColor: new THREE.Color('#FDBA74'),
    keyIntensity: 1.55,
    rimColor: new THREE.Color('#FBCFE8'),
    rimIntensity: 0.55,
    cloudColor: new THREE.Color('#FFE4E6'),
    cloudEmissive: new THREE.Color('#FDBA74'),
    cloudEmissiveIntensity: 0.25,
    exposure: 1.05,
    nightFactor: 0.18,
  },
  {
    // 0.25 Sunburst Day
    phase: 0.25,
    skyTop: new THREE.Color('#0D6EFD'),
    skyMid: new THREE.Color('#38BDF8'),
    skyHorizon: new THREE.Color('#BFEFFF'),
    hemiSky: new THREE.Color('#7DD3FC'),
    hemiGround: new THREE.Color('#22C55E'),
    hemiIntensity: 1.08,
    keyColor: new THREE.Color('#FFF4D4'),
    keyIntensity: 2.05,
    rimColor: new THREE.Color('#BAE6FD'),
    rimIntensity: 0.55,
    cloudColor: new THREE.Color('#FFFFFF'),
    cloudEmissive: new THREE.Color('#E0F2FE'),
    cloudEmissiveIntensity: 0.25,
    exposure: 1.08,
    nightFactor: 0.0,
  },
  {
    // 0.50 Golden Sunset
    phase: 0.5,
    skyTop: new THREE.Color('#312E81'),
    skyMid: new THREE.Color('#DB2777'),
    skyHorizon: new THREE.Color('#FB923C'),
    hemiSky: new THREE.Color('#F472B6'),
    hemiGround: new THREE.Color('#1E293B'),
    hemiIntensity: 0.78,
    keyColor: new THREE.Color('#FB923C'),
    keyIntensity: 1.45,
    rimColor: new THREE.Color('#C084FC'),
    rimIntensity: 0.6,
    cloudColor: new THREE.Color('#FDBA74'),
    cloudEmissive: new THREE.Color('#F43F5E'),
    cloudEmissiveIntensity: 0.28,
    exposure: 1.02,
    nightFactor: 0.42,
  },
  {
    // 0.75 Starlit Night
    phase: 0.75,
    skyTop: new THREE.Color('#020617'),
    skyMid: new THREE.Color('#0F172A'),
    skyHorizon: new THREE.Color('#1E293B'),
    hemiSky: new THREE.Color('#38BDF8'),
    hemiGround: new THREE.Color('#0F172A'),
    hemiIntensity: 0.48,
    keyColor: new THREE.Color('#93C5FD'),
    keyIntensity: 0.82,
    rimColor: new THREE.Color('#60A5FA'),
    rimIntensity: 0.48,
    cloudColor: new THREE.Color('#334155'),
    cloudEmissive: new THREE.Color('#1E293B'),
    cloudEmissiveIntensity: 0.22,
    exposure: 0.96,
    nightFactor: 1.0,
  },
  {
    // 1.00 Wrap to Dawn
    phase: 1.0,
    skyTop: new THREE.Color('#2563EB'),
    skyMid: new THREE.Color('#FB7185'),
    skyHorizon: new THREE.Color('#FDE68A'),
    hemiSky: new THREE.Color('#FDBA74'),
    hemiGround: new THREE.Color('#166534'),
    hemiIntensity: 0.85,
    keyColor: new THREE.Color('#FDBA74'),
    keyIntensity: 1.55,
    rimColor: new THREE.Color('#FBCFE8'),
    rimIntensity: 0.55,
    cloudColor: new THREE.Color('#FFE4E6'),
    cloudEmissive: new THREE.Color('#FDBA74'),
    cloudEmissiveIntensity: 0.25,
    exposure: 1.05,
    nightFactor: 0.18,
  },
];

export function levelTargetFor(level: number): number {
  return 10 + (Math.max(1, level) - 1) * 5;
}

export function levelFinishDistanceFor(level: number): number {
  return Math.min(3600, 1200 + (Math.max(1, level) - 1) * 350);
}

export function levelTimeLimitFor(level: number): number {
  return Math.round(levelFinishDistanceFor(level) / 28) + 5;
}

function getTimeLabel(phase: number): TimeOfDayLabel {
  const p = ((phase % 1) + 1) % 1;
  if (p >= 0.12 && p < 0.4) return 'Day';
  if (p >= 0.4 && p < 0.62) return 'Sunset';
  if (p >= 0.62 && p < 0.88) return 'Night';
  return 'Dawn';
}

function detectSoftwareGl(): boolean {
  const probeCanvas = document.createElement('canvas');
  const gl = probeCanvas.getContext('webgl2');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

/**
 * Deterministic PRNG so the cartoon landscape layout is rich and reproducible.
 */
function makeRng(seedStart: number): () => number {
  let s = seedStart;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export class HighwayScene {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private isSoftwareGl: boolean;

  private textures: ProceduralTextureSet;
  private foliageGeos: TreePartGeometries;
  private coinGeos: CoinGeometries;
  private diamondGeos: DiamondGeometries;
  private car: RaceCarHandle;
  private audio = new ProceduralEngineAudio();

  private controlsState: HighwayControlsState;
  private inputState: InputState = {
    left: false,
    right: false,
    up: false,
    down: false,
    boost: false,
    brake: false,
    tiltSteer: 0,
    wheelSteer: 0,
  };
  private resizeObserver: ResizeObserver | null = null;

  private onTelemetry: (t: HighwayTelemetry) => void;
  private onContextLostChange: (lost: boolean) => void;
  private onProgressSave?: (p: SavedProgress) => void;
  private onLevelUp?: (
    level: number,
    placement?: number,
    completedLevel?: number,
    timeBonus?: number,
  ) => void;
  private onAchievement?: (title: string, detail: string) => void;
  private onStageTimeout?: (level: number) => void;

  // Dynamic simulation state
  private currentSpeedUnits = 34; // world units/sec (~122 km/h)
  private distanceUnits = 0;
  private carX = 2.6; // start cleanly in right lane
  private carVelX = 0;
  private carRoll = 0;
  private carPitch = 0;
  private carYaw = 0;
  private steerAngle = 0;
  private wheelSpin = 0;
  private autoCruisePhase = 0;
  private impactShake = 0;
  private telemetryTimer = 0;
  private disposed = false;

  // Progression, Stage Finish Line, Timer, AI Race Position, Score Multiplier, Petrol & Booster state
  private level = 1;
  private levelCoins = 0;
  private levelTarget = 10;
  private stageDistanceM = 0;
  private stageTargetM = 1200;
  private stageTimeLimitSec = levelTimeLimitFor(1);
  private stageTimeLeftSec = levelTimeLimitFor(1);
  private lastTimerBeepSec = -1;
  private racePosition = 5;
  private totalCoins = 0;
  private totalDiamonds = 0;
  private diamondBoosterProgress = 0;
  private overtakes = 0;
  private scoreFloat = 0;
  private comboCount = 0;
  private comboTimer = 0;
  private multiplier = 1;
  private fuelPct = 100;
  private boosterTimeLeft = 0;
  private boosterCharges = 1;
  private boostPadCooldown = 0;
  private coinStreak = 0;
  private coinWaveCounter = 0;
  private nextWaveCursorZ = -48;
  private unlockedAchievements = new Set<string>();

  // Day & Night Cycle state
  private dayCyclePhase = 0.22; // Start in crisp morning-daylight
  private hemiLight!: THREE.HemisphereLight;
  private sunKeyLight!: THREE.DirectionalLight;
  private rimLight!: THREE.DirectionalLight;
  private skyShaderMat!: THREE.ShaderMaterial;
  private starsMat!: THREE.PointsMaterial;
  private sunGroup!: THREE.Group;
  private sunHaloMat!: THREE.SpriteMaterial;
  private sunCoreMat!: THREE.MeshBasicMaterial;
  private moonGroup!: THREE.Group;
  private moonHaloMat!: THREE.SpriteMaterial;
  private moonCoreMat!: THREE.MeshBasicMaterial;
  private cloudMat!: THREE.MeshStandardMaterial;
  private reflectorMat!: THREE.MeshStandardMaterial;
  private roadMat!: THREE.MeshStandardMaterial;

  // Weather state (Clear <-> Rain <-> Storm)
  private weatherCyclePhase = 0;
  private rainIntensity = 0;
  private lightningFlash = 0;
  private nextLightningTimer = 4.5;
  private rainDrops: RainDrop[] = [];
  private rainInst!: THREE.InstancedMesh;
  private rainMat!: THREE.MeshBasicMaterial;

  // Frame loop handles
  private frameId = 0;
  private isTimeoutId = false;

  // Instanced roadside assets
  private pineProps: RecycledProp[] = [];
  private pineTrunkInst!: THREE.InstancedMesh;
  private pineFoliageInst!: THREE.InstancedMesh;
  private pineCrownInst!: THREE.InstancedMesh;

  private oakProps: RecycledProp[] = [];
  private oakTrunkInst!: THREE.InstancedMesh;
  private oakFoliageInst!: THREE.InstancedMesh;
  private oakCrownInst!: THREE.InstancedMesh;

  private bushProps: RecycledProp[] = [];
  private bushInst!: THREE.InstancedMesh;

  private flowerProps: RecycledProp[] = [];
  private flowerInst!: THREE.InstancedMesh;

  private rockProps: RecycledProp[] = [];
  private rockInst!: THREE.InstancedMesh;

  private postZPositions: number[] = [];
  private postInst!: THREE.InstancedMesh;
  private reflectorInst!: THREE.InstancedMesh;

  private arches: THREE.Group[] = [];
  private valleyMountains: THREE.Mesh[] = [];
  private clouds: CloudInstance[] = [];

  private speedParticles: SpeedParticle[] = [];
  private speedParticleInst!: THREE.InstancedMesh;

  // Collectible Coins, Diamonds, Petrol, Boosters & Sparkle Burst Pools
  private coinsPool: CoinItem[] = [];
  private coinRimInst!: THREE.InstancedMesh;
  private coinFaceInst!: THREE.InstancedMesh;
  private coinGlowInst!: THREE.InstancedMesh;

  private diamondsPool: CoinItem[] = [];
  private diamondGemInst!: THREE.InstancedMesh;
  private diamondGlowInst!: THREE.InstancedMesh;

  private petrolPool: GroupPickup[] = [];
  private boosterPool: GroupPickup[] = [];
  private boostPadsPool: GroupPickup[] = [];

  private burstPool: BurstParticle[] = [];
  private burstInst!: THREE.InstancedMesh;
  private burstCursor = 0;

  // Traffic cars, AI Rival Race Cars & 3D Finish Line
  private trafficCars: TrafficVehicle[] = [];
  private aiRacers: AiRacerVehicle[] = [];
  private finishLineGroup!: THREE.Group;

  private disposables: Array<{ dispose: () => void }> = [];
  private envRenderTarget: THREE.WebGLRenderTarget | null = null;

  constructor(
    container: HTMLElement,
    initialControls: HighwayControlsState,
    onTelemetry: (t: HighwayTelemetry) => void,
    onContextLostChange: (lost: boolean) => void,
    initialProgress?: Partial<SavedProgress>,
    onProgressSave?: (p: SavedProgress) => void,
    onLevelUp?: (
      level: number,
      placement?: number,
      completedLevel?: number,
      timeBonus?: number,
    ) => void,
    onAchievement?: (title: string, detail: string) => void,
    onStageTimeout?: (level: number) => void,
  ) {
    this.container = container;
    this.controlsState = { ...initialControls };
    this.onTelemetry = onTelemetry;
    this.onContextLostChange = onContextLostChange;
    this.onProgressSave = onProgressSave;
    this.onLevelUp = onLevelUp;
    this.onAchievement = onAchievement;
    this.onStageTimeout = onStageTimeout;
    this.isSoftwareGl = detectSoftwareGl();

    if (initialProgress) {
      this.level = Math.max(1, initialProgress.level ?? 1);
      this.levelTarget = levelTargetFor(this.level);
      this.stageTargetM = levelFinishDistanceFor(this.level);
      this.stageTimeLimitSec = levelTimeLimitFor(this.level);
      this.stageDistanceM = Math.max(
        0,
        Math.min(this.stageTargetM - 50, initialProgress.stageDistanceM ?? 0),
      );
      const savedTimeLeft = initialProgress.stageTimeLeftSec;
      this.stageTimeLeftSec =
        typeof savedTimeLeft === 'number' &&
        savedTimeLeft > 0 &&
        savedTimeLeft <= this.stageTimeLimitSec
          ? savedTimeLeft
          : this.stageTimeLimitSec;
      this.levelCoins = Math.max(0, Math.min(this.levelTarget - 1, initialProgress.levelCoins ?? 0));
      this.totalCoins = Math.max(0, initialProgress.coins ?? 0);
      this.totalDiamonds = Math.max(0, initialProgress.diamonds ?? 0);
      this.diamondBoosterProgress = Math.max(
        0,
        Math.min(DIAMOND_BOOSTER_GOAL - 1, initialProgress.diamondBoosterProgress ?? 0),
      );
      this.overtakes = Math.max(0, initialProgress.overtakes ?? 0);
      this.scoreFloat = Math.max(0, initialProgress.score ?? 0);
      this.distanceUnits = Math.max(0, (initialProgress.distanceKm ?? 0) * 1000);
    }

    if (initialControls.timeMode === 'day') this.dayCyclePhase = 0.25;
    else if (initialControls.timeMode === 'sunset') this.dayCyclePhase = 0.5;
    else if (initialControls.timeMode === 'night') this.dayCyclePhase = 0.75;

    if (initialControls.weatherMode === 'rain') this.rainIntensity = 0.62;
    else if (initialControls.weatherMode === 'storm') this.rainIntensity = 1.0;

    // 1. Renderer setup with Software-WebGL guard and ACES Filmic color pipeline
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    // 2. Scene, Horizon Fog & Camera
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xbfefff);
    this.scene.fog = new THREE.Fog(0xbfefff, 135, 410);

    const aspect = (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(62, aspect, 0.25, 650);
    this.camera.position.set(2.6, 4.4, 9.8);
    this.camera.lookAt(_currentLookAt);

    // 3. Mandatory Studio Environment Reflection (RoomEnvironment) on every device
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.envRenderTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    this.scene.environment = this.envRenderTarget.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    // 4. Procedural Textures & Geometries
    this.textures = createProceduralTextures(this.renderer.capabilities.getMaxAnisotropy());
    this.foliageGeos = createFoliageGeometries();
    this.coinGeos = createCoinGeometries();
    this.diamondGeos = createDiamondGeometries();

    // 5. Build World
    this.setupLighting();
    this.buildSkyAndClouds();
    this.buildRoadAndTerrain();
    this.buildMountains();
    this.buildInstancedFoliage();
    this.buildHighwayArches();
    this.buildCoinsAndBursts();
    this.buildDiamondsPetrolAndBoosters();
    this.buildRainSystem();
    this.buildSpeedParticles();
    this.buildTrafficCars();
    this.buildAiRacersAndFinishLine();

    // 6. Hero Race Car
    this.car = createRaceCar(this.textures.contactShadow, this.controlsState.carColor);
    this.car.group.position.set(this.carX, 0, 0);
    this.scene.add(this.car.group);

    // Apply initial atmosphere state immediately
    this.applyAtmosphere(this.dayCyclePhase, 0);

    // 7. Pre-compile shaders on hardware GPUs
    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // 8. Listeners & Loop
    window.addEventListener('resize', this.handleResize);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.handleResize();
      });
      this.resizeObserver.observe(this.container);
    }
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.handleContextRestored);

    this.clock.start();
    this.tick();
  }

  private setupLighting(): void {
    // Cool sky / lush green meadow bounce HemisphereLight
    this.hemiLight = new THREE.HemisphereLight(0x7dd3fc, 0x22c55e, 1.05);
    this.hemiLight.position.set(0, 80, 0);
    this.scene.add(this.hemiLight);

    // Warm golden sunlight / cool moonlight Key Light
    this.sunKeyLight = new THREE.DirectionalLight(0xfff4d4, 2.05);
    this.sunKeyLight.position.set(42, 72, -28);
    this.sunKeyLight.castShadow = true;
    this.sunKeyLight.shadow.mapSize.width = 2048;
    this.sunKeyLight.shadow.mapSize.height = 2048;
    this.sunKeyLight.shadow.camera.near = 10;
    this.sunKeyLight.shadow.camera.far = 175;
    this.sunKeyLight.shadow.camera.left = -36;
    this.sunKeyLight.shadow.camera.right = 36;
    this.sunKeyLight.shadow.camera.top = 36;
    this.sunKeyLight.shadow.camera.bottom = -36;
    this.sunKeyLight.shadow.bias = -0.0005;
    this.sunKeyLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunKeyLight);

    // Subtle Rim/Fill Light from behind
    this.rimLight = new THREE.DirectionalLight(0xbae6fd, 0.55);
    this.rimLight.position.set(-35, 24, 42);
    this.scene.add(this.rimLight);
  }

  private buildSkyAndClouds(): void {
    // Smooth procedural sky dome shader for Dawn <-> Day <-> Sunset <-> Night transitions
    const skyGeo = new THREE.SphereGeometry(480, 32, 24);
    this.skyShaderMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
      uniforms: {
        uTopColor: { value: new THREE.Color('#0D6EFD') },
        uMidColor: { value: new THREE.Color('#38BDF8') },
        uHorizonColor: { value: new THREE.Color('#BFEFFF') },
        uSunDir: { value: new THREE.Vector3(0.3, 0.5, -0.8).normalize() },
        uSunGlow: { value: 0.45 },
      },
      vertexShader: `
        varying vec3 vWorldDir;
        void main() {
          vWorldDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uTopColor;
        uniform vec3 uMidColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uSunDir;
        uniform float uSunGlow;
        varying vec3 vWorldDir;
        void main() {
          float h = clamp(vWorldDir.y, 0.0, 1.0);
          vec3 col = mix(uHorizonColor, uMidColor, smoothstep(0.0, 0.28, h));
          col = mix(col, uTopColor, smoothstep(0.24, 0.85, h));
          float sunDot = max(dot(normalize(vWorldDir), normalize(uSunDir)), 0.0);
          col += vec3(1.0, 0.86, 0.62) * pow(sunDot, 12.0) * uSunGlow;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const skyDome = new THREE.Mesh(skyGeo, this.skyShaderMat);
    skyDome.renderOrder = -3;
    this.scene.add(skyDome);
    this.disposables.push(skyGeo, this.skyShaderMat);

    // Twinkling Starfield on upper hemisphere for Sunset / Night
    const starCount = 420;
    const starPositions = new Float32Array(starCount * 3);
    const starRng = makeRng(777);
    for (let i = 0; i < starCount; i++) {
      const theta = starRng() * Math.PI * 2;
      const phi = Math.acos(0.08 + starRng() * 0.92); // upper sky only
      const r = 445;
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.cos(phi);
      starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    this.starsMat = new THREE.PointsMaterial({
      color: 0xf8fafc,
      size: 2.3,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      fog: false,
      depthWrite: false,
    });
    const stars = new THREE.Points(starGeo, this.starsMat);
    stars.renderOrder = -2;
    this.scene.add(stars);
    this.disposables.push(starGeo, this.starsMat);

    // Cheerful Cartoon Sun (halo + bright disc)
    this.sunGroup = new THREE.Group();
    this.sunHaloMat = new THREE.SpriteMaterial({
      map: this.textures.sunHalo,
      transparent: true,
      depthWrite: false,
      fog: false,
      opacity: 1,
    });
    const sunSprite = new THREE.Sprite(this.sunHaloMat);
    sunSprite.scale.set(92, 92, 1);
    this.sunGroup.add(sunSprite);

    const sunCoreGeo = new THREE.CircleGeometry(14, 24);
    this.sunCoreMat = new THREE.MeshBasicMaterial({
      color: 0xfffbeb,
      fog: false,
      transparent: true,
      opacity: 1,
    });
    const sunCore = new THREE.Mesh(sunCoreGeo, this.sunCoreMat);
    sunCore.position.z = 1;
    this.sunGroup.add(sunCore);
    this.scene.add(this.sunGroup);
    this.disposables.push(this.sunHaloMat, sunCoreGeo, this.sunCoreMat);

    // Friendly Glowing Cartoon Moon (halo + silver-cream disc)
    this.moonGroup = new THREE.Group();
    this.moonHaloMat = new THREE.SpriteMaterial({
      map: this.textures.moonHalo,
      transparent: true,
      depthWrite: false,
      fog: false,
      opacity: 0,
    });
    const moonSprite = new THREE.Sprite(this.moonHaloMat);
    moonSprite.scale.set(68, 68, 1);
    this.moonGroup.add(moonSprite);

    const moonCoreGeo = new THREE.CircleGeometry(10.5, 24);
    this.moonCoreMat = new THREE.MeshBasicMaterial({
      color: 0xf1f5f9,
      fog: false,
      transparent: true,
      opacity: 0,
    });
    const moonCore = new THREE.Mesh(moonCoreGeo, this.moonCoreMat);
    moonCore.position.z = 1;
    this.moonGroup.add(moonCore);
    this.scene.add(this.moonGroup);
    this.disposables.push(this.moonHaloMat, moonCoreGeo, this.moonCoreMat);

    // 18 Composite 3D Fluffy Cartoon Clouds floating across the sky
    this.cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.92,
      metalness: 0.0,
      emissive: 0xe0f2fe,
      emissiveIntensity: 0.25,
      fog: false,
    });
    this.disposables.push(this.cloudMat);

    const rng = makeRng(404);
    for (let i = 0; i < 18; i++) {
      const cloudGroup = createCloudGroup(this.cloudMat, i * 1.7);
      const x = -220 + (i / 17) * 440 + (rng() - 0.5) * 28;
      const y = 44 + rng() * 52;
      const z = -110 - rng() * 220;
      const scale = 2.6 + rng() * 3.4;

      cloudGroup.position.set(x, y, z);
      cloudGroup.scale.setScalar(scale);
      cloudGroup.rotation.y = (rng() - 0.5) * 0.4;
      this.scene.add(cloudGroup);

      this.clouds.push({
        group: cloudGroup,
        driftSpeed: 1.4 + rng() * 2.2,
        baseY: y,
        bobPhase: rng() * Math.PI * 2,
      });
    }
  }

  private buildRoadAndTerrain(): void {
    // 1. Main 2-lane asphalt highway with center dashed lane markings
    const roadGeo = new THREE.PlaneGeometry(14.2, ROAD_LENGTH);
    roadGeo.rotateX(-Math.PI / 2);
    this.roadMat = new THREE.MeshStandardMaterial({
      map: this.textures.road,
      roughness: 0.84,
      metalness: 0.04,
    });
    const roadMesh = new THREE.Mesh(roadGeo, this.roadMat);
    roadMesh.position.set(0, 0, ROAD_CENTER_Z);
    roadMesh.receiveShadow = true;
    this.scene.add(roadMesh);
    this.disposables.push(roadGeo, this.roadMat);

    // 2. Left & Right Cartoon Coral-Red / Cream Curbs (offset cleanly above road)
    const curbGeo = new THREE.BoxGeometry(0.62, 0.14, ROAD_LENGTH);
    const curbMat = new THREE.MeshStandardMaterial({
      map: this.textures.curb,
      roughness: 0.65,
      metalness: 0.05,
    });
    for (const side of [-1, 1] as const) {
      const curb = new THREE.Mesh(curbGeo, curbMat);
      curb.position.set(side * 7.25, 0.07, ROAD_CENTER_Z);
      curb.receiveShadow = true;
      this.scene.add(curb);
    }
    this.disposables.push(curbGeo, curbMat);

    // 3. Continuous Metallic Highway Guardrail Beams + Instanced Posts + Night Reflectors
    const railGeo = new THREE.BoxGeometry(0.16, 0.28, ROAD_LENGTH);
    const railMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.34,
      metalness: 0.72,
    });
    for (const side of [-1, 1] as const) {
      const rail = new THREE.Mesh(railGeo, railMat);
      rail.position.set(side * 7.95, 0.68, ROAD_CENTER_Z);
      rail.castShadow = true;
      rail.receiveShadow = true;
      this.scene.add(rail);
    }
    this.disposables.push(railGeo, railMat);

    const postCountPerSide = 56;
    const postSpacing = PROP_Z_SPAN / postCountPerSide;
    const postGeo = new THREE.BoxGeometry(0.2, 0.88, 0.2);
    postGeo.translate(0, 0.44, 0);
    const postMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.48,
      metalness: 0.55,
    });
    this.postInst = new THREE.InstancedMesh(postGeo, postMat, postCountPerSide * 2);
    this.postInst.frustumCulled = false;
    this.postInst.castShadow = true;

    const reflectorGeo = new THREE.BoxGeometry(0.18, 0.14, 0.14);
    reflectorGeo.translate(0, 0.94, 0);
    this.reflectorMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.15,
      roughness: 0.3,
      metalness: 0.2,
    });
    this.reflectorInst = new THREE.InstancedMesh(reflectorGeo, this.reflectorMat, postCountPerSide * 2);
    this.reflectorInst.frustumCulled = false;

    for (let i = 0; i < postCountPerSide; i++) {
      this.postZPositions.push(PROP_Z_MIN + i * postSpacing);
    }
    this.updatePostInstances();
    this.scene.add(this.postInst, this.reflectorInst);
    this.disposables.push(postGeo, postMat, reflectorGeo, this.reflectorMat);

    // 4. Rolling Green Cartoon Meadow Terrain Banks on Both Sides
    const grassMat = new THREE.MeshStandardMaterial({
      map: this.textures.grass,
      roughness: 0.92,
      metalness: 0.0,
    });
    const leftTerrainGeo = createSideTerrainGeometry(-1, ROAD_LENGTH);
    const rightTerrainGeo = createSideTerrainGeometry(1, ROAD_LENGTH);

    const leftTerrain = new THREE.Mesh(leftTerrainGeo, grassMat);
    leftTerrain.position.z = ROAD_CENTER_Z;
    leftTerrain.receiveShadow = true;
    this.scene.add(leftTerrain);

    const rightTerrain = new THREE.Mesh(rightTerrainGeo, grassMat);
    rightTerrain.position.z = ROAD_CENTER_Z;
    rightTerrain.receiveShadow = true;
    this.scene.add(rightTerrain);

    this.disposables.push(leftTerrainGeo, rightTerrainGeo, grassMat);
  }

  private buildMountains(): void {
    const mtnMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 0.88,
      metalness: 0.02,
    });
    this.disposables.push(mtnMat);

    // 1. Majestic Distant Horizon Mountain Panorama
    const horizonSpecs: Array<[number, number, number, number, number, number]> = [
      [-230, -295, 76, 105, 0.62, 1.1],
      [-155, -325, 88, 132, 0.58, 2.4],
      [-72, -345, 92, 118, 0.6, 3.7],
      [15, -355, 102, 138, 0.56, 4.9],
      [105, -335, 86, 124, 0.6, 6.2],
      [190, -305, 82, 112, 0.62, 7.5],
      [255, -265, 74, 96, 0.64, 8.8],
      [-270, -225, 68, 86, 0.65, 9.4],
    ];

    for (const [x, z, r, h, snow, seed] of horizonSpecs) {
      const geo = createMountainPeakGeometry(r, h, snow, seed);
      const peak = new THREE.Mesh(geo, mtnMat);
      peak.position.set(x, -2, z);
      peak.rotation.y = seed * 0.7;
      this.scene.add(peak);
      this.disposables.push(geo);
    }

    // 2. Scrolling Side Mountain Foothills flanking left & right sides of the valley
    const rng = makeRng(808);
    const valleyGeoA = createMountainPeakGeometry(34, 46, 0.68, 11.2);
    const valleyGeoB = createMountainPeakGeometry(42, 58, 0.62, 23.7);
    this.disposables.push(valleyGeoA, valleyGeoB);

    const countPerSide = 12;
    const step = VALLEY_MTN_Z_SPAN / countPerSide;
    for (let i = 0; i < countPerSide; i++) {
      for (const side of [-1, 1] as const) {
        const useB = (i + (side > 0 ? 1 : 0)) % 2 === 0;
        const mtn = new THREE.Mesh(useB ? valleyGeoB : valleyGeoA, mtnMat);
        const x = side * (74 + rng() * 52);
        const z = VALLEY_MTN_Z_MIN + i * step + (rng() - 0.5) * 14;
        const scaleXZ = 0.85 + rng() * 0.55;
        const scaleY = 0.78 + rng() * 0.55;
        mtn.position.set(x, 0, z);
        mtn.scale.set(scaleXZ, scaleY, scaleXZ);
        mtn.rotation.y = rng() * Math.PI * 2;
        this.scene.add(mtn);
        this.valleyMountains.push(mtn);
      }
    }
  }

  private buildInstancedFoliage(): void {
    const rng = makeRng(2026);

    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x7c4a2d,
      roughness: 0.92,
      metalness: 0.0,
      flatShading: true,
    });
    const pineFoliageMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.74,
      metalness: 0.0,
      flatShading: true,
    });
    const pineCrownMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.65,
      metalness: 0.0,
      flatShading: true,
    });
    const oakFoliageMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.76,
      metalness: 0.0,
      flatShading: true,
    });
    const oakCrownMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.64,
      metalness: 0.0,
      flatShading: true,
    });
    const bushMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.8,
      metalness: 0.0,
      flatShading: true,
    });
    const flowerMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.55,
      metalness: 0.0,
      flatShading: true,
    });
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.86,
      metalness: 0.04,
      flatShading: true,
    });
    this.disposables.push(
      trunkMat,
      pineFoliageMat,
      pineCrownMat,
      oakFoliageMat,
      oakCrownMat,
      bushMat,
      flowerMat,
      rockMat,
    );

    // 1. Pine Trees (160)
    const pineCount = 160;
    this.pineTrunkInst = new THREE.InstancedMesh(this.foliageGeos.pineTrunk, trunkMat, pineCount);
    this.pineFoliageInst = new THREE.InstancedMesh(this.foliageGeos.pineFoliage, pineFoliageMat, pineCount);
    this.pineCrownInst = new THREE.InstancedMesh(this.foliageGeos.pineCrown, pineCrownMat, pineCount);
    for (const inst of [this.pineTrunkInst, this.pineFoliageInst, this.pineCrownInst]) {
      inst.frustumCulled = false;
      inst.castShadow = true;
      inst.receiveShadow = true;
    }

    const pineShades = ['#16A34A', '#15803D', '#22C55E', '#10B981'];
    const pineCrownShades = ['#4ADE80', '#34D399', '#86EFAC'];
    for (let i = 0; i < pineCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const band = rng();
      const x = side * (11.2 + band * band * 48);
      const y = groundHeightAt(x);
      const z = PROP_Z_MIN + (i / pineCount) * PROP_Z_SPAN + (rng() - 0.5) * 4;
      const scale = 0.85 + rng() * 0.45;
      this.pineProps.push({ x, y, z, rotY: rng() * Math.PI * 2, scale });

      _color.set(pineShades[Math.floor(rng() * pineShades.length)]);
      this.pineFoliageInst.setColorAt(i, _color);
      _color.set(pineCrownShades[Math.floor(rng() * pineCrownShades.length)]);
      this.pineCrownInst.setColorAt(i, _color);
    }
    if (this.pineFoliageInst.instanceColor) this.pineFoliageInst.instanceColor.needsUpdate = true;
    if (this.pineCrownInst.instanceColor) this.pineCrownInst.instanceColor.needsUpdate = true;
    this.scene.add(this.pineTrunkInst, this.pineFoliageInst, this.pineCrownInst);

    // 2. Fluffy Oak Trees (140)
    const oakCount = 140;
    this.oakTrunkInst = new THREE.InstancedMesh(this.foliageGeos.oakTrunk, trunkMat, oakCount);
    this.oakFoliageInst = new THREE.InstancedMesh(this.foliageGeos.oakFoliage, oakFoliageMat, oakCount);
    this.oakCrownInst = new THREE.InstancedMesh(this.foliageGeos.oakCrown, oakCrownMat, oakCount);
    for (const inst of [this.oakTrunkInst, this.oakFoliageInst, this.oakCrownInst]) {
      inst.frustumCulled = false;
      inst.castShadow = true;
      inst.receiveShadow = true;
    }

    const oakShades = ['#22C55E', '#2ECC71', '#16A34A', '#4ADE80'];
    const oakCrownShades = ['#86EFAC', '#6EE7B7', '#A3E635'];
    for (let i = 0; i < oakCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const band = rng();
      const x = side * (11.5 + band * band * 44);
      const y = groundHeightAt(x);
      const z = PROP_Z_MIN + (i / oakCount) * PROP_Z_SPAN + (rng() - 0.5) * 5;
      const scale = 0.85 + rng() * 0.38;
      this.oakProps.push({ x, y, z, rotY: rng() * Math.PI * 2, scale });

      _color.set(oakShades[Math.floor(rng() * oakShades.length)]);
      this.oakFoliageInst.setColorAt(i, _color);
      _color.set(oakCrownShades[Math.floor(rng() * oakCrownShades.length)]);
      this.oakCrownInst.setColorAt(i, _color);
    }
    if (this.oakFoliageInst.instanceColor) this.oakFoliageInst.instanceColor.needsUpdate = true;
    if (this.oakCrownInst.instanceColor) this.oakCrownInst.instanceColor.needsUpdate = true;
    this.scene.add(this.oakTrunkInst, this.oakFoliageInst, this.oakCrownInst);

    // 3. Roadside Bushes (180)
    const bushCount = 180;
    this.bushInst = new THREE.InstancedMesh(this.foliageGeos.bushFoliage, bushMat, bushCount);
    this.bushInst.frustumCulled = false;
    this.bushInst.castShadow = true;
    this.bushInst.receiveShadow = true;
    const bushShades = ['#22C55E', '#4ADE80', '#16A34A', '#34D399'];
    for (let i = 0; i < bushCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * (9.5 + rng() * 24);
      const y = groundHeightAt(x);
      const z = PROP_Z_MIN + rng() * PROP_Z_SPAN;
      const scale = 0.72 + rng() * 0.58;
      this.bushProps.push({ x, y, z, rotY: rng() * Math.PI * 2, scale });
      _color.set(bushShades[Math.floor(rng() * bushShades.length)]);
      this.bushInst.setColorAt(i, _color);
    }
    if (this.bushInst.instanceColor) this.bushInst.instanceColor.needsUpdate = true;
    this.scene.add(this.bushInst);

    // 4. Colorful Cartoon Wildflowers (140)
    const flowerCount = 140;
    this.flowerInst = new THREE.InstancedMesh(this.foliageGeos.flowerHeads, flowerMat, flowerCount);
    this.flowerInst.frustumCulled = false;
    const flowerPalette = ['#FDE047', '#FB7185', '#F472B6', '#C084FC', '#FFFFFF', '#FBBF24'];
    for (let i = 0; i < flowerCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * (9.2 + rng() * 14);
      const y = groundHeightAt(x);
      const z = PROP_Z_MIN + rng() * PROP_Z_SPAN;
      const scale = 0.85 + rng() * 0.55;
      this.flowerProps.push({ x, y, z, rotY: rng() * Math.PI * 2, scale });
      _color.set(flowerPalette[Math.floor(rng() * flowerPalette.length)]);
      this.flowerInst.setColorAt(i, _color);
    }
    if (this.flowerInst.instanceColor) this.flowerInst.instanceColor.needsUpdate = true;
    this.scene.add(this.flowerInst);

    // 5. Stylized Cartoon Boulders (48)
    const rockCount = 48;
    this.rockInst = new THREE.InstancedMesh(this.foliageGeos.rock, rockMat, rockCount);
    this.rockInst.frustumCulled = false;
    this.rockInst.castShadow = true;
    this.rockInst.receiveShadow = true;
    const rockPalette = ['#94A3B8', '#CBD5E1', '#A8A29E'];
    for (let i = 0; i < rockCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * (11.8 + rng() * 34);
      const y = groundHeightAt(x);
      const z = PROP_Z_MIN + rng() * PROP_Z_SPAN;
      const scale = 0.75 + rng() * 0.95;
      this.rockProps.push({ x, y, z, rotY: rng() * Math.PI * 2, scale });
      _color.set(rockPalette[Math.floor(rng() * rockPalette.length)]);
      this.rockInst.setColorAt(i, _color);
    }
    if (this.rockInst.instanceColor) this.rockInst.instanceColor.needsUpdate = true;
    this.scene.add(this.rockInst);

    this.syncAllFoliageMatrices();
  }

  private buildHighwayArches(): void {
    const zStarts = [-85, -265];
    for (const z of zStarts) {
      const arch = createHighwayArch(this.textures.archBanner);
      arch.position.set(0, 0, z);
      this.scene.add(arch);
      this.arches.push(arch);
    }
  }

  private buildCoinsAndBursts(): void {
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      metalness: 0.88,
      roughness: 0.16,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.36,
    });
    const faceMat = new THREE.MeshStandardMaterial({
      map: this.textures.coinFace,
      metalness: 0.55,
      roughness: 0.24,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.28,
    });
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xfde047,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.coinRimInst = new THREE.InstancedMesh(this.coinGeos.rim, rimMat, COIN_COUNT);
    this.coinFaceInst = new THREE.InstancedMesh(this.coinGeos.face, faceMat, COIN_COUNT);
    this.coinGlowInst = new THREE.InstancedMesh(this.coinGeos.glowRing, glowMat, COIN_COUNT);

    for (const inst of [this.coinRimInst, this.coinFaceInst, this.coinGlowInst]) {
      inst.frustumCulled = false;
    }
    this.coinRimInst.castShadow = true;
    this.coinFaceInst.castShadow = true;

    this.scene.add(this.coinRimInst, this.coinFaceInst, this.coinGlowInst);
    this.disposables.push(rimMat, faceMat, glowMat);

    // Initialize coin pool in spaced driving waves along the highway
    for (let i = 0; i < COIN_COUNT; i++) {
      this.coinsPool.push({ active: false, x: 0, z: 20, phase: i * 0.7 });
    }
    this.populateInitialCoins();

    // Sparkle burst particle pool
    const burstMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.95,
    });
    this.burstInst = new THREE.InstancedMesh(this.coinGeos.sparkle, burstMat, BURST_POOL_SIZE);
    this.burstInst.frustumCulled = false;
    for (let i = 0; i < BURST_POOL_SIZE; i++) {
      this.burstPool.push({
        active: false,
        x: 0,
        y: -10,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 0.5,
      });
    }
    this.scene.add(this.burstInst);
    this.disposables.push(burstMat);
  }

  private populateInitialCoins(): void {
    this.nextWaveCursorZ = -46;
    let idx = 0;
    while (idx < COIN_COUNT) {
      idx = this.spawnCoinWaveAt(idx, this.nextWaveCursorZ);
      this.nextWaveCursorZ -= 56;
    }
  }

  private spawnCoinWaveAt(startIndex: number, startZ: number): number {
    const waveSize = Math.min(5, COIN_COUNT - startIndex);
    if (waveSize <= 0) return startIndex;

    this.coinWaveCounter += 1;
    const patternCount = this.level >= 2 ? 4 : 3;
    const pattern = this.coinWaveCounter % patternCount;
    const laneSign = this.coinWaveCounter % 2 === 0 ? 1 : -1;
    const spacing = Math.max(8.5, 11.5 - Math.min(this.level, 6) * 0.4);

    for (let k = 0; k < waveSize; k++) {
      const item = this.coinsPool[startIndex + k];
      let x = 0;
      if (pattern === 0) {
        // Clean lane line
        x = laneSign * 2.65;
      } else if (pattern === 1) {
        // Center dash line
        x = 0;
      } else if (pattern === 2) {
        // Gentle diagonal lane switch
        const t = waveSize > 1 ? k / (waveSize - 1) : 0;
        x = laneSign * (-2.8 + t * 5.6);
      } else {
        // S-curve slalom (unlocked at Level 2+)
        x = Math.sin(k * 0.85 + this.coinWaveCounter) * 3.2;
      }

      item.active = true;
      item.x = THREE.MathUtils.clamp(x, -4.1, 4.1);
      item.z = startZ - k * spacing;
      item.phase = k * 0.65;
    }
    return startIndex + waveSize;
  }

  private buildDiamondsPetrolAndBoosters(): void {
    // 1. Rare Prismatic Diamonds (sparse along highway; 3 rare diamonds = +1 Nitro Booster)
    const diamondMat = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      emissive: 0xa855f7,
      emissiveIntensity: 0.68,
      roughness: 0.08,
      metalness: 0.4,
      clearcoat: 1.0,
      flatShading: true,
    });
    const diamondGlowMat = new THREE.MeshBasicMaterial({
      color: 0xe879f9,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.diamondGemInst = new THREE.InstancedMesh(this.diamondGeos.gem, diamondMat, DIAMOND_COUNT);
    this.diamondGlowInst = new THREE.InstancedMesh(this.diamondGeos.glowRing, diamondGlowMat, DIAMOND_COUNT);
    this.diamondGemInst.frustumCulled = false;
    this.diamondGlowInst.frustumCulled = false;
    this.diamondGemInst.castShadow = true;
    this.scene.add(this.diamondGemInst, this.diamondGlowInst);
    this.disposables.push(diamondMat, diamondGlowMat);

    // Spawn rare diamonds far apart down the highway
    for (let i = 0; i < DIAMOND_COUNT; i++) {
      const z = -155 - i * 195;
      const laneX = i % 2 === 0 ? -2.65 : 2.65;
      this.diamondsPool.push({
        active: true,
        x: laneX,
        z,
        phase: i * 1.4,
      });
    }

    // 2. Composite Petrol Can Pickups
    for (let i = 0; i < PETROL_COUNT; i++) {
      const group = createPetrolPickupGroup();
      const x = i % 2 === 0 ? 2.8 : -2.8;
      const z = -105 - i * 118;
      group.position.set(x, 0, z);
      this.scene.add(group);
      this.petrolPool.push({
        group,
        active: true,
        x,
        z,
        phase: i * 1.3,
      });
    }

    // 3. Composite Nitro Booster Pickups (more frequent along the highway)
    for (let i = 0; i < BOOSTER_COUNT; i++) {
      const group = createBoosterPickupGroup();
      const x = i % 2 === 0 ? -2.8 : 2.8;
      const z = -95 - i * 86;
      group.position.set(x, 0, z);
      this.scene.add(group);
      this.boosterPool.push({
        group,
        active: true,
        x,
        z,
        phase: i * 1.7,
      });
    }

    // 4. Flush-on-Road 3D Turbo Boost Pads
    for (let i = 0; i < BOOST_PAD_COUNT; i++) {
      const group = createBoostPadGroup();
      const x = i % 2 === 0 ? LANE_OFFSET_X : -LANE_OFFSET_X;
      const z = -72 - i * 105;
      group.position.set(x, 0, z);
      this.scene.add(group);
      this.boostPadsPool.push({
        group,
        active: true,
        x,
        z,
        phase: i * 1.1,
      });
    }
  }

  private buildRainSystem(): void {
    const rainGeo = new THREE.BoxGeometry(0.035, 1.35, 0.035);
    this.rainMat = new THREE.MeshBasicMaterial({
      color: 0xcbd5e1,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.rainInst = new THREE.InstancedMesh(rainGeo, this.rainMat, RAIN_COUNT);
    this.rainInst.frustumCulled = false;
    this.rainInst.visible = false;

    const rng = makeRng(5150);
    for (let i = 0; i < RAIN_COUNT; i++) {
      this.rainDrops.push({
        x: (rng() - 0.5) * 44,
        y: rng() * 24,
        z: -62 + rng() * 74,
        speedY: 26 + rng() * 14,
      });
    }
    this.scene.add(this.rainInst);
    this.disposables.push(rainGeo, this.rainMat);
  }

  private spawnCoinBurst(x: number, y: number, z: number): void {
    const count = 8;
    for (let i = 0; i < count; i++) {
      const p = this.burstPool[this.burstCursor];
      this.burstCursor = (this.burstCursor + 1) % BURST_POOL_SIZE;
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const radial = 3.2 + Math.random() * 2.8;
      p.active = true;
      p.x = x;
      p.y = y;
      p.z = z;
      p.vx = Math.cos(angle) * radial;
      p.vy = 3.4 + Math.random() * 3.2;
      p.vz = Math.sin(angle) * radial * 0.4;
      p.life = 0;
      p.maxLife = 0.42 + Math.random() * 0.16;
    }
  }

  private buildSpeedParticles(): void {
    const count = 42;
    const geo = new THREE.BoxGeometry(0.05, 0.05, 2.2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.45,
    });
    this.speedParticleInst = new THREE.InstancedMesh(geo, mat, count);
    this.speedParticleInst.frustumCulled = false;
    const rng = makeRng(999);
    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      this.speedParticles.push({
        x: side * (3.2 + rng() * 7.5),
        y: 0.7 + rng() * 4.5,
        z: -80 + rng() * 90,
        speedMul: 1.4 + rng() * 0.8,
      });
    }
    this.scene.add(this.speedParticleInst);
    this.disposables.push(geo, mat);
  }

  private buildTrafficCars(): void {
    const archetypes: TrafficCarArchetype[] = [
      'sedan',
      'suv',
      'pickup',
      'sedan',
      'suv',
      'sedan',
      'pickup',
      'suv',
    ];
    const palette = [
      '#0EA5E9', // Sky Blue
      '#F59E0B', // Sunburst Amber
      '#10B981', // Mint Emerald
      '#8B5CF6', // Violet
      '#EC4899', // Flamingo Pink
      '#14B8A6', // Teal
      '#F97316', // Tangerine
      '#EAB308', // Lemon Gold
      '#06B6D4', // Cyan
      '#FB7185', // Coral Rose
      '#22C55E', // Meadow Green
      '#6366F1', // Indigo
    ];
    const initialOffsetsZ = [
      -38, -56, -78, -98, -120, -140, -162, -182,
      -204, -224, -246, -266, -288, -308, -330, -350,
    ];

    for (let i = 0; i < TRAFFIC_COUNT; i++) {
      // Stagger lanes with subtle variation so highway traffic feels busy and organic
      const lane: -1 | 1 = i % 2 === 0 ? -1 : 1;
      const x = lane * LANE_OFFSET_X;
      const z = initialOffsetsZ[i];
      const baseSpeedUnits = lane === -1 ? 24 + (i % 4) * 2.5 : 17.5 + (i % 4) * 2.3;

      const handle = createTrafficCar(
        this.textures.contactShadow,
        archetypes[i % archetypes.length],
        palette[i % palette.length],
      );
      handle.group.position.set(x, 0, z);
      this.scene.add(handle.group);

      this.trafficCars.push({
        handle,
        lane,
        x,
        z,
        baseSpeedUnits,
        speedUnits: baseSpeedUnits,
        wheelSpin: 0,
        isBraking: false,
        bumpCooldown: 0,
        laneChangeCooldown: (i % 5) * 1.2,
        passedAwarded: false,
      });
    }
  }

  private buildAiRacersAndFinishLine(): void {
    const rivals: Array<{ name: string; color: string; laneX: number; leadM: number; skill: number }> = [
      { name: 'Blaze', color: '#F59E0B', laneX: -2.8, leadM: 32, skill: -1.4 },
      { name: 'Vortex', color: '#0EA5E9', laneX: 2.8, leadM: 68, skill: 0.4 },
      { name: 'Nova', color: '#8B5CF6', laneX: -2.6, leadM: 108, skill: 1.8 },
      { name: 'Viper', color: '#10B981', laneX: 2.6, leadM: 146, skill: 3.1 },
    ];

    for (let i = 0; i < rivals.length; i++) {
      const r = rivals[i];
      const handle = createRaceCar(this.textures.contactShadow, r.color);
      const progressM = this.stageDistanceM + r.leadM;
      const z = this.stageDistanceM - progressM;
      handle.group.position.set(r.laneX, 0, z);
      this.scene.add(handle.group);

      this.aiRacers.push({
        handle,
        name: r.name,
        x: r.laneX,
        z,
        targetX: r.laneX,
        stageProgressM: progressM,
        skillOffset: r.skill,
        speedUnits: 34 + r.skill,
        wheelSpin: 0,
        boostTimer: 0,
        nextBoostIn: 3.5 + i * 2.1,
        bumpCooldown: 0,
        laneTimer: 1.5 + i * 0.8,
      });
    }

    this.finishLineGroup = createFinishLineGroup(
      this.textures.finishBanner,
      this.textures.finishChecker,
    );
    this.finishLineGroup.visible = false;
    this.scene.add(this.finishLineGroup);
  }

  private updatePostInstances(): void {
    let idx = 0;
    for (let i = 0; i < this.postZPositions.length; i++) {
      const z = this.postZPositions[i];
      for (const side of [-1, 1] as const) {
        _dummy.position.set(side * 8.02, 0, z);
        _dummy.rotation.set(0, 0, 0);
        _dummy.scale.set(1, 1, 1);
        _dummy.updateMatrix();
        this.postInst.setMatrixAt(idx, _dummy.matrix);
        this.reflectorInst.setMatrixAt(idx, _dummy.matrix);
        idx++;
      }
    }
    this.postInst.instanceMatrix.needsUpdate = true;
    this.reflectorInst.instanceMatrix.needsUpdate = true;
  }

  private syncAllFoliageMatrices(): void {
    for (let i = 0; i < this.pineProps.length; i++) {
      const p = this.pineProps[i];
      _dummy.position.set(p.x, p.y, p.z);
      _dummy.rotation.set(0, p.rotY, 0);
      _dummy.scale.setScalar(p.scale);
      _dummy.updateMatrix();
      this.pineTrunkInst.setMatrixAt(i, _dummy.matrix);
      this.pineFoliageInst.setMatrixAt(i, _dummy.matrix);
      this.pineCrownInst.setMatrixAt(i, _dummy.matrix);
    }
    this.pineTrunkInst.instanceMatrix.needsUpdate = true;
    this.pineFoliageInst.instanceMatrix.needsUpdate = true;
    this.pineCrownInst.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < this.oakProps.length; i++) {
      const p = this.oakProps[i];
      _dummy.position.set(p.x, p.y, p.z);
      _dummy.rotation.set(0, p.rotY, 0);
      _dummy.scale.setScalar(p.scale);
      _dummy.updateMatrix();
      this.oakTrunkInst.setMatrixAt(i, _dummy.matrix);
      this.oakFoliageInst.setMatrixAt(i, _dummy.matrix);
      this.oakCrownInst.setMatrixAt(i, _dummy.matrix);
    }
    this.oakTrunkInst.instanceMatrix.needsUpdate = true;
    this.oakFoliageInst.instanceMatrix.needsUpdate = true;
    this.oakCrownInst.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < this.bushProps.length; i++) {
      const p = this.bushProps[i];
      _dummy.position.set(p.x, p.y, p.z);
      _dummy.rotation.set(0, p.rotY, 0);
      _dummy.scale.setScalar(p.scale);
      _dummy.updateMatrix();
      this.bushInst.setMatrixAt(i, _dummy.matrix);
    }
    this.bushInst.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < this.flowerProps.length; i++) {
      const p = this.flowerProps[i];
      _dummy.position.set(p.x, p.y, p.z);
      _dummy.rotation.set(0, p.rotY, 0);
      _dummy.scale.setScalar(p.scale);
      _dummy.updateMatrix();
      this.flowerInst.setMatrixAt(i, _dummy.matrix);
    }
    this.flowerInst.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < this.rockProps.length; i++) {
      const p = this.rockProps[i];
      _dummy.position.set(p.x, p.y, p.z);
      _dummy.rotation.set(0, p.rotY, 0);
      _dummy.scale.setScalar(p.scale);
      _dummy.updateMatrix();
      this.rockInst.setMatrixAt(i, _dummy.matrix);
    }
    this.rockInst.instanceMatrix.needsUpdate = true;
  }

  private applyAtmosphere(phase: number, elapsed: number): number {
    const p = ((phase % 1) + 1) % 1;
    let k0 = ATMOSPHERE_KEYS[0];
    let k1 = ATMOSPHERE_KEYS[1];
    for (let i = 0; i < ATMOSPHERE_KEYS.length - 1; i++) {
      if (p >= ATMOSPHERE_KEYS[i].phase && p <= ATMOSPHERE_KEYS[i + 1].phase) {
        k0 = ATMOSPHERE_KEYS[i];
        k1 = ATMOSPHERE_KEYS[i + 1];
        break;
      }
    }
    const span = Math.max(0.0001, k1.phase - k0.phase);
    const t = THREE.MathUtils.smoothstep((p - k0.phase) / span, 0, 1);

    _skyTop.copy(k0.skyTop).lerp(k1.skyTop, t);
    _skyMid.copy(k0.skyMid).lerp(k1.skyMid, t);
    _skyHorizon.copy(k0.skyHorizon).lerp(k1.skyHorizon, t);
    _hemiSky.copy(k0.hemiSky).lerp(k1.hemiSky, t);
    _hemiGround.copy(k0.hemiGround).lerp(k1.hemiGround, t);
    _keyColor.copy(k0.keyColor).lerp(k1.keyColor, t);
    _rimColor.copy(k0.rimColor).lerp(k1.rimColor, t);
    _cloudColor.copy(k0.cloudColor).lerp(k1.cloudColor, t);
    _cloudEmissive.copy(k0.cloudEmissive).lerp(k1.cloudEmissive, t);

    const nightFactor = THREE.MathUtils.lerp(k0.nightFactor, k1.nightFactor, t);

    // Sun & Moon Celestial Arc
    const sunAngle = p * Math.PI * 2;
    const sunX = Math.cos(sunAngle) * 180;
    const sunY = Math.sin(sunAngle) * 140 + 8;
    const sunZ = -290;
    this.sunGroup.position.set(sunX, sunY, sunZ);
    this.sunGroup.lookAt(0, 4, 10);

    const sunVis = THREE.MathUtils.clamp((sunY + 12) / 36, 0, 1);
    this.sunGroup.visible = sunVis > 0.01;
    this.sunHaloMat.opacity = sunVis;
    this.sunCoreMat.opacity = sunVis;

    const moonAngle = sunAngle + Math.PI;
    const moonX = Math.cos(moonAngle) * 175;
    const moonY = Math.sin(moonAngle) * 135 + 8;
    const moonZ = -290;
    this.moonGroup.position.set(moonX, moonY, moonZ);
    this.moonGroup.lookAt(0, 4, 10);

    const moonVis = THREE.MathUtils.clamp((moonY + 12) / 36, 0, 1);
    this.moonGroup.visible = moonVis > 0.01;
    this.moonHaloMat.opacity = moonVis;
    this.moonCoreMat.opacity = moonVis;

    // Weather atmospheric blend (Rain / Storm overcast sky, wet road sheen, tighter fog, lightning flash)
    const rain = this.rainIntensity;
    if (rain > 0.005) {
      const overcastBlend = Math.min(0.82, rain * 0.78);
      _skyTop.lerp(_stormSkyTop, overcastBlend);
      _skyMid.lerp(_stormSkyMid, overcastBlend);
      _skyHorizon.lerp(_stormSkyHorizon, overcastBlend);
      _cloudColor.lerp(_stormCloudColor, Math.min(0.85, rain * 0.8));
    }

    // Sky shader & horizon-matched fog
    this.skyShaderMat.uniforms.uTopColor.value.copy(_skyTop);
    this.skyShaderMat.uniforms.uMidColor.value.copy(_skyMid);
    this.skyShaderMat.uniforms.uHorizonColor.value.copy(_skyHorizon);
    _sunDir.set(sunX, Math.max(sunY, -25), sunZ).normalize();
    this.skyShaderMat.uniforms.uSunDir.value.copy(_sunDir);
    this.skyShaderMat.uniforms.uSunGlow.value =
      0.55 * sunVis * (1 - nightFactor * 0.7) * (1 - rain * 0.85);

    (this.scene.background as THREE.Color).copy(_skyHorizon);
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.copy(_skyHorizon);
      this.scene.fog.near = THREE.MathUtils.lerp(135, 48, rain);
      this.scene.fog.far = THREE.MathUtils.lerp(410, 195, rain);
    }

    // Wet asphalt specular sheen in rain/storm
    this.roadMat.roughness = THREE.MathUtils.lerp(0.84, 0.24, rain);
    this.roadMat.metalness = THREE.MathUtils.lerp(0.04, 0.34, rain);

    // Starfield twinkle at dusk/night (dimmed during rain/storm)
    const starAlpha = THREE.MathUtils.clamp((nightFactor - 0.28) / 0.55, 0, 1) * (1 - rain * 0.9);
    this.starsMat.opacity = starAlpha * (0.88 + Math.sin(elapsed * 2.2) * 0.12);

    // Dynamic 3-point lighting rig + storm lightning boost
    const flash = this.lightningFlash;
    this.hemiLight.color.copy(_hemiSky);
    this.hemiLight.groundColor.copy(_hemiGround);
    this.hemiLight.intensity =
      THREE.MathUtils.lerp(k0.hemiIntensity, k1.hemiIntensity, t) * (1 - rain * 0.28) + flash * 0.9;

    this.sunKeyLight.color.copy(_keyColor);
    this.sunKeyLight.intensity =
      THREE.MathUtils.lerp(k0.keyIntensity, k1.keyIntensity, t) * (1 - rain * 0.45) + flash * 1.4;

    // Key light tracks sun above horizon, smoothly handing off to moon arc at night
    if (sunY >= 10) {
      this.sunKeyLight.position.set(
        THREE.MathUtils.clamp(sunX * 0.35, -60, 60),
        Math.max(24, sunY * 0.55),
        -28,
      );
    } else {
      this.sunKeyLight.position.set(
        THREE.MathUtils.clamp(moonX * 0.35, -60, 60),
        Math.max(28, moonY * 0.55),
        -28,
      );
    }

    this.rimLight.color.copy(_rimColor);
    this.rimLight.intensity =
      THREE.MathUtils.lerp(k0.rimIntensity, k1.rimIntensity, t) + flash * 0.8;

    this.cloudMat.color.copy(_cloudColor);
    this.cloudMat.emissive.copy(_cloudEmissive);
    this.cloudMat.emissiveIntensity =
      THREE.MathUtils.lerp(k0.cloudEmissiveIntensity, k1.cloudEmissiveIntensity, t) * (1 - rain * 0.5) +
      flash * 0.7;

    this.renderer.toneMappingExposure =
      THREE.MathUtils.lerp(k0.exposure, k1.exposure, t) * (1 - rain * 0.08) + flash * 0.22;

    // Highway guardrail reflectors & car headlights glow brightly at dusk/night OR in rain/storm
    const headlightNeed = Math.max(nightFactor, rain * 0.8);
    this.reflectorMat.emissiveIntensity = 0.15 + headlightNeed * 1.9;
    this.car.headlightMaterial.emissiveIntensity = 1.15 + headlightNeed * 2.4;
    this.car.headlightBeamMaterial.opacity = headlightNeed * 0.2;
    for (const beam of this.car.headlightBeams) {
      beam.visible = headlightNeed > 0.05;
    }
    this.car.headlightSpot.intensity = headlightNeed * 26;

    return nightFactor;
  }

  public updateControls(next: Partial<HighwayControlsState>): void {
    const prevColor = this.controlsState.carColor;
    const prevSound = this.controlsState.soundEnabled;
    this.controlsState = { ...this.controlsState, ...next };

    if (next.carColor && next.carColor !== prevColor) {
      this.car.setPaintColor(next.carColor);
    }
    if (next.soundEnabled !== undefined && next.soundEnabled !== prevSound) {
      this.audio.setEnabled(next.soundEnabled);
    }
  }

  public setInputState(next: Partial<InputState>): void {
    this.inputState = { ...this.inputState, ...next };
  }

  public triggerBoosterCharge(): boolean {
    if (this.boosterCharges <= 0) return false;
    this.boosterCharges -= 1;
    this.boosterTimeLeft = Math.max(this.boosterTimeLeft, 4.5);
    this.currentSpeedUnits = Math.max(this.currentSpeedUnits, 72);
    this.comboCount += 1;
    this.comboTimer = 5.5;
    this.spawnCoinBurst(this.carX, 0.85, 1.5);
    this.audio.playBoostPad();
    this.emitTelemetryNow();
    return true;
  }

  public resetProgress(): void {
    this.level = 1;
    this.levelTarget = levelTargetFor(1);
    this.stageTargetM = levelFinishDistanceFor(1);
    this.stageDistanceM = 0;
    this.stageTimeLimitSec = levelTimeLimitFor(1);
    this.stageTimeLeftSec = this.stageTimeLimitSec;
    this.lastTimerBeepSec = -1;
    this.racePosition = 5;
    this.levelCoins = 0;
    this.totalCoins = 0;
    this.totalDiamonds = 0;
    this.diamondBoosterProgress = 0;
    this.overtakes = 0;
    this.scoreFloat = 0;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.multiplier = 1;
    this.fuelPct = 100;
    this.boosterTimeLeft = 0;
    this.boosterCharges = 1;
    this.boostPadCooldown = 0;
    this.coinStreak = 0;
    this.distanceUnits = 0;
    this.unlockedAchievements.clear();
    const leads = [32, 68, 108, 146];
    for (let i = 0; i < this.aiRacers.length; i++) {
      this.aiRacers[i].stageProgressM = leads[i] ?? (i + 1) * 35;
      this.aiRacers[i].boostTimer = 0;
      this.aiRacers[i].z = -this.aiRacers[i].stageProgressM;
    }
    this.persistProgress();
    this.emitTelemetryNow();
  }

  private unlockAchievement(id: string, title: string, detail: string): void {
    if (this.unlockedAchievements.has(id)) return;
    this.unlockedAchievements.add(id);
    this.audio.playAchievement();
    this.onAchievement?.(title, detail);
  }

  private persistProgress(): void {
    this.onProgressSave?.({
      level: this.level,
      levelCoins: this.levelCoins,
      coins: this.totalCoins,
      diamonds: this.totalDiamonds,
      diamondBoosterProgress: this.diamondBoosterProgress,
      overtakes: this.overtakes,
      score: Math.floor(this.scoreFloat),
      stageDistanceM: Math.round(this.stageDistanceM),
      stageTimeLeftSec: Number(this.stageTimeLeftSec.toFixed(1)),
      distanceKm: this.distanceUnits / 1000,
    });
  }

  private getWeatherLabel(): WeatherLabel {
    if (this.rainIntensity >= 0.78) return 'Storm';
    if (this.rainIntensity >= 0.25) return 'Rain';
    return 'Clear';
  }

  private emitTelemetryNow(): void {
    const speedKmh = this.currentSpeedUnits * 3.6;
    const isBraking = this.controlsState.braking || this.inputState.down || this.inputState.brake;
    const isBoosting =
      !isBraking &&
      (this.boosterTimeLeft > 0 ||
        ((this.controlsState.boosting || this.inputState.boost) && this.fuelPct > 0));
    this.onTelemetry({
      speedKmh: Math.round(speedKmh),
      distanceKm: this.distanceUnits / 1000,
      coins: this.totalCoins,
      diamonds: this.totalDiamonds,
      diamondBoosterProgress: this.diamondBoosterProgress,
      diamondBoosterGoal: DIAMOND_BOOSTER_GOAL,
      overtakes: this.overtakes,
      score: Math.floor(this.scoreFloat),
      multiplier: this.multiplier,
      fuelPct: Math.round(this.fuelPct),
      boosterTimeLeft: Number(this.boosterTimeLeft.toFixed(1)),
      boosterCharges: this.boosterCharges,
      level: this.level,
      levelCoins: this.levelCoins,
      levelTarget: this.levelTarget,
      stageDistanceM: Math.round(this.stageDistanceM),
      stageTargetM: this.stageTargetM,
      stageTimeLeftSec: Number(Math.max(0, this.stageTimeLeftSec).toFixed(1)),
      stageTimeLimitSec: this.stageTimeLimitSec,
      racePosition: this.racePosition,
      totalRacers: this.aiRacers.length + 1,
      timeLabel: getTimeLabel(this.dayCyclePhase),
      timePhase: this.dayCyclePhase,
      weatherLabel: this.getWeatherLabel(),
      steerRatio: Number(THREE.MathUtils.clamp(this.carVelX / 12.2, -1, 1).toFixed(2)),
      isBraking,
      isBoosting,
    });
  }

  private stepSimulation(dt: number, elapsed: number): void {
    // 0. Advance or smoothly transition Day & Night Cycle
    if (this.controlsState.timeMode === 'auto') {
      this.dayCyclePhase = (this.dayCyclePhase + dt / DAY_CYCLE_SECONDS) % 1;
    } else {
      const targetPhase =
        this.controlsState.timeMode === 'day'
          ? 0.25
          : this.controlsState.timeMode === 'sunset'
            ? 0.5
            : 0.75;
      let diff = targetPhase - this.dayCyclePhase;
      if (diff > 0.5) diff -= 1;
      if (diff < -0.5) diff += 1;
      this.dayCyclePhase = (this.dayCyclePhase + diff * (1 - Math.exp(-3.5 * dt)) + 1) % 1;
    }

    // 0b. Update Weather Transition (Clear <-> Rain <-> Storm) & Storm Lightning
    let targetRain = 0;
    if (this.controlsState.weatherMode === 'auto') {
      this.weatherCyclePhase = (this.weatherCyclePhase + dt / WEATHER_CYCLE_SECONDS) % 1;
      // Clear (~50%) -> Rain (~25%) -> Storm (~25%)
      if (this.weatherCyclePhase < 0.48) targetRain = 0;
      else if (this.weatherCyclePhase < 0.74) targetRain = 0.58;
      else targetRain = 1.0;
    } else if (this.controlsState.weatherMode === 'rain') {
      targetRain = 0.62;
    } else if (this.controlsState.weatherMode === 'storm') {
      targetRain = 1.0;
    }
    this.rainIntensity = THREE.MathUtils.damp(this.rainIntensity, targetRain, 1.6, dt);

    if (this.rainIntensity > 0.78) {
      this.nextLightningTimer -= dt;
      if (this.nextLightningTimer <= 0) {
        this.lightningFlash = 1.0;
        this.nextLightningTimer = 3.5 + Math.random() * 5.0;
      }
    }
    this.lightningFlash = THREE.MathUtils.damp(this.lightningFlash, 0, 12.0, dt);

    const nightFactor = this.applyAtmosphere(this.dayCyclePhase, elapsed);

    // 1. Resolve target speed, Booster Surge, Petrol Consumption & Braking
    if (this.boosterTimeLeft > 0) {
      this.boosterTimeLeft = Math.max(0, this.boosterTimeLeft - dt);
    }
    if (this.boostPadCooldown > 0) {
      this.boostPadCooldown = Math.max(0, this.boostPadCooldown - dt);
    }

    const isBraking = this.controlsState.braking || this.inputState.down || this.inputState.brake;
    const manualBoost = (this.controlsState.boosting || this.inputState.boost) && this.fuelPct > 0;
    const isBoosting = !isBraking && (this.boosterTimeLeft > 0 || manualBoost);

    if (this.inputState.up) {
      this.controlsState.targetSpeedKmh = THREE.MathUtils.clamp(
        this.controlsState.targetSpeedKmh + 95 * dt,
        40,
        260,
      );
    }

    // Consume petrol gently while driving (free during collected Nitro Surge!)
    if (this.currentSpeedUnits > 1.5 && this.boosterTimeLeft <= 0 && !isBraking) {
      const burnRate = manualBoost ? 1.95 : 1.05;
      this.fuelPct = Math.max(0, this.fuelPct - burnRate * dt);
    }

    const levelSpeedBonus = Math.min(28, (this.level - 1) * 3.5);
    const outOfFuelCap = this.fuelPct <= 0 && this.boosterTimeLeft <= 0 ? 55 : 999;
    const effectiveKmh = isBraking
      ? 0
      : this.boosterTimeLeft > 0
        ? Math.min(310, Math.max(this.controlsState.targetSpeedKmh, 195) + 85)
        : isBoosting
          ? Math.min(295, this.controlsState.targetSpeedKmh + 70 + levelSpeedBonus * 0.4)
          : Math.min(outOfFuelCap, this.controlsState.targetSpeedKmh + levelSpeedBonus * 0.35);
    const targetUnitsPerSec = effectiveKmh / 3.6;

    const speedDamp = isBraking ? 5.2 : isBoosting ? 4.8 : 3.4;
    this.currentSpeedUnits = THREE.MathUtils.damp(
      this.currentSpeedUnits,
      targetUnitsPerSec,
      speedDamp,
      dt,
    );
    if (isBraking && this.currentSpeedUnits < 0.25) {
      this.currentSpeedUnits = 0;
    }

    const dz = this.currentSpeedUnits * dt;
    this.distanceUnits += dz;

    // Score Multiplier & Distance Scoring
    if (this.comboTimer > 0) {
      this.comboTimer = Math.max(0, this.comboTimer - dt);
      if (this.comboTimer === 0) {
        this.comboCount = 0;
      }
    }
    let nextMul = 1;
    if (this.comboCount >= 20) nextMul = 5;
    else if (this.comboCount >= 12) nextMul = 4;
    else if (this.comboCount >= 6) nextMul = 3;
    else if (this.comboCount >= 2) nextMul = 2;
    if (this.boosterTimeLeft > 0) {
      nextMul = Math.min(5, nextMul + 1);
    }
    this.multiplier = nextMul;
    this.scoreFloat += dz * 0.65 * this.multiplier;

    if (this.multiplier >= 3) {
      this.unlockAchievement('combo_3x', 'Hot Streak 3x', 'Reached a 3x score multiplier');
    }
    if (this.multiplier >= 5) {
      this.unlockAchievement('combo_5x', 'Max Overdrive 5x', 'Hit the maximum 5x multiplier');
    }
    if (this.currentSpeedUnits * 3.6 >= 250) {
      this.unlockAchievement('speed_demon', '250+ Club', 'Blasted past 250 km/h');
    }
    if (this.distanceUnits >= 5000) {
      this.unlockAchievement('distance_5km', 'Road Warrior', 'Cruised 5.0 km on the highway');
    }
    if (this.scoreFloat >= 10000) {
      this.unlockAchievement('score_10k', 'High Roller', 'Scored 10,000 points');
    }

    // 2. Steering (Keyboard/Pointer + Mobile Tilt + Traffic-Aware Smart Auto-Cruise)
    let steerInput = 0;
    if (this.inputState.left) steerInput -= 1;
    if (this.inputState.right) steerInput += 1;

    const wheelInput =
      Math.abs(this.inputState.wheelSteer) > 0.02
        ? THREE.MathUtils.clamp(this.inputState.wheelSteer, -1, 1)
        : 0;
    const tiltInput =
      Math.abs(this.inputState.tiltSteer) > 0.02
        ? THREE.MathUtils.clamp(this.inputState.tiltSteer, -1, 1)
        : 0;
    const combinedSteer =
      steerInput !== 0 ? steerInput : wheelInput !== 0 ? wheelInput : tiltInput;

    if (combinedSteer !== 0) {
      this.carVelX = THREE.MathUtils.damp(this.carVelX, combinedSteer * 12.2, 9.5, dt);
    } else if (this.controlsState.autoCruise) {
      // Check if either lane is blocked by an upcoming traffic vehicle or AI rival racer
      let leftBlocked = false;
      let rightBlocked = false;
      for (let i = 0; i < this.trafficCars.length; i++) {
        const tc = this.trafficCars[i];
        if (tc.z < 5.5 && tc.z > -40) {
          if (tc.x < 0.4) leftBlocked = true;
          if (tc.x > -0.4) rightBlocked = true;
        }
      }
      for (let i = 0; i < this.aiRacers.length; i++) {
        const ar = this.aiRacers[i];
        if (ar.z < 5.5 && ar.z > -32) {
          if (ar.x < 0.4) leftBlocked = true;
          if (ar.x > -0.4) rightBlocked = true;
        }
      }

      let targetLaneX: number | null = null;

      // Prioritize Petrol Can when fuel is running low (< 40%)
      if (this.fuelPct < 40) {
        let nearestFuelZ = -Infinity;
        for (let i = 0; i < this.petrolPool.length; i++) {
          const p = this.petrolPool[i];
          if (p.active && p.z < -1.5 && p.z > -52 && p.z > nearestFuelZ) {
            const inLeft = p.x < 0;
            if ((inLeft && !leftBlocked) || (!inLeft && !rightBlocked)) {
              nearestFuelZ = p.z;
              targetLaneX = p.x;
            }
          }
        }
      }

      // Otherwise seek nearest unblocked Booster, Boost Pad, Diamond or Coin
      if (targetLaneX === null) {
        let nearestPickupZ = -Infinity;
        for (let i = 0; i < this.boosterPool.length; i++) {
          const b = this.boosterPool[i];
          if (b.active && b.z < -1.5 && b.z > -48 && b.z > nearestPickupZ) {
            const inLeft = b.x < 0;
            if ((inLeft && !leftBlocked) || (!inLeft && !rightBlocked)) {
              nearestPickupZ = b.z;
              targetLaneX = b.x;
            }
          }
        }
        for (let i = 0; i < this.boostPadsPool.length; i++) {
          const bp = this.boostPadsPool[i];
          if (bp.active && bp.z < -1.5 && bp.z > -48 && bp.z > nearestPickupZ) {
            const inLeft = bp.x < 0;
            if ((inLeft && !leftBlocked) || (!inLeft && !rightBlocked)) {
              nearestPickupZ = bp.z;
              targetLaneX = bp.x;
            }
          }
        }
        for (let i = 0; i < this.diamondsPool.length; i++) {
          const d = this.diamondsPool[i];
          if (d.active && d.z < -1.5 && d.z > -46 && d.z > nearestPickupZ) {
            const inLeft = d.x < 0;
            if ((inLeft && !leftBlocked) || (!inLeft && !rightBlocked)) {
              nearestPickupZ = d.z;
              targetLaneX = d.x;
            }
          }
        }
        for (let i = 0; i < this.coinsPool.length; i++) {
          const c = this.coinsPool[i];
          if (c.active && c.z < -1.5 && c.z > -46 && c.z > nearestPickupZ) {
            const coinInLeft = c.x < 0;
            if ((coinInLeft && !leftBlocked) || (!coinInLeft && !rightBlocked)) {
              nearestPickupZ = c.z;
              targetLaneX = c.x;
            }
          }
        }
      }

      if (targetLaneX === null) {
        if (leftBlocked && !rightBlocked) {
          targetLaneX = LANE_OFFSET_X;
        } else if (rightBlocked && !leftBlocked) {
          targetLaneX = -LANE_OFFSET_X;
        } else {
          this.autoCruisePhase += dt * 0.42;
          targetLaneX = Math.sin(this.autoCruisePhase) * 2.85;
        }
      }

      const diff = targetLaneX - this.carX;
      this.carVelX = THREE.MathUtils.damp(
        this.carVelX,
        THREE.MathUtils.clamp(diff * 2.6, -7.8, 7.8),
        5.8,
        dt,
      );
    } else {
      this.carVelX = THREE.MathUtils.damp(this.carVelX, 0, 8.5, dt);
    }

    this.carX = THREE.MathUtils.clamp(this.carX + this.carVelX * dt, -4.85, 4.85);
    if (Math.abs(this.carX) >= 4.84) {
      this.carVelX *= 0.4;
    }

    // Dynamic cartoon chassis lean, pitch (nose dive on brake / squat on boost), yaw, wheel spin
    this.carRoll = THREE.MathUtils.damp(this.carRoll, -this.carVelX * 0.015, 10, dt);
    const targetPitch = isBraking && this.currentSpeedUnits > 2 ? 0.028 : isBoosting ? -0.024 : 0;
    this.carPitch = THREE.MathUtils.damp(this.carPitch, targetPitch, 9.5, dt);
    this.carYaw = THREE.MathUtils.damp(this.carYaw, -this.carVelX * 0.022, 10, dt);
    this.steerAngle = THREE.MathUtils.damp(this.steerAngle, -this.carVelX * 0.036, 12, dt);

    const suspensionBob =
      this.currentSpeedUnits > 0.5
        ? Math.sin(elapsed * (8 + this.currentSpeedUnits * 0.16)) * 0.016
        : 0;
    this.car.group.position.set(this.carX, suspensionBob, 0);
    this.car.group.rotation.set(this.carPitch, this.carYaw, this.carRoll);

    this.car.frontLeftSteer.rotation.y = this.steerAngle;
    this.car.frontRightSteer.rotation.y = this.steerAngle;

    this.wheelSpin -= dz / 0.42;
    for (const w of this.car.wheels) {
      w.rotation.x = this.wheelSpin;
    }

    // Brake light & boost flame feedback
    const baseTailIntensity = 0.8 + nightFactor * 0.9;
    this.car.brakeLightsMaterial.emissiveIntensity = isBraking ? 3.8 : baseTailIntensity;
    for (let i = 0; i < this.car.boostFlames.length; i++) {
      const flame = this.car.boostFlames[i];
      flame.visible = isBoosting;
      if (isBoosting) {
        const flicker = 0.85 + Math.sin(elapsed * 48 + i * 2) * 0.25;
        flame.scale.set(1, flicker, 1);
      }
    }

    // 3. Synchronized Endless Scrolling of Road, Grass, Curbs & Props
    this.textures.road.offset.y = (this.textures.road.offset.y + dz / 10) % 1;
    this.textures.grass.offset.y = (this.textures.grass.offset.y + dz / 10) % 1;
    this.textures.curb.offset.y = (this.textures.curb.offset.y + dz / 5) % 1;

    // Recycle Guardrail posts + reflectors
    for (let i = 0; i < this.postZPositions.length; i++) {
      let z = this.postZPositions[i] + dz;
      if (z > PROP_Z_MAX) z -= PROP_Z_SPAN;
      this.postZPositions[i] = z;
    }
    this.updatePostInstances();

    // Recycle Trees, Bushes, Flowers & Boulders
    const scrollPool = (pool: RecycledProp[]) => {
      for (let i = 0; i < pool.length; i++) {
        let z = pool[i].z + dz;
        if (z > PROP_Z_MAX) z -= PROP_Z_SPAN;
        pool[i].z = z;
      }
    };
    scrollPool(this.pineProps);
    scrollPool(this.oakProps);
    scrollPool(this.bushProps);
    scrollPool(this.flowerProps);
    scrollPool(this.rockProps);
    this.syncAllFoliageMatrices();

    // Recycle Overhead Highway Arches
    for (const arch of this.arches) {
      arch.position.z += dz;
      if (arch.position.z > 25) {
        arch.position.z -= 360;
      }
    }

    // Parallax Scrolling of Side Valley Mountains
    const valleyDz = dz * 0.42;
    for (const mtn of this.valleyMountains) {
      mtn.position.z += valleyDz;
      if (mtn.position.z > VALLEY_MTN_Z_MAX) {
        mtn.position.z -= VALLEY_MTN_Z_SPAN;
      }
    }

    // Gentle Drifting Cartoon Clouds
    for (const cloud of this.clouds) {
      cloud.group.position.x += cloud.driftSpeed * dt;
      cloud.group.position.y = cloud.baseY + Math.sin(elapsed * 0.45 + cloud.bobPhase) * 0.65;
      if (cloud.group.position.x > 240) {
        cloud.group.position.x = -240;
      }
    }

    // 3b. Scroll, Collect & Recycle Collectible Gold Coins
    let minCoinZ = 0;
    for (let i = 0; i < this.coinsPool.length; i++) {
      const c = this.coinsPool[i];
      c.z += dz;
      if (c.active && c.z < minCoinZ) {
        minCoinZ = c.z;
      }
    }

    let collectedAny = false;
    for (let i = 0; i < this.coinsPool.length; i++) {
      const c = this.coinsPool[i];
      if (c.active && Math.abs(c.z) < 2.25 && Math.abs(c.x - this.carX) < 1.85) {
        c.active = false;
        collectedAny = true;
        this.totalCoins += 1;
        this.levelCoins += 1;
        this.coinStreak += 1;
        this.comboCount += 1;
        this.comboTimer = 5.5;
        this.scoreFloat += 25 * this.multiplier;
        this.spawnCoinBurst(c.x, 1.05, 0);
        this.audio.playCoinCollect(this.coinStreak);

        while (this.levelCoins >= this.levelTarget) {
          this.levelCoins -= this.levelTarget;
          this.levelTarget += 5;
          this.boosterCharges = Math.min(3, this.boosterCharges + 1);
          this.scoreFloat += 250 * this.multiplier;
          this.spawnCoinBurst(this.carX, 1.3, -1);
          this.audio.playDiamondCollect(this.multiplier);
        }
      } else if (c.active && c.z > 8) {
        // Missed a coin passed behind camera -> reset coin pitch streak
        c.active = false;
        this.coinStreak = 0;
      }
    }

    // Respawn a fresh wave whenever enough coins have passed behind the car
    let inactiveCount = 0;
    for (let i = 0; i < this.coinsPool.length; i++) {
      if (!this.coinsPool[i].active && this.coinsPool[i].z > 10) {
        inactiveCount++;
      }
    }
    if (inactiveCount >= 5) {
      // Compactly respawn a fresh wave far ahead
      const spawnStartZ = Math.min(-180, minCoinZ - 42);
      let spawned = 0;
      const patternCount = this.level >= 2 ? 4 : 3;
      this.coinWaveCounter += 1;
      const pattern = this.coinWaveCounter % patternCount;
      const laneSign = this.coinWaveCounter % 2 === 0 ? 1 : -1;
      const spacing = Math.max(8.5, 11.5 - Math.min(this.level, 6) * 0.4);

      for (let i = 0; i < this.coinsPool.length && spawned < 5; i++) {
        const c = this.coinsPool[i];
        if (!c.active && c.z > 10) {
          let x = 0;
          if (pattern === 0) x = laneSign * 2.65;
          else if (pattern === 1) x = 0;
          else if (pattern === 2) x = laneSign * (-2.8 + (spawned / 4) * 5.6);
          else x = Math.sin(spawned * 0.85 + this.coinWaveCounter) * 3.2;

          c.active = true;
          c.x = THREE.MathUtils.clamp(x, -4.1, 4.1);
          c.z = spawnStartZ - spawned * spacing;
          c.phase = spawned * 0.65;
          spawned++;
        }
      }
    }

    // Sync coin matrices
    for (let i = 0; i < this.coinsPool.length; i++) {
      const c = this.coinsPool[i];
      if (!c.active) {
        _dummy.position.set(0, -20, 0);
        _dummy.scale.setScalar(0.0001);
        _dummy.updateMatrix();
        this.coinRimInst.setMatrixAt(i, _dummy.matrix);
        this.coinFaceInst.setMatrixAt(i, _dummy.matrix);
        this.coinGlowInst.setMatrixAt(i, _dummy.matrix);
      } else {
        const bobY = 1.02 + Math.sin(elapsed * 4.2 + c.phase) * 0.14;
        const rotY = elapsed * 2.9 + c.phase;
        _dummy.position.set(c.x, bobY, c.z);
        _dummy.rotation.set(0, rotY, 0);
        _dummy.scale.setScalar(1);
        _dummy.updateMatrix();
        this.coinRimInst.setMatrixAt(i, _dummy.matrix);
        this.coinFaceInst.setMatrixAt(i, _dummy.matrix);

        // Ground halo ring underneath coin
        const pulse = 0.92 + Math.sin(elapsed * 4.2 + c.phase) * 0.12;
        _dummy.position.set(c.x, 0.032, c.z);
        _dummy.rotation.set(0, 0, 0);
        _dummy.scale.setScalar(pulse);
        _dummy.updateMatrix();
        this.coinGlowInst.setMatrixAt(i, _dummy.matrix);
      }
    }
    this.coinRimInst.instanceMatrix.needsUpdate = true;
    this.coinFaceInst.instanceMatrix.needsUpdate = true;
    this.coinGlowInst.instanceMatrix.needsUpdate = true;

    // 3b-ii. Scroll, Collect & Recycle Rare Prismatic Diamonds (3 Rare Diamonds -> +1 Nitro Booster)
    let minDiamondZ = -220;
    for (let i = 0; i < this.diamondsPool.length; i++) {
      const d = this.diamondsPool[i];
      d.z += dz;
      if (d.active && d.z < minDiamondZ) minDiamondZ = d.z;
    }

    for (let i = 0; i < this.diamondsPool.length; i++) {
      const d = this.diamondsPool[i];
      if (d.active && Math.abs(d.z) < 2.45 && Math.abs(d.x - this.carX) < 1.95) {
        d.active = false;
        collectedAny = true;
        this.totalDiamonds += 1;
        this.diamondBoosterProgress += 1;
        this.comboCount += 2;
        this.comboTimer = 6.5;
        this.scoreFloat += 180 * this.multiplier;
        // Brief crystal surge immediately on pickup; every 3 rare diamonds grants +1 stored Nitro Booster
        this.boosterTimeLeft = Math.max(this.boosterTimeLeft, 2.2);
        this.currentSpeedUnits = Math.max(this.currentSpeedUnits, 52);
        this.spawnCoinBurst(d.x, 1.25, 0);
        this.unlockAchievement('first_diamond', 'Rare Crystal Hunter', 'Collected a rare highway diamond');

        if (this.diamondBoosterProgress >= DIAMOND_BOOSTER_GOAL) {
          this.diamondBoosterProgress = 0;
          this.boosterCharges = Math.min(3, this.boosterCharges + 1);
          this.boosterTimeLeft = Math.max(this.boosterTimeLeft, 4.5);
          this.audio.playBoosterCollect();
          this.unlockAchievement(
            'diamond_booster',
            'Rare Diamond Booster',
            'Collected 3 rare diamonds to charge a Nitro Booster',
          );
        } else {
          this.audio.playDiamondCollect(this.multiplier);
        }
      } else if (d.z > 12) {
        // Recycle rare diamond sparsely down the highway
        d.active = true;
        d.z = Math.min(-240, minDiamondZ - 195);
        d.x = ((i + this.coinWaveCounter) % 2 === 0 ? -1 : 1) * 2.65;
        minDiamondZ = d.z;
      }

      if (!d.active) {
        _dummy.position.set(0, -20, 0);
        _dummy.scale.setScalar(0.0001);
        _dummy.updateMatrix();
        this.diamondGemInst.setMatrixAt(i, _dummy.matrix);
        this.diamondGlowInst.setMatrixAt(i, _dummy.matrix);
      } else {
        const bobY = 1.28 + Math.sin(elapsed * 4.8 + d.phase) * 0.18;
        const rotY = elapsed * 3.4 + d.phase;
        _dummy.position.set(d.x, bobY, d.z);
        _dummy.rotation.set(0.18, rotY, 0);
        _dummy.scale.setScalar(1.18);
        _dummy.updateMatrix();
        this.diamondGemInst.setMatrixAt(i, _dummy.matrix);

        const pulse = 1.05 + Math.sin(elapsed * 5.2 + d.phase) * 0.16;
        _dummy.position.set(d.x, 0.032, d.z);
        _dummy.rotation.set(0, 0, 0);
        _dummy.scale.setScalar(pulse);
        _dummy.updateMatrix();
        this.diamondGlowInst.setMatrixAt(i, _dummy.matrix);
      }
    }
    this.diamondGemInst.instanceMatrix.needsUpdate = true;
    this.diamondGlowInst.instanceMatrix.needsUpdate = true;

    // 3b-iii. Scroll, Collect & Recycle Petrol Cans
    let minPetrolZ = -180;
    for (let i = 0; i < this.petrolPool.length; i++) {
      this.petrolPool[i].z += dz;
      if (this.petrolPool[i].z < minPetrolZ) minPetrolZ = this.petrolPool[i].z;
    }
    for (let i = 0; i < this.petrolPool.length; i++) {
      const p = this.petrolPool[i];
      if (p.active && Math.abs(p.z) < 2.4 && Math.abs(p.x - this.carX) < 1.95) {
        p.active = false;
        p.group.visible = false;
        collectedAny = true;
        const wasLow = this.fuelPct < 25;
        this.fuelPct = Math.min(100, this.fuelPct + 38);
        this.scoreFloat += 40 * this.multiplier;
        this.spawnCoinBurst(p.x, 1.0, 0);
        this.audio.playPetrolCollect();
        if (wasLow) {
          this.unlockAchievement('clutch_refuel', 'Clutch Refuel', 'Refueled with under 25% petrol left');
        }
      } else if (p.z > 12) {
        p.active = true;
        p.group.visible = true;
        // Spawn closer ahead if player's tank is critically low
        const urgentOffset = this.fuelPct < 20 ? -68 - i * 32 : Math.min(-210, minPetrolZ - 95);
        p.z = urgentOffset;
        p.x = (i % 2 === 0 ? 1 : -1) * 2.85;
        minPetrolZ = Math.min(minPetrolZ, p.z);
      }
      if (p.active) {
        p.group.position.set(p.x, 0, p.z);
        const floatGrp = p.group.userData.floatGroup as THREE.Group | undefined;
        if (floatGrp) {
          floatGrp.position.y = 0.95 + Math.sin(elapsed * 3.8 + p.phase) * 0.14;
          floatGrp.rotation.y = elapsed * 2.2 + p.phase;
        }
      }
    }

    // 3b-iv. Scroll, Collect & Recycle Nitro Booster Pickups
    let minBoosterZ = -180;
    for (let i = 0; i < this.boosterPool.length; i++) {
      this.boosterPool[i].z += dz;
      if (this.boosterPool[i].z < minBoosterZ) minBoosterZ = this.boosterPool[i].z;
    }
    for (let i = 0; i < this.boosterPool.length; i++) {
      const b = this.boosterPool[i];
      if (b.active && Math.abs(b.z) < 2.4 && Math.abs(b.x - this.carX) < 1.95) {
        b.active = false;
        b.group.visible = false;
        collectedAny = true;
        this.boosterTimeLeft = Math.max(this.boosterTimeLeft, 5.0);
        this.boosterCharges = Math.min(3, this.boosterCharges + 1);
        this.fuelPct = Math.min(100, this.fuelPct + 12);
        this.currentSpeedUnits = Math.max(this.currentSpeedUnits, 72);
        this.comboCount += 1;
        this.comboTimer = 5.5;
        this.scoreFloat += 80 * this.multiplier;
        this.spawnCoinBurst(b.x, 1.1, 0);
        this.audio.playBoosterCollect();
        this.unlockAchievement('turbo_boost', 'Nitro Surge', 'Picked up a highway booster pod');
      } else if (b.z > 12) {
        b.active = true;
        b.group.visible = true;
        b.z = Math.min(-185, minBoosterZ - 76);
        b.x = (i % 2 === 0 ? -1 : 1) * 2.85;
        minBoosterZ = Math.min(minBoosterZ, b.z);
      }
      if (b.active) {
        b.group.position.set(b.x, 0, b.z);
        const floatGrp = b.group.userData.floatGroup as THREE.Group | undefined;
        if (floatGrp) {
          floatGrp.position.y = 1.05 + Math.sin(elapsed * 4.4 + b.phase) * 0.15;
          floatGrp.rotation.y = elapsed * 2.8 + b.phase;
        }
      }
    }

    // 3b-v. Scroll & Activate Flush-on-Road Turbo Boost Pads
    let minPadZ = -180;
    for (let i = 0; i < this.boostPadsPool.length; i++) {
      this.boostPadsPool[i].z += dz;
      if (this.boostPadsPool[i].z < minPadZ) minPadZ = this.boostPadsPool[i].z;
    }
    for (let i = 0; i < this.boostPadsPool.length; i++) {
      const bp = this.boostPadsPool[i];
      if (
        bp.active &&
        this.boostPadCooldown <= 0 &&
        Math.abs(bp.z) < 2.65 &&
        Math.abs(bp.x - this.carX) < 1.9
      ) {
        this.boostPadCooldown = 0.65;
        collectedAny = true;
        this.boosterTimeLeft = Math.max(this.boosterTimeLeft, 3.2);
        this.currentSpeedUnits = Math.max(this.currentSpeedUnits, 76);
        this.comboCount += 1;
        this.comboTimer = 5.5;
        this.scoreFloat += 80 * this.multiplier;
        this.spawnCoinBurst(bp.x, 0.35, 0);
        this.audio.playBoostPad();
        this.unlockAchievement('boost_pad', 'Pad Launcher', 'Hit a highway turbo boost pad');
      } else if (bp.z > 16) {
        bp.active = true;
        bp.z = Math.min(-195, minPadZ - 98);
        bp.x = ((i + this.coinWaveCounter) % 2 === 0 ? 1 : -1) * LANE_OFFSET_X;
        minPadZ = Math.min(minPadZ, bp.z);
      }
      bp.group.position.set(bp.x, 0, bp.z);
      const chevrons = bp.group.userData.chevronsGroup as THREE.Group | undefined;
      if (chevrons) {
        chevrons.position.z = -((elapsed * 2.8 + bp.phase) % 0.6);
      }
    }

    // Step sparkle burst particles
    for (let i = 0; i < this.burstPool.length; i++) {
      const p = this.burstPool[i];
      if (!p.active) {
        _dummy.position.set(0, -20, 0);
        _dummy.scale.setScalar(0.0001);
        _dummy.updateMatrix();
        this.burstInst.setMatrixAt(i, _dummy.matrix);
      } else {
        p.life += dt;
        if (p.life >= p.maxLife) {
          p.active = false;
          _dummy.position.set(0, -20, 0);
          _dummy.scale.setScalar(0.0001);
        } else {
          p.vy -= 12 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.z += p.vz * dt;
          const s = 1 - p.life / p.maxLife;
          _dummy.position.set(p.x, p.y, p.z);
          _dummy.rotation.set(p.life * 8, p.life * 10, 0);
          _dummy.scale.setScalar(Math.max(0.01, s));
        }
        _dummy.updateMatrix();
        this.burstInst.setMatrixAt(i, _dummy.matrix);
      }
    }
    this.burstInst.instanceMatrix.needsUpdate = true;

    if (collectedAny) {
      this.persistProgress();
      this.emitTelemetryNow();
    }

    // Step 3D Falling Rain Streaks when weather is Rain / Storm
    const showRain = this.rainIntensity > 0.04;
    this.rainInst.visible = showRain;
    if (showRain) {
      this.rainMat.opacity = Math.min(0.65, this.rainIntensity * 0.62);
      const streakStretch = 0.8 + this.rainIntensity * 0.85;
      for (let i = 0; i < this.rainDrops.length; i++) {
        const rd = this.rainDrops[i];
        rd.y -= rd.speedY * (0.85 + this.rainIntensity * 0.5) * dt;
        rd.z += dz * 0.72 + 4 * dt;
        if (rd.y < 0) rd.y += 24;
        if (rd.z > 14) rd.z -= 74;
        _dummy.position.set(rd.x, rd.y, rd.z);
        _dummy.rotation.set(0.22, 0, 0.06);
        _dummy.scale.set(1, streakStretch, 1);
        _dummy.updateMatrix();
        this.rainInst.setMatrixAt(i, _dummy.matrix);
      }
      this.rainInst.instanceMatrix.needsUpdate = true;
    }

    // Speed Streak Particles
    const showStreaks = this.currentSpeedUnits > 38 || isBoosting;
    this.speedParticleInst.visible = showStreaks;
    if (showStreaks) {
      const stretch = isBoosting ? 2.4 : 1.0;
      for (let i = 0; i < this.speedParticles.length; i++) {
        const sp = this.speedParticles[i];
        sp.z += dz * sp.speedMul;
        if (sp.z > 14) sp.z = -85;
        _dummy.position.set(sp.x, sp.y, sp.z);
        _dummy.rotation.set(0, 0, 0);
        _dummy.scale.set(1, 1, stretch);
        _dummy.updateMatrix();
        this.speedParticleInst.setMatrixAt(i, _dummy.matrix);
      }
      this.speedParticleInst.instanceMatrix.needsUpdate = true;
    }

    // 3c. Step Traffic Cars & Competitive AI Rival Race Cars
    this.stepTrafficCars(dt, elapsed, nightFactor);
    this.stepAiRacers(dt, elapsed, nightFactor);

    // 3d. Stage Progress, Countdown Timer, 3D Finish Line Positioning & Level Completion
    this.stageDistanceM += dz;
    this.stageTimeLeftSec = Math.max(0, this.stageTimeLeftSec - dt);
    if (this.stageTimeLeftSec > 0 && this.stageTimeLeftSec <= 5) {
      const wholeSec = Math.ceil(this.stageTimeLeftSec);
      if (wholeSec !== this.lastTimerBeepSec) {
        this.lastTimerBeepSec = wholeSec;
        this.audio.playTimerTick();
      }
    }

    const remainingM = this.stageTargetM - this.stageDistanceM;
    if (remainingM <= 340 && remainingM >= -35) {
      this.finishLineGroup.visible = true;
      this.finishLineGroup.position.set(0, 0, -remainingM);
    } else {
      this.finishLineGroup.visible = false;
    }

    // Update live race placement (1st .. 5th)
    let aheadCount = 0;
    for (let i = 0; i < this.aiRacers.length; i++) {
      if (this.aiRacers[i].stageProgressM > this.stageDistanceM) {
        aheadCount++;
      }
    }
    this.racePosition = 1 + aheadCount;

    if (this.stageDistanceM >= this.stageTargetM) {
      const completedLevel = this.level;
      const placement = this.racePosition;
      const timeBonus = Math.round(this.stageTimeLeftSec) * 25 * this.multiplier;
      const finishBonus = (6 - placement) * 350 * this.multiplier + timeBonus;
      this.scoreFloat += finishBonus;
      this.fuelPct = Math.min(100, this.fuelPct + 35);
      this.boosterCharges = Math.min(3, this.boosterCharges + 1);
      this.level += 1;
      this.stageDistanceM = 0;
      this.stageTargetM = levelFinishDistanceFor(this.level);
      this.stageTimeLimitSec = levelTimeLimitFor(this.level);
      this.stageTimeLeftSec = this.stageTimeLimitSec;
      this.lastTimerBeepSec = -1;

      // Stagger AI rivals ahead cleanly for the next stage
      const nextLeads = [28, 62, 98, 136];
      for (let i = 0; i < this.aiRacers.length; i++) {
        this.aiRacers[i].stageProgressM = nextLeads[i] ?? (i + 1) * 32;
        this.aiRacers[i].z = -this.aiRacers[i].stageProgressM;
        this.aiRacers[i].boostTimer = 0;
      }

      this.spawnCoinBurst(-3.5, 1.5, 0);
      this.spawnCoinBurst(0, 2.0, -1);
      this.spawnCoinBurst(3.5, 1.5, 0);
      this.audio.playLevelUp();
      this.unlockAchievement('first_finish', 'Checkered Flag', 'Crossed your first highway finish line');
      if (placement === 1) {
        this.unlockAchievement('pole_position', '1st Place Finish', 'Won a highway stage in 1st place');
      }
      if (this.level >= 3) {
        this.unlockAchievement('champion_lvl3', 'Stage Champion', 'Reached Highway Level 3');
      }
      this.persistProgress();
      this.emitTelemetryNow();
      this.onLevelUp?.(this.level, placement, completedLevel, timeBonus);
    } else if (this.stageTimeLeftSec <= 0) {
      const timedOutLevel = this.level;
      this.stageDistanceM = 0;
      this.stageTimeLimitSec = levelTimeLimitFor(this.level);
      this.stageTimeLeftSec = this.stageTimeLimitSec;
      this.lastTimerBeepSec = -1;
      this.fuelPct = 100;
      this.boosterCharges = Math.max(1, this.boosterCharges);
      this.comboCount = 0;
      this.comboTimer = 0;
      this.multiplier = 1;
      this.racePosition = 5;

      const retryLeads = [28, 62, 98, 136];
      for (let i = 0; i < this.aiRacers.length; i++) {
        this.aiRacers[i].stageProgressM = retryLeads[i] ?? (i + 1) * 32;
        this.aiRacers[i].z = -this.aiRacers[i].stageProgressM;
        this.aiRacers[i].boostTimer = 0;
      }

      this.audio.playTimeUp();
      this.persistProgress();
      this.emitTelemetryNow();
      this.onStageTimeout?.(timedOutLevel);
    }

    // 4. Smoothly Damped Camera Choreography, Impact Shake & Dynamic Speed FOV
    const preset = this.controlsState.cameraPreset;
    let targetFov = 62 + Math.max(0, (this.currentSpeedUnits - 25) * 0.25) + (isBoosting ? 7 : 0);

    if (preset === 'chase') {
      _targetCamPos.set(this.carX * 0.72, 4.15, 9.2);
      _targetLookAt.set(this.carX * 0.85, 1.45, -24);
    } else if (preset === 'hood') {
      _targetCamPos.set(this.carX, 1.62, -0.45);
      _targetLookAt.set(this.carX * 0.92, 1.35, -36);
      targetFov += 4;
    } else {
      const sway = Math.sin(elapsed * 0.24) * 3.8;
      _targetCamPos.set(this.carX * 0.35 + sway, 9.2, 16.5);
      _targetLookAt.set(0, 2.2, -38);
      targetFov = 58;
    }

    if (this.impactShake > 0.005) {
      const shakeAmt = this.impactShake * 0.32;
      _targetCamPos.x += Math.sin(elapsed * 62) * shakeAmt;
      _targetCamPos.y += Math.cos(elapsed * 54) * shakeAmt * 0.6;
      this.impactShake = THREE.MathUtils.damp(this.impactShake, 0, 10, dt);
    } else {
      this.impactShake = 0;
    }

    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, _targetCamPos.x, 6.5, dt);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, _targetCamPos.y, 6.5, dt);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, _targetCamPos.z, 6.5, dt);

    _currentLookAt.x = THREE.MathUtils.damp(_currentLookAt.x, _targetLookAt.x, 7.0, dt);
    _currentLookAt.y = THREE.MathUtils.damp(_currentLookAt.y, _targetLookAt.y, 7.0, dt);
    _currentLookAt.z = THREE.MathUtils.damp(_currentLookAt.z, _targetLookAt.z, 7.0, dt);
    this.camera.lookAt(_currentLookAt);

    const targetCamRoll = preset === 'chase' ? -this.carVelX * 0.004 : 0;
    this.camera.rotation.z = THREE.MathUtils.damp(this.camera.rotation.z, targetCamRoll, 6.0, dt);

    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 5.0, dt);
      this.camera.updateProjectionMatrix();
    }

    // 5. Audio & HUD Telemetry (~15 Hz updates to React so DOM never thrash-renders)
    const speedKmh = this.currentSpeedUnits * 3.6;
    this.audio.update(speedKmh, isBoosting, isBraking, this.rainIntensity);

    this.telemetryTimer += dt;
    if (this.telemetryTimer >= 0.065) {
      this.telemetryTimer = 0;
      this.emitTelemetryNow();
    }
  }

  private stepTrafficCars(dt: number, elapsed: number, nightFactor: number): void {
    let minTrafficZ = -180;
    for (let i = 0; i < this.trafficCars.length; i++) {
      if (this.trafficCars[i].z < minTrafficZ) {
        minTrafficZ = this.trafficCars[i].z;
      }
    }

    for (let i = 0; i < this.trafficCars.length; i++) {
      const tc = this.trafficCars[i];
      if (tc.bumpCooldown > 0) {
        tc.bumpCooldown = Math.max(0, tc.bumpCooldown - dt);
      }
      if (tc.laneChangeCooldown > 0) {
        tc.laneChangeCooldown = Math.max(0, tc.laneChangeCooldown - dt);
      }

      // Check spacing to any car ahead in the same lane so traffic never stacks
      let desiredSpeed = tc.baseSpeedUnits;
      let brakingBehind = false;
      for (let j = 0; j < this.trafficCars.length; j++) {
        if (i === j) continue;
        const other = this.trafficCars[j];
        if (other.lane === tc.lane && other.z < tc.z && tc.z - other.z < 17) {
          desiredSpeed = Math.min(desiredSpeed, other.speedUnits * 0.92);
          brakingBehind = true;
        }
      }

      // Dynamic overtaking: if blocked ahead and well ahead of player, try switching to the open lane
      if (brakingBehind && tc.laneChangeCooldown <= 0 && tc.z < -24 && tc.z > -260) {
        const targetLane: -1 | 1 = tc.lane === -1 ? 1 : -1;
        let adjacentClear = true;
        for (let j = 0; j < this.trafficCars.length; j++) {
          if (i === j) continue;
          const other = this.trafficCars[j];
          if (other.lane === targetLane && Math.abs(other.z - tc.z) < 22) {
            adjacentClear = false;
            break;
          }
        }
        if (adjacentClear) {
          tc.lane = targetLane;
          tc.laneChangeCooldown = 4.5;
        }
      }

      tc.isBraking = brakingBehind || tc.bumpCooldown > 0.2;
      tc.speedUnits = THREE.MathUtils.damp(tc.speedUnits, desiredSpeed, brakingBehind ? 5.0 : 2.2, dt);

      // Relative Z movement against player's forward velocity
      const relDz = (this.currentSpeedUnits - tc.speedUnits) * dt;
      tc.z += relDz;

      // Smoothly transition toward lane center & tilt subtly when changing lanes
      const targetX = tc.lane * LANE_OFFSET_X;
      const prevX = tc.x;
      tc.x = THREE.MathUtils.damp(tc.x, targetX, 5.2, dt);
      const laneVelX = (tc.x - prevX) / Math.max(dt, 0.001);

      // Recycle if passed behind camera or pulled far ahead when player stops
      if (tc.z > 24 || tc.z < -368) {
        const altLane: -1 | 1 = tc.z > 24 ? (i % 2 === 0 ? -1 : 1) : tc.lane;
        tc.lane = altLane;
        tc.x = altLane * LANE_OFFSET_X;
        let spawnZ = Math.min(-245, minTrafficZ - 24) - (i % 3) * 10;
        // Ensure clean longitudinal gap from cars in the same lane
        for (let j = 0; j < this.trafficCars.length; j++) {
          if (i === j) continue;
          const other = this.trafficCars[j];
          if (other.lane === tc.lane && Math.abs(other.z - spawnZ) < 20) {
            spawnZ = Math.min(spawnZ, other.z - 22);
          }
        }
        tc.z = spawnZ;
        tc.speedUnits = tc.baseSpeedUnits;
        tc.isBraking = false;
        tc.passedAwarded = false;
        minTrafficZ = Math.min(minTrafficZ, spawnZ);
      }

      // Clean Overtake & Near-Miss Racing Bonus
      if (!tc.passedAwarded && tc.z > 2.4 && tc.bumpCooldown <= 0 && this.currentSpeedUnits > 12) {
        tc.passedAwarded = true;
        this.overtakes += 1;
        const nearMiss = Math.abs(tc.x - this.carX) < 3.25;
        this.comboCount += nearMiss ? 2 : 1;
        this.comboTimer = 5.5;
        this.scoreFloat += (nearMiss ? 150 : 75) * this.multiplier;
        this.audio.playOvertake(nearMiss);
        this.unlockAchievement('first_overtake', 'Slipstream Pass', 'Cleanly overtook a highway racer');
        if (this.overtakes >= 15) {
          this.unlockAchievement('overtakes_15', 'Apex Racer', 'Overtook 15 traffic cars');
        }
      }

      // Soft physical bump collision with hero race car
      if (tc.bumpCooldown <= 0 && Math.abs(tc.z) < 4.2 && Math.abs(tc.x - this.carX) < 1.95) {
        tc.bumpCooldown = 0.65;
        tc.passedAwarded = true;
        const pushDir = this.carX >= tc.x ? 1 : -1;
        this.carVelX = pushDir * 8.5;
        this.carX = THREE.MathUtils.clamp(this.carX + pushDir * 0.45, -4.85, 4.85);
        this.currentSpeedUnits = Math.min(this.currentSpeedUnits, Math.max(8, tc.speedUnits * 0.8));
        tc.z -= 0.9;
        this.impactShake = 0.75;
        this.comboCount = 0;
        this.comboTimer = 0;
        this.multiplier = 1;
        this.spawnCoinBurst((this.carX + tc.x) * 0.5, 0.9, 0);
        this.audio.playBump();
      }

      // Update traffic car visual transform, wheel spin & night/brake lights
      tc.wheelSpin -= (tc.speedUnits * dt) / 0.4;
      for (const w of tc.handle.wheels) {
        w.rotation.x = tc.wheelSpin;
      }

      const bobY = Math.sin(elapsed * 7 + i * 1.4) * 0.012;
      tc.handle.group.position.set(tc.x, bobY, tc.z);
      tc.handle.group.rotation.set(
        tc.isBraking ? 0.018 : 0,
        THREE.MathUtils.clamp(-laneVelX * 0.025, -0.14, 0.14),
        THREE.MathUtils.clamp(-laneVelX * 0.014, -0.08, 0.08),
      );

      tc.handle.headlightMaterial.emissiveIntensity = 0.8 + nightFactor * 2.2;
      tc.handle.brakeLightsMaterial.emissiveIntensity = tc.isBraking
        ? 3.2
        : 0.75 + nightFactor * 0.9;
    }
  }

  private stepAiRacers(dt: number, elapsed: number, nightFactor: number): void {
    const levelPace = 35 + Math.min(24, (this.level - 1) * 2.6);

    for (let i = 0; i < this.aiRacers.length; i++) {
      const ar = this.aiRacers[i];
      if (ar.bumpCooldown > 0) ar.bumpCooldown = Math.max(0, ar.bumpCooldown - dt);
      if (ar.laneTimer > 0) ar.laneTimer -= dt;

      // Periodic AI Turbo Surge
      if (ar.boostTimer > 0) {
        ar.boostTimer = Math.max(0, ar.boostTimer - dt);
      } else {
        ar.nextBoostIn -= dt;
        if (ar.nextBoostIn <= 0) {
          ar.boostTimer = 2.6 + (i % 2) * 0.9;
          ar.nextBoostIn = 6.0 + (i % 3) * 2.4;
        }
      }

      // Competitive pack tension so AI racers keep racing visibly around the player
      const leadGapM = ar.stageProgressM - this.stageDistanceM;
      let packAdjust = 0;
      if (leadGapM < -120) {
        packAdjust = 16;
        if (ar.boostTimer <= 0) ar.boostTimer = 2.0;
      } else if (leadGapM < -45) {
        packAdjust = 6;
      } else if (leadGapM > 165) {
        packAdjust = -7;
      } else if (leadGapM > 110) {
        packAdjust = -3;
      }

      const targetSpeed = Math.max(
        22,
        levelPace + ar.skillOffset + packAdjust + (ar.boostTimer > 0 ? 12 : 0),
      );
      ar.speedUnits = THREE.MathUtils.damp(ar.speedUnits, targetSpeed, 2.8, dt);

      // Advance AI racer along stage & compute world Z relative to player at z=0
      ar.stageProgressM += ar.speedUnits * dt;
      ar.z = this.stageDistanceM - ar.stageProgressM;

      // AI traffic-dodging & racing line selection
      let blockedAhead = false;
      for (let j = 0; j < this.trafficCars.length; j++) {
        const tc = this.trafficCars[j];
        if (Math.abs(tc.x - ar.x) < 2.2 && tc.z < ar.z && ar.z - tc.z < 26) {
          blockedAhead = true;
          break;
        }
      }

      if (blockedAhead || ar.laneTimer <= 0) {
        let leftClear = true;
        let rightClear = true;
        for (let j = 0; j < this.trafficCars.length; j++) {
          const tc = this.trafficCars[j];
          if (Math.abs(tc.z - ar.z) < 22) {
            if (tc.x < 0.2) leftClear = false;
            if (tc.x > -0.2) rightClear = false;
          }
        }
        // Also respect nearby AI rivals
        for (let j = 0; j < this.aiRacers.length; j++) {
          if (i === j) continue;
          const other = this.aiRacers[j];
          if (Math.abs(other.z - ar.z) < 12) {
            if (other.x < -0.5) leftClear = false;
            if (other.x > 0.5) rightClear = false;
          }
        }

        if (blockedAhead) {
          if (ar.targetX <= 0 && rightClear) ar.targetX = LANE_OFFSET_X;
          else if (ar.targetX >= 0 && leftClear) ar.targetX = -LANE_OFFSET_X;
          else if (leftClear && rightClear) ar.targetX = ar.x >= 0 ? -LANE_OFFSET_X : LANE_OFFSET_X;
          ar.laneTimer = 1.6;
        } else {
          // Subtle racing line weave across highway
          const candidates = [-LANE_OFFSET_X, 0, LANE_OFFSET_X];
          ar.targetX = candidates[(i + Math.floor(elapsed * 0.35)) % candidates.length];
          ar.laneTimer = 2.8 + (i % 3) * 0.9;
        }
      }

      const prevX = ar.x;
      ar.x = THREE.MathUtils.damp(ar.x, THREE.MathUtils.clamp(ar.targetX, -4.6, 4.6), 4.6, dt);
      const latVel = (ar.x - prevX) / Math.max(dt, 0.001);

      // Soft wheel-to-wheel racing contact with player car
      if (ar.bumpCooldown <= 0 && Math.abs(ar.z) < 4.2 && Math.abs(ar.x - this.carX) < 1.95) {
        ar.bumpCooldown = 0.7;
        const pushDir = this.carX >= ar.x ? 1 : -1;
        this.carVelX = pushDir * 7.2;
        this.carX = THREE.MathUtils.clamp(this.carX + pushDir * 0.38, -4.85, 4.85);
        ar.x = THREE.MathUtils.clamp(ar.x - pushDir * 0.38, -4.6, 4.6);
        this.impactShake = 0.55;
        this.spawnCoinBurst((this.carX + ar.x) * 0.5, 0.9, 0);
        this.audio.playBump();
      }

      // Visibility & Transform
      const inView = ar.z > -340 && ar.z < 26;
      ar.handle.group.visible = inView;
      if (!inView) continue;

      ar.wheelSpin -= (ar.speedUnits * dt) / 0.42;
      for (const w of ar.handle.wheels) {
        w.rotation.x = ar.wheelSpin;
      }

      const bobY = Math.sin(elapsed * 8.5 + i * 1.9) * 0.014;
      ar.handle.group.position.set(ar.x, bobY, ar.z);
      ar.handle.group.rotation.set(
        ar.boostTimer > 0 ? -0.02 : 0,
        THREE.MathUtils.clamp(-latVel * 0.024, -0.14, 0.14),
        THREE.MathUtils.clamp(-latVel * 0.015, -0.09, 0.09),
      );

      ar.handle.headlightMaterial.emissiveIntensity = 1.0 + nightFactor * 2.2;
      ar.handle.brakeLightsMaterial.emissiveIntensity = 0.8 + nightFactor * 0.9;
      for (let f = 0; f < ar.handle.boostFlames.length; f++) {
        const flame = ar.handle.boostFlames[f];
        flame.visible = ar.boostTimer > 0;
        if (ar.boostTimer > 0) {
          flame.scale.set(1, 0.85 + Math.sin(elapsed * 45 + f * 2) * 0.25, 1);
        }
      }
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.isTimeoutId = true;
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.isTimeoutId = true;
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.isTimeoutId = true;
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = (): void => {
    if (this.disposed) return;

    const rawDelta = this.clock.getDelta();
    const dt = Math.min(rawDelta, 0.05);
    const elapsed = this.clock.elapsedTime;

    this.stepSimulation(dt, elapsed);
    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.isTimeoutId = false;
      this.frameId = window.requestAnimationFrame(this.tick);
    }
  };

  private handleResize = (): void => {
    if (this.disposed) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
  };

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
    if (this.isTimeoutId) {
      window.clearTimeout(this.frameId);
    } else {
      window.cancelAnimationFrame(this.frameId);
    }
    this.onContextLostChange(true);
  };

  private handleContextRestored = (): void => {
    this.onContextLostChange(false);
    this.clock.getDelta();
    this.tick();
  };

  public dispose(): void {
    this.disposed = true;
    this.persistProgress();
    if (this.isTimeoutId) {
      window.clearTimeout(this.frameId);
    } else {
      window.cancelAnimationFrame(this.frameId);
    }

    window.removeEventListener('resize', this.handleResize);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored);

    this.audio.dispose();
    this.textures.dispose();
    this.foliageGeos.dispose();
    this.coinGeos.dispose();
    this.diamondGeos.dispose();
    this.envRenderTarget?.dispose();

    for (const item of this.disposables) {
      item.dispose();
    }

    this.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.geometry?.dispose();
        if (Array.isArray(m.material)) {
          m.material.forEach((mat) => mat.dispose());
        } else {
          m.material?.dispose();
        }
      }
    });

    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
