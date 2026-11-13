import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { COMPONENT_CATALOG } from '../data/componentsCatalog';
import {
  CameraViewMode,
  ComponentId,
  EngineeringDimensions,
  LabelProjection,
  MeasurementResult,
  PhysicsState,
} from '../types/simulation';
import { createMaterialLibrary } from './materials';
import { createMechanicalAssembly } from './mechanicalAssembly';

export interface SceneCallbacks {
  onSelectComponent: (id: ComponentId | null) => void;
  onFocusComponent: (id: ComponentId) => void;
  onMeasurePick: (id: ComponentId) => void;
  onFrameUpdate: (
    dt: number,
    labels: LabelProjection[],
    measurementScreenPos: { x: number; y: number; visible: boolean } | null
  ) => void;
}

export interface SceneController {
  setCameraPreset: (mode: CameraViewMode) => void;
  focusOnComponent: (id: ComponentId) => void;
  setVisibility: (visibility: Record<ComponentId, boolean>) => void;
  setSelection: (selectedId: ComponentId | null) => void;
  setMeasureMode: (active: boolean, pair: [ComponentId | null, ComponentId | null]) => void;
  setExplodeTarget: (factor: number) => void;
  syncSimulationVisuals: (
    physics: PhysicsState,
    hallSignalHigh: boolean,
    dims: EngineeringDimensions
  ) => void;
  computeMeasurement: (a: ComponentId, b: ComponentId) => MeasurementResult;
  dispose: () => void;
}

function detectSoftwareWebGL(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 20, 128, 128, 126);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
  grad.addColorStop(0.65, 'rgba(0, 0, 0, 0.25)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(canvas);
}

const _projVec = new THREE.Vector3();
const _measureVecA = new THREE.Vector3();
const _measureVecB = new THREE.Vector3();
const _measureMid = new THREE.Vector3();

