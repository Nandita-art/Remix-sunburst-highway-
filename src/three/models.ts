import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Deterministic ground elevation outside the flat highway corridor (|x| <= 8.8).
 * Invariant in Z so recycled roadside trees and bushes sit 100% flush on the terrain banks.
 */
export function groundHeightAt(x: number): number {
  const absX = Math.abs(x);
  if (absX <= 8.8) {
    return 0;
  }
  const d = absX - 8.8;
  const gentleSlope = Math.min(d * 0.13, 3.2);
  const lateralRoll =
    Math.sin(x * 0.085) * Math.min(d * 0.045, 1.1) +
    Math.cos(x * 0.032) * Math.min(d * 0.035, 0.85);
  return Math.max(0, gentleSlope + lateralRoll * 0.65);
}

/**
 * Builds wide rolling terrain banks for left and right roadsides.
 */
export function createSideTerrainGeometry(side: -1 | 1, length: number): THREE.BufferGeometry {
  const width = 220;
  const segX = 44;
  const segZ = 8;
  const geo = new THREE.PlaneGeometry(width, length, segX, segZ);
  geo.rotateX(-Math.PI / 2);

  // Shift so inner edge starts cleanly at x = side * 7.2
  const innerEdge = 7.2;
  const offsetCenter = side * (innerEdge + width / 2);
  geo.translate(offsetCenter, 0, 0);

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const absX = Math.abs(vx);
    // Keep inner edge slightly below road plane (-0.02) to prevent Z-fighting
    const y = absX <= 8.8 ? -0.02 : groundHeightAt(vx);
    pos.setY(i, y);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

export interface RaceCarHandle {
  group: THREE.Group;
  frontLeftSteer: THREE.Group;
  frontRightSteer: THREE.Group;
  wheels: THREE.Group[];
  brakeLightsMaterial: THREE.MeshStandardMaterial;
  headlightMaterial: THREE.MeshStandardMaterial;
  headlightBeamMaterial: THREE.MeshBasicMaterial;
  headlightBeams: THREE.Mesh[];
  headlightSpot: THREE.SpotLight;
  paintMaterial: THREE.MeshPhysicalMaterial;
  boostFlames: THREE.Mesh[];
  setPaintColor: (hex: string) => void;
}

/**
 * Builds a composite 10+ part cartoon sports race car facing -Z, grounded at y = 0.
 */
export function createRaceCar(contactShadowTex: THREE.Texture, initialPaintHex = '#FF4757'): RaceCarHandle {
  const car = new THREE.Group();

  const paintMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(initialPaintHex),
    roughness: 0.22,
    metalness: 0.12,
    clearcoat: 1.0,
    clearcoatRoughness: 0.12,
  });

  const stripeMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.35,
    metalness: 0.05,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  const trimDarkMaterial = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.72,
    metalness: 0.15,
  });

  const chromeMaterial = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    roughness: 0.16,
    metalness: 0.88,
  });

  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x0f172a,
    roughness: 0.08,
    metalness: 0.1,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
  });

  const headlightMaterial = new THREE.MeshStandardMaterial({
    color: 0xfffbeb,
    emissive: 0xfef08a,
    emissiveIntensity: 1.35,
    roughness: 0.2,
  });

  const brakeLightsMaterial = new THREE.MeshStandardMaterial({
    color: 0xff2e43,
    emissive: 0xff1e38,
    emissiveIntensity: 0.8,
    roughness: 0.25,
  });

  // 1. Soft Contact Shadow underneath car
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 5.4),
    new THREE.MeshBasicMaterial({
      map: contactShadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.72,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.022;
  car.add(shadowPlane);

  // 2. Sculpted Extruded Main Chassis (side profile along Z, extruded across X)
  const profile = new THREE.Shape();
  profile.moveTo(-2.15, 0.26); // rear bottom
  profile.lineTo(2.15, 0.26);  // front bottom
  profile.lineTo(2.26, 0.45);  // front nose lip
  profile.lineTo(2.05, 0.74);  // hood front
  profile.lineTo(1.05, 0.88);  // windshield base
  profile.lineTo(0.45, 1.34);  // roof front
  profile.lineTo(-0.75, 1.34); // roof rear
  profile.lineTo(-1.45, 0.94); // fastback slope
  profile.lineTo(-2.15, 0.92); // rear deck
  profile.lineTo(-2.24, 0.52); // rear bumper
  profile.closePath();

  const bodyGeo = new THREE.ExtrudeGeometry(profile, {
    depth: 1.78,
    bevelEnabled: true,
    bevelThickness: 0.14,
    bevelSize: 0.1,
    bevelSegments: 3,
  });
  // Center extrusion along Z first, then rotate so +X profile becomes -Z forward
  bodyGeo.translate(0, 0, -1.78 / 2);
  bodyGeo.rotateY(Math.PI / 2);
  bodyGeo.computeVertexNormals();

  const bodyMesh = new THREE.Mesh(bodyGeo, paintMaterial);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  car.add(bodyMesh);

  // 3. Lower Aerodynamic Side Skirts & Front Splitter
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(2.08, 0.1, 4.45), trimDarkMaterial);
  splitter.position.set(0, 0.26, 0);
  splitter.castShadow = true;
  car.add(splitter);

  // 4. Twin Racing Stripes (hood, roof, rear deck)
  for (const sx of [-0.22, 0.22]) {
    const hoodStripe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.03, 1.15), stripeMaterial);
    hoodStripe.position.set(sx, 0.85, -1.52);
    hoodStripe.rotation.x = 0.12;
    car.add(hoodStripe);

    const roofStripe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.03, 1.24), stripeMaterial);
    roofStripe.position.set(sx, 1.44, 0.16);
    car.add(roofStripe);

    const rearStripe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.03, 0.72), stripeMaterial);
    rearStripe.position.set(sx, 1.03, 1.75);
    car.add(rearStripe);
  }

  // 5. Glossy Tinted Cabin Canopy & Side Windows
  const cabinShape = new THREE.Shape();
  cabinShape.moveTo(0.95, 0.88);
  cabinShape.lineTo(0.42, 1.32);
  cabinShape.lineTo(-0.72, 1.32);
  cabinShape.lineTo(-1.35, 0.94);
  cabinShape.closePath();

  const cabinGeo = new THREE.ExtrudeGeometry(cabinShape, {
    depth: 1.56,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 2,
  });
  cabinGeo.translate(0, 0, -1.56 / 2);
  cabinGeo.rotateY(Math.PI / 2);
  cabinGeo.computeVertexNormals();
  const cabinMesh = new THREE.Mesh(cabinGeo, glassMaterial);
  cabinMesh.position.y = 0.04;
  car.add(cabinMesh);

  // Side mirrors
  for (const side of [-1, 1]) {
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.16), paintMaterial);
    mirror.position.set(side * 1.12, 0.96, -0.58);
    car.add(mirror);
  }

  // 6. Front Chrome Grille, Headlights & Nighttime Volumetric Beams
  const grille = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.22, 0.12), trimDarkMaterial);
  grille.position.set(0, 0.48, -2.31);
  car.add(grille);

  const grilleBar = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.06, 0.14), chromeMaterial);
  grilleBar.position.set(0, 0.48, -2.32);
  car.add(grilleBar);

  const headlightBeams: THREE.Mesh[] = [];
  const headlightBeamMaterial = new THREE.MeshBasicMaterial({
    color: 0xfef3c7,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const beamGeo = new THREE.ConeGeometry(1.75, 16, 16, 1, true);
  beamGeo.translate(0, -8, 0);
  beamGeo.rotateX(Math.PI / 2 - 0.06);

  for (const hx of [-0.72, 0.72]) {
    const headlight = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.15, 0.12), headlightMaterial);
    headlight.position.set(hx, 0.66, -2.23);
    headlight.rotation.y = hx < 0 ? 0.16 : -0.16;
    car.add(headlight);

    const beam = new THREE.Mesh(beamGeo, headlightBeamMaterial);
    beam.position.set(hx, 0.64, -2.28);
    beam.visible = false;
    car.add(beam);
    headlightBeams.push(beam);
  }

  // Forward SpotLight mounted on nose to illuminate road & coins at dusk/night
  const headlightSpot = new THREE.SpotLight(0xfff4d6, 0, 58, Math.PI / 4.5, 0.55, 1.4);
  headlightSpot.position.set(0, 0.88, -2.15);
  const headlightTarget = new THREE.Object3D();
  headlightTarget.position.set(0, 0.1, -26);
  car.add(headlightTarget);
  headlightSpot.target = headlightTarget;
  car.add(headlightSpot);

  // 7. Rear Spoiler Wing & Pylons
  for (const px of [-0.58, 0.58]) {
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.32, 0.22), trimDarkMaterial);
    pylon.position.set(px, 1.14, 1.98);
    pylon.rotation.x = -0.18;
    car.add(pylon);
  }
  const wing = new THREE.Mesh(new THREE.BoxGeometry(2.08, 0.08, 0.36), paintMaterial);
  wing.position.set(0, 1.32, 2.04);
  wing.rotation.x = 0.08;
  wing.castShadow = true;
  car.add(wing);

  // Wing endplates
  for (const ex of [-1.04, 1.04]) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.42), trimDarkMaterial);
    plate.position.set(ex, 1.31, 2.04);
    car.add(plate);
  }

  // 8. Rear Taillights & Chrome Exhaust Pipes
  for (const tx of [-0.68, 0.68]) {
    const taillight = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.1), brakeLightsMaterial);
    taillight.position.set(tx, 0.76, 2.29);
    car.add(taillight);
  }

  const boostFlames: THREE.Mesh[] = [];
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.9,
  });

  for (const ex of [-0.46, 0.46]) {
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.25, 14), chromeMaterial);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(ex, 0.36, 2.3);
    car.add(exhaust);

    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.65, 12), flameMat);
    flame.rotation.x = Math.PI / 2;
    flame.position.set(ex, 0.36, 2.68);
    flame.visible = false;
    car.add(flame);
    boostFlames.push(flame);
  }

  // 9. Four Composite Wheels (rubber tire + 5-spoke metallic alloy rim + hubcap)
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.85, metalness: 0.05 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.2, metalness: 0.85 });

  const createWheel = (): THREE.Group => {
    const wheelGroup = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.34, 24), tireMat);
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    wheelGroup.add(tire);

    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.36, 16), rimMat);
    rim.rotation.z = Math.PI / 2;
    wheelGroup.add(rim);

    // 5-spoke cartoon star accent so wheel spin is clearly visible
    for (let s = 0; s < 5; s++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.055, 0.46), trimDarkMaterial);
      spoke.rotation.x = (s * Math.PI) / 5;
      wheelGroup.add(spoke);
    }

    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.4, 12), paintMaterial);
    hub.rotation.z = Math.PI / 2;
    wheelGroup.add(hub);

    return wheelGroup;
  };

  const frontLeftSteer = new THREE.Group();
  frontLeftSteer.position.set(-1.04, 0.42, -1.36);
  const flWheel = createWheel();
  frontLeftSteer.add(flWheel);
  car.add(frontLeftSteer);

  const frontRightSteer = new THREE.Group();
  frontRightSteer.position.set(1.04, 0.42, -1.36);
  const frWheel = createWheel();
  frontRightSteer.add(frWheel);
  car.add(frontRightSteer);

  const rlWheel = createWheel();
  rlWheel.position.set(-1.04, 0.42, 1.36);
  car.add(rlWheel);

  const rrWheel = createWheel();
  rrWheel.position.set(1.04, 0.42, 1.36);
  car.add(rrWheel);

  const wheels = [flWheel, frWheel, rlWheel, rrWheel];

  return {
    group: car,
    frontLeftSteer,
    frontRightSteer,
    wheels,
    brakeLightsMaterial,
    headlightMaterial,
    headlightBeamMaterial,
    headlightBeams,
    headlightSpot,
    paintMaterial,
    boostFlames,
    setPaintColor: (hex: string) => {
      paintMaterial.color.set(hex);
    },
  };
}

