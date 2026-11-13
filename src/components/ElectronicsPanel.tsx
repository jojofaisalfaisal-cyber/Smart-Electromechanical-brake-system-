import React, { useState } from 'react';
import { Cpu, Info, Zap } from 'lucide-react';
import { PhysicsState, SensorReadings, SimulationControls } from '../types/simulation';

interface ElectronicsPanelProps {
  controls: SimulationControls;
  physics: PhysicsState;
  sensors: SensorReadings;
}

type ElectronicModuleId =
  | 'psu_12v'
  | 'buck_5v'
  | 'bts7960'
  | 'esp32'
  | 'dc_motor'
  | 'servo'
  | 'hall'
  | 'hx711'
  | 'encoder'
  | 'ds18b20';

interface ModuleSpec {
  id: ElectronicModuleId;
  title: string;
  subtitle: string;
  voltage: string;
  pins: string[];
  notes: string;
}

const MODULE_SPECS: Record<ElectronicModuleId, ModuleSpec> = {
  psu_12v: {
    id: 'psu_12v',
    title: '12V DC Power Supply',
    subtitle: 'Industrial SMPS (12V / 10A)',
    voltage: '12.0 V DC Output',
    pins: ['+12V -> BTS7960 B+', '+12V -> Buck Converter IN+', 'COM -> Common GND Bus'],
    notes:
      'Supplies high-current 12V power exclusively to the BTS7960 H-bridge and the 5V buck converter input. Never power the ESP32 directly from the 12V motor rail.',
  },
  buck_5v: {
    id: 'buck_5v',
    title: '12V to 5V Buck Converter',
    subtitle: 'LM2596 / Step-Down Regulator',
    voltage: '12V In -> 5.0V Regulated Out',
    pins: ['IN+ / IN- <- 12V PSU', 'OUT+ -> 5V Logic & Servo Bus', 'OUT- -> Common GND'],
    notes:
      'Isolates sensitive 5V logic and sensors from motor inductive spikes while delivering steady current for the MG996R/DS3218 servo and ESP32 VIN.',
  },
  bts7960: {
    id: 'bts7960',
    title: 'BTS7960 Motor Driver',
    subtitle: '43A High-Current H-Bridge Module',
    voltage: '12V Motor Stage · 5V Logic',
    pins: ['RPWM -> ESP32 D26', 'LPWM -> ESP32 D27', 'R_EN -> ESP32 D14', 'L_EN -> ESP32 D12', 'M+/M- -> 12V Motor'],
    notes:
      'Drives the 12V geared motor bidirectionally using complementary PWM channels. Emergency Stop pulls R_EN and L_EN LOW immediately to cut drive torque.',
  },
  esp32: {
    id: 'esp32',
    title: 'ESP32 Development Board',
    subtitle: 'Dual-Core MCU (Wi-Fi / BLE Controller)',
    voltage: '5V VIN (3.3V Internal Logic)',
    pins: [
      'D26/D27: Motor RPWM/LPWM',
      'D14/D12: Driver R_EN/L_EN',
      'D15: Servo 50Hz PWM',
      'D34: Hall Sensor Input',
      'D23/D19: HX711 DT/SCK',
      'D18/D5: Encoder A/B',
      'D4: DS18B20 1-Wire',
    ],
    notes:
      'Central simulated controller aggregating feedback from all 4 sensors, executing speed/brake control loops, and exposing telemetry to the operator dashboard.',
  },
  dc_motor: {
    id: 'dc_motor',
    title: '12V DC Geared Motor',
    subtitle: '~500 RPM Planetary Geared Drive',
    voltage: '0–12V PWM Driven',
    pins: ['M+ <- BTS7960 Out A', 'M- <- BTS7960 Out B'],
    notes:
      'Mechanically coupled to the wheel/disc shaft. Current draw increases dynamically as brake clamping torque opposes motor rotation.',
  },
  servo: {
    id: 'servo',
    title: 'Servo Motor (MG996R / DS3218)',
    subtitle: 'High-Torque Brake Actuator',
    voltage: '5.0V Power · 50 Hz PWM',
    pins: ['VCC <- 5V Buck Rail', 'GND <- Common GND', 'SIG <- ESP32 D15'],
    notes:
      'Receives 1000–2000 μs PWM pulses on D15 to rotate 0°–90°, pulling the mechanical pushrod linkage and clamping the caliper brake pads.',
  },
  hall: {
    id: 'hall',
    title: 'Hall Effect Sensor',
    subtitle: 'A3144 Magnetic Speed Pickup',
    voltage: '5.0V · Digital Pulse Out',
    pins: ['VCC <- 5V Rail', 'GND <- Common GND', 'OUT -> ESP32 D34'],
    notes:
      'Detects 4 neodymium magnets embedded in the rotor hub to measure wheel angular velocity and instantaneous RPM.',
  },
  hx711: {
    id: 'hx711',
    title: 'Load Cell + HX711 Amplifier',
    subtitle: '24-Bit Wheatstone Bridge ADC',
    voltage: '5.0V · Serial DT/SCK',
    pins: ['VCC <- 5V Rail', 'GND <- Common GND', 'DT -> ESP32 D23', 'SCK -> ESP32 D19'],
    notes:
      'Measures mechanical clamping reaction force (0–50 N) from the shear-beam load cell and transmits 24-bit digital counts to the ESP32.',
  },
  encoder: {
    id: 'encoder',
    title: 'Incremental Rotary Encoder',
    subtitle: '600 PPR Quadrature Position Sensor',
    voltage: '5.0V · Quadrature A/B',
    pins: ['VCC <- 5V Rail', 'GND <- Common GND', 'CHA -> ESP32 D18', 'CHB -> ESP32 D5'],
    notes:
      'Monitors exact angular position of the brake actuator shaft in degrees and quadrature counts for closed-loop verification.',
  },
  ds18b20: {
    id: 'ds18b20',
    title: 'DS18B20 Temperature Sensor',
    subtitle: '1-Wire Stainless Thermal Probe',
    voltage: '5.0V · 1-Wire Data (4.7kΩ Pull-up)',
    pins: ['VDD <- 5V Rail', 'GND <- Common GND', 'DQ -> ESP32 D4'],
    notes:
      'Positioned 2 mm from the brake disc friction track to monitor temperature accumulation during braking and cooling during release.',
  },
};

