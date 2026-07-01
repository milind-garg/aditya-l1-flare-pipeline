import { useState, type ReactNode } from "react";
import SystemConfigModal from "./SystemConfigModal";

type Tab = "monitor" | "catalogue" | "evaluation" | "alerts";

interface AppShellProps {
  children: ReactNode;
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  utcTime: string;
}

export default function AppShell({ children, activeTab, setActiveTab, utcTime }: AppShellProps) {
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background text-on-surface font-body-md">
      {/* TopNavBar */}
      <header className="flex justify-between items-center px-margin-page h-16 bg-surface border-b border-outline-variant/15 shrink-0 z-20">
        <div className="flex items-center gap-4">
          <span className="font-headline-md text-headline-md text-primary uppercase tracking-wider">ADITYA-L1 MONITOR</span>
          <div className="h-4 w-px bg-outline-variant/30" />
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse-slow" />
            <span className="font-label-caps text-label-caps text-on-surface-variant">L1 CONNECTION: ACTIVE</span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4 text-on-surface-variant">
            <span className="text-label-caps font-label-caps text-on-surface-variant">{utcTime}</span>
          </div>
          <div className="flex items-center gap-3 pl-6 border-l border-outline-variant/15">
            <div className="text-right">
              <p className="font-label-caps text-label-caps text-on-surface">V. SARABHAI</p>
              <p className="text-[10px] text-on-surface-variant font-mono uppercase">Mission Director</p>
            </div>
            <div className="w-8 h-8 rounded-full bg-primary-container border border-outline-variant/30 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-sm">person</span>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* SideNavBar */}
        <aside className="w-64 flex flex-col pt-8 bg-surface-container border-r border-outline-variant/15 shrink-0 overflow-y-auto z-10">
          <div className="px-6 mb-8">
            <h2 className="font-headline-md text-headline-md text-primary">Mission Control</h2>
            <p className="font-label-caps text-label-caps text-on-surface-variant">Vigilance Unit 01</p>
          </div>
          
          <nav className="flex-1 space-y-1">
            <button 
              onClick={() => setActiveTab("monitor")}
              className={`w-full flex items-center gap-4 px-6 py-3 transition-colors font-label-caps text-label-caps ${
                activeTab === "monitor" 
                  ? "text-primary border-r-2 border-primary bg-primary-container/10" 
                  : "text-on-surface-variant hover:bg-white/5 hover:text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined text-lg">wb_sunny</span>
              <span>Telemetry Monitor</span>
            </button>
            
            <button 
              onClick={() => setActiveTab("catalogue")}
              className={`w-full flex items-center gap-4 px-6 py-3 transition-colors font-label-caps text-label-caps ${
                activeTab === "catalogue" 
                  ? "text-primary border-r-2 border-primary bg-primary-container/10" 
                  : "text-on-surface-variant hover:bg-white/5 hover:text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined text-lg">list_alt</span>
              <span>Event Catalogue</span>
            </button>
            
            <button 
              onClick={() => setActiveTab("evaluation")}
              className={`w-full flex items-center gap-4 px-6 py-3 transition-colors font-label-caps text-label-caps ${
                activeTab === "evaluation" 
                  ? "text-primary border-r-2 border-primary bg-primary-container/10" 
                  : "text-on-surface-variant hover:bg-white/5 hover:text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined text-lg">analytics</span>
              <span>Model Evaluation</span>
            </button>
            
            <button 
              onClick={() => setActiveTab("alerts")}
              className={`w-full flex items-center gap-4 px-6 py-3 transition-colors font-label-caps text-label-caps ${
                activeTab === "alerts" 
                  ? "text-primary border-r-2 border-primary bg-primary-container/10" 
                  : "text-on-surface-variant hover:bg-white/5 hover:text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined text-lg">notifications_active</span>
              <span>Space Weather Alerts</span>
            </button>
          </nav>
          
          <div className="px-6 py-6 border-t border-outline-variant/15 mt-auto">
             <button 
              onClick={() => setIsConfigOpen(true)}
              className="w-full flex items-center gap-4 text-on-surface-variant hover:text-on-surface transition-colors font-label-caps text-label-caps"
             >
              <span className="material-symbols-outlined text-lg">settings</span>
              <span>System Config</span>
            </button>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-hidden relative">
          {children}
        </main>
      </div>
      
      <SystemConfigModal 
        isOpen={isConfigOpen} 
        onClose={() => setIsConfigOpen(false)} 
      />
    </div>
  );
}