export interface CoinGeometries {
  rim: THREE.BufferGeometry;
  face: THREE.BufferGeometry;
  glowRing: THREE.BufferGeometry;
  sparkle: THREE.BufferGeometry;
  dispose: () => void;
}

/**
 * Composite multi-part collectible coin geometries (beveled rim + embossed face + ground glow ring)
 * plus sparkle octahedron for collection bursts.
 */
export function createCoinGeometries(): CoinGeometries {
  // Ridged golden torus rim around the coin edge
  const rim = new THREE.TorusGeometry(0.62, 0.1, 10, 24);

  // Inner embossed coin face disc (oriented in XY plane facing +/-Z)
  const face = new THREE.CylinderGeometry(0.58, 0.58, 0.12, 24);
  face.rotateX(Math.PI / 2);

  // Ground halo ring sitting cleanly on road surface
  const glowRing = new THREE.RingGeometry(0.32, 0.76, 24);
  glowRing.rotateX(-Math.PI / 2);

  // Burst particle geometry
  const sparkle = new THREE.OctahedronGeometry(0.18, 0);

  return {
    rim,
    face,
    glowRing,
    sparkle,
    dispose: () => {
      rim.dispose();
      face.dispose();
      glowRing.dispose();
      sparkle.dispose();
    },
  };
}

