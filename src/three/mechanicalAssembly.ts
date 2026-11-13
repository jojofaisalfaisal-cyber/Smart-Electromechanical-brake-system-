import * as THREE from 'three';
import { COMPONENT_CATALOG } from '../data/componentsCatalog';
import { ComponentId, EngineeringDimensions, PhysicsState } from '../types/simulation';
import { MaterialLibrary } from './materials';

export interface MechanicalAssemblyHandle {
  root: THREE.Group;
  componentGroups: Record<ComponentId, THREE.Group>;
  componentCentersLocal: Record<ComponentId, THREE.Vector3>;
  selectableMeshes: THREE.Object3D[];
  updateFromSimulation: (
    physics: PhysicsState,
    hallSignalHigh: boolean,
    explodeFactor: number,
    dims: EngineeringDimensions,
    dt: number
  ) => void;
  setVisibility: (visibility: Record<ComponentId, boolean>) => void;
  setHighlighted: (selectedId: ComponentId | null, hoveredId: ComponentId | null) => void;
  getComponentWorldCenter: (id: ComponentId, out: THREE.Vector3) => THREE.Vector3;
  dispose: () => void;
}

const _tmpVecA = new THREE.Vector3();
const _tmpVecB = new THREE.Vector3();
const _tmpDir = new THREE.Vector3();
const _upVec = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();

