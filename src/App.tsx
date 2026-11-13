import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Eye,
  Layers,
  Tag,
} from 'lucide-react';
import { ComponentTree } from './components/ComponentTree';
import { ControlDashboard } from './components/ControlDashboard';
import { ElectronicsPanel } from './components/ElectronicsPanel';
import { GoogleDrivePanel, SavedSimConfigPayload } from './components/GoogleDrivePanel';
import { PhysicsEquationsPanel } from './components/PhysicsEquationsPanel';
import { TelemetryCharts } from './components/TelemetryCharts';
import {
  COMPONENT_CATALOG,
  COMPONENT_LIST,
  DEFAULT_DIMENSIONS,
  DEFAULT_VISIBILITY,
} from './data/componentsCatalog';
import {
  computePhysicsParameters,
  createInitialPhysicsState,
  PhysicsIntegratorMemory,
  stepPhysicsEngine,
} from './simulation/physicsEngine';
import { computeSensorReadings } from './simulation/sensorSimulation';
import { createBrakeScene, SceneController } from './three/scene';
import {
  CameraViewMode,
  ComponentId,
  EngineeringDimensions,
  LabelProjection,
  MeasurementResult,
  PhysicsState,
  RotationDirection,
  SensorReadings,
  SimulationControls,
  TelemetryPoint,
  WorkspaceTab,
} from './types/simulation';

const MAX_HISTORY_POINTS = 220;

const INITIAL_CONTROLS: SimulationControls = {
  simRunning: true,
  motorOn: true,
  direction: 1,
  targetRpm: 300,
  brakeApplied: false,
  targetBrakeForceN: 28,
  emergencyStop: false,
};