export interface TreePartGeometries {
  pineTrunk: THREE.BufferGeometry;
  pineFoliage: THREE.BufferGeometry;
  pineCrown: THREE.BufferGeometry;
  oakTrunk: THREE.BufferGeometry;
  oakFoliage: THREE.BufferGeometry;
  oakCrown: THREE.BufferGeometry;
  bushFoliage: THREE.BufferGeometry;
  flowerHeads: THREE.BufferGeometry;
  rock: THREE.BufferGeometry;
  dispose: () => void;
}

/**
 * Builds composite multi-part cartoon tree, bush, flower, and boulder geometries
 * anchored with bottom-center pivot at y = 0 so every instance sits flush on groundHeightAt(x).
 */
export function createFoliageGeometries(): TreePartGeometries {
  // --- Archetype A: Layered Cartoon Pine Tree ---
  const pTrunkMain = new THREE.CylinderGeometry(0.18, 0.34, 1.9, 8);
  pTrunkMain.translate(0, 0.95, 0);
  const pTrunkFlare = new THREE.CylinderGeometry(0.32, 0.48, 0.35, 8);
  pTrunkFlare.translate(0, 0.175, 0);
  const pineTrunk = mergeGeometries([pTrunkMain, pTrunkFlare]);

  const tier1 = new THREE.ConeGeometry(1.85, 2.35, 8);
  tier1.translate(0, 2.55, 0);
  const tier2 = new THREE.ConeGeometry(1.45, 2.05, 8);
  tier2.rotateY(0.38);
  tier2.translate(0, 3.85, 0);
  const pineFoliage = mergeGeometries([tier1, tier2]);

  const tier3 = new THREE.ConeGeometry(1.02, 1.75, 8);
  tier3.rotateY(0.15);
  tier3.translate(0, 5.05, 0);
  const pineCrown = tier3;

  // --- Archetype B: Fluffy Cartoon Oak / Deciduous Tree ---
  const oTrunkMain = new THREE.CylinderGeometry(0.24, 0.42, 2.35, 8);
  oTrunkMain.translate(0, 1.175, 0);
  const oBranchL = new THREE.CylinderGeometry(0.11, 0.17, 1.1, 7);
  oBranchL.rotateZ(0.65);
  oBranchL.translate(-0.42, 1.95, 0.1);
  const oBranchR = new THREE.CylinderGeometry(0.11, 0.16, 0.95, 7);
  oBranchR.rotateZ(-0.58);
  oBranchR.translate(0.38, 1.85, -0.15);
  const oakTrunk = mergeGeometries([oTrunkMain, oBranchL, oBranchR]);

  const puff1 = new THREE.IcosahedronGeometry(1.38, 1);
  puff1.translate(0, 3.25, 0);
  const puff2 = new THREE.IcosahedronGeometry(1.02, 1);
  puff2.translate(-0.95, 2.95, 0.32);
  const puff3 = new THREE.IcosahedronGeometry(0.98, 1);
  puff3.translate(0.92, 2.9, -0.25);
  const puff4 = new THREE.IcosahedronGeometry(0.92, 1);
  puff4.translate(0.12, 3.05, 0.92);
  const oakFoliage = mergeGeometries([puff1, puff2, puff3, puff4]);

  const topPuff1 = new THREE.IcosahedronGeometry(1.05, 1);
  topPuff1.translate(-0.18, 4.15, -0.15);
  const topPuff2 = new THREE.IcosahedronGeometry(0.78, 1);
  topPuff2.translate(0.55, 3.95, 0.35);
  const oakCrown = mergeGeometries([topPuff1, topPuff2]);

  // --- Roadside Shrub Cluster ---
  const b1 = new THREE.IcosahedronGeometry(0.75, 1);
  b1.translate(0, 0.52, 0);
  const b2 = new THREE.IcosahedronGeometry(0.55, 1);
  b2.translate(-0.55, 0.38, 0.18);
  const b3 = new THREE.IcosahedronGeometry(0.52, 1);
  b3.translate(0.52, 0.36, -0.14);
  const bushFoliage = mergeGeometries([b1, b2, b3]);

  // --- Colorful Wildflower Cluster ---
  const fl1 = new THREE.OctahedronGeometry(0.22, 0);
  fl1.translate(0, 0.32, 0);
  const fl2 = new THREE.OctahedronGeometry(0.18, 0);
  fl2.translate(-0.28, 0.25, 0.18);
  const fl3 = new THREE.OctahedronGeometry(0.19, 0);
  fl3.translate(0.26, 0.28, -0.16);
  const flowerHeads = mergeGeometries([fl1, fl2, fl3]);

  // --- Faceted Cartoon Boulder ---
  const r1 = new THREE.DodecahedronGeometry(0.9, 0);
  r1.scale(1.2, 0.72, 1.0);
  r1.translate(0, 0.42, 0);
  const r2 = new THREE.DodecahedronGeometry(0.55, 0);
  r2.translate(0.75, 0.28, 0.35);
  const rock = mergeGeometries([r1, r2]);

  return {
    pineTrunk,
    pineFoliage,
    pineCrown,
    oakTrunk,
    oakFoliage,
    oakCrown,
    bushFoliage,
    flowerHeads,
    rock,
    dispose: () => {
      pineTrunk.dispose();
      pineFoliage.dispose();
      pineCrown.dispose();
      oakTrunk.dispose();
      oakFoliage.dispose();
      oakCrown.dispose();
      bushFoliage.dispose();
      flowerHeads.dispose();
      rock.dispose();
    },
  };
}

