import React, { useMemo, useState } from 'react';
import { Pause, Play, RotateCcw, Trash2 } from 'lucide-react';
import { TelemetryPoint } from '../types/simulation';

interface TelemetryChartsProps {
  history: TelemetryPoint[];
  simRunning: boolean;
  simTime: number;
  onStartSim: () => void;
  onPauseSim: () => void;
  onResetSim: () => void;
  onClearGraphs: () => void;
}

interface MiniChartProps {
  title: string;
  unit: string;
  data: TelemetryPoint[];
  minY: number;
  maxY: number;
  primaryKey: keyof TelemetryPoint;
  primaryLabel: string;
  primaryColor: string;
  secondaryKey?: keyof TelemetryPoint;
  secondaryLabel?: string;
  secondaryColor?: string;
  secondaryScale?: number;
  hoverIdx: number | null;
  onHoverIdx: (idx: number | null) => void;
}

const OscilloscopeChart: React.FC<MiniChartProps> = ({
  title,
  unit,
  data,
  minY,
  maxY,
  primaryKey,
  primaryLabel,
  primaryColor,
  secondaryKey,
  secondaryLabel,
  secondaryColor,
  secondaryScale = 1,
  hoverIdx,
  onHoverIdx,
}) => {
  const W = 380;
  const H = 104;
  const PAD_L = 34;
  const PAD_R = 10;
  const PAD_T = 10;
  const PAD_B = 18;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const { primaryPath, secondaryPath, latestVal, latestSecVal } = useMemo(() => {
    if (data.length === 0) {
      return { primaryPath: '', secondaryPath: '', latestVal: 0, latestSecVal: 0 };
    }
    const span = Math.max(maxY - minY, 1e-3);
    const n = data.length;
    const toX = (i: number) => PAD_L + (n === 1 ? plotW : (i / (n - 1)) * plotW);
    const toY = (v: number) =>
      PAD_T + plotH - Math.max(0, Math.min(1, (v - minY) / span)) * plotH;

    let pPath = '';
    let sPath = '';

    for (let i = 0; i < n; i++) {
      const pt = data[i];
      const x = toX(i).toFixed(1);
      const y1 = toY(Number(pt[primaryKey])).toFixed(1);
      pPath += i === 0 ? `M ${x} ${y1}` : ` L ${x} ${y1}`;

      if (secondaryKey) {
        const y2 = toY(Number(pt[secondaryKey]) * secondaryScale).toFixed(1);
        sPath += i === 0 ? `M ${x} ${y2}` : ` L ${x} ${y2}`;
      }
    }

    const activePt = hoverIdx !== null && data[hoverIdx] ? data[hoverIdx] : data[n - 1];
    return {
      primaryPath: pPath,
      secondaryPath: sPath,
      latestVal: Number(activePt[primaryKey]),
      latestSecVal: secondaryKey ? Number(activePt[secondaryKey]) : 0,
    };
  }, [data, minY, maxY, primaryKey, secondaryKey, secondaryScale, hoverIdx, plotW, plotH]);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (data.length < 2) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    const norm = Math.max(0, Math.min(1, (relX - PAD_L) / plotW));
    const idx = Math.round(norm * (data.length - 1));
    onHoverIdx(idx);
  };

  const hoverX =
    hoverIdx !== null && data.length > 1
      ? PAD_L + (hoverIdx / (data.length - 1)) * plotW
      : null;

  const yTicks = [minY, (minY + maxY) / 2, maxY];

  return (
    <div className="bg-[#0B0F17] border border-slate-800/90 rounded p-2 flex flex-col min-w-0">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-semibold text-slate-200 truncate">{title}</span>
          <span className="text-[10px] font-mono text-slate-500">({unit})</span>
        </div>
        <div className="flex items-center gap-2.5 text-[10px] font-mono tabular-nums shrink-0">
          <span style={{ color: primaryColor }}>
            {primaryLabel}: {latestVal.toFixed(1)}
          </span>
          {secondaryKey && secondaryLabel && (
            <span style={{ color: secondaryColor }}>
              {secondaryLabel}: {latestSecVal.toFixed(secondaryKey === 'brakeTorqueNm' ? 2 : 0)}
            </span>
          )}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-[104px] select-none overflow-visible"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => onHoverIdx(null)}
      >
        {/* Horizontal gridlines & Y ticks */}
        {yTicks.map((tick, i) => {
          const y = PAD_T + plotH - ((tick - minY) / Math.max(maxY - minY, 1)) * plotH;
          return (
            <g key={i}>
              <line
                x1={PAD_L}
                y1={y}
                x2={W - PAD_R}
                y2={y}
                stroke="#1e293b"
                strokeWidth={1}
                strokeDasharray={i === 1 ? '3 3' : undefined}
              />
              <text
                x={PAD_L - 4}
                y={y + 3}
                textAnchor="end"
                fill="#64748b"
                fontSize="8.5"
                fontFamily="IBM Plex Mono, monospace"
              >
                {tick.toFixed(0)}
              </text>
            </g>
          );
        })}

        {/* Vertical axis border */}
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + plotH} stroke="#334155" strokeWidth={1} />
        <line
          x1={PAD_L}
          y1={PAD_T + plotH}
          x2={W - PAD_R}
          y2={PAD_T + plotH}
          stroke="#334155"
          strokeWidth={1}
        />

        {/* Secondary curve (dashed) */}
        {secondaryPath && (
          <path
            d={secondaryPath}
            fill="none"
            stroke={secondaryColor}
            strokeWidth={1.3}
            strokeDasharray="4 3"
            opacity={0.85}
          />
        )}

        {/* Primary curve */}
        {primaryPath && (
          <path
            d={primaryPath}
            fill="none"
            stroke={primaryColor}
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
        )}

        {/* Interactive Crosshair */}
        {hoverX !== null && (
          <line
            x1={hoverX}
            y1={PAD_T}
            x2={hoverX}
            y2={PAD_T + plotH}
            stroke="#94a3b8"
            strokeWidth={1}
            strokeDasharray="2 2"
          />
        )}

        {/* X Axis time labels */}
        <text
          x={PAD_L}
          y={H - 3}
          fill="#64748b"
          fontSize="8.5"
          fontFamily="IBM Plex Mono, monospace"
        >
          {data.length > 0 ? `${data[0].time.toFixed(1)}s` : '0.0s'}
        </text>
        <text
          x={W - PAD_R}
          y={H - 3}
          textAnchor="end"
          fill="#64748b"
          fontSize="8.5"
          fontFamily="IBM Plex Mono, monospace"
        >
          {data.length > 0 ? `${data[data.length - 1].time.toFixed(1)}s` : '0.0s'}
        </text>
      </svg>
    </div>
  );
};