export function createBrakeScene(
  container: HTMLElement,
  callbacks: SceneCallbacks
): SceneController {
  const isSoftwareGl = detectSoftwareWebGL();
  const width = Math.max(container.clientWidth, 320);
  const height = Math.max(container.clientHeight, 240);

  const scene = new THREE.Scene();
  const bgColor = new THREE.Color(0x0b0f17);
  scene.background = bgColor;
  scene.fog = new THREE.FogExp2(0x0b0f17, 0.0032);

  const camera = new THREE.PerspectiveCamera(40, width / height, 0.5, 600);
  camera.position.set(36, 32, 62);

  const renderer = new THREE.WebGLRenderer({
    antialias: !isSoftwareGl,
    powerPreference: 'high-performance',
  });
  renderer.setSize(width, height);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = !isSoftwareGl;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  container.appendChild(renderer.domElement);

  // Studio environment reflections (RoomEnvironment)
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  pmremGenerator.dispose();

  // Balanced 3-point warm/cool studio lighting
  const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 0.72);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xfff4e6, 1.85);
  keyLight.position.set(32, 54, 42);
  keyLight.castShadow = !isSoftwareGl;
  keyLight.shadow.mapSize.width = 2048;
  keyLight.shadow.mapSize.height = 2048;
  keyLight.shadow.camera.near = 10;
  keyLight.shadow.camera.far = 150;
  keyLight.shadow.camera.left = -40;
  keyLight.shadow.camera.right = 40;
  keyLight.shadow.camera.top = 36;
  keyLight.shadow.camera.bottom = -36;
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.normalBias = 0.02;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.7);
  fillLight.position.set(-40, 24, -20);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.65);
  rimLight.position.set(-10, 34, -48);
  scene.add(rimLight);

  if (!isSoftwareGl) {
    RectAreaLightUniformsLib.init();
    const softbox = new THREE.RectAreaLight(0xffffff, 2.2, 42, 18);
    softbox.position.set(0, 42, 18);
    softbox.lookAt(0, 10, 0);
    scene.add(softbox);
  }

  // Materials & 10-component Mechanical Assembly
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const materials = createMaterialLibrary(maxAniso);
  const assembly = createMechanicalAssembly(materials);
  scene.add(assembly.root);

  // Engineering Workbench Floor & Radial Contact Shadow
  const benchGeo = new THREE.PlaneGeometry(320, 320);
  benchGeo.rotateX(-Math.PI / 2);
  const benchMesh = new THREE.Mesh(benchGeo, materials.benchSurface);
  benchMesh.position.y = -2.82;
  benchMesh.receiveShadow = true;
  scene.add(benchMesh);

  const shadowTex = createContactShadowTexture();
  const contactShadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.72,
  });
  const contactShadowGeo = new THREE.PlaneGeometry(66, 44);
  contactShadowGeo.rotateX(-Math.PI / 2);
  const contactShadowMesh = new THREE.Mesh(contactShadowGeo, contactShadowMat);
  contactShadowMesh.position.y = -2.79;
  scene.add(contactShadowMesh);

  // Measurement Mode 3D Dimension Line + Endpoint Markers
  const measureLineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(),
    new THREE.Vector3(),
  ]);
  const measureLineMat = new THREE.LineBasicMaterial({
    color: 0xf59e0b,
    depthTest: false,
  });
  const measureLine = new THREE.Line(measureLineGeo, measureLineMat);
  measureLine.renderOrder = 999;
  measureLine.visible = false;
  scene.add(measureLine);

  const markerGeo = new THREE.SphereGeometry(0.55, 16, 16);
  const markerMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, depthTest: false });
  const markerA = new THREE.Mesh(markerGeo, markerMat);
  const markerB = new THREE.Mesh(markerGeo, markerMat);
  markerA.renderOrder = 999;
  markerB.renderOrder = 999;
  markerA.visible = false;
  markerB.visible = false;
  scene.add(markerA, markerB);

  // OrbitControls (Left rotate, Wheel zoom, Right pan)
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(-2, 10, 0);
  controls.enableDamping = !isSoftwareGl;
  controls.dampingFactor = 0.06;
  controls.minDistance = 16;
  controls.maxDistance = 140;
  controls.maxPolarAngle = Math.PI * 0.49;

  // Smooth Camera Preset Interpolation
  let cameraTransitionActive = false;
  const targetCamPos = new THREE.Vector3(36, 32, 62);
  const targetOrbitCenter = new THREE.Vector3(-2, 10, 0);

  controls.addEventListener('start', () => {
    cameraTransitionActive = false;
  });

  // Simulation visual state cached for smooth rendering
  let explodeTarget = 0;
  let measureModeActive = false;
  let measurePair: [ComponentId | null, ComponentId | null] = [null, null];
  let latestPhysics: PhysicsState | null = null;
  let latestHallHigh = false;
  let latestDims: EngineeringDimensions | null = null;
  let hoveredId: ComponentId | null = null;
  let selectedId: ComponentId | null = null;

  // Raycasting for Hover, Click Select, Double-Click Focus, and Measurement
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pointerDownPos = { x: 0, y: 0 };
  let lastHoverCheck = 0;

  const updatePointer = (ev: PointerEvent | MouseEvent) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  };

  const pickComponent = (): ComponentId | null => {
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(assembly.selectableMeshes, false);
    for (const hit of hits) {
      if (hit.object.visible && hit.object.userData.componentId) {
        return hit.object.userData.componentId as ComponentId;
      }
    }
    return null;
  };

  const onPointerDown = (ev: PointerEvent) => {
    pointerDownPos = { x: ev.clientX, y: ev.clientY };
  };

  const onPointerUp = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    const dist = Math.hypot(ev.clientX - pointerDownPos.x, ev.clientY - pointerDownPos.y);
    if (dist > 5) return; // Ignore orbit drag
    updatePointer(ev);
    const hitId = pickComponent();
    if (measureModeActive && hitId) {
      callbacks.onMeasurePick(hitId);
    } else {
      callbacks.onSelectComponent(hitId);
    }
  };

  const onDoubleClick = (ev: MouseEvent) => {
    updatePointer(ev);
    const hitId = pickComponent();
    if (hitId) {
      callbacks.onFocusComponent(hitId);
      focusOnComponent(hitId);
    }
  };

  const onPointerMove = (ev: PointerEvent) => {
    const now = performance.now();
    if (now - lastHoverCheck < 45) return;
    lastHoverCheck = now;
    updatePointer(ev);
    const hitId = pickComponent();
    if (hitId !== hoveredId) {
      hoveredId = hitId;
      assembly.setHighlighted(selectedId, hoveredId);
      renderer.domElement.style.cursor = hitId ? 'pointer' : 'grab';
    }
  };

  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('dblclick', onDoubleClick);
  renderer.domElement.addEventListener('pointermove', onPointerMove);

  // ResizeObserver for responsive viewport
  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const w = Math.max(entry.contentRect.width, 100);
      const h = Math.max(entry.contentRect.height, 100);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
  });
  resizeObserver.observe(container);

  if (!isSoftwareGl) {
    renderer.compile(scene, camera);
  }

  // Camera Preset Setter
  const setCameraPreset = (mode: CameraViewMode) => {
    cameraTransitionActive = true;
    switch (mode) {
      case 'perspective':
        targetCamPos.set(36, 32, 62);
        targetOrbitCenter.set(-2, 10, 0);
        break;
      case 'front':
        targetCamPos.set(-1, 13, 68);
        targetOrbitCenter.set(-1, 11, 0);
        break;
      case 'side':
        targetCamPos.set(-72, 16, 0);
        targetOrbitCenter.set(-4, 11, 0);
        break;
      case 'top':
        targetCamPos.set(0, 74, 6);
        targetOrbitCenter.set(0, 6, 0);
        break;
      case 'exploded':
        targetCamPos.set(42, 38, 72);
        targetOrbitCenter.set(-1, 11, 0);
        break;
    }
  };

  const focusOnComponent = (id: ComponentId) => {
    assembly.getComponentWorldCenter(id, targetOrbitCenter);
    const offset = COMPONENT_CATALOG[id].focusOffset;
    targetCamPos.set(
      targetOrbitCenter.x + offset[0],
      Math.max(4, targetOrbitCenter.y + offset[1]),
      targetOrbitCenter.z + offset[2]
    );
    cameraTransitionActive = true;
  };

  // Animation Loop with Software WebGL pacing
  let disposed = false;
  let frameId = 0;
  let lastTime = performance.now();

  const afterDraw = (cb: () => void) => {
    const gl = renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        frameId = window.setTimeout(cb, 80);
      }
    };
    frameId = window.setTimeout(poll, 5);
  };

  const tick = () => {
    if (disposed) return;
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    // Smooth camera preset / focus damping
    if (cameraTransitionActive) {
      const lambda = 7.0;
      camera.position.x = THREE.MathUtils.damp(camera.position.x, targetCamPos.x, lambda, dt);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, targetCamPos.y, lambda, dt);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, targetCamPos.z, lambda, dt);
      controls.target.x = THREE.MathUtils.damp(controls.target.x, targetOrbitCenter.x, lambda, dt);
      controls.target.y = THREE.MathUtils.damp(controls.target.y, targetOrbitCenter.y, lambda, dt);
      controls.target.z = THREE.MathUtils.damp(controls.target.z, targetOrbitCenter.z, lambda, dt);

      if (
        camera.position.distanceTo(targetCamPos) < 0.15 &&
        controls.target.distanceTo(targetOrbitCenter) < 0.1
      ) {
        cameraTransitionActive = false;
      }
    }

    controls.update();

    if (latestPhysics && latestDims) {
      assembly.updateFromSimulation(
        latestPhysics,
        latestHallHigh,
        explodeTarget,
        latestDims,
        dt
      );
    }

    // Update 3D measurement line if two components are picked
    let measureScreen: { x: number; y: number; visible: boolean } | null = null;
    const canvasW = renderer.domElement.clientWidth;
    const canvasH = renderer.domElement.clientHeight;

    if (measureModeActive && measurePair[0] && measurePair[1]) {
      assembly.getComponentWorldCenter(measurePair[0], _measureVecA);
      assembly.getComponentWorldCenter(measurePair[1], _measureVecB);
      const posAttr = measureLineGeo.getAttribute('position') as THREE.BufferAttribute;
      posAttr.setXYZ(0, _measureVecA.x, _measureVecA.y, _measureVecA.z);
      posAttr.setXYZ(1, _measureVecB.x, _measureVecB.y, _measureVecB.z);
      posAttr.needsUpdate = true;
      measureLineGeo.computeBoundingSphere();

      markerA.position.copy(_measureVecA);
      markerB.position.copy(_measureVecB);
      measureLine.visible = true;
      markerA.visible = true;
      markerB.visible = true;

      _measureMid.addVectors(_measureVecA, _measureVecB).multiplyScalar(0.5);
      _measureMid.project(camera);
      measureScreen = {
        x: ((_measureMid.x + 1) / 2) * canvasW,
        y: (-(_measureMid.y - 1) / 2) * canvasH,
        visible: _measureMid.z < 1,
      };
    } else if (measureModeActive && measurePair[0]) {
      assembly.getComponentWorldCenter(measurePair[0], _measureVecA);
      markerA.position.copy(_measureVecA);
      markerA.visible = true;
      markerB.visible = false;
      measureLine.visible = false;
    } else {
      measureLine.visible = false;
      markerA.visible = false;
      markerB.visible = false;
    }

    // Project 3D component centers to 2D screen coordinates for DOM labels
    const labels: LabelProjection[] = [];
    (Object.keys(assembly.componentGroups) as ComponentId[]).forEach((id) => {
      const grp = assembly.componentGroups[id];
      if (!grp.visible) {
        labels.push({ id, x: 0, y: 0, visible: false });
        return;
      }
      assembly.getComponentWorldCenter(id, _projVec);
      _projVec.project(camera);
      const visible = _projVec.z > -1 && _projVec.z < 1;
      labels.push({
        id,
        x: ((_projVec.x + 1) / 2) * canvasW,
        y: (-(_projVec.y - 1) / 2) * canvasH,
        visible,
      });
    });

    callbacks.onFrameUpdate(dt, labels, measureScreen);

    renderer.render(scene, camera);

    if (isSoftwareGl) {
      afterDraw(tick);
    } else {
      frameId = requestAnimationFrame(tick);
    }
  };

  if (isSoftwareGl) {
    frameId = window.setTimeout(tick, 16);
  } else {
    frameId = requestAnimationFrame(tick);
  }

  return {
    setCameraPreset,
    focusOnComponent,
    setVisibility: (vis) => assembly.setVisibility(vis),
    setSelection: (id) => {
      selectedId = id;
      assembly.setHighlighted(selectedId, hoveredId);
    },
    setMeasureMode: (active, pair) => {
      measureModeActive = active;
      measurePair = pair;
    },
    setExplodeTarget: (factor) => {
      explodeTarget = factor;
    },
    syncSimulationVisuals: (physics, hallSignalHigh, dims) => {
      latestPhysics = physics;
      latestHallHigh = hallSignalHigh;
      latestDims = dims;
    },
    computeMeasurement: (a, b) => {
      assembly.getComponentWorldCenter(a, _measureVecA);
      assembly.getComponentWorldCenter(b, _measureVecB);
      const dxCm = Math.abs(_measureVecB.x - _measureVecA.x);
      const dyCm = Math.abs(_measureVecB.y - _measureVecA.y);
      const dzCm = Math.abs(_measureVecB.z - _measureVecA.z);
      const distanceCm = _measureVecA.distanceTo(_measureVecB);
      return {
        fromId: a,
        toId: b,
        distanceCm,
        distanceMm: distanceCm * 10,
        dxCm,
        dyCm,
        dzCm,
      };
    },
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('dblclick', onDoubleClick);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      controls.dispose();
      assembly.dispose();
      materials.dispose();
      benchGeo.dispose();
      contactShadowGeo.dispose();
      contactShadowMat.dispose();
      shadowTex.dispose();
      measureLineGeo.dispose();
      measureLineMat.dispose();
      markerGeo.dispose();
      markerMat.dispose();
      envTex.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    },
  };
}