/**
 * Creates a composite 6-part fluffy cartoon 3D cloud group.
 */
export function createCloudGroup(material: THREE.Material, seedOffset: number): THREE.Group {
  const cloud = new THREE.Group();
  const puffs: Array<[number, number, number, number]> = [
    [0, 0.3, 0, 2.2],
    [-2.0, -0.1, 0.2, 1.65],
    [2.05, -0.15, -0.1, 1.7],
    [-1.0, 0.9, -0.3, 1.55],
    [1.1, 0.75, 0.35, 1.5],
    [3.3, -0.45, 0.15, 1.15],
  ];

  for (let i = 0; i < puffs.length; i++) {
    const [px, py, pz, r] = puffs[i];
    const geo = new THREE.IcosahedronGeometry(r, 2);
    // Flatten underside slightly for classic cartoon cumulus silhouette
    geo.scale(1.15, 0.78, 0.95);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(
      px + Math.sin(seedOffset + i) * 0.25,
      py + Math.cos(seedOffset + i * 2) * 0.12,
      pz,
    );
    cloud.add(mesh);
  }
  return cloud;
}

/**
 * Generates a stylized faceted low-poly mountain ridge geometry with vertex colors:
 * green foothills -> colorful indigo/slate rock slopes -> crisp white snow caps.
 */
