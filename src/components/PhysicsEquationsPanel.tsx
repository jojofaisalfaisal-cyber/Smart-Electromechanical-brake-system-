import React from 'react';
import { Calculator } from 'lucide-react';
import {
  EngineeringDimensions,
  PhysicsParameters,
  PhysicsState,
} from '../types/simulation';

interface PhysicsEquationsPanelProps {
  dimensions: EngineeringDimensions;
  params: PhysicsParameters;
  physics: PhysicsState;
}

export const PhysicsEquationsPanel: React.FC<PhysicsEquationsPanelProps> = ({
  dimensions,
  params,
  physics,
}) => {
  return (
    <div className="flex-1 h-full bg-[#0B0F17] overflow-y-auto eng-scroll p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-2.5 border-b border-slate-800 pb-3">
          <Calculator className="w-5 h-5 text-cyan-400" />
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              Rotational Dynamics, Friction &amp; Thermal Mathematical Model
            </h2>
            <p className="text-xs text-slate-400">
              All equations below execute at 6× sub-stepped fixed integration per frame inside the
              browser simulation engine.
            </p>
          </div>
        </div>

        {/* Core Equations Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[#101622] border border-slate-800 rounded-lg p-4 space-y-2">
            <h3 className="text-xs font-semibold text-cyan-300">
              1. Rotational Equation of Motion
            </h3>
            <div className="bg-[#0B0F17] border border-slate-800 rounded p-2.5 font-mono text-sm text-slate-100">
              J · (dω / dt) = T_motor − T_brake − T_loss
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1 text-xs font-mono tabular-nums text-slate-300">
              <div>J_total = {params.totalInertiaKgM2.toFixed(5)} kg·m²</div>
              <div>ω = {physics.omegaRadS.toFixed(2)} rad/s</div>
              <div>T_motor = {physics.motorTorqueNm.toFixed(3)} N·m</div>
              <div>T_brake = {physics.brakeTorqueNm.toFixed(3)} N·m</div>
              <div>T_loss = {physics.lossTorqueNm.toFixed(3)} N·m</div>
              <div>T_net = {physics.netTorqueNm.toFixed(3)} N·m</div>
            </div>
          </div>

          <div className="bg-[#101622] border border-slate-800 rounded-lg p-4 space-y-2">
            <h3 className="text-xs font-semibold text-amber-300">
              2. Dual-Pad Disc Friction Torque
            </h3>
            <div className="bg-[#0B0F17] border border-slate-800 rounded p-2.5 font-mono text-sm text-slate-100">
              T_brake = 2 · μ · F_N · R_eff
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1 text-xs font-mono tabular-nums text-slate-300">
              <div>μ_kinetic = {params.frictionCoeffKinetic.toFixed(2)}</div>
              <div>μ_static = {params.frictionCoeffStatic.toFixed(2)}</div>
              <div>F_N = {physics.actualBrakeForceN.toFixed(2)} N</div>
              <div>R_eff = {(dimensions.effectiveBrakeRadiusCm / 100).toFixed(3)} m</div>
              <div>Pad Gap = {physics.padClearanceMm.toFixed(2)} mm</div>
              <div>Static Lock = {physics.padLocked ? 'ENGAGED' : 'FREE'}</div>
            </div>
          </div>

          <div className="bg-[#101622] border border-slate-800 rounded-lg p-4 space-y-2">
            <h3 className="text-xs font-semibold text-emerald-300">
              3. Disc Thermal Accumulation &amp; Cooling
            </h3>
            <div className="bg-[#0B0F17] border border-slate-800 rounded p-2.5 font-mono text-sm text-slate-100">
              C_th · (dT / dt) = |T_brake · ω| − h·A·(T − T_amb)
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1 text-xs font-mono tabular-nums text-slate-300">
              <div>C_th = {params.discThermalMassJPerC.toFixed(0)} J/°C</div>
              <div>h·A = {params.coolingCoeffWPerC.toFixed(2)} W/°C</div>
              <div>T_disc = {physics.discTempC.toFixed(2)} °C</div>
              <div>T_probe = {physics.probeTempC.toFixed(2)} °C</div>
              <div>P_heat = {Math.abs(physics.brakeTorqueNm * physics.omegaRadS).toFixed(1)} W</div>
              <div>T_amb = {params.ambientTempC.toFixed(1)} °C</div>
            </div>
          </div>

          <div className="bg-[#101622] border border-slate-800 rounded-lg p-4 space-y-2">
            <h3 className="text-xs font-semibold text-slate-200">
              4. Assumed Physical &amp; Actuator Parameters
            </h3>
            <div className="space-y-1 text-xs font-mono tabular-nums text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-400">Wheel Mass (scaled):</span>
                <span>{params.wheelMassKg.toFixed(2)} kg</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Disc Rotor Mass:</span>
                <span>{params.discMassKg.toFixed(2)} kg</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">DC Motor Stall Torque:</span>
                <span>{params.motorMaxTorqueNm.toFixed(2)} N·m</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Servo Slew Rate:</span>
                <span>{params.servoMaxSpeedDegPerS} °/s (Contact @ 15°)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Encoder Resolution:</span>
                <span>600 PPR (2400 counts/rev)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Hall Triggers:</span>
                <span>4 Neodymium Magnets / rev</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
