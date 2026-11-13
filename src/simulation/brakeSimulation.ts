import {
  EngineeringDimensions,
  PhysicsParameters,
  SimulationControls,
} from '../types/simulation';

export interface BrakeStepResult {
  servoAngleDeg: number;
  targetServoAngleDeg: number;
  padClearanceMm: number;
  actualBrakeForceN: number;
  maxFrictionTorqueNm: number;
  staticFrictionTorqueNm: number;
  pwmServoPulseUs: number;
}

/**
 * Simulates the MG996R/DS3218 servo actuator, pushrod linkage, floating caliper pads,
 * and resulting frictional braking torque on the ventilated disc rotor.
 */
export function stepBrakeSimulation(
  controls: SimulationControls,
  dims: EngineeringDimensions,
  params: PhysicsParameters,
  currentServoAngleDeg: number,
  dt: number
): BrakeStepResult {
  // Determine commanded braking force (0 - 50 N)
  let commandedForceN = 0;
  if (controls.emergencyStop) {
    commandedForceN = dims.maxBrakingForceN; // Full 50 N emergency clamp
  } else if (controls.brakeApplied) {
    commandedForceN = Math.max(0, Math.min(dims.maxBrakingForceN, controls.targetBrakeForceN));
  }

  // Map braking force (0..50 N) to servo horn angle:
  // 0 deg = fully released (1.5 mm pad air gap)
  // 15 deg = pad just contacts disc rotor
  // 90 deg = full 50 N clamping force
  const contactAngle = params.servoContactAngleDeg; // 15 deg
  const maxAngle = params.servoMaxAngleDeg; // 90 deg

  let targetServoAngleDeg = 0;
  if (commandedForceN > 0.01) {
    const forceRatio = commandedForceN / dims.maxBrakingForceN;
    targetServoAngleDeg = contactAngle + forceRatio * (maxAngle - contactAngle);
  }

  // Rate-limited servo actuator motion (MG996R/DS3218 ~375 deg/s; emergency boost ~520 deg/s)
  const maxSlewRate = controls.emergencyStop ? 540 : params.servoMaxSpeedDegPerS;
  const maxStep = maxSlewRate * dt;
  const angleDelta = targetServoAngleDeg - currentServoAngleDeg;

  let nextServoAngleDeg = currentServoAngleDeg;
  if (Math.abs(angleDelta) <= maxStep) {
    nextServoAngleDeg = targetServoAngleDeg;
  } else {
    nextServoAngleDeg = currentServoAngleDeg + Math.sign(angleDelta) * maxStep;
  }
  nextServoAngleDeg = Math.max(0, Math.min(maxAngle, nextServoAngleDeg));

  // Mechanical pad clearance: 1.5 mm at 0 deg -> 0.0 mm at >= 15 deg
  const padClearanceMm =
    nextServoAngleDeg < contactAngle
      ? 1.5 * (1 - nextServoAngleDeg / contactAngle)
      : 0;

  // Normal clamping force transmitted through linkage and caliper to load cell
  let actualBrakeForceN = 0;
  if (nextServoAngleDeg > contactAngle) {
    const compressionRatio = (nextServoAngleDeg - contactAngle) / (maxAngle - contactAngle);
    actualBrakeForceN = compressionRatio * dims.maxBrakingForceN;
  }

  // Dual-pad disc brake friction torque: T_brake = 2 * mu * F_N * R_eff
  const rEffMeters = dims.effectiveBrakeRadiusCm / 100;
  const maxFrictionTorqueNm = 2 * params.frictionCoeffKinetic * actualBrakeForceN * rEffMeters;
  const staticFrictionTorqueNm = 2 * params.frictionCoeffStatic * actualBrakeForceN * rEffMeters;

  // Standard hobby/industrial servo PWM pulse width (1000 us = 0 deg, 2000 us = 90 deg)
  const pwmServoPulseUs = 1000 + (nextServoAngleDeg / maxAngle) * 1000;

  return {
    servoAngleDeg: nextServoAngleDeg,
    targetServoAngleDeg,
    padClearanceMm,
    actualBrakeForceN,
    maxFrictionTorqueNm,
    staticFrictionTorqueNm,
    pwmServoPulseUs,
  };
}
