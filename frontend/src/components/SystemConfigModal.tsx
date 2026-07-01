import { useState } from "react";

interface SystemConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SystemConfigModal({ isOpen, onClose }: SystemConfigModalProps) {
  const [telemetryEnabled, setTelemetryEnabled] = useState(true);
  const [highContrast, setHighContrast] = useState(false);
  const [alertSound, setAlertSound] = useState(true);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-container border border-outline-variant/30 rounded-lg p-6 w-[450px] shadow-2xl flex flex-col gap-6">
        
        {/* Header */}
        <div className="flex justify-between items-center border-b border-outline-variant/20 pb-4">
          <h2 className="font-headline-md text-headline-md text-primary flex items-center gap-2">
            <span className="material-symbols-outlined">settings</span>
            System Configuration
          </h2>
          <button 
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-col gap-4 font-body-md text-on-surface">
          
          <div className="flex justify-between items-center bg-surface p-3 rounded border border-outline-variant/10">
            <div>
              <p className="font-label-caps text-label-caps mb-1">Live Telemetry Feed</p>
              <p className="text-[10px] text-on-surface-variant">Stream data from ISSDC relay</p>
            </div>
            <button 
              onClick={() => setTelemetryEnabled(!telemetryEnabled)}
              className={`w-12 h-6 rounded-full flex items-center px-1 transition-colors ${telemetryEnabled ? "bg-primary" : "bg-surface-variant"}`}
            >
              <div className={`w-4 h-4 rounded-full bg-white transition-transform ${telemetryEnabled ? "translate-x-6" : "translate-x-0"}`} />
            </button>
          </div>

          <div className="flex justify-between items-center bg-surface p-3 rounded border border-outline-variant/10">
            <div>
              <p className="font-label-caps text-label-caps mb-1">High Contrast Mode</p>
              <p className="text-[10px] text-on-surface-variant">Enhance visibility of charts</p>
            </div>
            <button 
              onClick={() => {
                setHighContrast(!highContrast);
                document.documentElement.style.filter = !highContrast ? "contrast(1.2) saturate(1.2)" : "none";
              }}
              className={`w-12 h-6 rounded-full flex items-center px-1 transition-colors ${highContrast ? "bg-primary" : "bg-surface-variant"}`}
            >
              <div className={`w-4 h-4 rounded-full bg-white transition-transform ${highContrast ? "translate-x-6" : "translate-x-0"}`} />
            </button>
          </div>

          <div className="flex justify-between items-center bg-surface p-3 rounded border border-outline-variant/10">
            <div>
              <p className="font-label-caps text-label-caps mb-1">Critical Alert Sounds</p>
              <p className="text-[10px] text-on-surface-variant">Audible warning for M/X class flares</p>
            </div>
            <button 
              onClick={() => setAlertSound(!alertSound)}
              className={`w-12 h-6 rounded-full flex items-center px-1 transition-colors ${alertSound ? "bg-primary" : "bg-surface-variant"}`}
            >
              <div className={`w-4 h-4 rounded-full bg-white transition-transform ${alertSound ? "translate-x-6" : "translate-x-0"}`} />
            </button>
          </div>

        </div>

        {/* Footer */}
        <div className="flex justify-end gap-4 pt-4 border-t border-outline-variant/20">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-on-surface-variant hover:text-on-surface font-label-caps text-label-caps transition-colors"
          >
            DISCARD
          </button>
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-primary text-on-primary rounded font-label-caps text-label-caps hover:bg-primary-hover transition-colors"
          >
            SAVE CHANGES
          </button>
        </div>

      </div>
    </div>
  );
}
