import * as THREE from 'three';

export interface ProceduralTextureSet {
  road: THREE.CanvasTexture;
  grass: THREE.CanvasTexture;
  curb: THREE.CanvasTexture;
  sky: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  sunHalo: THREE.CanvasTexture;
  moonHalo: THREE.CanvasTexture;
  archBanner: THREE.CanvasTexture;
  coinFace: THREE.CanvasTexture;
  finishBanner: THREE.CanvasTexture;
  finishChecker: THREE.CanvasTexture;
  dispose: () => void;
}

/**
 * Generates all procedural CanvasTextures for the cartoon endless highway.
 * All color/albedo maps use SRGBColorSpace and maximum anisotropy for grazing-angle sharpness.
 */
export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  const anisotropy = Math.max(1, maxAnisotropy);

  // 1. Road Texture: 2-lane cartoon asphalt with bold middle dashed markings & white edge lines
  const roadCanvas = document.createElement('canvas');
  roadCanvas.width = 1024;
  roadCanvas.height = 1024;
  const rCtx = roadCanvas.getContext('2d')!;

  // Rich stylized slate-indigo asphalt base
  rCtx.fillStyle = '#364156';
  rCtx.fillRect(0, 0, 1024, 1024);

  // Subtle cartoon tire-track darkening in left & right lanes
  const leftLaneGrad = rCtx.createLinearGradient(160, 0, 400, 0);
  leftLaneGrad.addColorStop(0, 'rgba(20, 26, 40, 0)');
  leftLaneGrad.addColorStop(0.5, 'rgba(20, 26, 40, 0.16)');
  leftLaneGrad.addColorStop(1, 'rgba(20, 26, 40, 0)');
  rCtx.fillStyle = leftLaneGrad;
  rCtx.fillRect(160, 0, 240, 1024);

  const rightLaneGrad = rCtx.createLinearGradient(624, 0, 864, 0);
  rightLaneGrad.addColorStop(0, 'rgba(20, 26, 40, 0)');
  rightLaneGrad.addColorStop(0.5, 'rgba(20, 26, 40, 0.16)');
  rightLaneGrad.addColorStop(1, 'rgba(20, 26, 40, 0)');
  rCtx.fillStyle = rightLaneGrad;
  rCtx.fillRect(624, 0, 240, 1024);

  // Crisp subtle asphalt grain speckles (deterministic pseudo-random so tiling is seamless)
  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = 0; i < 4200; i++) {
    const x = rand() * 1024;
    const y = rand() * 1024;
    const w = 2 + rand() * 3;
    const light = rand() > 0.5;
    rCtx.fillStyle = light ? 'rgba(255, 255, 255, 0.045)' : 'rgba(15, 23, 42, 0.09)';
    rCtx.fillRect(x, y, w, w);
  }

  // Outer crisp white edge lines
  rCtx.fillStyle = '#F8FAFC';
  rCtx.fillRect(42, 0, 22, 1024);
  rCtx.fillRect(960, 0, 22, 1024);

  // Subtle inner shoulder accent lines
  rCtx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  rCtx.fillRect(78, 0, 6, 1024);
  rCtx.fillRect(940, 0, 6, 1024);

  // Bold middle dashed lane markings (two clean dashes per tile repeat)
  const drawCenterDash = (yStart: number, height: number) => {
    const x = 492;
    const width = 40;
    const radius = 10;

    // Subtle dark asphalt outline for crisp cartoon pop
    rCtx.fillStyle = 'rgba(15, 23, 42, 0.35)';
    rCtx.beginPath();
    rCtx.roundRect(x - 4, yStart - 4, width + 8, height + 8, radius + 2);
    rCtx.fill();

    // Bright sunlit yellow-gold dash
    rCtx.fillStyle = '#FDE047';
    rCtx.beginPath();
    rCtx.roundRect(x, yStart, width, height, radius);
    rCtx.fill();

    // Inner bright highlight strip
    rCtx.fillStyle = '#FEF9C3';
    rCtx.beginPath();
    rCtx.roundRect(x + 8, yStart + 8, width - 16, height - 16, radius - 4);
    rCtx.fill();
  };

  drawCenterDash(64, 340);
  drawCenterDash(576, 340);

  const road = new THREE.CanvasTexture(roadCanvas);
  road.colorSpace = THREE.SRGBColorSpace;
  road.wrapS = THREE.ClampToEdgeWrapping;
  road.wrapT = THREE.RepeatWrapping;
  road.repeat.set(1, 24);
  road.anisotropy = anisotropy;
  road.needsUpdate = true;

  // 2. Cartoon Grass Meadow Texture
  const grassCanvas = document.createElement('canvas');
  grassCanvas.width = 512;
  grassCanvas.height = 512;
  const gCtx = grassCanvas.getContext('2d')!;

  gCtx.fillStyle = '#2ECC71';
  gCtx.fillRect(0, 0, 512, 512);

  // Stylized broad mowed / sunlight bands across Z
  gCtx.fillStyle = '#38D97C';
  gCtx.fillRect(0, 0, 512, 256);

  // Soft organic clover & highlight patches (seamless across edges)
  for (let i = 0; i < 160; i++) {
    const px = rand() * 512;
    const py = rand() * 512;
    const r = 10 + rand() * 24;
    gCtx.fillStyle = rand() > 0.45 ? 'rgba(134, 239, 172, 0.25)' : 'rgba(22, 163, 74, 0.22)';
    for (const ox of [-512, 0, 512]) {
      for (const oy of [-512, 0, 512]) {
        gCtx.beginPath();
        gCtx.arc(px + ox, py + oy, r, 0, Math.PI * 2);
        gCtx.fill();
      }
    }
  }

  // Stylized grass tufts
  gCtx.strokeStyle = 'rgba(21, 128, 61, 0.35)';
  gCtx.lineWidth = 2.5;
  gCtx.lineCap = 'round';
  for (let i = 0; i < 120; i++) {
    const tx = rand() * 512;
    const ty = rand() * 512;
    gCtx.beginPath();
    gCtx.moveTo(tx, ty);
    gCtx.lineTo(tx - 4, ty - 10);
    gCtx.moveTo(tx, ty);
    gCtx.lineTo(tx + 4, ty - 9);
    gCtx.stroke();
  }

  const grass = new THREE.CanvasTexture(grassCanvas);
  grass.colorSpace = THREE.SRGBColorSpace;
  grass.wrapS = THREE.RepeatWrapping;
  grass.wrapT = THREE.RepeatWrapping;
  grass.repeat.set(22, 32);
  grass.anisotropy = anisotropy;
  grass.needsUpdate = true;

  // 3. Cartoon Racing Curb Texture (Coral Red & Warm Cream stripes)
  const curbCanvas = document.createElement('canvas');
  curbCanvas.width = 128;
  curbCanvas.height = 512;
  const cCtx = curbCanvas.getContext('2d')!;
  cCtx.fillStyle = '#FFFBEB';
  cCtx.fillRect(0, 0, 128, 512);
  cCtx.fillStyle = '#FF4757';
  cCtx.fillRect(0, 0, 128, 256);
  cCtx.fillStyle = 'rgba(15, 23, 42, 0.14)';
  cCtx.fillRect(0, 0, 14, 512);

  const curb = new THREE.CanvasTexture(curbCanvas);
  curb.colorSpace = THREE.SRGBColorSpace;
  curb.wrapS = THREE.ClampToEdgeWrapping;
  curb.wrapT = THREE.RepeatWrapping;
  curb.repeat.set(1, 48);
  curb.anisotropy = anisotropy;
  curb.needsUpdate = true;

  // 4. Cartoon Blue Sky Dome Gradient Texture
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 32;
  skyCanvas.height = 512;
  const sCtx = skyCanvas.getContext('2d')!;
  const skyGrad = sCtx.createLinearGradient(0, 0, 0, 512);
  skyGrad.addColorStop(0.0, '#0D6EFD');   // Deep vibrant cartoon azure zenith
  skyGrad.addColorStop(0.28, '#2998FF');  // Cheerful mid-sky blue
  skyGrad.addColorStop(0.46, '#67D1FF');  // Bright cyan-blue
  skyGrad.addColorStop(0.54, '#BFEFFF');  // Sunlit horizon haze
  skyGrad.addColorStop(1.0, '#BFEFFF');   // Below horizon matches fog
  sCtx.fillStyle = skyGrad;
  sCtx.fillRect(0, 0, 32, 512);

  const sky = new THREE.CanvasTexture(skyCanvas);
  sky.colorSpace = THREE.SRGBColorSpace;
  sky.needsUpdate = true;

  // 5. Soft Radial Contact Shadow Texture
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 256;
  shadowCanvas.height = 256;
  const shCtx = shadowCanvas.getContext('2d')!;
  const shGrad = shCtx.createRadialGradient(128, 128, 18, 128, 128, 124);
  shGrad.addColorStop(0, 'rgba(15, 23, 42, 0.65)');
  shGrad.addColorStop(0.55, 'rgba(15, 23, 42, 0.35)');
  shGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
  shCtx.fillStyle = shGrad;
  shCtx.fillRect(0, 0, 256, 256);

  const contactShadow = new THREE.CanvasTexture(shadowCanvas);
  contactShadow.colorSpace = THREE.SRGBColorSpace;
  contactShadow.needsUpdate = true;

  // 6. Sun Halo Glow Texture
  const sunCanvas = document.createElement('canvas');
  sunCanvas.width = 256;
  sunCanvas.height = 256;
  const suCtx = sunCanvas.getContext('2d')!;
  const suGrad = suCtx.createRadialGradient(128, 128, 12, 128, 128, 126);
  suGrad.addColorStop(0, 'rgba(255, 253, 224, 1)');
  suGrad.addColorStop(0.3, 'rgba(254, 240, 138, 0.78)');
  suGrad.addColorStop(0.65, 'rgba(253, 224, 71, 0.24)');
  suGrad.addColorStop(1, 'rgba(253, 224, 71, 0)');
  suCtx.fillStyle = suGrad;
  suCtx.fillRect(0, 0, 256, 256);

  const sunHalo = new THREE.CanvasTexture(sunCanvas);
  sunHalo.colorSpace = THREE.SRGBColorSpace;
  sunHalo.needsUpdate = true;

  // 7. Overhead Highway Gantry Banner Texture
  const archCanvas = document.createElement('canvas');
  archCanvas.width = 1024;
  archCanvas.height = 192;
  const aCtx = archCanvas.getContext('2d')!;
  aCtx.fillStyle = '#0F766E';
  aCtx.fillRect(0, 0, 1024, 192);
  aCtx.strokeStyle = '#FFFFFF';
  aCtx.lineWidth = 10;
  aCtx.strokeRect(10, 10, 1004, 172);

  // Bright yellow chevron accents
  aCtx.fillStyle = '#FACC15';
  for (let i = 0; i < 4; i++) {
    const cx = 64 + i * 38;
    aCtx.beginPath();
    aCtx.moveTo(cx, 48);
    aCtx.lineTo(cx + 22, 96);
    aCtx.lineTo(cx, 144);
    aCtx.lineTo(cx + 18, 144);
    aCtx.lineTo(cx + 40, 96);
    aCtx.lineTo(cx + 18, 48);
    aCtx.closePath();
    aCtx.fill();

    const rx = 960 - i * 38;
    aCtx.beginPath();
    aCtx.moveTo(rx, 48);
    aCtx.lineTo(rx - 22, 96);
    aCtx.lineTo(rx, 144);
    aCtx.lineTo(rx - 18, 144);
    aCtx.lineTo(rx - 40, 96);
    aCtx.lineTo(rx - 18, 48);
    aCtx.closePath();
    aCtx.fill();
  }

  aCtx.fillStyle = '#FFFFFF';
  aCtx.font = '800 54px Outfit, sans-serif';
  aCtx.textAlign = 'center';
  aCtx.textBaseline = 'middle';
  aCtx.fillText('SUNBURST EXPRESSWAY', 512, 98);

  const archBanner = new THREE.CanvasTexture(archCanvas);
  archBanner.colorSpace = THREE.SRGBColorSpace;
  archBanner.anisotropy = anisotropy;
  archBanner.needsUpdate = true;

  // 8. Moon Halo Glow Texture (soft cool silver-blue)
  const moonCanvas = document.createElement('canvas');
  moonCanvas.width = 256;
  moonCanvas.height = 256;
  const mCtx = moonCanvas.getContext('2d')!;
  const mGrad = mCtx.createRadialGradient(128, 128, 12, 128, 128, 126);
  mGrad.addColorStop(0, 'rgba(241, 245, 249, 0.98)');
  mGrad.addColorStop(0.28, 'rgba(186, 230, 253, 0.55)');
  mGrad.addColorStop(0.65, 'rgba(125, 211, 252, 0.16)');
  mGrad.addColorStop(1, 'rgba(125, 211, 252, 0)');
  mCtx.fillStyle = mGrad;
  mCtx.fillRect(0, 0, 256, 256);

  const moonHalo = new THREE.CanvasTexture(moonCanvas);
  moonHalo.colorSpace = THREE.SRGBColorSpace;
  moonHalo.needsUpdate = true;

  // 9. Stylized Gold Coin Face Texture (embossed rim & star emblem)
  const coinCanvas = document.createElement('canvas');
  coinCanvas.width = 256;
  coinCanvas.height = 256;
  const cnCtx = coinCanvas.getContext('2d')!;

  const coinGrad = cnCtx.createRadialGradient(96, 92, 16, 128, 128, 124);
  coinGrad.addColorStop(0, '#FEF08A');
  coinGrad.addColorStop(0.55, '#FBBF24');
  coinGrad.addColorStop(1, '#D97706');
  cnCtx.fillStyle = coinGrad;
  cnCtx.beginPath();
  cnCtx.arc(128, 128, 124, 0, Math.PI * 2);
  cnCtx.fill();

  // Inner recessed ring
  cnCtx.strokeStyle = '#B45309';
  cnCtx.lineWidth = 10;
  cnCtx.beginPath();
  cnCtx.arc(128, 128, 96, 0, Math.PI * 2);
  cnCtx.stroke();

  cnCtx.strokeStyle = '#FEF9C3';
  cnCtx.lineWidth = 4;
  cnCtx.beginPath();
  cnCtx.arc(128, 128, 88, 0, Math.PI * 2);
  cnCtx.stroke();

  // Crisp 5-point star emblem in center
  cnCtx.fillStyle = '#FFFBEB';
  cnCtx.strokeStyle = '#B45309';
  cnCtx.lineWidth = 5;
  cnCtx.beginPath();
  const spikes = 5;
  const outerR = 54;
  const innerR = 24;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (i * Math.PI) / spikes - Math.PI / 2;
    const px = 128 + Math.cos(angle) * r;
    const py = 128 + Math.sin(angle) * r;
    if (i === 0) cnCtx.moveTo(px, py);
    else cnCtx.lineTo(px, py);
  }
  cnCtx.closePath();
  cnCtx.fill();
  cnCtx.stroke();

  const coinFace = new THREE.CanvasTexture(coinCanvas);
  coinFace.colorSpace = THREE.SRGBColorSpace;
  coinFace.anisotropy = anisotropy;
  coinFace.needsUpdate = true;

  // 10. Checkered Finish Line Overhead Banner Texture
  const finBannerCanvas = document.createElement('canvas');
  finBannerCanvas.width = 1024;
  finBannerCanvas.height = 192;
  const fbCtx = finBannerCanvas.getContext('2d')!;
  fbCtx.fillStyle = '#0F172A';
  fbCtx.fillRect(0, 0, 1024, 192);

  // Left & right checkered flags motif
  const sq = 24;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 6; col++) {
      fbCtx.fillStyle = (row + col) % 2 === 0 ? '#FFFFFF' : '#0F172A';
      fbCtx.fillRect(col * sq, row * sq, sq, sq);
      fbCtx.fillRect(1024 - (col + 1) * sq, row * sq, sq, sq);
    }
  }
  fbCtx.strokeStyle = '#FACC15';
  fbCtx.lineWidth = 8;
  fbCtx.strokeRect(4, 4, 1016, 184);

  fbCtx.fillStyle = '#FACC15';
  fbCtx.font = '800 62px Outfit, sans-serif';
  fbCtx.textAlign = 'center';
  fbCtx.textBaseline = 'middle';
  fbCtx.fillText('FINISH LINE', 512, 98);

  const finishBanner = new THREE.CanvasTexture(finBannerCanvas);
  finishBanner.colorSpace = THREE.SRGBColorSpace;
  finishBanner.anisotropy = anisotropy;
  finishBanner.needsUpdate = true;

  // 11. Checkered Asphalt Road Finish Strip Texture
  const finStripCanvas = document.createElement('canvas');
  finStripCanvas.width = 1024;
  finStripCanvas.height = 256;
  const fsCtx = finStripCanvas.getContext('2d')!;
  const cols = 16;
  const rows = 4;
  const cw = 1024 / cols;
  const ch = 256 / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      fsCtx.fillStyle = (r + c) % 2 === 0 ? '#F8FAFC' : '#0F172A';
      fsCtx.fillRect(c * cw, r * ch, cw, ch);
    }
  }
  fsCtx.fillStyle = '#FACC15';
  fsCtx.fillRect(0, 0, 1024, 14);
  fsCtx.fillRect(0, 242, 1024, 14);

  const finishChecker = new THREE.CanvasTexture(finStripCanvas);
  finishChecker.colorSpace = THREE.SRGBColorSpace;
  finishChecker.anisotropy = anisotropy;
  finishChecker.needsUpdate = true;

  return {
    road,
    grass,
    curb,
    sky,
    contactShadow,
    sunHalo,
    moonHalo,
    archBanner,
    coinFace,
    finishBanner,
    finishChecker,
    dispose: () => {
      road.dispose();
      grass.dispose();
      curb.dispose();
      sky.dispose();
      contactShadow.dispose();
      sunHalo.dispose();
      moonHalo.dispose();
      archBanner.dispose();
      coinFace.dispose();
      finishBanner.dispose();
      finishChecker.dispose();
    },
  };
}
