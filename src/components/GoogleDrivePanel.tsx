import React, { useCallback, useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileCode2,
  FileSpreadsheet,
  FolderOpen,
  HardDrive,
  LogOut,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  clearCachedAccessToken,
  getAccessToken,
  googleSignIn,
  initAuth,
  logout,
} from '../services/googleAuth';
import {
  createDriveFile,
  deleteDriveFile,
  downloadDriveFileText,
  DriveAuthExpiredError,
  DriveFileItem,
  listDriveFiles,
  updateDriveFile,
} from '../services/googleDrive';
import {
  EngineeringDimensions,
  PhysicsState,
  SensorReadings,
  SimulationControls,
  TelemetryPoint,
} from '../types/simulation';
import { GoogleSignInButton } from './GoogleSignInButton';

export interface SavedSimConfigPayload {
  schema: 'smart-brake-sim-v1';
  exportedAt: string;
  dimensions: EngineeringDimensions;
  frictionCoeff: number;
  controls: Pick<
    SimulationControls,
    'direction' | 'targetRpm' | 'targetBrakeForceN' | 'brakeApplied'
  >;
  latestSensors: SensorReadings;
  latestPhysics: Pick<
    PhysicsState,
    'simTime' | 'motorTorqueNm' | 'brakeTorqueNm' | 'discTempC' | 'servoAngleDeg'
  >;
}

interface GoogleDrivePanelProps {
  dimensions: EngineeringDimensions;
  frictionCoeff: number;
  controls: SimulationControls;
  physics: PhysicsState;
  sensors: SensorReadings;
  history: TelemetryPoint[];
  onLoadConfig: (payload: SavedSimConfigPayload) => void;
}

interface PendingMutation {
  type: 'delete' | 'update';
  file: DriveFileItem;
  newContent?: string;
  mimeType?: string;
}