export function createMountainPeakGeometry(
  baseRadius: number,
  height: number,
  snowThreshold: number,
  seed: number,
): THREE.BufferGeometry {
  const radialSegs = 7;
  const heightSegs = 4;
  const geo = new THREE.ConeGeometry(baseRadius, height, radialSegs, heightSegs, false);
  geo.translate(0, height / 2, 0);

  // Convert to non-indexed for crisp cartoon flat faces with clean vertex colors
  const nonIndexed = geo.toNonIndexed();
  geo.dispose();

  const pos = nonIndexed.attributes.position;
  // Perturb vertices deterministically so each mountain looks natural & jagged
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    if (vy > 0.5 && vy < height - 0.5) {
      const n = Math.sin(vx * 0.17 + seed) * Math.cos(vz * 0.19 - seed * 0.7);
      const scale = 1 + n * 0.22;
      pos.setX(i, vx * scale);
      pos.setZ(i, vz * scale);
    }
  }
  pos.needsUpdate = true;
  nonIndexed.computeVertexNormals();

  // Assign height-based cartoon colors (emerald base -> indigo/slate rock -> bright snow peak)
  const colors = new Float32Array(pos.count * 3);
  const cBase = new THREE.Color('#22C55E');
  const cMid = new THREE.Color('#5B6EE1');
  const cRock = new THREE.Color('#475569');
  const cSnow = new THREE.Color('#F8FAFC');
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const vy = pos.getY(i);
    const ratio = vy / height;
    const jitter = Math.sin(pos.getX(i) * 0.25 + seed) * 0.04;
    const h = ratio + jitter;

    if (h > snowThreshold) {
      tmp.copy(cSnow);
    } else if (h > 0.36) {
      const t = (h - 0.36) / (snowThreshold - 0.36);
      tmp.copy(cRock).lerp(cMid, 0.55 + t * 0.35);
    } else {
      const t = Math.max(0, h / 0.36);
      tmp.copy(cBase).lerp(cRock, t * 0.85);
    }

    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }

  nonIndexed.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return nonIndexed;
}

/**
 * Builds an overhead cartoon highway gantry arch spanning the road.
 */
export function createHighwayArch(bannerTex: THREE.Texture): THREE.Group {
  const arch = new THREE.Group();

  const pillarMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.38,
    metalness: 0.55,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    roughness: 0.35,
    metalness: 0.2,
  });
  const signMat = new THREE.MeshStandardMaterial({
    map: bannerTex,
    emissiveMap: bannerTex,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.18,
    roughness: 0.4,
    metalness: 0.08,
  });

  // Left & Right support pillars positioned cleanly outside guardrails (x = ±8.5)
  for (const sx of [-8.5, 8.5]) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.65, 0.95), accentMat);
    base.position.set(sx, 0.325, 0);
    base.castShadow = true;
    arch.add(base);

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 7.6, 12), pillarMat);
    pole.position.set(sx, 3.8, 0);
    pole.castShadow = true;
    arch.add(pole);
  }

  // Overhead horizontal truss bar
  const crossbeam = new THREE.Mesh(new THREE.BoxGeometry(17.6, 0.42, 0.42), pillarMat);
  crossbeam.position.set(0, 7.45, 0);
  crossbeam.castShadow = true;
  arch.add(crossbeam);

  // Main colorful sign board facing the driver (+Z)
  const boardBack = new THREE.Mesh(new THREE.BoxGeometry(11.4, 2.25, 0.24), pillarMat);
  boardBack.position.set(0, 6.95, 0.14);
  boardBack.castShadow = true;
  arch.add(boardBack);

  const boardFace = new THREE.Mesh(new THREE.PlaneGeometry(11.1, 2.05), signMat);
  boardFace.position.set(0, 6.95, 0.27);
  arch.add(boardFace);

  return arch;
}

export type TrafficCarArchetype = 'sedan' | 'suv' | 'pickup';

export interface TrafficCarHandle {
  group: THREE.Group;
  wheels: THREE.Group[];
  brakeLightsMaterial: THREE.MeshStandardMaterial;
  headlightMaterial: THREE.MeshStandardMaterial;
  paintMaterial: THREE.MeshPhysicalMaterial;
  setPaintColor: (hex: string) => void;
}

/**
 * Builds a composite multi-part cartoon traffic car facing -Z, grounded at y = 0.
 * Supports three distinct silhouettes: 'sedan', 'suv', and 'pickup'.
 */
