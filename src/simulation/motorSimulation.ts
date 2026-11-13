import { PhysicsParameters, SimulationControls } from '../types/simulation';

export interface MotorStepResult {
  motorTorqueNm: number;
  motorRpm: number;
  pwmDutyPct: number;
  motorCurrentA: number;
  integralError: number;
}

/**
 * Simulates the 12V DC Geared Motor driven by the BTS7960 H-Bridge.
 * Combines closed-loop PWM speed regulation with DC motor back-EMF speed-torque limits.
 */
export function stepMotorSimulation(
  controls: SimulationControls,
  params: PhysicsParameters,
  omegaRadS: number,
  prevIntegralError: number,
  dt: number
): MotorStepResult {
  const wheelRpmSigned = (omegaRadS * 60) / (2 * Math.PI);
  // Direct 1:1 shaft coupling between geared motor output shaft and main wheel shaft
  const motorRpm = wheelRpmSigned;

  if (!controls.motorOn || controls.emergencyStop || controls.targetRpm <= 0) {
    // BTS7960 R_EN / L_EN disabled or zero command: coasting / zero drive torque
    return {
      motorTorqueNm: 0,
      motorRpm,
      pwmDutyPct: 0,
      motorCurrentA: 0.04, // Quiescent driver standby current
      integralError: 0,
    };
  }

  const clampedTargetRpm = Math.min(Math.max(controls.targetRpm, 0), params.motorNoLoadRpm);
  const targetOmega = (controls.direction * clampedTargetRpm * 2 * Math.PI) / 60;
  const noLoadOmega = (params.motorNoLoadRpm * 2 * Math.PI) / 60;

  // PI speed controller calculating normalized PWM command (-1..1)
  const error = targetOmega - omegaRadS;
  const kp = 0.042;
  const ki = 0.085;
  const nextIntegral = Math.max(-12, Math.min(12, prevIntegralError + error * dt));

  // Feed-forward term based on no-load speed ratio + PI correction
  const feedForward = targetOmega / noLoadOmega;
  let cmdDuty = feedForward + kp * error + ki * nextIntegral;

  // Enforce unidirectional drive matching selected direction (RPWM vs LPWM)
  if (controls.direction === 1) {
    cmdDuty = Math.max(0, Math.min(1, cmdDuty));
  } else {
    cmdDuty = Math.min(0, Math.max(-1, cmdDuty));
  }

  // DC motor back-EMF physics: T_motor = T_stall * (V_applied/V_nom - omega / omega_no_load)
  const rawTorque = params.motorMaxTorqueNm * (cmdDuty - omegaRadS / noLoadOmega);

  // Motor only drives in the commanded direction (no regenerative braking unless coasting)
  const motorTorqueNm =
    controls.direction === 1
      ? Math.max(0, Math.min(params.motorMaxTorqueNm, rawTorque))
      : Math.min(0, Math.max(-params.motorMaxTorqueNm, rawTorque));

  const torqueFraction = Math.abs(motorTorqueNm) / params.motorMaxTorqueNm;
  // 12V geared motor current: ~0.35 A no-load up to ~6.5 A under heavy braking load
  const motorCurrentA = 0.35 * Math.abs(cmdDuty) + 6.15 * torqueFraction;

  return {
    motorTorqueNm,
    motorRpm,
    pwmDutyPct: Math.abs(cmdDuty) * 100,
    motorCurrentA,
    integralError: nextIntegral,
  };
}
