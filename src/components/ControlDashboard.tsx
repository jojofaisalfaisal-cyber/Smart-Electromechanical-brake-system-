import React from 'react';
import {
  AlertOctagon,
  ArrowLeftRight,
  CheckCircle2,
  Disc,
  Gauge,
  OctagonAlert,
  Play,
  RotateCcw,
  ShieldAlert,
  Square,
  Thermometer,
} from 'lucide-react';
import {
  EngineeringDimensions,
  PhysicsState,
  RotationDirection,
  SensorReadings,
  SimulationControls,
} from '../types/simulation';

interface ControlDashboardProps {
  controls: SimulationControls;
  physics: PhysicsState;
  sensors: SensorReadings;
  dimensions: EngineeringDimensions;
  onMotorToggle: (on: boolean) => void;
  onTargetRpmChange: (rpm: number) => void;
  onDirectionChange: (dir: RotationDirection) => void;
  onBrakeApply: () => void;
  onBrakeRelease: () => void;
  onBrakeForceChange: (forceN: number) => void;
  onEmergencyStop: () => void;
  onResetEmergencyStop: () => void;
}

export const ControlDashboard: React.FC<ControlDashboardProps> = ({
  controls,
  physics,
  sensors,
  dimensions,
  onMotorToggle,
  onTargetRpmChange,
  onDirectionChange,
  onBrakeApply,
  onBrakeRelease,
  onBrakeForceChange,
  onEmergencyStop,
  onResetEmergencyStop,
}) => {
  const isMotorActive = controls.motorOn && !controls.emergencyStop;
  const isBrakeActive = controls.brakeApplied || controls.emergencyStop;

  return (
    <aside className="w-[336px] shrink-0 bg-[#101622] border-l border-slate-800/90 flex flex-col h-full overflow-hidden">
      {/* System Status Header Matrix */}
      <div className="px-3.5 py-2.5 border-b border-slate-800/90">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold tracking-wide text-slate-200">
            System Status & Telemetry
          </h2>
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-mono font-medium ${
              controls.emergencyStop
                ? 'text-rose-400'
                : controls.simRunning
                ? 'text-emerald-400'
                : 'text-amber-400'
            }`}
          >
            {controls.emergencyStop ? (
              <>
                <ShieldAlert className="w-3.5 h-3.5" />
                E-STOP TRIPPED
              </>
            ) : controls.simRunning ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                RUNNING
              </>
            ) : (
              <>
                <Square className="w-3 h-3" />
                STOPPED
              </>
            )}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1.5 text-[11px] font-mono">
          <div className="bg-[#0B0F17] border border-slate-800 rounded px-2 py-1">
            <div className="text-[10px] text-slate-500">MOTOR</div>
            <div className={isMotorActive ? 'text-cyan-400 font-semibold' : 'text-slate-400'}>
              {isMotorActive ? 'ON' : 'OFF'}
            </div>
          </div>
          <div className="bg-[#0B0F17] border border-slate-800 rounded px-2 py-1">
            <div className="text-[10px] text-slate-500">BRAKE</div>
            <div
              className={
                controls.emergencyStop
                  ? 'text-rose-400 font-semibold'
                  : isBrakeActive
                  ? 'text-amber-400 font-semibold'
                  : 'text-emerald-400'
              }
            >
              {controls.emergencyStop ? 'E-CLAMP' : isBrakeActive ? 'ACTIVE' : 'RELEASED'}
            </div>
          </div>
          <div className="bg-[#0B0F17] border border-slate-800 rounded px-2 py-1">
            <div className="text-[10px] text-slate-500">E-STOP</div>
            <div className={controls.emergencyStop ? 'text-rose-400 font-semibold' : 'text-slate-400'}>
              {controls.emergencyStop ? 'ACTIVE' : 'INACTIVE'}
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable Telemetry & Controls */}
      <div className="flex-1 overflow-y-auto eng-scroll divide-y divide-slate-800/80">
        {/* Live Sensor Readings */}
        <div className="p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-cyan-400" />
              <h3 className="text-xs font-semibold text-slate-200">Live Sensor Readings</h3>
            </div>
            <span className="text-[10px] font-mono text-slate-500">
              HALL · HX711 · ENC · DS18B20
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {/* Wheel Speed (Hall Effect) */}
            <div className="bg-[#0B0F17] border border-slate-800 rounded p-2">
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span>Wheel Speed</span>
                <span className="font-mono text-slate-500">D34</span>
              </div>
              <div className="mt-0.5 flex items-baseline gap-1">
                <span className="text-lg font-mono font-semibold tabular-nums text-cyan-300">
                  {sensors.wheelRpm.toFixed(1)}
                </span>
                <span className="text-[10px] font-mono text-slate-400">RPM</span>
              </div>
              <div className="text-[10px] font-mono tabular-nums text-slate-500">
                Pulses: {sensors.hallPulseCount}
              </div>
            </div>

            {/* Brake Force (Load Cell + HX711) */}
            <div className="bg-[#0B0F17] border border-slate-800 rounded p-2">
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span>Brake Force</span>
                <span className="font-mono text-slate-500">HX711</span>
              </div>
              <div className="mt-0.5 flex items-baseline gap-1">
                <span className="text-lg font-mono font-semibold tabular-nums text-amber-300">
                  {sensors.brakeForceN.toFixed(2)}
                </span>
                <span className="text-[10px] font-mono text-slate-400">N</span>
              </div>
              <div className="text-[10px] font-mono tabular-nums text-slate-500">
                ADC: {sensors.hx711RawCounts.toLocaleString()}
              </div>
            </div>

            {/* Brake Temperature (DS18B20) */}
            <div className="bg-[#0B0F17] border border-slate-800 rounded p-2">
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <Thermometer className="w-3 h-3 text-rose-400" />
                  Disc Temp
                </span>
                <span className="font-mono text-slate-500">D4</span>
              </div>
              <div className="mt-0.5 flex items-baseline gap-1">
                <span
                  className={`text-lg font-mono font-semibold tabular-nums ${
                    sensors.brakeTempC > 65 ? 'text-rose-400' : 'text-emerald-300'
                  }`}
                >
                  {sensors.brakeTempC.toFixed(2)}
                </span>
                <span className="text-[10px] font-mono text-slate-400">°C</span>
              </div>
              <div className="text-[10px] font-mono tabular-nums text-slate-500">
                Ambient: 24.0 °C
              </div>
            </div>

            {/* Servo Position & Rotary Encoder */}
            <div className="bg-[#0B0F17] border border-slate-800 rounded p-2">
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span>Servo / Enc</span>
                <span className="font-mono text-slate-500">D18/D5</span>
              </div>
              <div className="mt-0.5 flex items-baseline gap-1">
                <span className="text-lg font-mono font-semibold tabular-nums text-slate-100">
                  {sensors.servoAngleDeg.toFixed(1)}
                </span>
                <span className="text-[10px] font-mono text-slate-400">deg</span>
              </div>
              <div className="text-[10px] font-mono tabular-nums text-slate-500">
                Counts: {sensors.encoderCounts} / 600
              </div>
            </div>
          </div>

          {/* Dynamics & Torque Balance Row */}
          <div className="bg-[#0B0F17] border border-slate-800 rounded p-2 grid grid-cols-3 gap-2 text-[10px] font-mono tabular-nums">
            <div>
              <div className="text-slate-500">Motor RPM</div>
              <div className="text-slate-200 font-semibold">{sensors.motorRpm.toFixed(1)}</div>
              <div className="text-slate-500">{physics.motorCurrentA.toFixed(2)} A</div>
            </div>
            <div>
              <div className="text-slate-500">T_motor / T_brk</div>
              <div className="text-cyan-300 font-semibold">
                {Math.abs(physics.motorTorqueNm).toFixed(2)} N·m
              </div>
              <div className="text-amber-300">
                {Math.abs(physics.brakeTorqueNm).toFixed(2)} N·m
              </div>
            </div>
            <div>
              <div className="text-slate-500">Resp. Latency</div>
              <div className="text-slate-200 font-semibold">
                {physics.responseLatencyMs.toFixed(0)} ms
              </div>
              <div className="text-slate-500">Gap {physics.padClearanceMm.toFixed(2)} mm</div>
            </div>
          </div>
        </div>

        {/* Motor Controls */}
        <div className="p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-200">
              12V DC Geared Motor Control
            </h3>
            <span className="text-[10px] font-mono text-slate-400 tabular-nums">
              PWM {physics.pwmMotorDutyPct.toFixed(0)}%
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onMotorToggle(true)}
              disabled={controls.emergencyStop || isMotorActive}
              className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded text-xs font-semibold border transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                isMotorActive
                  ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-300'
                  : 'bg-cyan-600 hover:bg-cyan-500 border-cyan-500 text-slate-950'
              }`}
            >
              <Play className="w-3.5 h-3.5" />
              Motor Start
            </button>
            <button
              onClick={() => onMotorToggle(false)}
              disabled={!controls.motorOn}
              className="flex items-center justify-center gap-1.5 py-2 px-3 rounded text-xs font-semibold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
            >
              <Square className="w-3.5 h-3.5" />
              Motor Stop
            </button>
          </div>

          {/* Target RPM Slider + Numeric Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Target Speed (RPM)</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={dimensions.maxMotorRpm}
                  step={10}
                  value={controls.targetRpm}
                  onChange={(e) =>
                    onTargetRpmChange(
                      Math.max(0, Math.min(dimensions.maxMotorRpm, Number(e.target.value) || 0))
                    )
                  }
                  className="w-16 bg-[#0B0F17] border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-xs tabular-nums text-cyan-300 focus:outline-none focus:border-cyan-500"
                />
                <span className="text-[11px] font-mono text-slate-500">RPM</span>
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={dimensions.maxMotorRpm}
              step={5}
              value={controls.targetRpm}
              onChange={(e) => onTargetRpmChange(Number(e.target.value))}
              className="w-full eng-slider"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-500">
              <span>0 RPM</span>
              <span>250 RPM</span>
              <span>{dimensions.maxMotorRpm} RPM</span>
            </div>
          </div>

          {/* Direction Selector */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-400 flex items-center gap-1.5">
              <ArrowLeftRight className="w-3.5 h-3.5 text-slate-500" />
              Direction
            </span>
            <div className="grid grid-cols-2 gap-1 p-0.5 bg-[#0B0F17] border border-slate-800 rounded">
              <button
                onClick={() => onDirectionChange(1)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                  controls.direction === 1
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                Forward
              </button>
              <button
                onClick={() => onDirectionChange(-1)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                  controls.direction === -1
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                Reverse
              </button>
            </div>
          </div>
        </div>

        {/* Brake Controls & Emergency Stop */}
        <div className="p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Disc className="w-3.5 h-3.5 text-amber-400" />
              Electromechanical Brake
            </h3>
            <span className="text-[10px] font-mono text-slate-400 tabular-nums">
              {physics.pwmServoPulseUs.toFixed(0)} μs
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onBrakeApply}
              disabled={controls.emergencyStop}
              className={`py-2 px-3 rounded text-xs font-semibold border transition-colors cursor-pointer disabled:opacity-45 ${
                controls.brakeApplied && !controls.emergencyStop
                  ? 'bg-amber-500 text-slate-950 border-amber-400'
                  : 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/50 text-amber-300'
              }`}
            >
              Brake Apply
            </button>
            <button
              onClick={onBrakeRelease}
              disabled={controls.emergencyStop}
              className={`py-2 px-3 rounded text-xs font-semibold border transition-colors cursor-pointer disabled:opacity-45 ${
                !controls.brakeApplied && !controls.emergencyStop
                  ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
              }`}
            >
              Brake Release
            </button>
          </div>

          {/* Braking Force Slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Braking Force Target</span>
              <span className="font-mono font-semibold tabular-nums text-amber-300">
                {controls.emergencyStop
                  ? `${dimensions.maxBrakingForceN.toFixed(1)} N (E-STOP)`
                  : `${controls.targetBrakeForceN.toFixed(1)} N`}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={dimensions.maxBrakingForceN}
              step={1}
              value={controls.targetBrakeForceN}
              onChange={(e) => onBrakeForceChange(Number(e.target.value))}
              className="w-full eng-slider eng-slider-amber"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-500 tabular-nums">
              <span>0 N</span>
              <span>Servo: {physics.servoAngleDeg.toFixed(1)}°</span>
              <span>{dimensions.maxBrakingForceN} N</span>
            </div>
          </div>

          {/* Emergency Stop Section */}
          <div className="pt-2 border-t border-slate-800/80 space-y-2">
            {!controls.emergencyStop ? (
              <button
                onClick={onEmergencyStop}
                className="w-full py-2.5 px-4 rounded bg-rose-600 hover:bg-rose-500 active:bg-rose-700 border border-rose-400/60 text-white font-semibold text-xs tracking-wide flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <OctagonAlert className="w-4 h-4" />
                EMERGENCY STOP
              </button>
            ) : (
              <div className="bg-rose-950/50 border border-rose-500/60 rounded p-2.5 space-y-2">
                <div className="flex items-center gap-2 text-rose-300 text-xs font-semibold">
                  <AlertOctagon className="w-4 h-4 shrink-0" />
                  <span>Emergency Stop Engaged — Drive Disabled</span>
                </div>
                <p className="text-[11px] text-rose-200/80 leading-snug">
                  BTS7960 enable pins pulled LOW; 50 N emergency clamp active. Reset E-Stop to
                  re-enable motor drive.
                </p>
                <button
                  onClick={onResetEmergencyStop}
                  className="w-full py-1.5 px-3 rounded bg-slate-900 hover:bg-slate-800 border border-rose-400/60 text-rose-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset Emergency Stop
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};