const INITIAL_SENSORS: SensorReadings = {
  wheelRpm: 0,
  signedWheelRpm: 0,
  motorRpm: 0,
  brakeForceN: 0,
  hx711RawCounts: 0,
  servoAngleDeg: 0,
  encoderCounts: 0,
  brakeTempC: 24.0,
  hallPulseCount: 0,
  hallSignalHigh: false,
};

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('3d');
  const [viewMode, setViewMode] = useState<CameraViewMode>('perspective');
  const [explodeFactor, setExplodeFactor] = useState<number>(0);
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [selectedId, setSelectedId] = useState<ComponentId | null>(null);
  const [visibility, setVisibility] = useState<Record<ComponentId, boolean>>(DEFAULT_VISIBILITY);

  const [measureMode, setMeasureMode] = useState<boolean>(false);
  const [measurePair, setMeasurePair] = useState<[ComponentId | null, ComponentId | null]>([
    null,
    null,
  ]);
  const [measurement, setMeasurement] = useState<MeasurementResult | null>(null);

  const [dimensions, setDimensions] = useState<EngineeringDimensions>(DEFAULT_DIMENSIONS);
  const [frictionCoeff, setFrictionCoeff] = useState<number>(0.42);
  const [controls, setControls] = useState<SimulationControls>(INITIAL_CONTROLS);

  const physicsParams = useMemo(
    () => computePhysicsParameters(dimensions, frictionCoeff),
    [dimensions, frictionCoeff]
  );

  const [uiPhysics, setUiPhysics] = useState<PhysicsState>(() =>
    createInitialPhysicsState(24.0)
  );
  const [uiSensors, setUiSensors] = useState<SensorReadings>(INITIAL_SENSORS);
  const [history, setHistory] = useState<TelemetryPoint[]>([]);

  // Mutable simulation refs for zero-overhead 60fps Three.js integration
  const controlsRef = useRef<SimulationControls>(controls);
  const dimsRef = useRef<EngineeringDimensions>(dimensions);
  const paramsRef = useRef(physicsParams);
  const physicsRef = useRef<PhysicsState>(createInitialPhysicsState(24.0));
  const sensorsRef = useRef<SensorReadings>(INITIAL_SENSORS);
  const memoryRef = useRef<PhysicsIntegratorMemory>({
    integralError: 0,
    prevBrakeActive: false,
    prevCommandForceN: 0,
  });

  controlsRef.current = controls;
  dimsRef.current = dimensions;
  paramsRef.current = physicsParams;

  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const sceneCtrlRef = useRef<SceneController | null>(null);
  const labelDomRefs = useRef<Partial<Record<ComponentId, HTMLButtonElement | null>>>({});
  const measureBadgeRef = useRef<HTMLDivElement | null>(null);
  const showLabelsRef = useRef<boolean>(showLabels);
  showLabelsRef.current = showLabels;

  const lastUiSyncRef = useRef<number>(0);
  const lastHistoryPushRef = useRef<number>(0);

  // Ref callbacks for scene events
  const handleSelectFromScene = useCallback((id: ComponentId | null) => {
    setSelectedId(id);
    sceneCtrlRef.current?.setSelection(id);
  }, []);

  const handleMeasurePick = useCallback((id: ComponentId) => {
    setMeasurePair((prev) => {
      if (!prev[0] || (prev[0] && prev[1])) {
        return [id, null];
      }
      if (prev[0] === id) {
        return prev;
      }
      return [prev[0], id];
    });
  }, []);

  // Initialize Three.js scene once
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const controller = createBrakeScene(container, {
      onSelectComponent: handleSelectFromScene,
      onFocusComponent: (id) => setSelectedId(id),
      onMeasurePick: handleMeasurePick,
      onFrameUpdate: (dt, labels, measureScreen) => {
        // Step Physics Engine if simulation is running
        if (controlsRef.current.simRunning) {
          const nextPhysics = stepPhysicsEngine(
            physicsRef.current,
            controlsRef.current,
            dimsRef.current,
            paramsRef.current,
            memoryRef.current,
            dt
          );
          const nextSensors = computeSensorReadings(nextPhysics, sensorsRef.current);
          physicsRef.current = nextPhysics;
          sensorsRef.current = nextSensors;
        }

        // Push state directly to Three.js assembly
        controller.syncSimulationVisuals(
          physicsRef.current,
          sensorsRef.current.hallSignalHigh,
          dimsRef.current
        );

        // Update 3D->2D DOM callout labels directly without React re-renders
        labels.forEach((lbl: LabelProjection) => {
          const el = labelDomRefs.current[lbl.id];
          if (!el) return;
          if (!showLabelsRef.current || !lbl.visible) {
            el.style.opacity = '0';
            el.style.pointerEvents = 'none';
          } else {
            el.style.opacity = '1';
            el.style.pointerEvents = 'auto';
            el.style.transform = `translate3d(${lbl.x.toFixed(1)}px, ${lbl.y.toFixed(1)}px, 0) translate(-50%, -50%)`;
          }
        });

        // Update measurement floating badge
        const mEl = measureBadgeRef.current;
        if (mEl) {
          if (measureScreen && measureScreen.visible) {
            mEl.style.opacity = '1';
            mEl.style.transform = `translate3d(${measureScreen.x.toFixed(1)}px, ${measureScreen.y.toFixed(1)}px, 0) translate(-50%, -120%)`;
          } else {
            mEl.style.opacity = '0';
          }
        }

        // Throttle React dashboard telemetry & charts (~16 Hz for smooth numbers & low CPU)
        const now = performance.now();
        if (now - lastUiSyncRef.current >= 60) {
          lastUiSyncRef.current = now;
          const p = physicsRef.current;
          const s = sensorsRef.current;
          setUiPhysics(p);
          setUiSensors(s);

          if (controlsRef.current.simRunning && now - lastHistoryPushRef.current >= 90) {
            lastHistoryPushRef.current = now;
            const point: TelemetryPoint = {
              time: p.simTime,
              wheelRpm: s.wheelRpm,
              targetRpm:
                controlsRef.current.motorOn && !controlsRef.current.emergencyStop
                  ? controlsRef.current.targetRpm
                  : 0,
              motorRpm: s.motorRpm,
              brakeForceN: s.brakeForceN,
              brakeTorqueNm: Math.abs(p.brakeTorqueNm),
              motorTorqueNm: Math.abs(p.motorTorqueNm),
              brakeTempC: s.brakeTempC,
              servoAngleDeg: s.servoAngleDeg,
              responseLatencyMs: p.responseLatencyMs,
            };
            setHistory((prev) => {
              const next = [...prev, point];
              return next.length > MAX_HISTORY_POINTS
                ? next.slice(next.length - MAX_HISTORY_POINTS)
                : next;
            });
          }
        }
      },
    });

    sceneCtrlRef.current = controller;
    controller.syncSimulationVisuals(
      physicsRef.current,
      sensorsRef.current.hallSignalHigh,
      dimsRef.current
    );

    return () => {
      controller.dispose();
      sceneCtrlRef.current = null;
    };
  }, [handleSelectFromScene, handleMeasurePick]);

  // Sync visibility, explode factor, and measurement mode with scene controller
  useEffect(() => {
    sceneCtrlRef.current?.setVisibility(visibility);
  }, [visibility]);

  useEffect(() => {
    sceneCtrlRef.current?.setExplodeTarget(explodeFactor);
  }, [explodeFactor]);

  useEffect(() => {
    sceneCtrlRef.current?.setMeasureMode(measureMode, measurePair);
    if (measureMode && measurePair[0] && measurePair[1] && sceneCtrlRef.current) {
      setMeasurement(sceneCtrlRef.current.computeMeasurement(measurePair[0], measurePair[1]));
    } else {
      setMeasurement(null);
    }
  }, [measureMode, measurePair, explodeFactor]);

  // Viewing Mode Handler
  const handleViewModeChange = useCallback((mode: CameraViewMode) => {
    setViewMode(mode);
    if (mode === 'exploded') {
      setExplodeFactor(1);
    } else if (explodeFactor > 0 && mode === 'perspective') {
      setExplodeFactor(0);
    }
    sceneCtrlRef.current?.setCameraPreset(mode);
  }, [explodeFactor]);

  // Reset Simulation
  const handleResetSimulation = useCallback(() => {
    const freshPhysics = createInitialPhysicsState(24.0);
    physicsRef.current = freshPhysics;
    sensorsRef.current = { ...INITIAL_SENSORS };
    memoryRef.current = {
      integralError: 0,
      prevBrakeActive: false,
      prevCommandForceN: 0,
    };
    setControls({
      ...INITIAL_CONTROLS,
      simRunning: true,
      motorOn: false,
    });
    setUiPhysics(freshPhysics);
    setUiSensors({ ...INITIAL_SENSORS });
    setHistory([]);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault();
          setControls((c) => ({ ...c, simRunning: !c.simRunning }));
          break;
        case 'm':
          setControls((c) => (c.emergencyStop ? c : { ...c, motorOn: !c.motorOn }));
          break;
        case 'b':
          setControls((c) => (c.emergencyStop ? c : { ...c, brakeApplied: !c.brakeApplied }));
          break;
        case 'e':
          setControls((c) => ({
            ...c,
            emergencyStop: true,
            motorOn: false,
            brakeApplied: true,
          }));
          break;
        case 'l':
          setShowLabels((v) => !v);
          break;
        case '1':
          handleViewModeChange('perspective');
          break;
        case '2':
          handleViewModeChange('front');
          break;
        case '3':
          handleViewModeChange('side');
          break;
        case '4':
          handleViewModeChange('top');
          break;
        case '5':
          handleViewModeChange('exploded');
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleViewModeChange]);

  return (
    <div className="h-screen w-screen bg-[#0B0F17] text-slate-100 flex flex-col overflow-hidden">
      {/* Top 3-Zone Engineering Navigation Header */}
      <header className="h-12 shrink-0 bg-[#101622] border-b border-slate-800/90 px-5 flex items-center justify-between gap-8">
        {/* Zone 1: Single-line Wordmark */}
        <div className="text-sm font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0">
          Smart Electromechanical Brake System
        </div>

        {/* Zone 2: Workspace Mode Tabs */}
        <nav className="flex items-center gap-6 text-xs font-medium text-slate-400">
          <button
            onClick={() => setActiveTab('3d')}
            className={`py-3 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === '3d'
                ? 'border-cyan-400 text-slate-100'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            3D Mechanical Twin
          </button>
          <button
            onClick={() => setActiveTab('electronics')}
            className={`py-3 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'electronics'
                ? 'border-cyan-400 text-slate-100'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            ESP32 Electronics
          </button>
          <button
            onClick={() => setActiveTab('physics')}
            className={`py-3 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'physics'
                ? 'border-cyan-400 text-slate-100'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            Physics &amp; Equations
          </button>
          <button
            onClick={() => setActiveTab('drive')}
            className={`py-3 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'drive'
                ? 'border-cyan-400 text-slate-100'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            Google Drive
          </button>
        </nav>

        {/* Zone 3: Primary Action */}
        <div className="shrink-0">
          <button
            onClick={() => {
              setExplodeFactor(0);
              handleViewModeChange('perspective');
            }}
            className="px-3 py-1.5 text-xs font-medium rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Reset Camera
          </button>
        </div>
      </header>

      {/* Main Middle Workspace (Left Tree · Center Stage · Right Dashboard) */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* LEFT: Assembly Tree, Inspector, Measurement & Dimensions */}
        <ComponentTree
          selectedId={selectedId}
          visibility={visibility}
          measureMode={measureMode}
          measurePair={measurePair}
          measurement={measurement}
          dimensions={dimensions}
          frictionCoeff={frictionCoeff}
          onSelect={(id) => {
            setSelectedId(id);
            sceneCtrlRef.current?.setSelection(id);
          }}
          onFocus={(id) => {
            setSelectedId(id);
            sceneCtrlRef.current?.setSelection(id);
            sceneCtrlRef.current?.focusOnComponent(id);
            setActiveTab('3d');
          }}
          onToggleVisibility={(id) =>
            setVisibility((prev) => ({ ...prev, [id]: !prev[id] }))
          }
          onShowAll={() => setVisibility(DEFAULT_VISIBILITY)}
          onToggleMeasureMode={() => {
            setMeasureMode((m) => !m);
            setMeasurePair([null, null]);
            setMeasurement(null);
          }}
          onClearMeasure={() => {
            setMeasurePair([null, null]);
            setMeasurement(null);
          }}
          onUpdateDimensions={(patch) =>
            setDimensions((prev) => ({ ...prev, ...patch }))
          }
          onUpdateFriction={setFrictionCoeff}
        />

        {/* CENTER: Persistent 3D WebGL Stage (or Electronics / Physics view) */}
        <main className="flex-1 min-w-0 relative bg-[#0B0F17] overflow-hidden">
          {/* Keep Three.js WebGL mount alive across tab switches so camera & assembly state never reset */}
          <div
            className={`absolute inset-0 ${
              activeTab === '3d' ? 'visible pointer-events-auto' : 'invisible pointer-events-none'
            }`}
          >
            <div ref={canvasMountRef} className="w-full h-full" />

            {/* 3D Projected Component Labels */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              {COMPONENT_LIST.map((comp) => {
                const isSelected = selectedId === comp.id;
                return (
                  <button
                    key={comp.id}
                    ref={(el) => {
                      labelDomRefs.current[comp.id] = el;
                    }}
                    onClick={() => {
                      if (measureMode) {
                        handleMeasurePick(comp.id);
                      } else {
                        handleSelectFromScene(comp.id);
                      }
                    }}
                    onDoubleClick={() => {
                      setSelectedId(comp.id);
                      sceneCtrlRef.current?.focusOnComponent(comp.id);
                    }}
                    style={{ opacity: 0 }}
                    className={`absolute top-0 left-0 px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors cursor-pointer whitespace-nowrap ${
                      isSelected
                        ? 'bg-cyan-500/90 border-cyan-300 text-slate-950 font-semibold'
                        : 'bg-[#0B0F17]/85 border-slate-700/80 text-slate-200 hover:border-cyan-400'
                    }`}
                  >
                    {comp.code} · {comp.name.split(' ')[0]}
                  </button>
                );
              })}

              {/* 3D Measurement Distance Callout */}
              <div
                ref={measureBadgeRef}
                style={{ opacity: 0 }}
                className="absolute top-0 left-0 px-2 py-1 rounded bg-amber-500 text-slate-950 font-mono text-[11px] font-semibold whitespace-nowrap pointer-events-none"
              >
                {measurement
                  ? `${measurement.distanceCm.toFixed(2)} cm (${measurement.distanceMm.toFixed(1)} mm)`
                  : ''}
              </div>
            </div>

            {/* Top-Left Subtle Interaction Hint */}
            <div className="absolute top-3 left-3 px-2.5 py-1 rounded bg-[#101622]/90 border border-slate-800 text-[11px] text-slate-400 pointer-events-none">
              Drag: Orbit · Right-Drag: Pan · Scroll: Zoom · Click: Select · Double-Click: Focus
            </div>

            {/* Bottom-Center CAD Camera & Exploded View Dock */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-[#101622]/95 border border-slate-700/80 rounded-lg px-2.5 py-1.5 flex items-center gap-3">
              {/* 5 Viewing Mode Buttons */}
              <div className="flex items-center gap-1">
                <Camera className="w-3.5 h-3.5 text-slate-400 mr-1" />
                {(
                  [
                    ['perspective', 'Perspective'],
                    ['front', 'Front'],
                    ['side', 'Side'],
                    ['top', 'Top'],
                    ['exploded', 'Exploded'],
                  ] as [CameraViewMode, string][]
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    onClick={() => handleViewModeChange(mode)}
                    className={`px-2 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      viewMode === mode
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                        : 'text-slate-300 hover:bg-slate-800 border border-transparent'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="h-4 w-px bg-slate-700" />

              {/* Exploded Separation Slider */}
              <div className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-[11px] text-slate-400 whitespace-nowrap">Explode</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={explodeFactor}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setExplodeFactor(val);
                    if (val > 0.05 && viewMode !== 'exploded') setViewMode('exploded');
                    if (val === 0 && viewMode === 'exploded') setViewMode('perspective');
                  }}
                  className="w-20 eng-slider"
                />
                <span className="font-mono text-[10px] tabular-nums text-slate-300 w-7">
                  {Math.round(explodeFactor * 100)}%
                </span>
              </div>

              <div className="h-4 w-px bg-slate-700" />

              {/* Component Labels Toggle */}
              <button
                onClick={() => setShowLabels((v) => !v)}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border transition-colors whitespace-nowrap cursor-pointer ${
                  showLabels
                    ? 'bg-slate-800 border-slate-600 text-slate-100'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                {showLabels ? <Tag className="w-3 h-3 text-cyan-400" /> : <Eye className="w-3 h-3" />}
                Labels
              </button>
            </div>
          </div>

          {/* Electronics Schematic Tab */}
          {activeTab === 'electronics' && (
            <ElectronicsPanel
              controls={controls}
              physics={uiPhysics}
              sensors={uiSensors}
            />
          )}

          {/* Physics & Equations Tab */}
          {activeTab === 'physics' && (
            <PhysicsEquationsPanel
              dimensions={dimensions}
              params={physicsParams}
              physics={uiPhysics}
            />
          )}

          {/* Google Drive Telemetry & Config Sync Tab */}
          {activeTab === 'drive' && (
            <GoogleDrivePanel
              dimensions={dimensions}
              frictionCoeff={frictionCoeff}
              controls={controls}
              physics={uiPhysics}
              sensors={uiSensors}
              history={history}
              onLoadConfig={(payload: SavedSimConfigPayload) => {
                setDimensions(payload.dimensions);
                if (typeof payload.frictionCoeff === 'number') {
                  setFrictionCoeff(payload.frictionCoeff);
                }
                setControls((prev) => ({
                  ...prev,
                  direction: payload.controls.direction,
                  targetRpm: payload.controls.targetRpm,
                  targetBrakeForceN: payload.controls.targetBrakeForceN,
                  brakeApplied: prev.emergencyStop ? prev.brakeApplied : payload.controls.brakeApplied,
                }));
              }}
            />
          )}
        </main>

        {/* RIGHT: Live Sensor Telemetry & Motor/Brake Controls */}
        <ControlDashboard
          controls={controls}
          physics={uiPhysics}
          sensors={uiSensors}
          dimensions={dimensions}
          onMotorToggle={(on) =>
            setControls((c) => (c.emergencyStop ? c : { ...c, motorOn: on }))
          }
          onTargetRpmChange={(rpm) =>
            setControls((c) => ({ ...c, targetRpm: rpm }))
          }
          onDirectionChange={(dir: RotationDirection) =>
            setControls((c) => ({ ...c, direction: dir }))
          }
          onBrakeApply={() =>
            setControls((c) => (c.emergencyStop ? c : { ...c, brakeApplied: true }))
          }
          onBrakeRelease={() =>
            setControls((c) => (c.emergencyStop ? c : { ...c, brakeApplied: false }))
          }
          onBrakeForceChange={(forceN) =>
            setControls((c) => ({ ...c, targetBrakeForceN: forceN }))
          }
          onEmergencyStop={() =>
            setControls((c) => ({
              ...c,
              emergencyStop: true,
              motorOn: false,
              brakeApplied: true,
            }))
          }
          onResetEmergencyStop={() =>
            setControls((c) => ({
              ...c,
              emergencyStop: false,
              brakeApplied: false,
            }))
          }
        />
      </div>

      {/* BOTTOM: Simulation Timeline & Real-time Oscilloscope Graphs */}
      <TelemetryCharts
        history={history}
        simRunning={controls.simRunning}
        simTime={uiPhysics.simTime}
        onStartSim={() => setControls((c) => ({ ...c, simRunning: true }))}
        onPauseSim={() => setControls((c) => ({ ...c, simRunning: false }))}
        onResetSim={handleResetSimulation}
        onClearGraphs={() => setHistory([])}
      />
    </div>
  );
}
