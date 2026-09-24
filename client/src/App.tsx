import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Sidebar, type NavTab } from './components/shell/Sidebar';
import { Header } from './components/shell/Header';
import { DashboardPage } from './pages/DashboardPage';
import { StudentsPage } from './pages/StudentsPage';
import { FeesPage } from './pages/FeesPage';
import { AutomationsPage } from './pages/AutomationsPage';
import { MessagesPage } from './pages/MessagesPage';
import { SyncPage } from './pages/SyncPage';
import { SettingsPage } from './pages/SettingsPage';
import { PublicPayPage } from './pages/PublicPayPage';
import { LoginPage } from './pages/LoginPage';
import { SetupPage } from './pages/SetupPage';
import { AdminChatbot } from './components/AdminChatbot';
import { api, API_BASE, getStoredToken } from './lib/api';

const AppShell: React.FC = () => {
  const { isAuthenticated, isLoading, isSetupRequired, institution } = useAuth();
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [cashierMode, setCashierMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [liveEvent, setLiveEvent] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<'LOGIN' | 'SETUP' | null>(null);
  const [mockMode, setMockMode] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('campusflow_sidebar_collapsed') === 'true';
  });

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('campusflow_sidebar_collapsed', String(next));
      return next;
    });
  };

  // Check if we are viewing a public payment link (/pay/:token)
  const pathname = window.location.pathname;
  const isPayRoute = pathname.startsWith('/pay/');
  const payToken = isPayRoute ? pathname.replace('/pay/', '') : null;

  // Real-time SSE Live Event Stream (Only active when authenticated)
  useEffect(() => {
    if (isPayRoute || !isAuthenticated) return;

    let eventSource: EventSource | null = null;
    try {
      const token = getStoredToken();
      const streamUrl = `${API_BASE}/dashboard/live-stream${token ? `?token=${encodeURIComponent(token)}` : ''}`;
      eventSource = new EventSource(streamUrl, { withCredentials: true } as any);

      const handleUpdate = (type: string, data: any) => {
        window.dispatchEvent(new CustomEvent('campusflow:data-updated', { detail: { type, ...data } }));
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleUpdate('MESSAGE', data);
        } catch {
          // heartbeat
        }
      };

      eventSource.addEventListener('SYNC_COMPLETED', (event: any) => {
        try {
          const data = JSON.parse(event.data);
          const updatedCount = (data.metrics?.rowsAdded || 0) + (data.metrics?.rowsUpdated || 0);
          if (updatedCount > 0) {
            setLiveEvent(`⚡ Auto-synced with Google Sheets: ${updatedCount} student record(s) updated.`);
            setTimeout(() => setLiveEvent(null), 5000);
          }
          handleUpdate('SYNC_COMPLETED', data);
        } catch (e) {
          handleUpdate('SYNC_COMPLETED', {});
        }
      });

      eventSource.addEventListener('DATA_UPDATED', (event: any) => {
        try {
          const data = JSON.parse(event.data);
          handleUpdate('DATA_UPDATED', data);
        } catch (e) {
          handleUpdate('DATA_UPDATED', {});
        }
      });

      eventSource.addEventListener('PAYMENT_CAPTURED', (event: any) => {
        try {
          const data = JSON.parse(event.data);
          setLiveEvent(`💰 Payment received: ₹${data.amount} for ${data.studentName} (${data.receiptNumber})`);
          setTimeout(() => setLiveEvent(null), 5000);
          handleUpdate('PAYMENT_CAPTURED', data);
        } catch (e) {
          handleUpdate('PAYMENT_CAPTURED', {});
        }
      });

      eventSource.addEventListener('PAYMENT_RECEIVED', (event: any) => {
        try {
          const data = JSON.parse(event.data);
          handleUpdate('PAYMENT_RECEIVED', data);
        } catch (e) {
          handleUpdate('PAYMENT_RECEIVED', {});
        }
      });

      eventSource.onerror = () => {
        // SSE gracefully reconnects automatically
      };
    } catch (err) {
      console.warn('SSE stream unavailable in offline mode');
    }

    return () => {
      eventSource?.close();
    };
  }, [isPayRoute, isAuthenticated]);

  // Query mockMode from backend
  useEffect(() => {
    if (!isAuthenticated) return;
    api.getDashboardSummary().then((res: any) => {
      if (res?.mockMode) {
        setMockMode(true);
      }
    }).catch(() => {});
  }, [isAuthenticated]);

  // Keyboard shortcut Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const searchInput = document.querySelector('input[placeholder*="Search records"]') as HTMLInputElement;
        searchInput?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Public Pay route does not require authentication
  if (isPayRoute && payToken) {
    return <PublicPayPage token={payToken} onBackToApp={() => (window.location.href = '/')} />;
  }

  // Loading Splash Screen
  if (isLoading) {
    return (
      <div className="min-h-screen w-full bg-background flex flex-col items-center justify-center">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary-container flex items-center justify-center text-on-primary font-bold text-xl mb-4 animate-pulse">
          A
        </div>
        <p className="font-headline-sm text-sm text-on-surface-variant animate-pulse">
          Connecting to AlphaXync Console...
        </p>
      </div>
    );
  }

  // Unauthenticated Flow: Login or Initial Setup
  if (!isAuthenticated) {
    const effectiveMode = authMode ?? (isSetupRequired ? 'SETUP' : 'LOGIN');
    if (effectiveMode === 'SETUP') {
      return <SetupPage onGoToLogin={() => setAuthMode('LOGIN')} />;
    }
    return <LoginPage onGoToSetup={() => setAuthMode('SETUP')} />;
  }

  const getTitle = () => {
    switch (currentTab) {
      case 'dashboard':
        return 'Operations Console';
      case 'students':
        return 'Student Directory & Profiles';
      case 'fees':
        return 'Fees & Protected Ledger';
      case 'automations':
        return 'Automation Engine';
      case 'messages':
        return 'WhatsApp Communications';
      case 'sync':
        return 'Data Sync & Integrity';
      case 'settings':
        return 'Configuration';
    }
  };

  return (
    <div className="bg-background font-body-md text-on-surface antialiased min-h-screen">
      {/* Real-time SSE Live Toast */}
      {liveEvent && (
        <div className="fixed bottom-6 right-6 z-50 bg-secondary text-on-secondary px-4 py-2.5 rounded shadow-xl flex items-center gap-2 font-body-sm animate-bounce">
          <span className="material-symbols-outlined text-[18px]">verified</span>
          <span>{liveEvent}</span>
          <button onClick={() => setLiveEvent(null)} className="ml-2 text-white/80 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* Left Sidebar with Real Institution Name & Code from Auth Context */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        cashierMode={cashierMode}
        institutionName={institution?.name || "St. Xavier's Eng. College"}
        institutionCode={institution?.code || 'STXAVIER'}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebar}
      />

      {/* Content Area with Top Header */}
      <div className={`transition-all duration-300 ease-in-out ${sidebarCollapsed ? 'pl-[72px]' : 'pl-64'}`}>
        <Header
          currentTitle={getTitle()}
          cashierMode={cashierMode}
          onToggleCashierMode={() => setCashierMode((prev) => !prev)}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          mockMode={mockMode}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={toggleSidebar}
        />

        <main className="relative w-full pt-14 px-space-xl py-space-lg bg-background min-h-screen">
          {currentTab === 'dashboard' && (
            <DashboardPage onNavigateTab={setCurrentTab} cashierMode={cashierMode} />
          )}
          {currentTab === 'students' && <StudentsPage cashierMode={cashierMode} />}
          {currentTab === 'fees' && <FeesPage cashierMode={cashierMode} />}
          {currentTab === 'automations' && <AutomationsPage />}
          {currentTab === 'messages' && <MessagesPage />}
          {currentTab === 'sync' && <SyncPage />}
          {currentTab === 'settings' && <SettingsPage />}
        </main>
      </div>

      {/* AlphaXync AI Copilot Admin Chatbot */}
      <AdminChatbot />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
};

export default App;
