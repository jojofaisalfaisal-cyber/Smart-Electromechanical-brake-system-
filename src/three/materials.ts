import * as THREE from 'three';

export interface MaterialLibrary {
  brushedAluminum: THREE.MeshStandardMaterial;
  darkAluminum: THREE.MeshStandardMaterial;
  machinedSteel: THREE.MeshStandardMaterial;
  stainlessDisc: THREE.MeshStandardMaterial;
  rubberTire: THREE.MeshStandardMaterial;
  rubberFoot: THREE.MeshStandardMaterial;
  alloyRim: THREE.MeshStandardMaterial;
  redCaliper: THREE.MeshPhysicalMaterial;
  brakePad: THREE.MeshStandardMaterial;
  servoBody: THREE.MeshStandardMaterial;
  servoBlueHorn: THREE.MeshStandardMaterial;
  motorHousing: THREE.MeshStandardMaterial;
  copperTerminal: THREE.MeshStandardMaterial;
  pcbBlue: THREE.MeshStandardMaterial;
  pcbBlack: THREE.MeshStandardMaterial;
  siliconeWhite: THREE.MeshStandardMaterial;
  brassHardware: THREE.MeshStandardMaterial;
  benchSurface: THREE.MeshStandardMaterial;
  hallLedMat: THREE.MeshStandardMaterial;
  wireRed: THREE.MeshStandardMaterial;
  wireBlack: THREE.MeshStandardMaterial;
  wireSignal: THREE.MeshStandardMaterial;
  dispose: () => void;
}

function createBrushedMetalTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#c4cbd4';
  ctx.fillRect(0, 0, 512, 512);

  for (let y = 0; y < 512; y++) {
    const shade = 185 + Math.floor(Math.sin(y * 0.7) * 8 + (Math.random() - 0.5) * 22);
    ctx.fillStyle = `rgb(${shade}, ${shade + 3}, ${shade + 7})`;
    ctx.fillRect(0, y, 512, 1);
  }

  // Subtle horizontal milling streaks
  ctx.globalAlpha = 0.08;
  for (let i = 0; i < 400; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const w = 30 + Math.random() * 140;
    ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#64748b';
    ctx.fillRect(x, y, w, 1);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createTireTreadTexture(): { colorMap: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = 512;
  colorCanvas.height = 512;
  const cCtx = colorCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = 512;
  bumpCanvas.height = 512;
  const bCtx = bumpCanvas.getContext('2d')!;

  cCtx.fillStyle = '#1b1e23';
  cCtx.fillRect(0, 0, 512, 512);
  bCtx.fillStyle = '#b0b0b0';
  bCtx.fillRect(0, 0, 512, 512);

  // Circumferential grooves
  const grooveXs = [150, 256, 362];
  for (const gx of grooveXs) {
    cCtx.fillStyle = '#0e1013';
    cCtx.fillRect(gx - 8, 0, 16, 512);
    bCtx.fillStyle = '#202020';
    bCtx.fillRect(gx - 8, 0, 16, 512);
  }

  // Angled shoulder sipes
  cCtx.strokeStyle = '#0c0e11';
  cCtx.lineWidth = 10;
  bCtx.strokeStyle = '#181818';
  bCtx.lineWidth = 10;

  for (let y = -64; y < 576; y += 32) {
    cCtx.beginPath();
    cCtx.moveTo(40, y);
    cCtx.lineTo(145, y + 26);
    cCtx.stroke();

    cCtx.beginPath();
    cCtx.moveTo(472, y);
    cCtx.lineTo(367, y + 26);
    cCtx.stroke();

    bCtx.beginPath();
    bCtx.moveTo(40, y);
    bCtx.lineTo(145, y + 26);
    bCtx.stroke();

    bCtx.beginPath();
    bCtx.moveTo(472, y);
    bCtx.lineTo(367, y + 26);
    bCtx.stroke();
  }

  // Subtle rubber grain
  for (let i = 0; i < 3000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    cCtx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.08)';
    cCtx.fillRect(x, y, 2, 2);
  }

  const colorMap = new THREE.CanvasTexture(colorCanvas);
  colorMap.wrapS = THREE.RepeatWrapping;
  colorMap.wrapT = THREE.RepeatWrapping;
  colorMap.repeat.set(1, 6);
  colorMap.colorSpace = THREE.SRGBColorSpace;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(1, 6);

  return { colorMap, bumpMap };
}

function createTurnedDiscTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#cfd6de';
  ctx.fillRect(0, 0, 512, 512);

  // Concentric lathe turning rings
  const cx = 256;
  const cy = 256;
  for (let r = 20; r < 256; r += 2) {
    const v = 195 + Math.floor(Math.sin(r * 0.9) * 14 + (Math.random() - 0.5) * 10);
    ctx.strokeStyle = `rgb(${v}, ${v + 2}, ${v + 5})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createWorkbenchGridTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0f141d';
  ctx.fillRect(0, 0, 512, 512);

  // Minor grid (every 32px)
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 512; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  // Major grid (every 128px)
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= 512; i += 128) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(12, 12);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createMaterialLibrary(maxAnisotropy: number): MaterialLibrary {
  const textures: THREE.Texture[] = [];
  const materials: THREE.Material[] = [];

  const regTex = <T extends THREE.Texture>(t: T): T => {
    t.anisotropy = maxAnisotropy;
    textures.push(t);
    return t;
  };
  const regMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  const brushedTex = regTex(createBrushedMetalTexture());
  const tireMaps = createTireTreadTexture();
  regTex(tireMaps.colorMap);
  regTex(tireMaps.bumpMap);
  const discTex = regTex(createTurnedDiscTexture());
  const benchTex = regTex(createWorkbenchGridTexture());

  const brushedAluminum = regMat(
    new THREE.MeshStandardMaterial({
      color: 0xc9d1da,
      map: brushedTex,
      metalness: 0.85,
      roughness: 0.34,
    })
  );

  const darkAluminum = regMat(
    new THREE.MeshStandardMaterial({
      color: 0x475569,
      metalness: 0.78,
      roughness: 0.42,
    })
  );

  const machinedSteel = regMat(
    new THREE.MeshStandardMaterial({
      color: 0xdbe2ea,
      metalness: 0.94,
      roughness: 0.18,
    })
  );

  const stainlessDisc = regMat(
    new THREE.MeshStandardMaterial({
      color: 0xd4dbe3,
      map: discTex,
      metalness: 0.9,
      roughness: 0.24,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0,
    })
  );

  const rubberTire = regMat(
    new THREE.MeshStandardMaterial({
      color: 0x262a30,
      map: tireMaps.colorMap,
      bumpMap: tireMaps.bumpMap,
      bumpScale: 0.18,
      metalness: 0.05,
      roughness: 0.86,
    })
  );

  const rubberFoot = regMat(
    new THREE.MeshStandardMaterial({
      color: 0x181a1e,
      metalness: 0.05,
      roughness: 0.92,
    })
  );

  const alloyRim = regMat(
    new THREE.MeshStandardMaterial({
      color: 0x2a313b,
      metalness: 0.82,
      roughness: 0.32,
    })
  );

  const redCaliper = regMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xc81e2b,
      metalness: 0.65,
      roughness: 0.28,
      clearcoat: 0.65,
      clearcoatRoughness: 0.2,
    })
  );

  const brakePad = regMat(
    new THREE.MeshStandardMaterial({
      color: 0x3b3834,
      metalness: 0.18,
      roughness: 0.88,
    })
  );

  const servoBody = regMat(
    new THREE.MeshStandardMaterial({
      color: 0x181b20,
      metalness: 0.12,
      roughness: 0.58,
    })
  );

  const servoBlueHorn = regMat(
    new THREE.MeshStandardMaterial({
      color: 0x1d6fe0,
      metalness: 0.78,
      roughness: 0.28,
    })
  );

  const motorHousing = regMat(
    new THREE.MeshStandardMaterial({
      color: 0x9aa4b0,
      map: brushedTex,
      metalness: 0.86,
      roughness: 0.3,
    })
  );

  const copperTerminal = regMat(
    new THREE.MeshStandardMaterial({
      color: 0xd98a3c,
      metalness: 0.9,
      roughness: 0.24,
    })
  );

  const pcbBlue = regMat(
    new THREE.MeshStandardMaterial({
      color: 0x0f5ca8,
      metalness: 0.18,
      roughness: 0.45,
    })
  );

  const pcbBlack = regMat(
    new THREE.MeshStandardMaterial({
      color: 0x1e242c,
      metalness: 0.22,
      roughness: 0.52,
    })
  );

  const siliconeWhite = regMat(
    new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.02,
      roughness: 0.72,
    })
  );

  const brassHardware = regMat(
    new THREE.MeshStandardMaterial({
      color: 0xc9a24b,
      metalness: 0.88,
      roughness: 0.28,
    })
  );

  const benchSurface = regMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: benchTex,
      metalness: 0.15,
      roughness: 0.82,
    })
  );

  const hallLedMat = regMat(
    new THREE.MeshStandardMaterial({
      color: 0x064e3b,
      emissive: new THREE.Color(0x10b981),
      emissiveIntensity: 0.1,
      roughness: 0.3,
      metalness: 0.1,
    })
  );

  const wireRed = regMat(
    new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.55, metalness: 0.05 })
  );
  const wireBlack = regMat(
    new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.65, metalness: 0.05 })
  );
  const wireSignal = regMat(
    new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.5, metalness: 0.05 })
  );

  return {
    brushedAluminum,
    darkAluminum,
    machinedSteel,
    stainlessDisc,
    rubberTire,
    rubberFoot,
    alloyRim,
    redCaliper,
    brakePad,
    servoBody,
    servoBlueHorn,
    motorHousing,
    copperTerminal,
    pcbBlue,
    pcbBlack,
    siliconeWhite,
    brassHardware,
    benchSurface,
    hallLedMat,
    wireRed,
    wireBlack,
    wireSignal,
    dispose: () => {
      textures.forEach((t) => t.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
