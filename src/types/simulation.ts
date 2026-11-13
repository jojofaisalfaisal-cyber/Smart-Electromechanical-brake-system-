export type ComponentId =
  | 'wheel'
  | 'brake_disc'
  | 'brake_caliper'
  | 'servo_motor'
  | 'dc_motor'
  | 'base_structure'
  | 'hall_sensor'
  | 'load_cell'
  | 'rotary_encoder'
  | 'temp_sensor';

export type CameraViewMode = 'perspective' | 'front' | 'side' | 'top' | 'exploded';

export type WorkspaceTab = '3d' | 'electronics' | 'physics' | 'drive';

export type RotationDirection = 1 | -1;

export interface EngineeringDimensions {
  baseLengthCm: number; // Default 55 cm
  baseWidthCm: number; // Default 35 cm
  maxHeightCm: number; // Default 28 cm
  wheelDiameterCm: number; // Default 20 cm (15-25 cm)
  wheelWidthCm: number; // Default 6 cm (4-8 cm)
  discDiameterCm: number; // Default 15.2 cm
  effectiveBrakeRadiusCm: number; // Default 5.8 cm
  motorVoltageV: number; // 12 V
  logicVoltageV: number; // 5 V
  maxMotorRpm: number; // ~500 RPM
  maxBrakingForceN: number; // ~50 N
}

export interface PhysicsParameters {
  wheelMassKg: number; // Derived or configurable (~2.2 kg at 20cm)
  discMassKg: number; // ~0.65 kg
  shaftInertiaKgM2: number; // 0.0004 kg*m^2
  totalInertiaKgM2: number; // J = J_wheel + J_disc + J_shaft + J_motor_reflected
  motorMaxTorqueNm: number; // ~2.8 N*m stall / rated peak at shaft
  motorNoLoadRpm: number; // 500 RPM
  motorTimeConstantS: number; // 0.14 s electrical/controller ramp
  frictionCoeffKinetic: number; // mu_k = 0.42
  frictionCoeffStatic: number; // mu_s = 0.48
  viscousLossCoeff: number; // b = 0.0038 N*m*s/rad
  bearingCoulombLossNm: number; // 0.035 N*m
  servoMaxSpeedDegPerS: number; // 375 deg/s (MG996R/DS3218 ~0.16s/60deg)
  servoContactAngleDeg: number; // 15 deg where pad touches rotor
  servoMaxAngleDeg: number; // 90 deg at 50 N
  ambientTempC: number; // 24.0 C
  discThermalMassJPerC: number; // 145 J/C
  coolingCoeffWPerC: number; // 1.35 W/C convective + conductive
}

export interface SimulationControls {
  simRunning: boolean;
  motorOn: boolean;
  direction: RotationDirection;
  targetRpm: number; // 0 - 500 RPM
  brakeApplied: boolean;
  targetBrakeForceN: number; // 0 - 50 N
  emergencyStop: boolean;
}

export interface SensorReadings {
  wheelRpm: number; // Magnitude or signed RPM from Hall sensor
  signedWheelRpm: number;
  motorRpm: number;
  brakeForceN: number; // Load Cell + HX711 (0 - 50 N)
  hx711RawCounts: number; // 24-bit ADC count proportional to force
  servoAngleDeg: number; // 0 - 90 deg
  encoderCounts: number; // 600 PPR quadrature -> 0 - 600 counts (over 90 deg)
  brakeTempC: number; // DS18B20 temperature (C)
  hallPulseCount: number; // Cumulative magnetic pulses
  hallSignalHigh: boolean; // Instantaneous digital pin D34 state
}

export interface PhysicsState {
  simTime: number;
  omegaRadS: number; // Wheel/disc/shaft angular velocity (rad/s)
  wheelAngleRad: number; // Cumulative angular position (rad)
  servoAngleDeg: number; // Current mechanical servo horn angle (0-90 deg)
  padClearanceMm: number; // 1.5 mm released -> 0.0 mm clamped
  actualBrakeForceN: number; // Actual normal clamping force on rotor (N)
  motorTorqueNm: number; // T_motor
  brakeTorqueNm: number; // T_brake (opposing motion)
  lossTorqueNm: number; // T_loss
  netTorqueNm: number; // J * d_omega/dt
  discTempC: number; // True rotor surface temperature
  probeTempC: number; // DS18B20 filtered temperature
  motorCurrentA: number; // Estimated 12V motor draw (A)
  pwmMotorDutyPct: number; // BTS7960 RPWM/LPWM duty (0-100%)
  pwmServoPulseUs: number; // 1000-2000 us servo PWM
  responseLatencyMs: number; // Measured actuation lag between brake cmd & clamp
  lastBrakeCmdTime: number;
  lastBrakeCmdForceN: number;
  brakeSettled: boolean;
  padLocked: boolean; // True when static friction holds rotor at 0 RPM
}

export interface TelemetryPoint {
  time: number;
  wheelRpm: number;
  targetRpm: number;
  motorRpm: number;
  brakeForceN: number;
  brakeTorqueNm: number;
  motorTorqueNm: number;
  brakeTempC: number;
  servoAngleDeg: number;
  responseLatencyMs: number;
}

export interface ComponentMetadata {
  id: ComponentId;
  code: string;
  name: string;
  category: 'Actuator' | 'Rotating Assembly' | 'Braking Mechanism' | 'Sensor' | 'Structure';
  material: string;
  dimensionsSummary: string;
  electricalConnection: string;
  description: string;
  explodeVector: [number, number, number]; // in cm
  focusOffset: [number, number, number]; // camera offset when focusing
}

export interface LabelProjection {
  id: ComponentId;
  x: number;
  y: number;
  visible: boolean;
}

export interface MeasurementResult {
  fromId: ComponentId;
  toId: ComponentId;
  distanceCm: number;
  distanceMm: number;
  dxCm: number;
  dyCm: number;
  dzCm: number;
}