export const TelemetryCharts: React.FC<TelemetryChartsProps> = ({
  history,
  simRunning,
  simTime,
  onStartSim,
  onPauseSim,
  onResetSim,
  onClearGraphs,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const maxTemp = useMemo(() => {
    const peak = history.reduce((m, p) => Math.max(m, p.brakeTempC), 30);
    return Math.max(80, Math.ceil((peak + 10) / 10) * 10);
  }, [history]);

  const hoveredPoint = hoverIdx !== null && history[hoverIdx] ? history[hoverIdx] : null;

  return (
    <section className="h-[186px] shrink-0 bg-[#101622] border-t border-slate-800/90 px-3.5 py-2 flex flex-col gap-2">
      {/* Timeline Controls Strip */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={simRunning ? onPauseSim : onStartSim}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold border transition-colors cursor-pointer ${
              simRunning
                ? 'bg-amber-500/15 border-amber-500/50 text-amber-300 hover:bg-amber-500/25'
                : 'bg-cyan-600 border-cyan-500 text-slate-950 hover:bg-cyan-500'
            }`}
          >
            {simRunning ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                Pause Simulation
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                Start Simulation
              </>
            )}
          </button>

          <button
            onClick={onResetSim}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Simulation
          </button>

          <button
            onClick={onClearGraphs}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/70 transition-colors cursor-pointer"
            title="Clear graph buffers"
          >
            <Trash2 className="w-3 h-3" />
            Clear Plots
          </button>
        </div>

        <div className="flex items-center gap-4 text-[11px] font-mono tabular-nums text-slate-400">
          {hoveredPoint ? (
            <span className="text-cyan-300">
              Probe @ {hoveredPoint.time.toFixed(2)}s · {hoveredPoint.wheelRpm.toFixed(1)} RPM ·{' '}
              {hoveredPoint.brakeForceN.toFixed(1)} N · {hoveredPoint.brakeTempC.toFixed(1)} °C
            </span>
          ) : (
            <span>Hover plots to inspect exact sample coordinates</span>
          )}
          <span className="text-slate-300 font-medium">
            Elapsed: T+{simTime.toFixed(1)}s
          </span>
        </div>
      </div>

      {/* 3 Real-Time Synchronized Engineering Graphs */}
      <div className="grid grid-cols-3 gap-2.5 flex-1 min-h-0">
        <OscilloscopeChart
          title="1. Wheel Speed vs Target"
          unit="RPM"
          data={history}
          minY={0}
          maxY={520}
          primaryKey="wheelRpm"
          primaryLabel="Wheel"
          primaryColor="#22d3ee"
          secondaryKey="targetRpm"
          secondaryLabel="Target"
          secondaryColor="#94a3b8"
          hoverIdx={hoverIdx}
          onHoverIdx={setHoverIdx}
        />

        <OscilloscopeChart
          title="2. Braking Force & Torque"
          unit="N / N·m×15"
          data={history}
          minY={0}
          maxY={55}
          primaryKey="brakeForceN"
          primaryLabel="Force"
          primaryColor="#f59e0b"
          secondaryKey="brakeTorqueNm"
          secondaryLabel="T_brk"
          secondaryColor="#fb7185"
          secondaryScale={15}
          hoverIdx={hoverIdx}
          onHoverIdx={setHoverIdx}
        />

        <OscilloscopeChart
          title="3. Disc Temperature & Latency"
          unit="°C / ms÷5"
          data={history}
          minY={20}
          maxY={maxTemp}
          primaryKey="brakeTempC"
          primaryLabel="Temp"
          primaryColor="#34d399"
          secondaryKey="responseLatencyMs"
          secondaryLabel="Lag"
          secondaryColor="#a78bfa"
          secondaryScale={0.2}
          hoverIdx={hoverIdx}
          onHoverIdx={setHoverIdx}
        />
      </div>
    </section>
  );
};