export const ElectronicsPanel: React.FC<ElectronicsPanelProps> = ({
  controls,
  physics,
  sensors,
}) => {
  const [selectedMod, setSelectedMod] = useState<ElectronicModuleId>('esp32');
  const spec = MODULE_SPECS[selectedMod];

  const motorEnabled = controls.motorOn && !controls.emergencyStop;
  const rpwmActive = motorEnabled && controls.direction === 1 && physics.pwmMotorDutyPct > 0.5;
  const lpwmActive = motorEnabled && controls.direction === -1 && physics.pwmMotorDutyPct > 0.5;

  const boxStyle = (id: ElectronicModuleId) =>
    selectedMod === id
      ? 'stroke-cyan-400 fill-[#152033] stroke-2'
      : 'stroke-slate-700 fill-[#111827] stroke-[1.2] hover:stroke-slate-500';

  return (
    <div className="flex-1 h-full bg-[#0B0F17] flex flex-col overflow-hidden">
      {/* Architecture Disclaimer & Wire Legend */}
      <div className="px-4 py-2.5 bg-[#101622] border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-300">
          <Cpu className="w-4 h-4 text-cyan-400 shrink-0" />
          <span className="font-semibold">ESP32 Electrical & Signal Architecture</span>
          <span className="text-slate-500">·</span>
          <span className="text-[11px] text-slate-400">
            Simulated architectural schematic (no physical ESP32 hardware attached)
          </span>
        </div>

        {/* Color-Coded Wire Legend */}
        <div className="flex items-center gap-4 text-[11px] font-mono">
          <span className="inline-flex items-center gap-1.5 text-rose-400">
            <span className="w-4 h-0.5 bg-rose-500 inline-block" /> 12V Power
          </span>
          <span className="inline-flex items-center gap-1.5 text-amber-400">
            <span className="w-4 h-0.5 bg-amber-500 inline-block" /> 5V Power
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-400">
            <span className="w-4 h-0.5 bg-slate-500 inline-block" /> Common GND
          </span>
          <span className="inline-flex items-center gap-1.5 text-cyan-400">
            <span className="w-4 h-0.5 bg-cyan-400 inline-block" /> PWM Signals
          </span>
          <span className="inline-flex items-center gap-1.5 text-emerald-400">
            <span className="w-4 h-0.5 bg-emerald-400 inline-block" /> Sensor Signals
          </span>
        </div>
      </div>

      {/* Interactive SVG Schematic + Module Inspector */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <div className="flex-1 p-4 overflow-auto flex items-center justify-center">
          <svg
            viewBox="0 0 1080 560"
            className="w-full max-w-[1060px] h-auto select-none bg-[#0D131F] border border-slate-800/90 rounded-lg"
          >
            {/* Subtle schematic grid */}
            <defs>
              <pattern id="sch-grid" width="24" height="24" patternUnits="userSpaceOnUse">
                <path
                  d="M 24 0 L 0 0 0 24"
                  fill="none"
                  stroke="rgba(148,163,184,0.06)"
                  strokeWidth="1"
                />
              </pattern>
            </defs>
            <rect width="1080" height="560" fill="url(#sch-grid)" />

            {/* ================= POWER WIRES (12V RED / 5V AMBER / GND SLATE) ================= */}
            {/* 12V PSU -> BTS7960 B+/B- */}
            <path d="M 190 120 L 265 120" stroke="#ef4444" strokeWidth="3" fill="none" />
            <path d="M 190 140 L 265 140" stroke="#64748b" strokeWidth="2.5" fill="none" />

            {/* 12V PSU -> Buck Converter */}
            <path d="M 120 185 L 120 270" stroke="#ef4444" strokeWidth="3" fill="none" />
            <path d="M 140 185 L 140 270" stroke="#64748b" strokeWidth="2.5" fill="none" />

            {/* BTS7960 -> 12V DC Geared Motor */}
            <path
              d="M 325 85 L 325 45 L 430 45"
              stroke={motorEnabled ? '#ef4444' : '#7f1d1d'}
              strokeWidth="3.2"
              fill="none"
            />
            <path
              d="M 355 85 L 355 62 L 430 62"
              stroke={motorEnabled ? '#94a3b8' : '#475569'}
              strokeWidth="2.8"
              fill="none"
            />

            {/* Buck Converter 5V Out -> Central 5V & GND Bus */}
            <path d="M 190 310 L 420 310 L 420 280 L 455 280" stroke="#f59e0b" strokeWidth="2.5" fill="none" />
            <path d="M 190 330 L 405 330 L 405 300 L 455 300" stroke="#64748b" strokeWidth="2.2" fill="none" />

            {/* 5V + GND distribution bus to Right Sensors & Servo */}
            <path d="M 655 150 L 710 150 L 710 510" stroke="#f59e0b" strokeWidth="2" fill="none" />
            <path d="M 655 168 L 695 168 L 695 524" stroke="#64748b" strokeWidth="1.8" fill="none" />

            {/* Branch 5V/GND to each sensor & servo */}
            {[62, 162, 268, 375, 480].map((yPos, idx) => (
              <g key={idx}>
                <path d={`M 710 ${yPos} L 790 ${yPos}`} stroke="#f59e0b" strokeWidth="1.8" fill="none" />
                <path d={`M 695 ${yPos + 14} L 790 ${yPos + 14}`} stroke="#64748b" strokeWidth="1.6" fill="none" />
              </g>
            ))}

            {/* ================= PWM SIGNALS (ESP32 <-> BTS7960 & SERVO) ================= */}
            {/* RPWM D26, LPWM D27, R_EN D14, L_EN D12 */}
            <path
              d="M 455 190 L 385 190 L 385 165 L 385 165"
              stroke={rpwmActive ? '#22d3ee' : '#164e63'}
              strokeWidth="2"
              fill="none"
            />
            <path d="M 385 165 L 385 145 L 365 145" stroke={rpwmActive ? '#22d3ee' : '#164e63'} strokeWidth="2" fill="none" />
            <path d="M 455 208 L 365 208 L 365 165" stroke={lpwmActive ? '#22d3ee' : '#164e63'} strokeWidth="2" fill="none" />
            <path d="M 455 226 L 340 226 L 340 185" stroke={motorEnabled ? '#22d3ee' : '#f43f5e'} strokeWidth="1.8" fill="none" />
            <path d="M 455 244 L 320 244 L 320 185" stroke={motorEnabled ? '#22d3ee' : '#f43f5e'} strokeWidth="1.8" fill="none" />

            {/* Servo PWM D15 */}
            <path
              d="M 655 460 L 735 460 L 735 508 L 790 508"
              stroke={physics.servoAngleDeg > 1 ? '#22d3ee' : '#0891b2'}
              strokeWidth="2.2"
              fill="none"
            />

            {/* ================= SENSOR SIGNALS (ESP32 <-> SENSORS) ================= */}
            {/* Hall D34 */}
            <path
              d="M 655 210 L 755 210 L 755 90 L 790 90"
              stroke={sensors.hallSignalHigh ? '#34d399' : '#10b981'}
              strokeWidth={sensors.hallSignalHigh ? '2.8' : '1.8'}
              fill="none"
            />
            {/* HX711 DT D23, SCK D19 */}
            <path d="M 655 250 L 765 250 L 765 190 L 790 190" stroke="#10b981" strokeWidth="1.8" fill="none" />
            <path d="M 655 268 L 775 268 L 775 206 L 790 206" stroke="#10b981" strokeWidth="1.8" fill="none" />
            {/* Rotary Encoder A D18, B D5 */}
            <path d="M 655 315 L 790 315 L 790 296" stroke="#10b981" strokeWidth="1.8" fill="none" />
            <path d="M 655 333 L 765 333 L 765 312 L 790 312" stroke="#10b981" strokeWidth="1.8" fill="none" />
            {/* DS18B20 D4 */}
            <path d="M 655 395 L 750 395 L 750 403 L 790 403" stroke="#10b981" strokeWidth="1.8" fill="none" />

            {/* ================= COMPONENT BLOCKS ================= */}
            {/* 1. 12V Power Supply */}
            <g className="cursor-pointer" onClick={() => setSelectedMod('psu_12v')}>
              <rect x="30" y="75" width="160" height="110" rx="6" className={boxStyle('psu_12v')} />
              <text x="110" y="102" textAnchor="middle" fill="#f8fafc" fontSize="13" fontWeight="600">
                12V DC Power Supply
              </text>
              <text x="110" y="122" textAnchor="middle" fill="#94a3b8" fontSize="10.5" fontFamily="IBM Plex Mono">
                SMPS 12.0 V / 10 A
              </text>
              <text x="178" y="124" textAnchor="end" fill="#f87171" fontSize="10" fontFamily="IBM Plex Mono">+12V</text>
              <text x="178" y="144" textAnchor="end" fill="#94a3b8" fontSize="10" fontFamily="IBM Plex Mono">GND</text>
            </g>

            {/* 2. Buck Converter 12V -> 5V */}
            <g className="cursor-pointer" onClick={() => setSelectedMod('buck_5v')}>
              <rect x="30" y="270" width="160" height="90" rx="6" className={boxStyle('buck_5v')} />
              <text x="110" y="298" textAnchor="middle" fill="#f8fafc" fontSize="12.5" fontWeight="600">
                Buck Converter
              </text>
              <text x="110" y="318" textAnchor="middle" fill="#fbbf24" fontSize="11" fontFamily="IBM Plex Mono">
                12V DC → 5.0V DC
              </text>
              <text x="110" y="338" textAnchor="middle" fill="#94a3b8" fontSize="10" fontFamily="IBM Plex Mono">
                Logic &amp; Servo Rail
              </text>
            </g>

            {/* 3. BTS7960 Motor Driver */}
            <g className="cursor-pointer" onClick={() => setSelectedMod('bts7960')}>
              <rect x="265" y="85" width="145" height="100" rx="6" className={boxStyle('bts7960')} />
              <text x="337" y="110" textAnchor="middle" fill="#f8fafc" fontSize="12.5" fontWeight="600">
                BTS7960 Driver
              </text>
              <text x="337" y="128" textAnchor="middle" fill="#38bdf8" fontSize="10" fontFamily="IBM Plex Mono">
                PWM: {physics.pwmMotorDutyPct.toFixed(0)}% · {physics.motorCurrentA.toFixed(1)}A
              </text>
              <text x="337" y="146" textAnchor="middle" fill={motorEnabled ? '#34d399' : '#fb7185'} fontSize="10" fontFamily="IBM Plex Mono">
                EN: {motorEnabled ? 'HIGH (ACTIVE)' : 'LOW (DISABLED)'}
              </text>
              <text x="337" y="166" textAnchor="middle" fill="#94a3b8" fontSize="9.5" fontFamily="IBM Plex Mono">
                RPWM / LPWM / R_EN / L_EN
              </text>
            </g>

            {/* 4. 12V DC Geared Motor */}
            <g className="cursor-pointer" onClick={() => setSelectedMod('dc_motor')}>
              <rect x="430" y="20" width="225" height="62" rx="6" className={boxStyle('dc_motor')} />
              <text x="542" y="43" textAnchor="middle" fill="#f8fafc" fontSize="12.5" fontWeight="600">
                12V DC Geared Motor
              </text>
              <text x="542" y="63" textAnchor="middle" fill="#38bdf8" fontSize="10.5" fontFamily="IBM Plex Mono">
                {sensors.motorRpm.toFixed(1)} RPM · {controls.direction === 1 ? 'FWD' : 'REV'} · {Math.abs(physics.motorTorqueNm).toFixed(2)} N·m
              </text>
            </g>

            {/* 5. ESP32 Main Controller */}
            <g className="cursor-pointer" onClick={() => setSelectedMod('esp32')}>
              <rect x="455" y="120" width="200" height="370" rx="8" className={boxStyle('esp32')} />
              <rect x="495" y="132" width="120" height="30" rx="3" fill="#1e293b" stroke="#334155" />
              <text x="555" y="151" textAnchor="middle" fill="#94a3b8" fontSize="10" fontFamily="IBM Plex Mono">
                Wi-Fi / BLE ANTENNA
              </text>
              <text x="555" y="184" textAnchor="middle" fill="#f8fafc" fontSize="15" fontWeight="700">
                ESP32 Controller
              </text>
              <text x="555" y="202" textAnchor="middle" fill="#64748b" fontSize="10" fontFamily="IBM Plex Mono">
                Main Control Unit
              </text>

              {/* Left Pin Labels */}
              <text x="465" y="194" fill="#22d3ee" fontSize="10" fontFamily="IBM Plex Mono">D26 (RPWM)</text>
              <text x="465" y="212" fill="#22d3ee" fontSize="10" fontFamily="IBM Plex Mono">D27 (LPWM)</text>
              <text x="465" y="230" fill="#22d3ee" fontSize="10" fontFamily="IBM Plex Mono">D14 (R_EN)</text>
              <text x="465" y="248" fill="#22d3ee" fontSize="10" fontFamily="IBM Plex Mono">D12 (L_EN)</text>
              <text x="465" y="284" fill="#fbbf24" fontSize="10" fontFamily="IBM Plex Mono">5V VIN</text>
              <text x="465" y="304" fill="#94a3b8" fontSize="10" fontFamily="IBM Plex Mono">GND</text>

              {/* Right Pin Labels */}
              <text x="645" y="154" textAnchor="end" fill="#fbbf24" fontSize="10" fontFamily="IBM Plex Mono">5V OUT</text>
              <text x="645" y="172" textAnchor="end" fill="#94a3b8" fontSize="10" fontFamily="IBM Plex Mono">GND</text>
              <text x="645" y="214" textAnchor="end" fill="#34d399" fontSize="10" fontFamily="IBM Plex Mono">D34 (HALL)</text>
              <text x="645" y="254" textAnchor="end" fill="#34d399" fontSize="10" fontFamily="IBM Plex Mono">D23 (HX_DT)</text>
              <text x="645" y="272" textAnchor="end" fill="#34d399" fontSize="10" fontFamily="IBM Plex Mono">D19 (HX_SCK)</text>
              <text x="645" y="319" textAnchor="end" fill="#34d399" fontSize="10" fontFamily="IBM Plex Mono">D18 (ENC_A)</text>
              <text x="645" y="337" textAnchor="end" fill="#34d399" fontSize="10" fontFamily="IBM Plex Mono">D5  (ENC_B)</text>
              <text x="645" y="399" textAnchor="end" fill="#34d399" fontSize="10" fontFamily="IBM Plex Mono">D4  (DS18B20)</text>
              <text x="645" y="464" textAnchor="end" fill="#22d3ee" fontSize="10" fontFamily="IBM Plex Mono">D15 (SERVO)</text>
            </g>

            {/* 6. Hall Effect Sensor */}
            <g className="cursor-pointer" onClick={() => setSelectedMod('hall')}>
              <rect x="790" y="38" width="255" height="72" rx="6" className={boxStyle('hall')} />
              <text x="804" y="60" fill="#f8fafc" fontSize="12.5" fontWeight="600">Hall Effect Sensor</text>
              <text x="804" y="78" fill="#34d399" fontSize="10.5" fontFamily="IBM Plex Mono">
                {sensors.wheelRpm.toFixed(1)} RPM · Pulses: {sensors.hallPulseCount}
              </text>
              <text x="804" y="96" fill="#94a3b8" fontSize="9.5" fontFamily="IBM Plex Mono">5V / GND / OUT → D34</text>
            </g>

            {/* 7. Load Cell + HX711 */}
            <g className="cursor-pointer" onClick={() => setSelectedMod('hx711')}>
              <rect x="790" y="138" width="255" height="82" rx="6" className={boxStyle('hx711')} />
              <text x="804" y="160" fill="#f8fafc" fontSize="12.5" fontWeight="600">Load Cell + HX711</text>
              <text x="804" y="178" fill="#fbbf24" fontSize="10.5" fontFamily="IBM Plex Mono">
                {sensors.brakeForceN.toFixed(2)} N ({sensors.hx711RawCounts.toLocaleString()} ADC)
              </text>
              <text x="804" y="198" fill="#94a3b8" fontSize="9.5" fontFamily="IBM Plex Mono">5V / GND / DT→D23 / SCK→D19</text>
            </g>

            {/* 8. Rotary Encoder */}
            <g className="cursor-pointer" onClick={() => setSelectedMod('encoder')}>
              <rect x="790" y="244" width="255" height="82" rx="6" className={boxStyle('encoder')} />
              <text x="804" y="266" fill="#f8fafc" fontSize="12.5" fontWeight="600">Rotary Encoder (600 PPR)</text>
              <text x="804" y="284" fill="#34d399" fontSize="10.5" fontFamily="IBM Plex Mono">
                {sensors.servoAngleDeg.toFixed(1)}° · {sensors.encoderCounts} counts
              </text>
              <text x="804" y="304" fill="#94a3b8" fontSize="9.5" fontFamily="IBM Plex Mono">5V / GND / A→D18 / B→D5</text>
            </g>

            {/* 9. DS18B20 Temperature Sensor */}
            <g className="cursor-pointer" onClick={() => setSelectedMod('ds18b20')}>
              <rect x="790" y="350" width="255" height="74" rx="6" className={boxStyle('ds18b20')} />
              <text x="804" y="372" fill="#f8fafc" fontSize="12.5" fontWeight="600">DS18B20 Temp Sensor</text>
              <text x="804" y="390" fill="#34d399" fontSize="10.5" fontFamily="IBM Plex Mono">
                {sensors.brakeTempC.toFixed(2)} °C (1-Wire Bus)
              </text>
              <text x="804" y="409" fill="#94a3b8" fontSize="9.5" fontFamily="IBM Plex Mono">5V / GND / DQ → D4 (4.7kΩ pullup)</text>
            </g>

            {/* 10. Servo Motor */}
            <g className="cursor-pointer" onClick={() => setSelectedMod('servo')}>
              <rect x="790" y="454" width="255" height="80" rx="6" className={boxStyle('servo')} />
              <text x="804" y="476" fill="#f8fafc" fontSize="12.5" fontWeight="600">
                Servo Motor (MG996R / DS3218)
              </text>
              <text x="804" y="494" fill="#22d3ee" fontSize="10.5" fontFamily="IBM Plex Mono">
                {physics.servoAngleDeg.toFixed(1)}° · PWM: {physics.pwmServoPulseUs.toFixed(0)} μs
              </text>
              <text x="804" y="514" fill="#94a3b8" fontSize="9.5" fontFamily="IBM Plex Mono">5V / GND / SIG ← D15</text>
            </g>
          </svg>
        </div>

        {/* Right Module Datasheet Sidebar */}
        <div className="w-[300px] shrink-0 bg-[#101622] border-l border-slate-800 p-4 flex flex-col gap-3 overflow-y-auto eng-scroll">
          <div className="flex items-center gap-2 text-cyan-400">
            <Zap className="w-4 h-4" />
            <h3 className="text-xs font-semibold text-slate-100">Module Pinout &amp; Notes</h3>
          </div>

          <div className="bg-[#0B0F17] border border-slate-800 rounded p-3 space-y-2.5">
            <div>
              <div className="text-sm font-semibold text-slate-100">{spec.title}</div>
              <div className="text-xs text-slate-400">{spec.subtitle}</div>
            </div>

            <div className="text-xs font-mono text-amber-300 border-t border-slate-800 pt-2">
              {spec.voltage}
            </div>

            <div className="space-y-1 border-t border-slate-800 pt-2">
              <div className="text-[11px] font-semibold text-slate-400">Pin Connections</div>
              {spec.pins.map((p, i) => (
                <div key={i} className="text-[11px] font-mono text-emerald-300">
                  {p}
                </div>
              ))}
            </div>

            <p className="text-xs text-slate-400 leading-relaxed border-t border-slate-800 pt-2">
              {spec.notes}
            </p>
          </div>

          <div className="bg-[#0B0F17] border border-slate-800 rounded p-3 space-y-1.5 text-[11px] text-slate-400">
            <div className="flex items-center gap-1.5 text-slate-200 font-semibold">
              <Info className="w-3.5 h-3.5 text-cyan-400" />
              Grounding &amp; Power Rule
            </div>
            <p className="leading-relaxed">
              All GNDs are tied to a single common ground reference across the 12V SMPS, 5V Buck,
              BTS7960, ESP32, and all 4 sensors. Motor power comes exclusively from the 12V rail.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
