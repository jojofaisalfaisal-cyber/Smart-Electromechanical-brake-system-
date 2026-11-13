import { PhysicsState, SensorReadings } from '../types/simulation';

/**
 * Derives all physical sensor readings strictly from the physics simulation state.
 * Zero random values: uses physical discretization (quadrature encoder counts,
 * 24-bit HX711 bridge scaling, 12-bit DS18B20 quantization, 4-magnet Hall trigger).
 */
export function computeSensorReadings(
  state: PhysicsState,
  prevReadings: SensorReadings
): SensorReadings {
  const signedWheelRpm = (state.omegaRadS * 60) / (2 * Math.PI);
  const wheelRpm = Math.abs(signedWheelRpm);
  const motorRpm = wheelRpm; // 1:1 coupled output shaft

  // 1. Hall Effect Sensor (4 neodymium trigger magnets around rotor hub)
  // Trigger window: +/- 10 degrees around each 90-degree magnet station
  const magnetsPerRev = 4;
  const normalizedAngle = ((state.wheelAngleRad % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const sectorAngle = (Math.PI * 2) / magnetsPerRev;
  const angleInSector = normalizedAngle % sectorAngle;
  const hallSignalHigh = angleInSector < 0.18 && wheelRpm > 0.2;

  // Cumulative magnet edge crossings derived strictly from angular travel
  const totalMagnetCrossings = Math.floor(Math.abs(state.wheelAngleRad) / sectorAngle);

  // 2. Load Cell + HX711 (24-bit ADC, calibrated 0..50 N -> 0..419,430 counts above tare)
  const brakeForceN = state.actualBrakeForceN;
  const hx711RawCounts = Math.round(brakeForceN * 8388.6);

  // 3. Rotary Encoder (600 PPR = 2400 quadrature counts/rev -> 6.6667 counts per degree)
  const encoderCounts = Math.round((state.servoAngleDeg / 360) * 2400);

  // 4. DS18B20 Temperature Sensor (12-bit resolution = 0.0625 C steps)
  const quantizedTempC = Math.round(state.probeTempC / 0.0625) * 0.0625;

  return {
    wheelRpm,
    signedWheelRpm,
    motorRpm,
    brakeForceN,
    hx711RawCounts,
    servoAngleDeg: state.servoAngleDeg,
    encoderCounts,
    brakeTempC: quantizedTempC,
    hallPulseCount: Math.max(prevReadings.hallPulseCount, totalMagnetCrossings),
    hallSignalHigh,
  };
}