export function createTrafficCar(
  contactShadowTex: THREE.Texture,
  archetype: TrafficCarArchetype,
  initialPaintHex: string,
): TrafficCarHandle {
  const car = new THREE.Group();

  const paintMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(initialPaintHex),
    roughness: 0.28,
    metalness: 0.1,
    clearcoat: 0.85,
    clearcoatRoughness: 0.16,
  });

  const trimDarkMaterial = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.74,
    metalness: 0.14,
  });

  const chromeMaterial = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.22,
    metalness: 0.82,
  });

  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x0f172a,
    roughness: 0.1,
    metalness: 0.12,
    clearcoat: 0.9,
    clearcoatRoughness: 0.08,
  });

  const headlightMaterial = new THREE.MeshStandardMaterial({
    color: 0xfffbeb,
    emissive: 0xfef08a,
    emissiveIntensity: 0.9,
    roughness: 0.2,
  });

  const brakeLightsMaterial = new THREE.MeshStandardMaterial({
    color: 0xff2e43,
    emissive: 0xff1e38,
    emissiveIntensity: 0.75,
    roughness: 0.25,
  });

  // 1. Soft Contact Shadow underneath traffic vehicle
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(3.0, 5.1),
    new THREE.MeshBasicMaterial({
      map: contactShadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.65,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.022;
  car.add(shadowPlane);

  // 2. Archetype Body Profile (+X becomes -Z forward after rotateY(Math.PI / 2))
  const profile = new THREE.Shape();
  const cabinShape = new THREE.Shape();
  let wheelRadius = 0.39;
  let frontZ = -1.28;
  let rearZ = 1.28;
  let taillightY = 0.76;
  let taillightZ = 2.15;
  let headlightY = 0.66;
  let headlightZ = -2.14;

  if (archetype === 'suv') {
    profile.moveTo(-2.05, 0.3);
    profile.lineTo(2.05, 0.3);
    profile.lineTo(2.14, 0.56);
    profile.lineTo(1.98, 0.92);
    profile.lineTo(1.12, 1.02);
    profile.lineTo(0.68, 1.66);
    profile.lineTo(-1.58, 1.66);
    profile.lineTo(-2.05, 1.06);
    profile.lineTo(-2.12, 0.56);
    profile.closePath();

    cabinShape.moveTo(1.04, 1.02);
    cabinShape.lineTo(0.64, 1.6);
    cabinShape.lineTo(-1.46, 1.6);
    cabinShape.lineTo(-1.86, 1.04);
    cabinShape.closePath();

    wheelRadius = 0.44;
    frontZ = -1.32;
    rearZ = 1.32;
    taillightY = 0.86;
    taillightZ = 2.14;
    headlightY = 0.74;
    headlightZ = -2.14;
  } else if (archetype === 'pickup') {
    profile.moveTo(-2.18, 0.32);
    profile.lineTo(2.1, 0.32);
    profile.lineTo(2.2, 0.56);
    profile.lineTo(2.04, 0.94);
    profile.lineTo(1.06, 1.04);
    profile.lineTo(0.66, 1.64);
    profile.lineTo(-0.38, 1.64);
    profile.lineTo(-0.56, 1.04);
    profile.lineTo(-2.12, 1.04);
    profile.lineTo(-2.22, 0.56);
    profile.closePath();

    cabinShape.moveTo(0.98, 1.04);
    cabinShape.lineTo(0.62, 1.58);
    cabinShape.lineTo(-0.34, 1.58);
    cabinShape.lineTo(-0.48, 1.04);
    cabinShape.closePath();

    wheelRadius = 0.45;
    frontZ = -1.34;
    rearZ = 1.38;
    taillightY = 0.84;
    taillightZ = 2.24;
    headlightY = 0.76;
    headlightZ = -2.2;
  } else {
    // Classic rounded cartoon sedan
    profile.moveTo(-2.02, 0.28);
    profile.lineTo(2.02, 0.28);
    profile.lineTo(2.14, 0.5);
    profile.lineTo(1.94, 0.82);
    profile.lineTo(0.98, 0.94);
    profile.lineTo(0.45, 1.44);
    profile.lineTo(-0.82, 1.44);
    profile.lineTo(-1.44, 0.96);
    profile.lineTo(-2.02, 0.92);
    profile.lineTo(-2.12, 0.52);
    profile.closePath();

    cabinShape.moveTo(0.9, 0.94);
    cabinShape.lineTo(0.42, 1.39);
    cabinShape.lineTo(-0.78, 1.39);
    cabinShape.lineTo(-1.32, 0.96);
    cabinShape.closePath();

    wheelRadius = 0.39;
    frontZ = -1.26;
    rearZ = 1.26;
    taillightY = 0.76;
    taillightZ = 2.13;
    headlightY = 0.66;
    headlightZ = -2.14;
  }

  const bodyGeo = new THREE.ExtrudeGeometry(profile, {
    depth: 1.66,
    bevelEnabled: true,
    bevelThickness: 0.12,
    bevelSize: 0.09,
    bevelSegments: 2,
  });
  bodyGeo.translate(0, 0, -1.66 / 2);
  bodyGeo.rotateY(Math.PI / 2);
  bodyGeo.computeVertexNormals();

  const bodyMesh = new THREE.Mesh(bodyGeo, paintMaterial);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  car.add(bodyMesh);

  // 3. Glossy Cabin Glass
  const cabinGeo = new THREE.ExtrudeGeometry(cabinShape, {
    depth: 1.48,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  cabinGeo.translate(0, 0, -1.48 / 2);
  cabinGeo.rotateY(Math.PI / 2);
  cabinGeo.computeVertexNormals();
  const cabinMesh = new THREE.Mesh(cabinGeo, glassMaterial);
  cabinMesh.position.y = 0.03;
  car.add(cabinMesh);

  // 4. Lower Bumpers / Skirts
  const chassisBottom = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.12, 4.2), trimDarkMaterial);
  chassisBottom.position.set(0, 0.3, 0);
  car.add(chassisBottom);

  // Archetype-specific detail accents
  if (archetype === 'suv') {
    for (const rx of [-0.62, 0.62]) {
      const rack = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 1.9), chromeMaterial);
      rack.position.set(rx, 1.78, 0.45);
      car.add(rack);
    }
    const spareTire = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.2, 16), trimDarkMaterial);
    spareTire.rotation.x = Math.PI / 2;
    spareTire.position.set(0, 0.98, 2.18);
    car.add(spareTire);
  } else if (archetype === 'pickup') {
    // Open truck bed floor insert + sport roll bar
    const bedLiner = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.08, 1.4), trimDarkMaterial);
    bedLiner.position.set(0, 1.12, 1.32);
    car.add(bedLiner);

    const rollBar = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.36, 0.1), chromeMaterial);
    rollBar.position.set(0, 1.32, 0.68);
    car.add(rollBar);
  }

  // Side mirrors
  for (const side of [-1, 1]) {
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.11, 0.14), paintMaterial);
    mirror.position.set(side * 1.04, 1.04, -0.52);
    car.add(mirror);
  }

  // 5. Front Grille & Headlights
  const grille = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.2, 0.1), chromeMaterial);
  grille.position.set(0, headlightY - 0.14, headlightZ - 0.04);
  car.add(grille);

  for (const hx of [-0.66, 0.66]) {
    const headlight = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.15, 0.1), headlightMaterial);
    headlight.position.set(hx, headlightY, headlightZ);
    car.add(headlight);
  }

  // 6. Rear Taillights / Brake Lights & License Plate Accent
  for (const tx of [-0.64, 0.64]) {
    const taillight = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.15, 0.1), brakeLightsMaterial);
    taillight.position.set(tx, taillightY, taillightZ);
    car.add(taillight);
  }
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.18, 0.08), chromeMaterial);
  plate.position.set(0, taillightY - 0.18, taillightZ + 0.02);
  car.add(plate);

  // 7. Four Composite Wheels
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.86, metalness: 0.05 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.24, metalness: 0.8 });

  const makeWheel = (): THREE.Group => {
    const w = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.3, 18), tireMat);
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    w.add(tire);

    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(wheelRadius * 0.6, wheelRadius * 0.6, 0.32, 14),
      rimMat,
    );
    rim.rotation.z = Math.PI / 2;
    w.add(rim);

    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, wheelRadius * 1.05), trimDarkMaterial);
    w.add(bar);
    return w;
  };

  const wheelPositions: Array<[number, number, number]> = [
    [-0.95, wheelRadius, frontZ],
    [0.95, wheelRadius, frontZ],
    [-0.95, wheelRadius, rearZ],
    [0.95, wheelRadius, rearZ],
  ];

  const wheels: THREE.Group[] = [];
  for (const [wx, wy, wz] of wheelPositions) {
    const wheel = makeWheel();
    wheel.position.set(wx, wy, wz);
    car.add(wheel);
    wheels.push(wheel);
  }

  return {
    group: car,
    wheels,
    brakeLightsMaterial,
    headlightMaterial,
    paintMaterial,
    setPaintColor: (hex: string) => {
      paintMaterial.color.set(hex);
    },
  };
}

