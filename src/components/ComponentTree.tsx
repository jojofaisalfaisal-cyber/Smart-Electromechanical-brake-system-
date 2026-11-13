import React from 'react';
import {
  Box,
  Compass,
  Eye,
  EyeOff,
  Ruler,
  Sliders,
} from 'lucide-react';
import { COMPONENT_CATALOG, COMPONENT_LIST } from '../data/componentsCatalog';
import {
  ComponentId,
  EngineeringDimensions,
  MeasurementResult,
} from '../types/simulation';

interface ComponentTreeProps {
  selectedId: ComponentId | null;
  visibility: Record<ComponentId, boolean>;
  measureMode: boolean;
  measurePair: [ComponentId | null, ComponentId | null];
  measurement: MeasurementResult | null;
  dimensions: EngineeringDimensions;
  frictionCoeff: number;
  onSelect: (id: ComponentId) => void;
  onFocus: (id: ComponentId) => void;
  onToggleVisibility: (id: ComponentId) => void;
  onShowAll: () => void;
  onToggleMeasureMode: () => void;
  onClearMeasure: () => void;
  onUpdateDimensions: (patch: Partial<EngineeringDimensions>) => void;
  onUpdateFriction: (mu: number) => void;
}

export const ComponentTree: React.FC<ComponentTreeProps> = ({
  selectedId,
  visibility,
  measureMode,
  measurePair,
  measurement,
  dimensions,
  frictionCoeff,
  onSelect,
  onFocus,
  onToggleVisibility,
  onShowAll,
  onToggleMeasureMode,
  onClearMeasure,
  onUpdateDimensions,
  onUpdateFriction,
}) => {
  const selectedMeta = selectedId ? COMPONENT_CATALOG[selectedId] : null;
  const hiddenCount = Object.values(visibility).filter((v) => !v).length;

  return (
    <aside className="w-[276px] shrink-0 bg-[#101622] border-r border-slate-800/90 flex flex-col h-full overflow-hidden">
      {/* Assembly Tree Header */}
      <div className="px-3.5 py-2.5 border-b border-slate-800/90 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Box className="w-4 h-4 text-cyan-400" />
          <h2 className="text-xs font-semibold tracking-wide text-slate-200">
            Assembly Hierarchy
          </h2>
        </div>
        {hiddenCount > 0 && (
          <button
            onClick={onShowAll}
            className="text-[11px] font-medium text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
          >
            Show All ({hiddenCount})
          </button>
        )}
      </div>

      {/* Scrollable Tree + Inspector + Tools */}
      <div className="flex-1 overflow-y-auto eng-scroll divide-y divide-slate-800/80">
        {/* Component Tree List */}
        <div className="p-2 space-y-0.5">
          {COMPONENT_LIST.map((comp) => {
            const isSelected = selectedId === comp.id;
            const isVisible = visibility[comp.id];
            const isMeasureA = measurePair[0] === comp.id;
            const isMeasureB = measurePair[1] === comp.id;

            return (
              <div
                key={comp.id}
                className={`group flex items-center gap-1.5 px-2 py-1.5 rounded border transition-colors ${
                  isSelected
                    ? 'bg-cyan-500/12 border-cyan-500/40 text-slate-100'
                    : isMeasureA || isMeasureB
                    ? 'bg-amber-500/12 border-amber-500/40 text-amber-100'
                    : 'bg-transparent border-transparent hover:bg-slate-800/60 text-slate-300'
                }`}
              >
                <button
                  onClick={() => onSelect(comp.id)}
                  onDoubleClick={() => onFocus(comp.id)}
                  title="Click to select · Double-click to focus camera"
                  className="flex-1 min-w-0 text-left flex items-center gap-2 cursor-pointer"
                >
                  <span className="font-mono text-[10px] text-slate-500 shrink-0 w-11">
                    {comp.code}
                  </span>
                  <span className="text-xs font-medium truncate">
                    {comp.name}
                  </span>
                </button>
                <button
                  onClick={() => onToggleVisibility(comp.id)}
                  aria-label={`Toggle ${comp.name} visibility`}
                  title={isVisible ? 'Hide component' : 'Show component'}
                  className={`p-1 rounded transition-colors cursor-pointer ${
                    isVisible
                      ? 'text-slate-400 hover:text-slate-100'
                      : 'text-slate-600 hover:text-slate-300'
                  }`}
                >
                  {isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>
              </div>
            );
          })}
        </div>

        {/* Selected Component Engineering Inspector */}
        <div className="p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-cyan-400" />
              <h3 className="text-xs font-semibold text-slate-200">
                Component Inspector
              </h3>
            </div>
            {selectedMeta && (
              <button
                onClick={() => onFocus(selectedMeta.id)}
                className="text-[11px] font-medium text-cyan-400 hover:text-cyan-300 cursor-pointer"
              >
                Focus Camera
              </button>
            )}
          </div>

          {selectedMeta ? (
            <div className="bg-[#0B0F17] border border-slate-800 rounded p-2.5 space-y-1.5 text-xs">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold text-slate-100 leading-snug">
                  {selectedMeta.name}
                </span>
                <span className="font-mono text-[10px] text-cyan-400 shrink-0">
                  {selectedMeta.code}
                </span>
              </div>
              <div className="text-[11px] text-slate-400">
                {selectedMeta.category} · {selectedMeta.material}
              </div>
              <div className="pt-1 border-t border-slate-800/80 space-y-1 text-[11px]">
                <div>
                  <span className="text-slate-500">Dimensions: </span>
                  <span className="text-slate-200 font-mono">{selectedMeta.dimensionsSummary}</span>
                </div>
                <div>
                  <span className="text-slate-500">Interface: </span>
                  <span className="text-emerald-400 font-mono">
                    {selectedMeta.electricalConnection}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed pt-1">
                {selectedMeta.description}
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Click any 3D component or item above to inspect material specifications, dimensions,
              and electrical pins. Double-click to focus camera.
            </p>
          )}
        </div>

        {/* CAD Distance Measurement Tool */}
        <div className="p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Ruler className="w-3.5 h-3.5 text-amber-400" />
              <h3 className="text-xs font-semibold text-slate-200">
                Measurement Mode
              </h3>
            </div>
            <button
              onClick={onToggleMeasureMode}
              className={`px-2 py-0.5 text-[11px] font-medium rounded border transition-colors cursor-pointer ${
                measureMode
                  ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
                  : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {measureMode ? 'Active' : 'Enable'}
            </button>
          </div>

          {measureMode && (
            <div className="bg-[#0B0F17] border border-amber-500/30 rounded p-2.5 space-y-2 text-[11px]">
              <div className="flex items-center justify-between text-slate-300">
                <span>
                  A: {measurePair[0] ? COMPONENT_CATALOG[measurePair[0]].code : 'Click part'}
                </span>
                <span>
                  B: {measurePair[1] ? COMPONENT_CATALOG[measurePair[1]].code : 'Click part'}
                </span>
                {(measurePair[0] || measurePair[1]) && (
                  <button
                    onClick={onClearMeasure}
                    className="text-amber-400 hover:text-amber-300 cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
              {measurement ? (
                <div className="pt-1.5 border-t border-slate-800 space-y-1 font-mono tabular-nums">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Euclidean Dist:</span>
                    <span className="text-amber-300 font-semibold">
                      {measurement.distanceCm.toFixed(2)} cm ({measurement.distanceMm.toFixed(1)} mm)
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>ΔX: {measurement.dxCm.toFixed(1)}</span>
                    <span>ΔY: {measurement.dyCm.toFixed(1)}</span>
                    <span>ΔZ: {measurement.dzCm.toFixed(1)} cm</span>
                  </div>
                </div>
              ) : (
                <p className="text-slate-500">
                  Select two components in the 3D viewport to measure center-to-center distance.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Adjustable Engineering Design Parameters */}
        <div className="p-3.5 space-y-2.5">
          <div className="flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            <h3 className="text-xs font-semibold text-slate-200">
              Engineering Dimensions
            </h3>
          </div>

          <div className="space-y-2.5 text-[11px]">
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-slate-400">Wheel Diameter</span>
                <span className="font-mono tabular-nums text-slate-200">
                  {dimensions.wheelDiameterCm.toFixed(1)} cm
                </span>
              </div>
              <input
                type="range"
                min={15}
                max={25}
                step={0.5}
                value={dimensions.wheelDiameterCm}
                onChange={(e) => onUpdateDimensions({ wheelDiameterCm: Number(e.target.value) })}
                className="w-full eng-slider"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="text-slate-400">Wheel Width</span>
                <span className="font-mono tabular-nums text-slate-200">
                  {dimensions.wheelWidthCm.toFixed(1)} cm
                </span>
              </div>
              <input
                type="range"
                min={4}
                max={8}
                step={0.5}
                value={dimensions.wheelWidthCm}
                onChange={(e) => onUpdateDimensions({ wheelWidthCm: Number(e.target.value) })}
                className="w-full eng-slider"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="text-slate-400">Effective Disc Radius (R_eff)</span>
                <span className="font-mono tabular-nums text-slate-200">
                  {dimensions.effectiveBrakeRadiusCm.toFixed(1)} cm
                </span>
              </div>
              <input
                type="range"
                min={4.5}
                max={6.8}
                step={0.1}
                value={dimensions.effectiveBrakeRadiusCm}
                onChange={(e) =>
                  onUpdateDimensions({ effectiveBrakeRadiusCm: Number(e.target.value) })
                }
                className="w-full eng-slider"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="text-slate-400">Pad Friction Coeff (μ_k)</span>
                <span className="font-mono tabular-nums text-slate-200">
                  {frictionCoeff.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={0.25}
                max={0.65}
                step={0.01}
                value={frictionCoeff}
                onChange={(e) => onUpdateFriction(Number(e.target.value))}
                className="w-full eng-slider eng-slider-amber"
              />
            </div>

            <div className="pt-1.5 border-t border-slate-800/80 grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] font-mono tabular-nums text-slate-400">
              <span>Base: {dimensions.baseLengthCm}×{dimensions.baseWidthCm} cm</span>
              <span>Max H: {dimensions.maxHeightCm} cm</span>
              <span>Motor: {dimensions.motorVoltageV}V DC</span>
              <span>Logic: {dimensions.logicVoltageV}V DC</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