export function createMechanicalAssembly(materials: MaterialLibrary): MechanicalAssemblyHandle {
  const root = new THREE.Group();
  root.name = 'SmartElectromechanicalBrakeAssembly';

  const geometries: THREE.BufferGeometry[] = [];
  const customMaterials: THREE.Material[] = [];
  const selectableMeshes: THREE.Object3D[] = [];

  const regGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };

  // Clone material per component group so selection/hover highlighting doesn't bleed across parts
  const componentBaseMats = new Map<THREE.Mesh, THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial>();

  const tagComponent = (group: THREE.Group, id: ComponentId) => {
    group.userData.componentId = id;
    group.traverse((child) => {
      child.userData.componentId = id;
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        selectableMeshes.push(mesh);
        if (mesh.material instanceof THREE.MeshStandardMaterial) {
          const cloned = mesh.material.clone();
          customMaterials.push(cloned);
          mesh.material = cloned;
          componentBaseMats.set(mesh, cloned);
        }
      }
    });
  };

  // Shared shaft centerline coordinates (1 unit = 1 cm)
  const SHAFT_Y = 12.0;
  const SHAFT_Z = -2.5;
  const WHEEL_X = -20.5;
  const DISC_X = -16.2;

  // Component root groups & base positions for smooth Exploded View interpolation
  const componentGroups = {} as Record<ComponentId, THREE.Group>;
  const basePositions = {} as Record<ComponentId, THREE.Vector3>;
  const currentExplodeOffsets = {} as Record<ComponentId, THREE.Vector3>;
  const componentCentersLocal = {} as Record<ComponentId, THREE.Vector3>;

  const createPartGroup = (id: ComponentId, centerLocal: THREE.Vector3): THREE.Group => {
    const g = new THREE.Group();
    g.name = id;
    componentGroups[id] = g;
    basePositions[id] = new THREE.Vector3(0, 0, 0);
    currentExplodeOffsets[id] = new THREE.Vector3(0, 0, 0);
    componentCentersLocal[id] = centerLocal;
    root.add(g);
    return g;
  };

  // =========================================================================
  // 1. BASE STRUCTURE (Aluminum Base Plate, Feet, Pedestals, Shaft, Coupling)
  // =========================================================================
  const baseGroup = createPartGroup('base_structure', new THREE.Vector3(0, 4, 0));

  // Main 55 x 1.6 x 35 cm brushed aluminum plate (top surface at y = 0)
  const plateShape = new THREE.Shape();
  const pw = 55 / 2;
  const pd = 35 / 2;
  const cr = 0.8;
  plateShape.moveTo(-pw + cr, -pd);
  plateShape.lineTo(pw - cr, -pd);
  plateShape.quadraticCurveTo(pw, -pd, pw, -pd + cr);
  plateShape.lineTo(pw, pd - cr);
  plateShape.quadraticCurveTo(pw, pd, pw - cr, pd);
  plateShape.lineTo(-pw + cr, pd);
  plateShape.quadraticCurveTo(-pw, pd, -pw, pd - cr);
  plateShape.lineTo(-pw, -pd + cr);
  plateShape.quadraticCurveTo(-pw, -pd, -pw + cr, -pd);

  const plateGeo = regGeo(
    new THREE.ExtrudeGeometry(plateShape, {
      depth: 1.4,
      bevelEnabled: true,
      bevelThickness: 0.1,
      bevelSize: 0.1,
      bevelSegments: 2,
    })
  );
  plateGeo.rotateX(Math.PI / 2);
  const basePlateMesh = new THREE.Mesh(plateGeo, materials.brushedAluminum);
  basePlateMesh.position.y = -0.1;
  baseGroup.add(basePlateMesh);

  // 4 Corner rubber & steel leveling feet
  const footGeo = regGeo(new THREE.CylinderGeometry(1.6, 1.8, 1.2, 24));
  const footCollarGeo = regGeo(new THREE.CylinderGeometry(1.3, 1.3, 0.35, 24));
  const footPositions: [number, number][] = [
    [-24.5, -14.5],
    [24.5, -14.5],
    [-24.5, 14.5],
    [24.5, 14.5],
  ];
  for (const [fx, fz] of footPositions) {
    const foot = new THREE.Mesh(footGeo, materials.rubberFoot);
    foot.position.set(fx, -2.2, fz);
    baseGroup.add(foot);
    const collar = new THREE.Mesh(footCollarGeo, materials.machinedSteel);
    collar.position.set(fx, -1.7, fz);
    baseGroup.add(collar);
  }

  // Central Pillow-Block Shaft Bearing Pedestal (x = -6.5)
  const centerPedestalFoot = new THREE.Mesh(
    regGeo(new THREE.BoxGeometry(6.8, 1.0, 9.6)),
    materials.brushedAluminum
  );
  centerPedestalFoot.position.set(-6.5, 0.5, SHAFT_Z);
  baseGroup.add(centerPedestalFoot);

  const centerPedestalCol = new THREE.Mesh(
    regGeo(new THREE.BoxGeometry(3.4, 11.2, 5.4)),
    materials.brushedAluminum
  );
  centerPedestalCol.position.set(-6.5, 6.2, SHAFT_Z);
  baseGroup.add(centerPedestalCol);

  const centerBearingOuter = new THREE.Mesh(
    regGeo(new THREE.CylinderGeometry(2.3, 2.3, 3.8, 32)),
    materials.darkAluminum
  );
  centerBearingOuter.rotation.z = Math.PI / 2;
  centerBearingOuter.position.set(-6.5, SHAFT_Y, SHAFT_Z);
  baseGroup.add(centerBearingOuter);

  const centerBearingRace = new THREE.Mesh(
    regGeo(new THREE.TorusGeometry(1.35, 0.25, 12, 28)),
    materials.machinedSteel
  );
  centerBearingRace.rotation.y = Math.PI / 2;
  centerBearingRace.position.set(-8.4, SHAFT_Y, SHAFT_Z);
  baseGroup.add(centerBearingRace);

  // Right Shaft Bearing Support Pedestal (x = +3.5)
  const rightPedestalFoot = new THREE.Mesh(
    regGeo(new THREE.BoxGeometry(5.2, 0.9, 8.2)),
    materials.brushedAluminum
  );
  rightPedestalFoot.position.set(3.5, 0.45, SHAFT_Z);
  baseGroup.add(rightPedestalFoot);

  const rightPedestalCol = new THREE.Mesh(
    regGeo(new THREE.BoxGeometry(2.6, 11.2, 4.6)),
    materials.brushedAluminum
  );
  rightPedestalCol.position.set(3.5, 6.1, SHAFT_Z);
  baseGroup.add(rightPedestalCol);

  const rightBearingOuter = new THREE.Mesh(
    regGeo(new THREE.CylinderGeometry(2.1, 2.1, 3.0, 32)),
    materials.darkAluminum
  );
  rightBearingOuter.rotation.z = Math.PI / 2;
  rightBearingOuter.position.set(3.5, SHAFT_Y, SHAFT_Z);
  baseGroup.add(rightBearingOuter);

  // Rotating Main Steel Drive Shaft + Flexible Jaw Coupling (coupled to wheelAngle)
  const rotatingShaftGroup = new THREE.Group();
  rotatingShaftGroup.position.set(0, SHAFT_Y, SHAFT_Z);
  baseGroup.add(rotatingShaftGroup);

  const mainShaftMesh = new THREE.Mesh(
    regGeo(new THREE.CylinderGeometry(0.75, 0.75, 29.5, 24)),
    materials.machinedSteel
  );
  mainShaftMesh.rotation.z = Math.PI / 2;
  mainShaftMesh.position.x = -7.0;
  rotatingShaftGroup.add(mainShaftMesh);

  // Flexible shaft coupling at x = +8.6
  const couplingBody = new THREE.Mesh(
    regGeo(new THREE.CylinderGeometry(1.45, 1.45, 3.2, 24)),
    materials.brushedAluminum
  );
  couplingBody.rotation.z = Math.PI / 2;
  couplingBody.position.x = 8.6;
  rotatingShaftGroup.add(couplingBody);

  const couplingSpider = new THREE.Mesh(
    regGeo(new THREE.CylinderGeometry(1.48, 1.48, 0.75, 12)),
    materials.redCaliper
  );
  couplingSpider.rotation.z = Math.PI / 2;
  couplingSpider.position.x = 8.6;
  rotatingShaftGroup.add(couplingSpider);

  // Instanced M6 Hex Socket Cap Fasteners across the base plate and pedestals
  const boltGeo = regGeo(new THREE.CylinderGeometry(0.32, 0.32, 0.55, 6));
  const boltCoords: [number, number, number][] = [
    // Center pedestal
    [-8.6, 1.15, SHAFT_Z - 3.6],
    [-8.6, 1.15, SHAFT_Z + 3.6],
    [-4.4, 1.15, SHAFT_Z - 3.6],
    [-4.4, 1.15, SHAFT_Z + 3.6],
    // Right pedestal
    [2.0, 1.05, SHAFT_Z - 3.0],
    [2.0, 1.05, SHAFT_Z + 3.0],
    [5.0, 1.05, SHAFT_Z - 3.0],
    [5.0, 1.05, SHAFT_Z + 3.0],
    // Motor cradle bolts
    [13.5, 1.05, SHAFT_Z - 4.4],
    [13.5, 1.05, SHAFT_Z + 4.4],
    [21.0, 1.05, SHAFT_Z - 4.4],
    [21.0, 1.05, SHAFT_Z + 4.4],
    // Base plate corner tie-downs
    [-25.5, 0.2, -15.5],
    [25.5, 0.2, -15.5],
    [-25.5, 0.2, 15.5],
    [25.5, 0.2, 15.5],
    // Load cell riser bolts
    [-8.2, 0.8, 7.0],
    [-4.8, 0.8, 7.0],
    [-8.2, 0.8, 10.0],
    [-4.8, 0.8, 10.0],
    // Caliper mount bolts
    [-14.5, 0.9, 2.8],
    [-12.5, 0.9, 5.2],
  ];
  const boltsInstanced = new THREE.InstancedMesh(boltGeo, materials.machinedSteel, boltCoords.length);
  const dummy = new THREE.Object3D();
  boltCoords.forEach(([bx, by, bz], idx) => {
    dummy.position.set(bx, by, bz);
    dummy.rotation.set(0, idx * 0.4, 0);
    dummy.updateMatrix();
    boltsInstanced.setMatrixAt(idx, dummy.matrix);
  });
  boltsInstanced.instanceMatrix.needsUpdate = true;
  boltsInstanced.computeBoundingSphere();
  baseGroup.add(boltsInstanced);

  tagComponent(baseGroup, 'base_structure');

  // =========================================================================
  // 2. WHEEL & RUBBER TIRE (Ø 20 cm × 6 cm width)
  // =========================================================================
  const wheelGroup = createPartGroup('wheel', new THREE.Vector3(WHEEL_X, SHAFT_Y, SHAFT_Z));
  const wheelSpinPivot = new THREE.Group();
  wheelSpinPivot.position.set(WHEEL_X, SHAFT_Y, SHAFT_Z);
  wheelGroup.add(wheelSpinPivot);

  // Realistic tire profile via LatheGeometry (radius 10 cm, width 6 cm)
  const tireProfile: THREE.Vector2[] = [
    new THREE.Vector2(5.8, -2.5),
    new THREE.Vector2(7.0, -2.85),
    new THREE.Vector2(8.8, -3.0),
    new THREE.Vector2(9.75, -2.65),
    new THREE.Vector2(10.0, -1.6),
    new THREE.Vector2(10.0, 0.0),
    new THREE.Vector2(10.0, 1.6),
    new THREE.Vector2(9.75, 2.65),
    new THREE.Vector2(8.8, 3.0),
    new THREE.Vector2(7.0, 2.85),
    new THREE.Vector2(5.8, 2.5),
    new THREE.Vector2(5.8, -2.5),
  ];
  const tireGeo = regGeo(new THREE.LatheGeometry(tireProfile, 48));
  tireGeo.rotateZ(Math.PI / 2); // Align wheel axis along X
  const tireMesh = new THREE.Mesh(tireGeo, materials.rubberTire);
  wheelSpinPivot.add(tireMesh);

  // Alloy Rim Barrel & Lip Rings
  const rimBarrel = new THREE.Mesh(
    regGeo(new THREE.CylinderGeometry(5.9, 5.9, 4.8, 36, 1, true)),
    materials.alloyRim
  );
  rimBarrel.rotation.z = Math.PI / 2;
  wheelSpinPivot.add(rimBarrel);

  const rimLipGeo = regGeo(new THREE.TorusGeometry(5.9, 0.32, 12, 36));
  const rimLipLeft = new THREE.Mesh(rimLipGeo, materials.alloyRim);
  rimLipLeft.rotation.y = Math.PI / 2;
  rimLipLeft.position.x = -2.35;
  wheelSpinPivot.add(rimLipLeft);

  const rimLipRight = new THREE.Mesh(rimLipGeo, materials.alloyRim);
  rimLipRight.rotation.y = Math.PI / 2;
  rimLipRight.position.x = 2.35;
  wheelSpinPivot.add(rimLipRight);

  // 6 Sculpted Wheel Spokes
  const spokeGeo = regGeo(new THREE.BoxGeometry(1.1, 4.7, 0.95));
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const spoke = new THREE.Mesh(spokeGeo, materials.alloyRim);
    spoke.position.set(0, Math.cos(angle) * 3.3, Math.sin(angle) * 3.3);
    spoke.rotation.x = -angle;
    wheelSpinPivot.add(spoke);
  }

  // Central Machined Hub + 6 Hub Bolts
  const wheelHub = new THREE.Mesh(
    regGeo(new THREE.CylinderGeometry(2.1, 2.1, 4.6, 24)),
    materials.machinedSteel
  );
  wheelHub.rotation.z = Math.PI / 2;
  wheelSpinPivot.add(wheelHub);

  const hubBoltGeo = regGeo(new THREE.CylinderGeometry(0.22, 0.22, 0.6, 6));
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const hb = new THREE.Mesh(hubBoltGeo, materials.brassHardware);
    hb.rotation.z = Math.PI / 2;
    hb.position.set(2.3, Math.cos(angle) * 1.5, Math.sin(angle) * 1.5);
    wheelSpinPivot.add(hb);
  }

  tagComponent(wheelGroup, 'wheel');

  // =========================================================================
  // 3. VENTILATED BRAKE DISC ROTOR (Ø 15.2 cm, drilled ventilation holes)
  // =========================================================================
  const discGroup = createPartGroup('brake_disc', new THREE.Vector3(DISC_X, SHAFT_Y, SHAFT_Z));
  const discSpinPivot = new THREE.Group();
  discSpinPivot.position.set(DISC_X, SHAFT_Y, SHAFT_Z);
  discGroup.add(discSpinPivot);

  const discOuterR = 7.6;
  const discShape = new THREE.Shape();
  discShape.absarc(0, 0, discOuterR, 0, Math.PI * 2, false);

  const boreHole = new THREE.Path();
  boreHole.absarc(0, 0, 1.45, 0, Math.PI * 2, true);
  discShape.holes.push(boreHole);

  // Drilled ventilation holes (3 staggered radial rings × 12)
  const holeRadii = [4.6, 5.7, 6.75];
  for (let ringIdx = 0; ringIdx < holeRadii.length; ringIdx++) {
    const r = holeRadii[ringIdx];
    const count = 12;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + ringIdx * 0.17;
      const hx = Math.cos(a) * r;
      const hy = Math.sin(a) * r;
      const ventHole = new THREE.Path();
      ventHole.absarc(hx, hy, 0.26, 0, Math.PI * 2, true);
      discShape.holes.push(ventHole);
    }
  }

  // Lightening cutouts around inner carrier
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const cx = Math.cos(a) * 3.0;
    const cy = Math.sin(a) * 3.0;
    const cutout = new THREE.Path();
    cutout.absarc(cx, cy, 0.45, 0, Math.PI * 2, true);
    discShape.holes.push(cutout);
  }

  const discGeo = regGeo(
    new THREE.ExtrudeGeometry(discShape, {
      depth: 0.36,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.04,
      bevelSegments: 2,
      curveSegments: 48,
    })
  );
  // Extrude is along Z; rotate Y by PI/2 so disc face normal is along X
  discGeo.translate(0, 0, -0.18);
  discGeo.rotateY(Math.PI / 2);

  const discMesh = new THREE.Mesh(discGeo, materials.stainlessDisc);
  discSpinPivot.add(discMesh);

  // Hub adapter spacer connecting disc to wheel hub
  const discSpacer = new THREE.Mesh(
    regGeo(new THREE.CylinderGeometry(2.15, 2.15, 1.3, 24)),
    materials.darkAluminum
  );
  discSpacer.rotation.z = Math.PI / 2;
  discSpacer.position.x = -0.65;
  discSpinPivot.add(discSpacer);

  // 4 Neodymium Trigger Magnets for Hall Effect Sensor (radius 3.9 cm)
  const magnetGeo = regGeo(new THREE.CylinderGeometry(0.28, 0.28, 0.25, 16));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const mag = new THREE.Mesh(magnetGeo, materials.machinedSteel);
    mag.rotation.z = Math.PI / 2;
    mag.position.set(0.25, Math.cos(a) * 3.9, Math.sin(a) * 3.9);
    discSpinPivot.add(mag);
  }

  tagComponent(discGroup, 'brake_disc');

  // =========================================================================
  // 4. MECHANICAL BRAKE CALIPER + DUAL CLAMPING PADS + ACTUATOR LEVER
  // =========================================================================
  const caliperGroup = createPartGroup(
    'brake_caliper',
    new THREE.Vector3(DISC_X + 0.5, SHAFT_Y + 0.5, SHAFT_Z + 6.5)
  );

  // Aluminum caliper mounting bracket bolted to base plate
  const calMountBase = new THREE.Mesh(
    regGeo(new THREE.BoxGeometry(3.8, 0.9, 4.4)),
    materials.brushedAluminum
  );
  calMountBase.position.set(-13.4, 0.45, 4.0);
  caliperGroup.add(calMountBase);

  const calMountArm = new THREE.Mesh(
    regGeo(new THREE.BoxGeometry(1.6, 11.2, 2.6)),
    materials.brushedAluminum
  );
  calMountArm.position.set(-13.8, 5.8, 4.0);
  calMountArm.rotation.x = 0.08;
  caliperGroup.add(calMountArm);

  // Red Anodized Floating Caliper Body straddling the rotor at 2 o'clock (z = +4.4, y = 12.6)
  const caliperAnchor = new THREE.Group();
  caliperAnchor.position.set(DISC_X, SHAFT_Y + 0.6, SHAFT_Z + 6.9);
  caliperGroup.add(caliperAnchor);

  const calOuterHalf = new THREE.Mesh(
    regGeo(new THREE.BoxGeometry(1.35, 5.2, 3.8)),
    materials.redCaliper
  );
  calOuterHalf.position.set(1.15, 0, 0);
  caliperAnchor.add(calOuterHalf);

  const calInnerHalf = new THREE.Mesh(
    regGeo(new THREE.BoxGeometry(1.2, 5.2, 3.8)),
    materials.redCaliper
  );
  calInnerHalf.position.set(-1.15, 0, 0);
  caliperAnchor.add(calInnerHalf);

  // Top bridge connecting inner & outer caliper halves over the rotor edge
  const calBridge = new THREE.Mesh(
    regGeo(new THREE.BoxGeometry(3.5, 1.4, 3.2)),
    materials.redCaliper
  );
  calBridge.position.set(0, 2.1, 0.8);
  caliperAnchor.add(calBridge);

  // Piston boss & adjuster nut
  const pistonBoss = new THREE.Mesh(
    regGeo(new THREE.CylinderGeometry(1.15, 1.15, 0.8, 20)),
    materials.redCaliper
  );
  pistonBoss.rotation.z = Math.PI / 2;
  pistonBoss.position.set(1.85, 0, 0);
  caliperAnchor.add(pistonBoss);

  // Dual Brake Pads (animated inward along X when clamping!)
  const padGeo = regGeo(new THREE.BoxGeometry(0.32, 3.4, 2.5));
  const padOutboard = new THREE.Mesh(padGeo, materials.brakePad);
  padOutboard.position.set(0.42, 0, 0);
  caliperAnchor.add(padOutboard);

  const padInboard = new THREE.Mesh(padGeo, materials.brakePad);
  padInboard.position.set(-0.42, 0, 0);
  caliperAnchor.add(padInboard);

  // Caliper Actuating Cam Lever Arm (pivots around local X/Z when pulled by servo pushrod)
  const caliperLeverPivot = new THREE.Group();
  caliperLeverPivot.position.set(1.8, 1.3, 0.4);
  caliperAnchor.add(caliperLeverPivot);

  const calLeverArm = new THREE.Mesh(
    regGeo(new THREE.BoxGeometry(0.45, 3.4, 0.75)),
    materials.machinedSteel
  );
  calLeverArm.position.set(0, 1.4, 0);
  caliperLeverPivot.add(calLeverArm);

  const calLeverPin = new THREE.Mesh(
    regGeo(new THREE.CylinderGeometry(0.28, 0.28, 0.9, 12)),
    materials.brassHardware
  );
  calLeverPin.rotation.z = Math.PI / 2;
  calLeverPin.position.set(0, 2.85, 0);
  caliperLeverPivot.add(calLeverPin);

  // Caliper lower reaction tab (connects to Load Cell force linkage)
  const calReactionPin = new THREE.Mesh(
    regGeo(new THREE.CylinderGeometry(0.25, 0.25, 0.8, 12)),
    materials.brassHardware
  );
  calReactionPin.rotation.z = Math.PI / 2;
  calReactionPin.position.set(1.2, -2.2, 0.9);
  caliperAnchor.add(calReactionPin);

  tagComponent(caliperGroup, 'brake_caliper');

  // =========================================================================
  // 5. SERVO MOTOR (MG996R / DS3218) + UPPER BRACKET + ARTICULATED PUSHROD
  // =========================================================================
  const servoGroup = createPartGroup('servo_motor', new THREE.Vector3(-8.5, 22.8, -0.5));

  // Tall vertical aluminum L-post bracket bolted next to central pedestal
  const servoPostVert = new THREE.Mesh(
    regGeo(new THREE.BoxGeometry(1.2, 11.8, 4.2)),
    materials.brushedAluminum
  );
  servoPostVert.position.set(-8.6, 17.6, -1.6);
  servoGroup.add(servoPostVert);

  const servoTopShelf = new THREE.Mesh(
    regGeo(new THREE.BoxGeometry(5.6, 0.8, 4.8)),
    materials.brushedAluminum
  );
  servoTopShelf.position.set(-8.6, 21.3, 0.2);
  servoGroup.add(servoTopShelf);

  // MG996R / DS3218 Servo Housing
  const servoHousing = new THREE.Mesh(
    regGeo(new THREE.BoxGeometry(4.1, 4.1, 2.0)),
    materials.servoBody
  );
  servoHousing.position.set(-8.6, 23.6, 0.4);
  servoGroup.add(servoHousing);

  // Anodized heatsink middle collar on DS3218/MG996R
  const servoHeatsink = new THREE.Mesh(
    regGeo(new THREE.BoxGeometry(4.16, 1.5, 2.06)),
    materials.darkAluminum
  );
  servoHeatsink.position.set(-8.6, 23.4, 0.4);
  servoGroup.add(servoHeatsink);

  // Servo Mounting Ears
  const servoEars = new THREE.Mesh(
    regGeo(new THREE.BoxGeometry(5.5, 0.35, 2.0)),
    materials.servoBody
  );
  servoEars.position.set(-8.6, 21.85, 0.4);
  servoGroup.add(servoEars);

  // Rotating Blue Aluminum Servo Horn (rotates around Z axis)
  const servoHornPivot = new THREE.Group();
  servoHornPivot.position.set(-9.6, 24.1, 1.65);
  servoGroup.add(servoHornPivot);

  const servoSplineHub = new THREE.Mesh(
    regGeo(new THREE.CylinderGeometry(0.6, 0.6, 0.55, 18)),
    materials.servoBlueHorn
  );
  servoSplineHub.rotation.x = Math.PI / 2;
  servoHornPivot.add(servoSplineHub);

  const servoHornArm = new THREE.Mesh(
    regGeo(new THREE.BoxGeometry(2.9, 0.72, 0.35)),
    materials.servoBlueHorn
  );
  servoHornArm.position.set(-1.15, 0, 0.15);
  servoHornPivot.add(servoHornArm);

  const servoHornPin = new THREE.Mesh(
    regGeo(new THREE.CylinderGeometry(0.22, 0.22, 0.6, 12)),
    materials.machinedSteel
  );
  servoHornPin.rotation.x = Math.PI / 2;
  servoHornPin.position.set(-2.25, 0, 0.25);
  servoHornPivot.add(servoHornPin);

  // Dynamic Pushrod Linkage connecting Servo Horn Pin -> Caliper Lever Pin
  const pushrodGroup = new THREE.Group();
  servoGroup.add(pushrodGroup);
  const pushrodShaft = new THREE.Mesh(
    regGeo(new THREE.CylinderGeometry(0.18, 0.18, 1, 12)),
    materials.machinedSteel
  );
  // Align cylinder along +Z so lookAt aims it directly between pins
  pushrodShaft.rotation.x = Math.PI / 2;
  pushrodShaft.position.z = 0.5;
  pushrodGroup.add(pushrodShaft);

  const clevisStart = new THREE.Mesh(
    regGeo(new THREE.BoxGeometry(0.55, 0.55, 1.1)),
    materials.darkAluminum
  );
  clevisStart.position.z = 0.5;
  pushrodGroup.add(clevisStart);

  tagComponent(servoGroup, 'servo_motor');

  // =========================================================================
  // 6. 12V DC GEARED MOTOR + CRADLE BRACKET
  // =========================================================================
  const dcMotorGroup = createPartGroup('dc_motor', new THREE.Vector3(17.5, SHAFT_Y, SHAFT_Z));

  // Heavy-duty split-clamp aluminum motor cradle bolted to base plate
  const cradleBase = new THREE.Mesh(
    regGeo(new THREE.BoxGeometry(10.0, 1.0, 10.4)),
    materials.brushedAluminum
  );
  cradleBase.position.set(17.2, 0.5, SHAFT_Z);
  dcMotorGroup.add(cradleBase);

  const cradleWallFront = new THREE.Mesh(
    regGeo(new THREE.BoxGeometry(2.0, 11.4, 7.6)),
    materials.brushedAluminum
  );
  cradleWallFront.position.set(13.5, 6.2, SHAFT_Z);
  dcMotorGroup.add(cradleWallFront);

  const cradleWallRear = new THREE.Mesh(
    regGeo(new THREE.BoxGeometry(1.6, 9.8, 7.2)),
    materials.brushedAluminum
  );
  cradleWallRear.position.set(20.8, 5.4, SHAFT_Z);
  dcMotorGroup.add(cradleWallRear);

  // Cylindrical Planetary Gearbox Housing
  const gearboxCan = new THREE.Mesh(
    regGeo(new THREE.CylinderGeometry(3.2, 3.2, 4.4, 32)),
    materials.motorHousing
  );
  gearboxCan.rotation.z = Math.PI / 2;
  gearboxCan.position.set(14.8, SHAFT_Y, SHAFT_Z);
  dcMotorGroup.add(gearboxCan);

  // Motor Main Body
  const motorBodyCan = new THREE.Mesh(
    regGeo(new THREE.CylinderGeometry(3.05, 3.05, 6.6, 32)),
    materials.motorHousing
  );
  motorBodyCan.rotation.z = Math.PI / 2;
  motorBodyCan.position.set(20.3, SHAFT_Y, SHAFT_Z);
  dcMotorGroup.add(motorBodyCan);

  // Rear Endbell & Copper Power Terminals
  const motorRearCap = new THREE.Mesh(
    regGeo(new THREE.CylinderGeometry(2.4, 2.8, 1.2, 24)),
    materials.darkAluminum
  );
  motorRearCap.rotation.z = Math.PI / 2;
  motorRearCap.position.set(24.0, SHAFT_Y, SHAFT_Z);
  dcMotorGroup.add(motorRearCap);

  const termPos = new THREE.Mesh(
    regGeo(new THREE.BoxGeometry(0.9, 0.45, 0.45)),
    materials.copperTerminal
  );
  termPos.position.set(24.5, SHAFT_Y + 1.0, SHAFT_Z + 0.8);
  dcMotorGroup.add(termPos);

  const termNeg = new THREE.Mesh(
    regGeo(new THREE.BoxGeometry(0.9, 0.45, 0.45)),
    materials.copperTerminal
  );
  termNeg.position.set(24.5, SHAFT_Y + 1.0, SHAFT_Z - 0.8);
  dcMotorGroup.add(termNeg);

  // Rotating DC Motor Output Shaft into flexible coupling
  const motorOutputShaft = new THREE.Mesh(
    regGeo(new THREE.CylinderGeometry(0.65, 0.65, 3.6, 20)),
    materials.machinedSteel
  );
  motorOutputShaft.rotation.z = Math.PI / 2;
  motorOutputShaft.position.set(11.0, SHAFT_Y, SHAFT_Z);
  dcMotorGroup.add(motorOutputShaft);

  tagComponent(dcMotorGroup, 'dc_motor');

  // =========================================================================
  // 7. HALL EFFECT SENSOR (Wheel Speed)
  // =========================================================================
  const hallGroup = createPartGroup('hall_sensor', new THREE.Vector3(-15.0, 5.8, 5.2));

  const hallBracketFoot = new THREE.Mesh(
    regGeo(new THREE.BoxGeometry(2.2, 0.5, 2.4)),
    materials.brushedAluminum
  );
  hallBracketFoot.position.set(-15.0, 0.25, 5.6);
  hallGroup.add(hallBracketFoot);

  const hallBracketStem = new THREE.Mesh(
    regGeo(new THREE.BoxGeometry(0.45, 5.6, 1.8)),
    materials.brushedAluminum
  );
  hallBracketStem.position.set(-15.0, 3.0, 5.2);
  hallGroup.add(hallBracketStem);

  const hallPcb = new THREE.Mesh(
    regGeo(new THREE.BoxGeometry(0.28, 3.2, 1.6)),
    materials.pcbBlue
  );
  hallPcb.position.set(-15.0, 6.0, 4.5);
  hallPcb.rotation.x = -0.35;
  hallGroup.add(hallPcb);

  const hallIc = new THREE.Mesh(
    regGeo(new THREE.BoxGeometry(0.35, 0.55, 0.45)),
    materials.servoBody
  );
  hallIc.position.set(-15.2, 7.2, 3.9);
  hallGroup.add(hallIc);

  // Indicator LED on PCB (flashes dynamically when magnet passes!)
  const hallLed = new THREE.Mesh(
    regGeo(new THREE.BoxGeometry(0.32, 0.3, 0.3)),
    materials.hallLedMat
  );
  hallLed.position.set(-14.8, 5.8, 4.6);
  hallGroup.add(hallLed);

  tagComponent(hallGroup, 'hall_sensor');

  // =========================================================================
  // 8. LOAD CELL + FORCE TRANSMISSION LINKAGE (Brake Force 0–50 N)
  // =========================================================================
  const loadCellGroup = createPartGroup('load_cell', new THREE.Vector3(-6.5, 4.2, 8.5));

  // Machined aluminum pedestal block on front-center of base plate
  const lcPedestal = new THREE.Mesh(
    regGeo(new THREE.BoxGeometry(4.4, 3.4, 4.0)),
    materials.brushedAluminum
  );
  lcPedestal.position.set(-7.6, 1.7, 8.5);
  loadCellGroup.add(lcPedestal);

  // Shear-beam Load Cell body (cantilevered to the right)
  const lcBeamPivot = new THREE.Group();
  lcBeamPivot.position.set(-7.6, 4.1, 8.5);
  loadCellGroup.add(lcBeamPivot);

  const lcBeam = new THREE.Mesh(
    regGeo(new THREE.BoxGeometry(8.2, 1.35, 1.35)),
    materials.machinedSteel
  );
  lcBeam.position.set(2.4, 0, 0);
  lcBeamPivot.add(lcBeam);

  // White silicone strain-gauge bridge cover on beam
  const lcSilicone = new THREE.Mesh(
    regGeo(new THREE.BoxGeometry(2.4, 0.28, 1.1)),
    materials.siliconeWhite
  );
  lcSilicone.position.set(2.4, 0.72, 0);
  lcBeamPivot.add(lcSilicone);

  // Upper Clevis post on cantilevered tip of load cell
  const lcTipPost = new THREE.Mesh(
    regGeo(new THREE.CylinderGeometry(0.45, 0.55, 1.6, 16)),
    materials.machinedSteel
  );
  lcTipPost.position.set(5.8, 1.3, 0);
  lcBeamPivot.add(lcTipPost);

  // Dynamic mechanical force-transmission rod connecting Caliper Reaction Pin -> Load Cell Tip Post
  const forceLinkageGroup = new THREE.Group();
  loadCellGroup.add(forceLinkageGroup);
  const forceRod = new THREE.Mesh(
    regGeo(new THREE.CylinderGeometry(0.16, 0.16, 1, 12)),
    materials.machinedSteel
  );
  forceRod.rotation.x = Math.PI / 2;
  forceRod.position.z = 0.5;
  forceLinkageGroup.add(forceRod);

  tagComponent(loadCellGroup, 'load_cell');

  // =========================================================================
  // 9. ROTARY ENCODER (Brake Actuator Angular Position)
  // =========================================================================
  const encoderGroup = createPartGroup('rotary_encoder', new THREE.Vector3(5.2, 4.0, 7.5));

  const encBracket = new THREE.Mesh(
    regGeo(new THREE.BoxGeometry(4.4, 1.8, 4.4)),
    materials.brushedAluminum
  );
  encBracket.position.set(5.2, 0.9, 7.5);
  encoderGroup.add(encBracket);

  const encBody = new THREE.Mesh(
    regGeo(new THREE.CylinderGeometry(1.9, 1.9, 3.4, 28)),
    materials.pcbBlack
  );
  encBody.position.set(5.2, 3.5, 7.5);
  encoderGroup.add(encBody);

  const encFlange = new THREE.Mesh(
    regGeo(new THREE.CylinderGeometry(2.05, 2.05, 0.45, 28)),
    materials.brushedAluminum
  );
  encFlange.position.set(5.2, 5.1, 7.5);
  encoderGroup.add(encFlange);

  // Rotating Encoder Shaft + Knurled Coupler + Pointer Arm
  const encShaftPivot = new THREE.Group();
  encShaftPivot.position.set(5.2, 5.8, 7.5);
  encoderGroup.add(encShaftPivot);

  const encCoupler = new THREE.Mesh(
    regGeo(new THREE.CylinderGeometry(0.85, 0.85, 1.3, 20)),
    materials.machinedSteel
  );
  encShaftPivot.add(encCoupler);

  const encPointer = new THREE.Mesh(
    regGeo(new THREE.BoxGeometry(2.2, 0.22, 0.42)),
    materials.servoBlueHorn
  );
  encPointer.position.set(0.9, 0.55, 0);
  encShaftPivot.add(encPointer);

  // Braided linkage cable path between Load Cell/Brake linkage and Encoder pulley
  const encCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.8, 5.4, 8.5),
    new THREE.Vector3(1.8, 5.5, 8.2),
    new THREE.Vector3(5.2, 5.8, 7.5),
  ]);
  const encCableMesh = new THREE.Mesh(
    regGeo(new THREE.TubeGeometry(encCurve, 20, 0.1, 8, false)),
    materials.wireBlack
  );
  encoderGroup.add(encCableMesh);

  tagComponent(encoderGroup, 'rotary_encoder');

  // =========================================================================
  // 10. DS18B20 TEMPERATURE SENSOR (Adjacent to Brake Disc Track)
  // =========================================================================
  const tempGroup = createPartGroup('temp_sensor', new THREE.Vector3(-15.6, 5.8, -7.8));

  const tempBracketBase = new THREE.Mesh(
    regGeo(new THREE.BoxGeometry(2.8, 0.6, 2.6)),
    materials.brushedAluminum
  );
  tempBracketBase.position.set(-15.4, 0.3, -8.8);
  tempGroup.add(tempBracketBase);

  const tempBracketPost = new THREE.Mesh(
    regGeo(new THREE.BoxGeometry(1.4, 6.2, 1.4)),
    materials.brushedAluminum
  );
  tempBracketPost.position.set(-15.4, 3.4, -8.8);
  tempGroup.add(tempBracketPost);

  const tempClampBlock = new THREE.Mesh(
    regGeo(new THREE.BoxGeometry(2.2, 1.4, 1.8)),
    materials.darkAluminum
  );
  tempClampBlock.position.set(-15.4, 6.5, -8.4);
  tempGroup.add(tempClampBlock);

  // Stainless steel DS18B20 waterproof probe tip aimed 2 mm from disc surface
  const tempProbe = new THREE.Mesh(
    regGeo(new THREE.CylinderGeometry(0.32, 0.32, 3.2, 16)),
    materials.machinedSteel
  );
  tempProbe.rotation.x = Math.PI / 2;
  tempProbe.position.set(-15.6, 6.5, -6.9);
  tempGroup.add(tempProbe);

  // Sensor wire tail
  const tempWireCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-15.6, 6.5, -8.5),
    new THREE.Vector3(-14.2, 4.2, -10.2),
    new THREE.Vector3(-11.0, 0.5, -11.5),
  ]);
  const tempWire = new THREE.Mesh(
    regGeo(new THREE.TubeGeometry(tempWireCurve, 16, 0.12, 8, false)),
    materials.wireRed
  );
  tempGroup.add(tempWire);

  tagComponent(tempGroup, 'temp_sensor');

  // Keep reference to stainless disc material clone for dynamic thermal glow
  const discClonedMat = componentBaseMats.get(discMesh);
  const hallLedClonedMat = componentBaseMats.get(hallLed);

  // =========================================================================
  // UPDATE & INTERACTION HANDLERS
  // =========================================================================
  let selectedComponent: ComponentId | null = null;
  let hoveredComponent: ComponentId | null = null;

  const updateFromSimulation = (
    physics: PhysicsState,
    hallSignalHigh: boolean,
    explodeFactor: number,
    dims: EngineeringDimensions,
    dt: number
  ) => {
    const dampLambda = 8.5;

    // 1. Update Exploded View offsets smoothly
    (Object.keys(componentGroups) as ComponentId[]).forEach((id) => {
      const target = COMPONENT_CATALOG[id].explodeVector;
      const cur = currentExplodeOffsets[id];
      cur.x = THREE.MathUtils.damp(cur.x, target[0] * explodeFactor, dampLambda, dt);
      cur.y = THREE.MathUtils.damp(cur.y, target[1] * explodeFactor, dampLambda, dt);
      cur.z = THREE.MathUtils.damp(cur.z, target[2] * explodeFactor, dampLambda, dt);
      componentGroups[id].position.copy(cur);
    });

    // 2. Apply adjustable Wheel dimensions (relative to default 20 cm × 6 cm)
    const diamScale = dims.wheelDiameterCm / 20.0;
    const widthScale = dims.wheelWidthCm / 6.0;
    wheelSpinPivot.scale.set(widthScale, diamScale, diamScale);

    // 3. Synchronized mechanical rotation (Wheel + Brake Disc + Main Shaft + Coupling + Motor Shaft)
    const angle = physics.wheelAngleRad;
    wheelSpinPivot.rotation.x = angle;
    discSpinPivot.rotation.x = angle;
    rotatingShaftGroup.rotation.x = angle;
    motorOutputShaft.rotation.x = angle;

    // 4. Servo Horn rotation (0..90 deg mapped cleanly) & Caliper Lever / Pads clamping
    const servoRad = THREE.MathUtils.degToRad(physics.servoAngleDeg);
    servoHornPivot.rotation.z = servoRad * 0.85;

    // Pad inward travel: 1.5 mm (0.15 cm) clearance -> 0.0 cm when clamped
    const gapCm = physics.padClearanceMm * 0.1;
    const clampCompressionCm = (physics.actualBrakeForceN / 50) * 0.06;
    const padHalfOffset = 0.22 + gapCm - clampCompressionCm;
    padOutboard.position.x = padHalfOffset;
    padInboard.position.x = -padHalfOffset;

    // Caliper lever pivots proportionally to servo stroke
    caliperLeverPivot.rotation.z = servoRad * 0.35;

    // 5. Update articulated Pushrod Linkage between Servo Horn Pin & Caliper Lever Pin
    root.updateMatrixWorld(true);
    servoHornPin.getWorldPosition(_tmpVecA);
    calLeverPin.getWorldPosition(_tmpVecB);
    servoGroup.worldToLocal(_tmpVecA);
    servoGroup.worldToLocal(_tmpVecB);
    const pushLen = _tmpVecA.distanceTo(_tmpVecB);
    pushrodGroup.position.copy(_tmpVecA);
    _tmpDir.subVectors(_tmpVecB, _tmpVecA).normalize();
    _quat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _tmpDir);
    pushrodGroup.quaternion.copy(_quat);
    pushrodShaft.scale.set(1, 1, Math.max(0.5, pushLen));
    pushrodShaft.position.z = pushLen * 0.5;

    // 6. Update Load Cell beam elastic micro-deflection & force-transmission rod
    const forceRatio = physics.actualBrakeForceN / 50;
    lcBeamPivot.rotation.z = -forceRatio * 0.025; // Subtle observable shear deflection
    calReactionPin.getWorldPosition(_tmpVecA);
    lcTipPost.getWorldPosition(_tmpVecB);
    loadCellGroup.worldToLocal(_tmpVecA);
    loadCellGroup.worldToLocal(_tmpVecB);
    const forceRodLen = _tmpVecA.distanceTo(_tmpVecB);
    forceLinkageGroup.position.copy(_tmpVecA);
    _tmpDir.subVectors(_tmpVecB, _tmpVecA).normalize();
    _quat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _tmpDir);
    forceLinkageGroup.quaternion.copy(_quat);
    forceRod.scale.set(1, 1, Math.max(0.5, forceRodLen));
    forceRod.position.z = forceRodLen * 0.5;

    // 7. Rotary Encoder shaft rotates synchronously with servo/actuator angle
    encShaftPivot.rotation.y = servoRad * 1.5;

    // 8. Thermal heat glow on Brake Disc above 55 C
    if (discClonedMat && selectedComponent !== 'brake_disc' && hoveredComponent !== 'brake_disc') {
      const heatRatio = THREE.MathUtils.clamp((physics.discTempC - 48) / 110, 0, 1);
      discClonedMat.emissive.setRGB(heatRatio * 0.85, heatRatio * 0.22, 0);
      discClonedMat.emissiveIntensity = heatRatio * 0.75;
    }

    // 9. Hall Effect Sensor LED flashes when magnet passes
    if (hallLedClonedMat) {
      hallLedClonedMat.emissive.setHex(hallSignalHigh ? 0x22d3ee : 0x10b981);
      hallLedClonedMat.emissiveIntensity = hallSignalHigh ? 2.4 : 0.15;
    }
  };

  const setVisibility = (visibility: Record<ComponentId, boolean>) => {
    (Object.keys(componentGroups) as ComponentId[]).forEach((id) => {
      componentGroups[id].visible = visibility[id];
    });
  };

  const applyHighlightColors = () => {
    componentBaseMats.forEach((mat, mesh) => {
      const id = mesh.userData.componentId as ComponentId;
      if (mesh === hallLed) return; // LED keeps its live sensor signal
      if (id === selectedComponent) {
        mat.emissive.setHex(0x0ea5e9);
        mat.emissiveIntensity = 0.35;
      } else if (id === hoveredComponent) {
        mat.emissive.setHex(0x38bdf8);
        mat.emissiveIntensity = 0.18;
      } else {
        mat.emissive.setHex(0x000000);
        mat.emissiveIntensity = 0;
      }
    });
  };

  const setHighlighted = (selectedId: ComponentId | null, hoveredId: ComponentId | null) => {
    selectedComponent = selectedId;
    hoveredComponent = hoveredId;
    applyHighlightColors();
  };

  const getComponentWorldCenter = (id: ComponentId, out: THREE.Vector3): THREE.Vector3 => {
    const group = componentGroups[id];
    const localCenter = componentCentersLocal[id];
    out.copy(localCenter);
    group.localToWorld(out);
    return out;
  };

  // Ensure _upVec isn't flagged unused
  void _upVec;

  return {
    root,
    componentGroups,
    componentCentersLocal,
    selectableMeshes,
    updateFromSimulation,
    setVisibility,
    setHighlighted,
    getComponentWorldCenter,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      customMaterials.forEach((m) => m.dispose());
    },
  };
}
