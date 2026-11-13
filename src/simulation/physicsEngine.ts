import {
  EngineeringDimensions,
  PhysicsParameters,
  PhysicsState,
  SimulationControls,
} from '../types/simulation';
import { stepBrakeSimulation } from './brakeSimulation';
import { stepMotorSimulation } from './motorSimulation';

/**
 * Computes physical rotational inertia J dynamically from current mechanical dimensions.
 * J = J_wheel + J_disc + J_shaft + J_motor_reflected
 */
export function computePhysicsParameters(
  dims: EngineeringDimensions,
  frictionCoeff = 0.42
): PhysicsParameters {
  const wheelRadiusM = dims.wheelDiameterCm / 200;
  const widthScale = dims.wheelWidthCm / 6.0;
  const radiusScale = Math.pow(dims.wheelDiameterCm / 20.0, 2);

  // 20 cm scooter/robotic wheel + alloy rim ~ 2.2 kg
  const wheelMassKg = 2.2 * widthScale * (dims.wheelDiameterCm / 20.0);
  // Hollow-ring + hub approximation: J_wheel ~ 0.62 * m * R^2
  const jWheel = 0.62 * wheelMassKg * wheelRadiusM * wheelRadiusM;

  // Stainless steel brake disc (Ø 15.2 cm, 3.5 mm thick, ~0.65 kg)
  const discRadiusM = dims.discDiameterCm / 200;
  const discMassKg = 0.65 * Math.pow(dims.discDiameterCm / 15.2, 2);
  const jDisc = 0.5 * discMassKg * discRadiusM * discRadiusM;

  // Steel shaft + coupling + reflected planetary gearbox rotor inertia
  const shaftInertiaKgM2 = 0.00055;
  const motorReflectedInertia = 0.0012 * radiusScale * 0.25 + 0.0009;

  const totalInertiaKgM2 = jWheel + jDisc + shaftInertiaKgM2 + motorReflectedInertia;

  return {
    wheelMassKg,
    discMassKg,
    shaftInertiaKgM2,
    totalInertiaKgM2,
    motorMaxTorqueNm: 1.85,
    motorNoLoadRpm: dims.maxMotorRpm,
    motorTimeConstantS: 0.14,
    frictionCoeffKinetic: frictionCoeff,
    frictionCoeffStatic: frictionCoeff * 1.14,
    viscousLossCoeff: 0.0036,
    bearingCoulombLossNm: 0.032,
    servoMaxSpeedDegPerS: 375,
    servoContactAngleDeg: 15,
    servoMaxAngleDeg: 90,
    ambientTempC: 24.0,
    discThermalMassJPerC: 95,
    coolingCoeffWPerC: 1.45,
  };
}

export function createInitialPhysicsState(ambientTempC = 24.0): PhysicsState {
  return {
    simTime: 0,
    omegaRadS: 0,
    wheelAngleRad: 0,
    servoAngleDeg: 0,
    padClearanceMm: 1.5,
    actualBrakeForceN: 0,
    motorTorqueNm: 0,
    brakeTorqueNm: 0,
    lossTorqueNm: 0,
    netTorqueNm: 0,
    discTempC: ambientTempC,
    probeTempC: ambientTempC,
    motorCurrentA: 0.04,
    pwmMotorDutyPct: 0,
    pwmServoPulseUs: 1000,
    responseLatencyMs: 0,
    lastBrakeCmdTime: 0,
    lastBrakeCmdForceN: 0,
    brakeSettled: true,
    padLocked: false,
  };
}

export interface PhysicsIntegratorMemory {
  integralError: number;
  prevBrakeActive: boolean;
  prevCommandForceN: number;
}

/**
 * Advances rotational dynamics, servo braking, and disc thermal state using consistent sub-stepping.
 * Solves: J * d(omega)/dt = T_motor - T_brake - T_loss
 */