export const GoogleDrivePanel: React.FC<GoogleDrivePanelProps> = ({
  dimensions,
  frictionCoeff,
  controls,
  physics,
  sensors,
  history,
  onLoadConfig,
}) => {
  const [needsAuth, setNeedsAuth] = useState<boolean>(true);
  const [user, setUser] = useState<User | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  const [files, setFiles] = useState<DriveFileItem[]>([]);
  const [loadingFiles, setLoadingFiles] = useState<boolean>(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [onlyBrakeSim, setOnlyBrakeSim] = useState<boolean>(false);

  const [selectedFile, setSelectedFile] = useState<DriveFileItem | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [parsedConfig, setParsedConfig] = useState<SavedSimConfigPayload | null>(null);

  const [statusMessage, setStatusMessage] = useState<{
    kind: 'info' | 'error' | 'success';
    text: string;
  } | null>(null);

  const [pendingMutation, setPendingMutation] = useState<PendingMutation | null>(null);

  const handleSessionExpired = useCallback(() => {
    clearCachedAccessToken();
    setNeedsAuth(true);
    setStatusMessage({
      kind: 'error',
      text: 'Google Drive access token expired or unavailable. Please sign in again.',
    });
  }, []);

  const fetchFiles = useCallback(
    async (queryOverride?: string, scopeOverride?: boolean) => {
      const token = getAccessToken();
      if (!token) {
        setNeedsAuth(true);
        return;
      }
      setLoadingFiles(true);
      try {
        const items = await listDriveFiles(token, {
          query: queryOverride ?? searchQuery,
          onlyBrakeSim: scopeOverride ?? onlyBrakeSim,
          pageSize: 30,
        });
        setFiles(items);
      } catch (err) {
        if (err instanceof DriveAuthExpiredError) {
          handleSessionExpired();
        } else {
          setStatusMessage({
            kind: 'error',
            text: err instanceof Error ? err.message : 'Failed to list Google Drive files.',
          });
        }
      } finally {
        setLoadingFiles(false);
      }
    },
    [searchQuery, onlyBrakeSim, handleSessionExpired]
  );

  useEffect(() => {
    const unsub = initAuth(
      (authedUser) => {
        setUser(authedUser);
        setNeedsAuth(false);
      },
      () => {
        setNeedsAuth(true);
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!needsAuth && getAccessToken()) {
      void fetchFiles();
    }
  }, [needsAuth, fetchFiles]);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setStatusMessage(null);
    try {
      const res = await googleSignIn();
      setUser(res.user);
      setNeedsAuth(false);
      setStatusMessage({
        kind: 'success',
        text: `Connected to Google Drive as ${res.user.email ?? res.user.displayName ?? 'user'}.`,
      });
    } catch (err) {
      setStatusMessage({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Google Sign-In failed.',
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setFiles([]);
    setSelectedFile(null);
    setPreviewText(null);
    setParsedConfig(null);
    setNeedsAuth(true);
    setStatusMessage({ kind: 'info', text: 'Signed out from Google Drive.' });
  };

  const buildTelemetryCsv = (): string => {
    const header =
      'time_s,wheel_rpm,target_rpm,motor_rpm,brake_force_N,brake_torque_Nm,motor_torque_Nm,brake_temp_C,servo_angle_deg,response_latency_ms';
    const rows =
      history.length > 0
        ? history.map((p) =>
            [
              p.time.toFixed(3),
              p.wheelRpm.toFixed(2),
              p.targetRpm.toFixed(2),
              p.motorRpm.toFixed(2),
              p.brakeForceN.toFixed(3),
              p.brakeTorqueNm.toFixed(4),
              p.motorTorqueNm.toFixed(4),
              p.brakeTempC.toFixed(3),
              p.servoAngleDeg.toFixed(2),
              p.responseLatencyMs.toFixed(1),
            ].join(',')
          )
        : [
            [
              physics.simTime.toFixed(3),
              sensors.wheelRpm.toFixed(2),
              controls.targetRpm.toFixed(2),
              sensors.motorRpm.toFixed(2),
              sensors.brakeForceN.toFixed(3),
              Math.abs(physics.brakeTorqueNm).toFixed(4),
              Math.abs(physics.motorTorqueNm).toFixed(4),
              sensors.brakeTempC.toFixed(3),
              sensors.servoAngleDeg.toFixed(2),
              physics.responseLatencyMs.toFixed(1),
            ].join(','),
          ];
    return [header, ...rows].join('\n');
  };

  const buildConfigJson = (): string => {
    const payload: SavedSimConfigPayload = {
      schema: 'smart-brake-sim-v1',
      exportedAt: new Date().toISOString(),
      dimensions,
      frictionCoeff,
      controls: {
        direction: controls.direction,
        targetRpm: controls.targetRpm,
        targetBrakeForceN: controls.targetBrakeForceN,
        brakeApplied: controls.brakeApplied,
      },
      latestSensors: sensors,
      latestPhysics: {
        simTime: physics.simTime,
        motorTorqueNm: physics.motorTorqueNm,
        brakeTorqueNm: physics.brakeTorqueNm,
        discTempC: physics.discTempC,
        servoAngleDeg: physics.servoAngleDeg,
      },
    };
    return JSON.stringify(payload, null, 2);
  };

  const handleSaveTelemetryCsv = async () => {
    const token = getAccessToken();
    if (!token) {
      handleSessionExpired();
      return;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `brake_sim_telemetry_${stamp}.csv`;
    setBusyAction('Uploading telemetry CSV...');
    setStatusMessage(null);
    try {
      const created = await createDriveFile(
        token,
        fileName,
        'text/csv',
        buildTelemetryCsv(),
        'Smart Electromechanical Brake System telemetry log (RPM, Force, Torque, Temperature)'
      );
      setStatusMessage({ kind: 'success', text: `Saved "${created.name}" to Google Drive.` });
      await fetchFiles();
    } catch (err) {
      if (err instanceof DriveAuthExpiredError) handleSessionExpired();
      else
        setStatusMessage({
          kind: 'error',
          text: err instanceof Error ? err.message : 'Failed to upload telemetry CSV.',
        });
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveConfigJson = async () => {
    const token = getAccessToken();
    if (!token) {
      handleSessionExpired();
      return;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `brake_sim_config_${stamp}.json`;
    setBusyAction('Uploading rig configuration...');
    setStatusMessage(null);
    try {
      const created = await createDriveFile(
        token,
        fileName,
        'application/json',
        buildConfigJson(),
        'Smart Electromechanical Brake System rig dimensions & physics configuration'
      );
      setStatusMessage({ kind: 'success', text: `Saved "${created.name}" to Google Drive.` });
      await fetchFiles();
    } catch (err) {
      if (err instanceof DriveAuthExpiredError) handleSessionExpired();
      else
        setStatusMessage({
          kind: 'error',
          text: err instanceof Error ? err.message : 'Failed to upload configuration.',
        });
    } finally {
      setBusyAction(null);
    }
  };

  const handleSelectAndPreview = async (file: DriveFileItem) => {
    const token = getAccessToken();
    if (!token) {
      handleSessionExpired();
      return;
    }
    setSelectedFile(file);
    setParsedConfig(null);
    setPreviewText(null);

    if (file.mimeType.startsWith('application/vnd.google-apps.')) {
      setPreviewText(
        `Google Workspace document (${file.mimeType}). Select a .csv or .json simulation file to inspect contents.`
      );
      return;
    }

    setBusyAction(`Reading ${file.name}...`);
    try {
      const text = await downloadDriveFileText(token, file.id);
      setPreviewText(text.slice(0, 16000));
      try {
        const parsed = JSON.parse(text) as Partial<SavedSimConfigPayload>;
        if (parsed.schema === 'smart-brake-sim-v1' && parsed.dimensions && parsed.controls) {
          setParsedConfig(parsed as SavedSimConfigPayload);
        }
      } catch {
        // Not a JSON config file
      }
    } catch (err) {
      if (err instanceof DriveAuthExpiredError) handleSessionExpired();
      else
        setPreviewText(
          err instanceof Error ? `Unable to download preview: ${err.message}` : 'Preview error.'
        );
    } finally {
      setBusyAction(null);
    }
  };

  const requestOverwriteFile = (file: DriveFileItem) => {
    const isCsv = file.name.toLowerCase().endsWith('.csv') || file.mimeType.includes('csv');
    setPendingMutation({
      type: 'update',
      file,
      mimeType: isCsv ? 'text/csv' : 'application/json',
      newContent: isCsv ? buildTelemetryCsv() : buildConfigJson(),
    });
  };

  const requestDeleteFile = (file: DriveFileItem) => {
    setPendingMutation({
      type: 'delete',
      file,
    });
  };

  const executeConfirmedMutation = async () => {
    if (!pendingMutation) return;
    const token = getAccessToken();
    if (!token) {
      setPendingMutation(null);
      handleSessionExpired();
      return;
    }

    const mutation = pendingMutation;
    setPendingMutation(null);
    setBusyAction(
      mutation.type === 'delete'
        ? `Deleting ${mutation.file.name}...`
        : `Updating ${mutation.file.name}...`
    );

    try {
      if (mutation.type === 'delete') {
        await deleteDriveFile(token, mutation.file.id);
        if (selectedFile?.id === mutation.file.id) {
          setSelectedFile(null);
          setPreviewText(null);
          setParsedConfig(null);
        }
        setStatusMessage({
          kind: 'success',
          text: `Deleted "${mutation.file.name}" from Google Drive.`,
        });
      } else if (mutation.type === 'update' && mutation.newContent && mutation.mimeType) {
        await updateDriveFile(token, mutation.file.id, mutation.mimeType, mutation.newContent);
        setStatusMessage({
          kind: 'success',
          text: `Updated "${mutation.file.name}" with current simulation data.`,
        });
        if (selectedFile?.id === mutation.file.id) {
          setPreviewText(mutation.newContent.slice(0, 16000));
        }
      }
      await fetchFiles();
    } catch (err) {
      if (err instanceof DriveAuthExpiredError) handleSessionExpired();
      else
        setStatusMessage({
          kind: 'error',
          text: err instanceof Error ? err.message : 'Google Drive operation failed.',
        });
    } finally {
      setBusyAction(null);
    }
  };

  if (needsAuth) {
    return (
      <div className="flex-1 h-full bg-[#0B0F17] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[#101622] border border-slate-800 rounded-lg p-6 space-y-4">
          <div className="flex items-center gap-2.5 text-cyan-400">
            <HardDrive className="w-5 h-5" />
            <h2 className="text-base font-semibold text-slate-100">
              Google Drive Telemetry &amp; Rig Sync
            </h2>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Connect your Google account to save simulation telemetry CSV logs, archive test-rig
            configurations (wheel dimensions, friction parameters, target speeds), and load saved
            graduation project test runs directly from Google Drive.
          </p>

          {statusMessage && (
            <div
              className={`p-2.5 rounded border text-xs ${
                statusMessage.kind === 'error'
                  ? 'bg-rose-950/50 border-rose-500/40 text-rose-200'
                  : 'bg-slate-900 border-slate-700 text-slate-300'
              }`}
            >
              {statusMessage.text}
            </div>
          )}

          <div className="pt-1">
            <GoogleSignInButton onClick={handleLogin} loading={isLoggingIn} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 h-full bg-[#0B0F17] flex flex-col overflow-hidden relative">
      {/* Top Google Drive Account & Quick Export Bar */}
      <div className="px-4 py-2.5 bg-[#101622] border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <HardDrive className="w-4 h-4 text-cyan-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-100 truncate">
              Google Drive Workspace · {user?.displayName || user?.email || 'Connected'}
            </div>
            <div className="text-[11px] font-mono text-slate-400 truncate">
              {user?.email} · {history.length} telemetry samples buffered
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleSaveTelemetryCsv}
            disabled={Boolean(busyAction)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-slate-950 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
            Save Telemetry CSV
          </button>
          <button
            onClick={handleSaveConfigJson}
            disabled={Boolean(busyAction)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            <FileCode2 className="w-3.5 h-3.5 text-amber-400" />
            Save Rig Config JSON
          </button>
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-transparent hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-medium transition-colors cursor-pointer"
            title="Sign out of Google Drive"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Status Notification Strip */}
      {(statusMessage || busyAction) && (
        <div
          className={`px-4 py-1.5 border-b text-xs flex items-center justify-between ${
            statusMessage?.kind === 'error'
              ? 'bg-rose-950/40 border-rose-500/40 text-rose-200'
              : statusMessage?.kind === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
              : 'bg-slate-900 border-slate-800 text-slate-300'
          }`}
        >
          <span className="inline-flex items-center gap-2">
            {statusMessage?.kind === 'success' && <CheckCircle2 className="w-3.5 h-3.5" />}
            {statusMessage?.kind === 'error' && <AlertTriangle className="w-3.5 h-3.5" />}
            {busyAction || statusMessage?.text}
          </span>
          {statusMessage && !busyAction && (
            <button
              onClick={() => setStatusMessage(null)}
              className="text-[11px] opacity-80 hover:opacity-100 cursor-pointer"
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      {/* Main Split: File Browser (Left) + Preview & Actions (Right) */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Drive File Browser */}
        <div className="w-[54%] border-r border-slate-800 flex flex-col min-w-0">
          <div className="p-3 border-b border-slate-800/80 flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void fetchFiles();
                }}
                placeholder="Search Drive files by name..."
                className="w-full bg-[#101622] border border-slate-700 rounded pl-8 pr-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <button
              onClick={() => {
                const next = !onlyBrakeSim;
                setOnlyBrakeSim(next);
                void fetchFiles(searchQuery, next);
              }}
              className={`px-2.5 py-1.5 rounded text-[11px] font-medium border whitespace-nowrap cursor-pointer ${
                onlyBrakeSim
                  ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                  : 'bg-[#101622] border-slate-700 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {onlyBrakeSim ? 'Brake Logs Only' : 'All Drive Files'}
            </button>
            <button
              onClick={() => void fetchFiles()}
              disabled={loadingFiles}
              className="p-1.5 rounded bg-[#101622] border border-slate-700 text-slate-300 hover:bg-slate-800 cursor-pointer disabled:opacity-50"
              title="Refresh file list"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingFiles ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto eng-scroll divide-y divide-slate-800/60">
            {loadingFiles && files.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                Loading files from Google Drive...
              </div>
            ) : files.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 space-y-2">
                <FolderOpen className="w-6 h-6 mx-auto text-slate-600" />
                <div>No matching files found in Google Drive.</div>
              </div>
            ) : (
              files.map((file) => {
                const isSelected = selectedFile?.id === file.id;
                const isSimFile = file.name.startsWith('brake_sim_');
                return (
                  <div
                    key={file.id}
                    className={`px-3 py-2 flex items-center justify-between gap-2 transition-colors ${
                      isSelected ? 'bg-cyan-500/10' : 'hover:bg-slate-900/70'
                    }`}
                  >
                    <button
                      onClick={() => void handleSelectAndPreview(file)}
                      className="flex-1 min-w-0 text-left flex items-center gap-2.5 cursor-pointer"
                    >
                      {file.name.endsWith('.csv') ? (
                        <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <FileCode2
                          className={`w-4 h-4 shrink-0 ${
                            isSimFile ? 'text-amber-400' : 'text-slate-400'
                          }`}
                        />
                      )}
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-slate-200 truncate">
                          {file.name}
                        </div>
                        <div className="text-[10px] font-mono text-slate-500 truncate">
                          {file.modifiedTime
                            ? new Date(file.modifiedTime).toLocaleString()
                            : 'Unknown date'}
                          {file.size ? ` · ${(Number(file.size) / 1024).toFixed(1)} KB` : ''}
                        </div>
                      </div>
                    </button>

                    <div className="flex items-center gap-1 shrink-0">
                      {isSimFile && (
                        <button
                          onClick={() => requestOverwriteFile(file)}
                          title="Overwrite file with current simulation data"
                          className="px-2 py-1 rounded text-[10px] font-medium bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 cursor-pointer"
                        >
                          Update
                        </button>
                      )}
                      <button
                        onClick={() => requestDeleteFile(file)}
                        title="Delete file from Google Drive"
                        className="p-1.5 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* File Inspector & Config Loader */}
        <div className="w-[46%] flex flex-col min-w-0 bg-[#0D131F]">
          <div className="px-3.5 py-2.5 border-b border-slate-800 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-200 truncate">
              {selectedFile ? selectedFile.name : 'File Inspector'}
            </span>
            {parsedConfig && (
              <button
                onClick={() => {
                  onLoadConfig(parsedConfig);
                  setStatusMessage({
                    kind: 'success',
                    text: `Applied configuration from "${selectedFile?.name}" to the 3D simulator.`,
                  });
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-[11px] font-semibold shrink-0 cursor-pointer"
              >
                <Download className="w-3 h-3" />
                Load Into Simulator
              </button>
            )}
          </div>

          <div className="flex-1 overflow-auto eng-scroll p-3">
            {previewText !== null ? (
              <pre className="text-[11px] font-mono text-slate-300 whitespace-pre-wrap break-words leading-relaxed">
                {previewText}
              </pre>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-500 text-center px-6">
                Select any Drive file on the left to inspect its contents, overwrite saved
                simulation logs, or load a saved rig configuration.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mandatory User Confirmation Dialog for Update / Delete */}
      {pendingMutation && (
        <div className="absolute inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[#101622] border border-slate-700 rounded-lg p-5 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle
                className={`w-5 h-5 shrink-0 mt-0.5 ${
                  pendingMutation.type === 'delete' ? 'text-rose-400' : 'text-amber-400'
                }`}
              />
              <div className="space-y-1.5">
                <h3 className="text-sm font-semibold text-slate-100">
                  {pendingMutation.type === 'delete'
                    ? 'Delete File from Google Drive?'
                    : 'Overwrite Google Drive File?'}
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {pendingMutation.type === 'delete'
                    ? `Are you sure you want to permanently delete "${pendingMutation.file.name}" from your Google Drive? This action cannot be undone.`
                    : `Are you sure you want to overwrite the contents of "${pendingMutation.file.name}" in Google Drive with the current simulation data?`}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setPendingMutation(null)}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => void executeConfirmedMutation()}
                className={`px-3.5 py-1.5 rounded text-xs font-semibold cursor-pointer ${
                  pendingMutation.type === 'delete'
                    ? 'bg-rose-600 hover:bg-rose-500 text-white'
                    : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                }`}
              >
                {pendingMutation.type === 'delete' ? 'Confirm Delete' : 'Confirm Overwrite'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