export interface DiamondGeometries {
  gem: THREE.BufferGeometry;
  glowRing: THREE.BufferGeometry;
  dispose: () => void;
}

/**
 * Faceted cartoon crystal diamond geometry + ground halo ring.
 */
export function createDiamondGeometries(): DiamondGeometries {
  const gem = new THREE.OctahedronGeometry(0.68, 0);
  gem.scale(0.88, 1.32, 0.88);
  gem.computeVertexNormals();

  const glowRing = new THREE.RingGeometry(0.36, 0.82, 24);
  glowRing.rotateX(-Math.PI / 2);

  return {
    gem,
    glowRing,
    dispose: () => {
      gem.dispose();
      glowRing.dispose();
    },
  };
}

/**
 * Builds a composite 5-part 3D cartoon Petrol / Jerrycan pickup grounded at y = 0.
 */
export function createPetrolPickupGroup(): THREE.Group {
  const group = new THREE.Group();

  const redTankMat = new THREE.MeshPhysicalMaterial({
    color: 0xef4444,
    emissive: 0x991b1b,
    emissiveIntensity: 0.35,
    roughness: 0.3,
    metalness: 0.12,
    clearcoat: 0.8,
  });

  const accentYellowMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    emissive: 0xeab308,
    emissiveIntensity: 0.45,
    roughness: 0.32,
    metalness: 0.2,
  });

  const badgeWhiteMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xfef08a,
    emissiveIntensity: 0.3,
    roughness: 0.35,
  });

  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xf87171,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  // Ground glow ring
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.92, 24), glowMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.032;
  group.add(ring);

  // Floating canister sub-group
  const can = new THREE.Group();
  can.position.y = 0.95;

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.92, 1.06, 0.56), redTankMat);
  body.castShadow = true;
  can.add(body);

  // Top carry handle
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.14, 0.16), redTankMat);
  handle.position.set(-0.12, 0.6, 0);
  can.add(handle);

  // Angled yellow spout nozzle
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.42, 10), accentYellowMat);
  spout.position.set(0.32, 0.64, 0);
  spout.rotation.z = -0.52;
  can.add(spout);

  // Fuel band stripe around middle
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.24, 0.6), accentYellowMat);
  stripe.position.set(0, -0.05, 0);
  can.add(stripe);

  // Bright front/back emblem dot
  const emblem = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.63), badgeWhiteMat);
  emblem.position.set(0, 0.2, 0);
  can.add(emblem);

  group.add(can);
  group.userData.floatGroup = can;
  return group;
}

/**
 * Builds a composite 5-part 3D electric Nitro Booster pod pickup grounded at y = 0.
 */
