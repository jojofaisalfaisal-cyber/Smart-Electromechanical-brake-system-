import { ComponentId, ComponentMetadata, EngineeringDimensions } from '../types/simulation';

export const DEFAULT_DIMENSIONS: EngineeringDimensions = {
  baseLengthCm: 55,
  baseWidthCm: 35,
  maxHeightCm: 28,
  wheelDiameterCm: 20,
  wheelWidthCm: 6,
  discDiameterCm: 15.2,
  effectiveBrakeRadiusCm: 5.8,
  motorVoltageV: 12,
  logicVoltageV: 5,
  maxMotorRpm: 500,
  maxBrakingForceN: 50,
};

export const COMPONENT_CATALOG: Record<ComponentId, ComponentMetadata> = {
  wheel: {
    id: 'wheel',
    code: 'ASM-01',
    name: 'Drive Wheel & Rubber Tire',
    category: 'Rotating Assembly',
    material: 'Vulcanized Tread Rubber / Die-Cast Alloy Rim',
    dimensionsSummary: 'Ø 20.0 cm × 6.0 cm width (adjustable 15–25 cm)',
    electricalConnection: 'Mechanically coupled to main drive shaft (No electrical connection)',
    description:
      'Primary rotational inertia load mounted on the left end of the steel drive shaft. Transfers motor torque and experiences deceleration during caliper clamping.',
    explodeVector: [-12, 2, 0],
    focusOffset: [-22, 12, 24],
  },
  brake_disc: {
    id: 'brake_disc',
    code: 'ASM-02',
    name: 'Ventilated Brake Disc Rotor',
    category: 'Rotating Assembly',
    material: '410 Stainless Steel (Machined & Cross-Drilled)',
    dimensionsSummary: 'Ø 15.2 cm × 0.35 cm thickness, Reff = 5.8 cm',
    electricalConnection: '4× Neodymium trigger magnets embedded on hub for Hall sensor',
    description:
      'Cross-drilled ventilated metallic rotor bolted concentrically to the wheel hub. Rotates rigidly with the wheel and shaft; dissipates kinetic energy as thermal energy under friction.',
    explodeVector: [-5.5, 1, 0],
    focusOffset: [-12, 10, 22],
  },
  brake_caliper: {
    id: 'brake_caliper',
    code: 'ASM-03',
    name: 'Mechanical Disc Brake Caliper',
    category: 'Braking Mechanism',
    material: '6061-T6 Anodized Aluminum / Sintered Ceramic-Organic Pads',
    dimensionsSummary: 'Floating dual-pad caliper with lever cam actuator',
    electricalConnection: 'Actuated mechanically via pushrod linkage from Servo Motor',
    description:
      'Straddles the rotor perimeter with opposed inboard and outboard friction pads. Actuating cam arm converts servo pushrod travel into normal clamping force up to 50 N.',
    explodeVector: [-3, 7, 7],
    focusOffset: [-8, 12, 20],
  },
  servo_motor: {
    id: 'servo_motor',
    code: 'ACT-04',
    name: 'Servo Motor (MG996R / DS3218)',
    category: 'Actuator',
    material: 'Glass-Filled Nylon Case / Metal Gear Train / Anodized Horn',
    dimensionsSummary: '40.7 × 19.7 × 42.9 mm, 20 kg·cm torque @ 5–6V',
    electricalConnection: 'ESP32 Pin D15 (50 Hz PWM Signal) · 5V Buck Rail · Common GND',
    description:
      'High-torque metal-gear servo mounted on the upper aluminum bracket. Rotates from 0° to 90° to drive the pushrod linkage and modulate caliper clamping pressure.',
    explodeVector: [0, 11, 2],
    focusOffset: [-4, 16, 20],
  },
  dc_motor: {
    id: 'dc_motor',
    code: 'ACT-05',
    name: '12V DC Geared Drive Motor',
    category: 'Actuator',
    material: 'Brushed Steel Housing / Planetary Gearbox / Copper Windings',
    dimensionsSummary: 'Ø 6.4 cm × 11.2 cm, 12V DC, ~500 RPM max output',
    electricalConnection: 'BTS7960 M+/M- · ESP32 D26 (RPWM), D27 (LPWM), D14/D12 (EN)',
    description:
      '12V geared DC motor seated in a split-clamp aluminum cradle. Coupled via a flexible shaft coupler to drive the main rotor/wheel shaft in forward or reverse.',
    explodeVector: [12, 2, 0],
    focusOffset: [16, 12, 24],
  },
  base_structure: {
    id: 'base_structure',
    code: 'STR-06',
    name: 'Aluminum Base Plate & Supports',
    category: 'Structure',
    material: '6061 Machined Aluminum Plate / Pillow-Block Bearings / Steel Fasteners',
    dimensionsSummary: '55.0 cm × 35.0 cm × 1.6 cm base, 28.0 cm max assembly height',
    electricalConnection: 'Chassis Ground Reference',
    description:
      'Precision-milled aluminum optical/mechatronic bed with 4 leveling feet, dual pillow-block bearing pedestals, main steel drive shaft, flexible coupling, and M5/M6 fasteners.',
    explodeVector: [0, -5, 0],
    focusOffset: [0, 26, 46],
  },
  hall_sensor: {
    id: 'hall_sensor',
    code: 'SEN-07',
    name: 'Hall Effect Speed Sensor (A3144)',
    category: 'Sensor',
    material: 'FR-4 PCB / Epoxy Hall IC / Aluminum L-Bracket',
    dimensionsSummary: '32 × 14 mm module positioned 3 mm from rotor magnet ring',
    electricalConnection: 'ESP32 Pin D34 (Digital Pulse Input) · 5V · Common GND',
    description:
      'Detects passing neodymium magnets embedded in the rotor hub to compute instantaneous wheel angular velocity and RPM without mechanical contact.',
    explodeVector: [-5, 0, 10],
    focusOffset: [-10, 8, 18],
  },
  load_cell: {
    id: 'load_cell',
    code: 'SEN-08',
    name: 'Strain-Gauge Load Cell + HX711',
    category: 'Sensor',
    material: '7075 Aluminum Shear Beam / Foil Strain Gauge Bridge',
    dimensionsSummary: '80 × 12.7 × 12.7 mm beam (0–5 kg / 0–50 N calibrated range)',
    electricalConnection: 'HX711 ADC -> ESP32 D23 (DT), D19 (SCK) · 5V · Common GND',
    description:
      'Mounted inline with the brake reaction force transmission linkage on the front pedestal. Measures real-time braking clamping force in Newtons via 24-bit HX711 amplifier.',
    explodeVector: [0, 3, 10],
    focusOffset: [2, 10, 18],
  },
  rotary_encoder: {
    id: 'rotary_encoder',
    code: 'SEN-09',
    name: 'Incremental Rotary Encoder',
    category: 'Sensor',
    material: 'Machined Aluminum Body / Optical Disc / 6 mm Stainless Shaft',
    dimensionsSummary: 'Ø 38 mm × 35 mm, 600 PPR quadrature (2400 counts/rev)',
    electricalConnection: 'ESP32 D18 (Channel A), D5 (Channel B) · 5V · Common GND',
    description:
      'Tracks exact angular displacement of the brake actuator mechanism in degrees and quadrature encoder counts for closed-loop brake position verification.',
    explodeVector: [5, 2, 10],
    focusOffset: [8, 10, 18],
  },
  temp_sensor: {
    id: 'temp_sensor',
    code: 'SEN-10',
    name: 'DS18B20 Temperature Sensor',
    category: 'Sensor',
    material: '304 Stainless Steel Probe / Sealed Thermal Tip',
    dimensionsSummary: 'Ø 6 mm × 30 mm probe tip mounted 2 mm from disc track',
    electricalConnection: 'ESP32 Pin D4 (1-Wire Bus with 4.7kΩ pull-up) · 5V · Common GND',
    description:
      'Positioned adjacent to the brake disc friction track to monitor thermal rise caused by frictional power dissipation and convective cooling during release.',
    explodeVector: [-3, -2, -9],
    focusOffset: [-8, 10, -18],
  },
};

export const COMPONENT_LIST: ComponentMetadata[] = Object.values(COMPONENT_CATALOG);

export const DEFAULT_VISIBILITY: Record<ComponentId, boolean> = {
  wheel: true,
  brake_disc: true,
  brake_caliper: true,
  servo_motor: true,
  dc_motor: true,
  base_structure: true,
  hall_sensor: true,
  load_cell: true,
  rotary_encoder: true,
  temp_sensor: true,
};