export function stepPhysicsEngine(
  prev: PhysicsState,
  controls: SimulationControls,
  dims: EngineeringDimensions,
  params: PhysicsParameters,
  memory: PhysicsIntegratorMemory,
  rawDt: number
): PhysicsState {
  const dt = Math.min(Math.max(rawDt, 0.0001), 0.05);
  const subSteps = 6;
  const subDt = dt / subSteps;

  let simTime = prev.simTime;
  let omega = prev.omegaRadS;
  let wheelAngle = prev.wheelAngleRad;
  let servoAngle = prev.servoAngleDeg;
  let discTempC = prev.discTempC;
  let probeTempC = prev.probeTempC;

  // Detect brake command step change for response latency measurement
  const effectiveCmdForceN = controls.emergencyStop
    ? dims.maxBrakingForceN
    : controls.brakeApplied
    ? controls.targetBrakeForceN
    : 0;
  const effectiveBrakeActive = controls.emergencyStop || controls.brakeApplied;

  let lastBrakeCmdTime = prev.lastBrakeCmdTime;
  let lastBrakeCmdForceN = prev.lastBrakeCmdForceN;
  let brakeSettled = prev.brakeSettled;
  let responseLatencyMs = prev.responseLatencyMs;

  if (
    effectiveBrakeActive !== memory.prevBrakeActive ||
    Math.abs(effectiveCmdForceN - memory.prevCommandForceN) > 0.5
  ) {
    lastBrakeCmdTime = simTime;
    lastBrakeCmdForceN = effectiveCmdForceN;
    brakeSettled = false;
    memory.prevBrakeActive = effectiveBrakeActive;
    memory.prevCommandForceN = effectiveCmdForceN;
  }

  let latestMotorTorque = 0;
  let latestBrakeTorque = 0;
  let latestLossTorque = 0;
  let latestNetTorque = 0;
  let latestClearanceMm = prev.padClearanceMm;
  let latestBrakeForceN = prev.actualBrakeForceN;
  let latestCurrentA = prev.motorCurrentA;
  let latestPwmDuty = prev.pwmMotorDutyPct;
  let latestServoPulse = prev.pwmServoPulseUs;
  let padLocked = false;

  for (let i = 0; i < subSteps; i++) {
    simTime += subDt;

    // 1. Step motor torque
    const motorRes = stepMotorSimulation(
      controls,
      params,
      omega,
      memory.integralError,
      subDt
    );
    memory.integralError = motorRes.integralError;

    // 2. Step servo + mechanical brake clamping
    const brakeRes = stepBrakeSimulation(controls, dims, params, servoAngle, subDt);
    servoAngle = brakeRes.servoAngleDeg;

    // Check if actuator reached >= 95% of commanded target for latency tracking
    if (!brakeSettled) {
      const angleDiff = Math.abs(brakeRes.targetServoAngleDeg - servoAngle);
      if (angleDiff <= 1.0) {
        responseLatencyMs = Math.max(0, (simTime - lastBrakeCmdTime) * 1000);
        brakeSettled = true;
      } else {
        responseLatencyMs = Math.max(0, (simTime - lastBrakeCmdTime) * 1000);
      }
    }

    // 3. Compute mechanical bearing & aerodynamic losses
    const speedThreshold = 0.08; // rad/s (~0.76 RPM)
    const viscousLoss = params.viscousLossCoeff * omega;
    let coulombLoss = 0;
    if (Math.abs(omega) > speedThreshold) {
      coulombLoss = Math.sign(omega) * params.bearingCoulombLossNm;
    }

    const totalStaticHold =
      brakeRes.staticFrictionTorqueNm + params.bearingCoulombLossNm;

    // 4. Solve J * d(omega)/dt = T_motor - T_brake - T_loss with zero-crossing lock
    let appliedBrakeTorque = 0;
    let netTorque = 0;

    if (Math.abs(omega) <= speedThreshold) {
      // Near rest: check if driving motor torque exceeds static holding torque
      if (Math.abs(motorRes.motorTorqueNm) <= totalStaticHold) {
        omega = 0;
        padLocked = brakeRes.actualBrakeForceN > 0.1;
        // Static reaction balances motor torque
        appliedBrakeTorque =
          brakeRes.actualBrakeForceN > 0.1 ? motorRes.motorTorqueNm : 0;
        netTorque = 0;
      } else {
        const motionSign = Math.sign(motorRes.motorTorqueNm);
        appliedBrakeTorque = motionSign * brakeRes.maxFrictionTorqueNm;
        coulombLoss = motionSign * params.bearingCoulombLossNm;
        netTorque = motorRes.motorTorqueNm - appliedBrakeTorque - (viscousLoss + coulombLoss);
        omega += (netTorque / params.totalInertiaKgM2) * subDt;
        padLocked = false;
      }
    } else {
      const motionSign = Math.sign(omega);
      appliedBrakeTorque = motionSign * brakeRes.maxFrictionTorqueNm;
      const totalLoss = viscousLoss + coulombLoss;
      netTorque = motorRes.motorTorqueNm - appliedBrakeTorque - totalLoss;

      const nextOmega = omega + (netTorque / params.totalInertiaKgM2) * subDt;

      // Prevent unintended negative RPM or sign reversal caused by braking friction
      if (omega > 0 && nextOmega <= 0) {
        if (Math.abs(motorRes.motorTorqueNm) <= totalStaticHold) {
          omega = 0;
          padLocked = brakeRes.actualBrakeForceN > 0.1;
        } else {
          omega = nextOmega;
        }
      } else if (omega < 0 && nextOmega >= 0) {
        if (Math.abs(motorRes.motorTorqueNm) <= totalStaticHold) {
          omega = 0;
          padLocked = brakeRes.actualBrakeForceN > 0.1;
        } else {
          omega = nextOmega;
        }
      } else {
        omega = nextOmega;
      }
    }

    wheelAngle += omega * subDt;

    // 5. Thermal accumulation & convective cooling (DS18B20)
    // Frictional power P = |T_brake * omega|, scaled slightly for laboratory bench observability
    const frictionPowerW = Math.abs(appliedBrakeTorque * omega);
    const speedCoolingBonus = 1 + 0.045 * Math.abs(omega);
    const coolingPowerW =
      params.coolingCoeffWPerC * speedCoolingBonus * (discTempC - params.ambientTempC);

    const dTemp = ((frictionPowerW - coolingPowerW) / params.discThermalMassJPerC) * subDt;
    discTempC = Math.max(params.ambientTempC, Math.min(220, discTempC + dTemp));

    // DS18B20 probe thermal lag (tau = 0.55 s)
    const probeTau = 0.55;
    probeTempC += ((discTempC - probeTempC) / probeTau) * subDt;

    latestMotorTorque = motorRes.motorTorqueNm;
    latestBrakeTorque = appliedBrakeTorque;
    latestLossTorque = viscousLoss + coulombLoss;
    latestNetTorque = netTorque;
    latestClearanceMm = brakeRes.padClearanceMm;
    latestBrakeForceN = brakeRes.actualBrakeForceN;
    latestCurrentA = motorRes.motorCurrentA;
    latestPwmDuty = motorRes.pwmDutyPct;
    latestServoPulse = brakeRes.pwmServoPulseUs;
  }

  return {
    simTime,
    omegaRadS: omega,
    wheelAngleRad: wheelAngle,
    servoAngleDeg: servoAngle,
    padClearanceMm: latestClearanceMm,
    actualBrakeForceN: latestBrakeForceN,
    motorTorqueNm: latestMotorTorque,
    brakeTorqueNm: latestBrakeTorque,
    lossTorqueNm: latestLossTorque,
    netTorqueNm: latestNetTorque,
    discTempC,
    probeTempC,
    motorCurrentA: latestCurrentA,
    pwmMotorDutyPct: latestPwmDuty,
    pwmServoPulseUs: latestServoPulse,
    responseLatencyMs,
    lastBrakeCmdTime,
    lastBrakeCmdForceN,
    brakeSettled,
    padLocked,
  };
}