export function createBoosterPickupGroup(): THREE.Group {
  const group = new THREE.Group();

  const nitroBlueMat = new THREE.MeshPhysicalMaterial({
    color: 0x0ea5e9,
    emissive: 0x0284c7,
    emissiveIntensity: 0.65,
    roughness: 0.2,
    metalness: 0.45,
    clearcoat: 1.0,
  });

  const goldTrimMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.55,
    roughness: 0.24,
    metalness: 0.78,
  });

  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xe0f2fe,
  });

  const glowMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  // Ground glow ring
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.96, 24), glowMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.032;
  group.add(ring);

  const pod = new THREE.Group();
  pod.position.y = 1.05;

  // Main angled nitro canister
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.08, 16), nitroBlueMat);
  tank.rotation.z = 0.28;
  tank.castShadow = true;
  pod.add(tank);

  // Gold end caps
  for (const dir of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.14, 16), goldTrimMat);
    cap.position.set(-dir * 0.14, dir * 0.5, 0);
    cap.rotation.z = 0.28;
    pod.add(cap);
  }

  // Orbiting electric energy ring
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.06, 8, 24), goldTrimMat);
  halo.rotation.x = Math.PI / 3;
  pod.add(halo);

  // Inner bright energy diamond
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), coreMat);
  core.position.set(0, 0.72, 0);
  pod.add(core);

  group.add(pod);
  group.userData.floatGroup = pod;
  return group;
}

/**
 * Builds a flush-on-asphalt 3D Turbo Boost Pad with glowing forward chevrons.
 */
export function createBoostPadGroup(): THREE.Group {
  const group = new THREE.Group();

  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.35,
    metalness: 0.72,
  });

  const padGlowMat = new THREE.MeshBasicMaterial({
    color: 0x0ea5e9,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });

  const chevronCyanMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
  });

  const chevronGoldMat = new THREE.MeshBasicMaterial({
    color: 0xfacc15,
  });

  // Flush dark base plate
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.04, 4.6), frameMat);
  base.position.y = 0.02;
  group.add(base);

  // Inner cyan light bed
  const lightBed = new THREE.Mesh(new THREE.PlaneGeometry(2.15, 4.25), padGlowMat);
  lightBed.rotation.x = -Math.PI / 2;
  lightBed.position.y = 0.044;
  group.add(lightBed);

  // Side neon guide rails
  for (const sx of [-1.22, 1.22]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 4.6), chevronCyanMat);
    rail.position.set(sx, 0.045, 0);
    group.add(rail);
  }

  // Three forward-pointing chevron strips along -Z
  const chevronsGroup = new THREE.Group();
  const zOffsets = [1.25, 0, -1.25];
  for (let i = 0; i < zOffsets.length; i++) {
    const mat = i === 2 ? chevronGoldMat : chevronCyanMat;
    const z = zOffsets[i];
    for (const side of [-1, 1] as const) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.04, 0.24), mat);
      wing.position.set(side * 0.37, 0.06, z);
      wing.rotation.y = side * 0.56;
      chevronsGroup.add(wing);
    }
  }
  group.add(chevronsGroup);
  group.userData.chevronsGroup = chevronsGroup;

  return group;
}

/**
 * Builds the 3D Checkered Finish Line Gantry + Asphalt Finish Strip.
 */
export function createFinishLineGroup(
  bannerTex: THREE.Texture,
  checkerTex: THREE.Texture,
): THREE.Group {
  const group = new THREE.Group();

  const pillarMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.3,
    metalness: 0.45,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.35,
    roughness: 0.25,
    metalness: 0.55,
  });
  const signMat = new THREE.MeshStandardMaterial({
    map: bannerTex,
    emissiveMap: bannerTex,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.26,
    roughness: 0.35,
    metalness: 0.1,
  });
  const stripMat = new THREE.MeshStandardMaterial({
    map: checkerTex,
    roughness: 0.55,
    metalness: 0.05,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  // Checkered road finish strip flush across both highway lanes
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(14.2, 3.6), stripMat);
  strip.rotation.x = -Math.PI / 2;
  strip.position.y = 0.036;
  strip.receiveShadow = true;
  group.add(strip);

  // Left & Right Finish Pillars + Strobe Beacons
  for (const sx of [-8.4, 8.4]) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.75, 1.15), goldMat);
    base.position.set(sx, 0.375, 0);
    base.castShadow = true;
    group.add(base);

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 8.0, 12), pillarMat);
    pole.position.set(sx, 4.0, 0);
    pole.castShadow = true;
    group.add(pole);

    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 12), goldMat);
    beacon.position.set(sx, 8.2, 0);
    group.add(beacon);
  }

  // Overhead crossbeam & double-sided Finish Line banner
  const beam = new THREE.Mesh(new THREE.BoxGeometry(17.6, 0.48, 0.48), goldMat);
  beam.position.set(0, 7.6, 0);
  beam.castShadow = true;
  group.add(beam);

  const board = new THREE.Mesh(new THREE.BoxGeometry(12.2, 2.45, 0.26), pillarMat);
  board.position.set(0, 7.05, 0.14);
  board.castShadow = true;
  group.add(board);

  const bannerFront = new THREE.Mesh(new THREE.PlaneGeometry(11.9, 2.25), signMat);
  bannerFront.position.set(0, 7.05, 0.29);
  group.add(bannerFront);

  return group;
}

