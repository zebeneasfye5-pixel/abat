import React, { useState, useEffect, Suspense, lazy, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { HeroSection } from './components/HeroSection';
import {
  UserProfile,
  ConfessionBooking,
  WalletState,
  WalletTransaction,
  BankAccountInfo,
  MinistryBankAccounts,
} from './types';
import {
  fetchConfessions,
  fetchWalletData,
  fetchCurrentUser,
  getSavedUserSnapshot,
  updateConfessionStatus,
} from './services/api';
import { usePWAInstall } from './hooks/usePWAInstall';
import {
  Shield,
  Users,
  Sparkles,
  Wallet,
  BookOpen,
  Flame,
  WifiOff,
  Smartphone,
  Lock,
  LogIn,
  ArrowLeft,
  Home,
} from 'lucide-react';

// Lazy-load secondary views & modals so the initial Home bundle loads fast on mobile networks
const AssemblyHall = lazy(() => import('./components/AssemblyHall').then((m) => ({ default: m.AssemblyHall })));
const SecretConfessionRoom = lazy(() => import('./components/SecretConfessionRoom').then((m) => ({ default: m.SecretConfessionRoom })));
const SpiritualAIAdvisor = lazy(() => import('./components/SpiritualAIAdvisor').then((m) => ({ default: m.SpiritualAIAdvisor })));
const SpiritualWallet = lazy(() => import('./components/SpiritualWallet').then((m) => ({ default: m.SpiritualWallet })));
const OfflineLibrary = lazy(() => import('./components/OfflineLibrary').then((m) => ({ default: m.OfflineLibrary })));
const SuperDashboardDrawer = lazy(() => import('./components/SuperDashboardDrawer').then((m) => ({ default: m.SuperDashboardDrawer })));
const AuthProfileModal = lazy(() => import('./components/AuthProfileModal').then((m) => ({ default: m.AuthProfileModal })));
const PWAInstallModal = lazy(() => import('./components/PWAInstallModal').then((m) => ({ default: m.PWAInstallModal })));

const EMPTY_GUEST_USER: UserProfile = {
  id: '',
  fullName: '',
  baptismalName: '',
  phone: '',
  email: '',
  role: 'child',
  confessorPriest: 'ቀሲስ ሄኖክ',
  confessionStage: 'ጀማሪ',
  avatarSeed: '',
  isAuthenticated: false,
};

const TAB_TITLES: Record<string, string> = {
  assembly: 'የቀጥታ ዙም ጉባኤ (Zoom Meeting)',
  'secret-room': 'የንስሐ ሚስጥር ቤት',
  'ai-advisor': 'የኤአይ መንፈሳዊ ጭንቅላት',
  wallet: 'መንፈሳዊ ዋሌት እና ባንክ',
  'offline-books': 'የኦፍላይን ጸሎትና መጻሕፍት',
};

const TabLoader = () => (
  <div className="max-w-4xl mx-auto px-4 py-16 flex flex-col items-center justify-center text-amber-300 space-y-3">
    <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
    <p className="text-xs text-stone-400">በመክፈት ላይ...</p>
  </div>
);

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('home');
  const [tabHistory, setTabHistory] = useState<string[]>(['home']);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [installBannerDismissed, setInstallBannerDismissed] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [authChecked, setAuthChecked] = useState(false);

  // Immediately hydrate saved authenticated user synchronously so closing & reopening NEVER asks to re-register
  const [user, setUser] = useState<UserProfile>(() => getSavedUserSnapshot() || EMPTY_GUEST_USER);

  // Confession bookings
  const [bookings, setBookings] = useState<ConfessionBooking[]>([]);

  // Wallet & Bank Accounts
  const [walletState, setWalletState] = useState<WalletState>({
    totalBalance: 0,
    tithes: 0,
    charity: 0,
    churchSupport: 0,
    withdrawnTotal: 0,
  });
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [ministryBanks, setMinistryBanks] = useState<MinistryBankAccounts | undefined>(undefined);
  const [userBankAccount, setUserBankAccount] = useState<BankAccountInfo | null>(null);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Sync/re-hydrate verified user with backend without erasing local session on Render cold restarts
    fetchCurrentUser()
      .then((loggedInUser) => {
        if (loggedInUser) {
          setUser(loggedInUser);
        }
      })
      .finally(() => setAuthChecked(true));

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Only load bookings and wallet data when the user is signed in
  useEffect(() => {
    if (!user.isAuthenticated) return;
    fetchConfessions().then(setBookings);
    fetchWalletData().then((data) => {
      if (data.balance) setWalletState(data.balance);
      if (data.transactions) setTransactions(data.transactions);
      if (data.ministryBanks) setMinistryBanks(data.ministryBanks);
      if (data.userBankAccount !== undefined) setUserBankAccount(data.userBankAccount);
    });
  }, [user.isAuthenticated]);

  // Browser Hardware/Chrome Back Button (`popstate`) Integration
  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      // Close open overlays first before popping main tab
      if (isDashboardOpen) {
        setIsDashboardOpen(false);
        return;
      }
      if (isAuthModalOpen) {
        setIsAuthModalOpen(false);
        return;
      }
      if (isInstallModalOpen) {
        setIsInstallModalOpen(false);
        return;
      }
      const targetTab = event.state?.tab;
      if (targetTab && typeof targetTab === 'string') {
        setActiveTab(targetTab);
        setTabHistory((prev) => (prev.length > 1 ? prev.slice(0, -1) : ['home']));
      } else {
        setActiveTab('home');
        setTabHistory(['home']);
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [isDashboardOpen, isAuthModalOpen, isInstallModalOpen]);

  const handleUpdateUser = (updated: UserProfile) => {
    setUser(updated);
  };

  const navigateToTab = useCallback(
    (tab: string) => {
      if (tab === activeTab) return;
      setTabHistory((prev) => [...prev, tab]);
      setActiveTab(tab);
      try {
        window.history.pushState({ tab }, '', `#${tab}`);
      } catch {}
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [activeTab]
  );

  const handleNavigate = (tab: string) => {
    const protectedTabs = ['assembly', 'secret-room', 'wallet'];
    if (protectedTabs.includes(tab) && !user.isAuthenticated) {
      navigateToTab(tab);
      setIsAuthModalOpen(true);
      return;
    }
    navigateToTab(tab);
  };

  const handleGoBack = useCallback(() => {
    if (isDashboardOpen) {
      setIsDashboardOpen(false);
      return;
    }
    if (isAuthModalOpen) {
      setIsAuthModalOpen(false);
      return;
    }
    if (isInstallModalOpen) {
      setIsInstallModalOpen(false);
      return;
    }
    if (tabHistory.length > 1) {
      const nextHistory = tabHistory.slice(0, -1);
      const prevTab = nextHistory[nextHistory.length - 1] || 'home';
      setTabHistory(nextHistory);
      setActiveTab(prevTab);
    } else {
      setTabHistory(['home']);
      setActiveTab('home');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [isDashboardOpen, isAuthModalOpen, isInstallModalOpen, tabHistory]);

  const handleOpenDashboard = () => {
    if (!user.isAuthenticated) {
      setIsAuthModalOpen(true);
      return;
    }
    try {
      window.history.pushState({ tab: activeTab, modal: 'dashboard' }, '');
    } catch {}
    setIsDashboardOpen(true);
  };

  const handleUpdateBookingStatus = async (id: string, status: 'confirmed' | 'completed' | 'cancelled') => {
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status } : b)));
    try {
      await updateConfessionStatus(id, status);
    } catch {}
  };

  const handleGivingSuccess = (newTx: WalletTransaction, newBal: WalletState) => {
    setTransactions((prev) => [newTx, ...prev]);
    setWalletState(newBal);
  };

  const handleBankConfigUpdated = (mBanks: MinistryBankAccounts, uBank: BankAccountInfo | null) => {
    setMinistryBanks(mBanks);
    setUserBankAccount(uBank);
  };

  const { isInstalled, isInstallable, install } = usePWAInstall();

  const handleQuickInstall = async () => {
    if (isInstallable) {
      const outcome = await install();
      if (outcome === 'accepted') return;
    }
    setIsInstallModalOpen(true);
  };

  const renderAuthGate = (title: string) => (
    <div className="max-w-xl mx-auto px-4 py-16">
      <div className="p-8 rounded-3xl bg-stone-900/80 border-2 border-amber-700/50 shadow-2xl text-center space-y-5">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-950 border border-amber-600/50 flex items-center justify-center text-amber-300">
          <Lock className="w-8 h-8" />
        </div>
        <h2 className="text-xl sm:text-2xl font-heading font-bold text-amber-100">{title}</h2>
        <p className="text-xs text-stone-300 leading-relaxed">
          እያንዳንዱ ተጠቃሚ በራሱ ስም እና ማንነት እንዲገባ በቅድሚያ ወደ አካውንትዎ ይግቡ ወይም አዲስ ይመዝገቡ።
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            onClick={() => setIsAuthModalOpen(true)}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-red-900 via-amber-900 to-red-900 border border-amber-500/60 text-white font-bold text-sm inline-flex items-center gap-2 hover:scale-[1.02] transition"
          >
            <LogIn className="w-4 h-4" />
            <span>ግባ / አዲስ ተመዝገብ</span>
          </button>
          <button
            onClick={handleGoBack}
            className="px-5 py-3 rounded-xl bg-stone-900 border border-stone-700 text-stone-200 font-bold text-sm inline-flex items-center gap-2 hover:bg-stone-800 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>ወደ ኋላ ተመለስ</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-stone-950 text-stone-100 selection:bg-amber-700/30 selection:text-amber-200">
      
      {!isOnline && (
        <div className="bg-amber-600 text-stone-950 text-xs py-2 px-4 text-center font-bold flex items-center justify-center gap-2">
          <WifiOff className="w-4 h-4" />
          <span>የኢንተርኔት ግንኙነት የለም — መተግበሪያው በስልክዎ ኦፍላይን ማህደረ-ትውስታ እየሰራ ነው።</span>
        </div>
      )}

      <Navbar
        activeTab={activeTab}
        setActiveTab={handleNavigate}
        user={user}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onOpenDashboard={handleOpenDashboard}
        onOpenInstall={() => setIsInstallModalOpen(true)}
        isOnline={isOnline}
        canGoBack={activeTab !== 'home'}
        onGoBack={handleGoBack}
      />

      {/* Sticky In-App Back Bar whenever user enters ANY sub-page */}
      {activeTab !== 'home' && (
        <div className="sticky top-16 sm:top-18 z-30 bg-stone-900/95 backdrop-blur-md border-b border-amber-800/30 px-3 sm:px-6 py-2">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
            <button
              onClick={handleGoBack}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-950/80 hover:bg-amber-900 border border-amber-600/50 text-amber-200 text-xs font-bold transition shadow-sm"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>ወደ ኋላ ተመለስ (Back)</span>
            </button>

            <span className="text-xs font-heading font-semibold text-amber-300 truncate">
              {TAB_TITLES[activeTab] || ''}
            </span>

            <button
              onClick={() => navigateToTab('home')}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-stone-950 hover:bg-stone-800 border border-stone-700 text-stone-300 text-xs font-medium transition shrink-0"
              title="ወደ ዋና መነሻ"
            >
              <Home className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">ዋና መነሻ</span>
            </button>
          </div>
        </div>
      )}

      {!isInstalled && !installBannerDismissed && activeTab === 'home' && (
        <div className="sm:hidden bg-gradient-to-r from-red-950 via-stone-900 to-amber-950 border-b border-amber-800/40 px-3 py-2 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-stone-200 min-w-0">
            <img src="/pwa-192x192.png" alt="ቀሲስ ሄኖክ" className="w-6 h-6 rounded-md border border-amber-500/50 shrink-0" />
            <span className="font-semibold text-[11px] truncate">ቀሲስ ሄኖክ አፕን ወደ ስልክ ጫን</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleQuickInstall}
              className="px-2.5 py-1 rounded-md bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-[11px] shadow transition inline-flex items-center gap-1"
            >
              <Smartphone className="w-3 h-3" />
              <span>{isInstallable ? 'አሁን ጫን' : 'መጫኛ'}</span>
            </button>
            <button
              onClick={() => setInstallBannerDismissed(true)}
              aria-label="Dismiss install banner"
              className="p-1 text-stone-400 hover:text-stone-200 text-xs leading-none"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 pb-20 lg:pb-12">
        {activeTab === 'home' && (
          <>
            <HeroSection onNavigate={handleNavigate} />

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                
                <div
                  onClick={() => handleNavigate('assembly')}
                  className="p-4 sm:p-5 rounded-2xl bg-stone-900/60 border border-stone-800 hover:border-amber-600/60 transition-all cursor-pointer group shadow-lg flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-amber-950/70 border border-amber-600/40 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform shrink-0">
                      <Users className="w-5 h-5" />
                    </div>
                    <h4 className="text-sm font-heading font-bold text-amber-200">የቀጥታ ዙም ጉባኤ (Zoom Meeting)</h4>
                  </div>
                  <span className="text-amber-400 font-bold group-hover:translate-x-1 transition-transform">→</span>
                </div>

                <div
                  onClick={() => handleNavigate('secret-room')}
                  className="p-4 sm:p-5 rounded-2xl bg-stone-900/60 border border-stone-800 hover:border-red-600/60 transition-all cursor-pointer group shadow-lg flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-red-950/70 border border-red-600/40 flex items-center justify-center text-red-400 group-hover:scale-105 transition-transform shrink-0">
                      <Shield className="w-5 h-5" />
                    </div>
                    <h4 className="text-sm font-heading font-bold text-amber-200">የንስሐ ሚስጥር ቤት</h4>
                  </div>
                  <span className="text-red-400 font-bold group-hover:translate-x-1 transition-transform">→</span>
                </div>

                <div
                  onClick={() => handleNavigate('ai-advisor')}
                  className="p-4 sm:p-5 rounded-2xl bg-stone-900/60 border border-stone-800 hover:border-amber-600/60 transition-all cursor-pointer group shadow-lg flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-amber-950/70 border border-amber-600/40 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform shrink-0">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <h4 className="text-sm font-heading font-bold text-amber-200">የኤአይ መንፈሳዊ ጭንቅላት</h4>
                  </div>
                  <span className="text-amber-400 font-bold group-hover:translate-x-1 transition-transform">→</span>
                </div>

                <div
                  onClick={() => handleNavigate('wallet')}
                  className="p-4 sm:p-5 rounded-2xl bg-stone-900/60 border border-stone-800 hover:border-emerald-600/60 transition-all cursor-pointer group shadow-lg flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-emerald-950/70 border border-emerald-600/40 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform shrink-0">
                      <Wallet className="w-5 h-5" />
                    </div>
                    <h4 className="text-sm font-heading font-bold text-amber-200">መንፈሳዊ ዋሌት</h4>
                  </div>
                  <span className="text-emerald-400 font-bold group-hover:translate-x-1 transition-transform">→</span>
                </div>

              </div>
            </div>
          </>
        )}

        <Suspense fallback={<TabLoader />}>
          {activeTab === 'assembly' &&
            (user.isAuthenticated ? (
              <AssemblyHall user={user} onLeaveMeeting={handleGoBack} />
            ) : authChecked ? (
              renderAuthGate('ወደ ቀጥታ የዙም ጉባኤ ለመግባት ይግቡ')
            ) : <TabLoader />)}

          {activeTab === 'secret-room' &&
            (user.isAuthenticated ? (
              <SecretConfessionRoom
                user={user}
                bookings={bookings}
                onCompleteConfession={(id) => handleUpdateBookingStatus(id, 'completed')}
              />
            ) : authChecked ? (
              renderAuthGate('ወደ ንስሐ ሚስጥር ቤት ለመግባት ይግቡ')
            ) : <TabLoader />)}

          {activeTab === 'ai-advisor' && <SpiritualAIAdvisor user={user} />}

          {activeTab === 'wallet' &&
            (user.isAuthenticated ? (
              <SpiritualWallet
                user={user}
                walletState={walletState}
                transactions={transactions}
                ministryBanks={ministryBanks}
                userBankAccount={userBankAccount}
                onGivingSuccess={handleGivingSuccess}
                onBankConfigUpdated={handleBankConfigUpdated}
              />
            ) : authChecked ? (
              renderAuthGate('መንፈሳዊ ዋሌት ለመጠቀም ይግቡ')
            ) : <TabLoader />)}

          {activeTab === 'offline-books' && <OfflineLibrary />}
        </Suspense>
      </main>

      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-stone-950/95 backdrop-blur-md border-t border-amber-900/30 px-3 py-2 flex items-center justify-around text-[10px]">
        <button
          onClick={() => handleNavigate('home')}
          className={`flex flex-col items-center gap-1 py-1 px-2 ${activeTab === 'home' ? 'text-amber-300 font-bold' : 'text-stone-400'}`}
        >
          <Flame className="w-4 h-4" />
          <span>መነሻ</span>
        </button>

        <button
          onClick={() => handleNavigate('assembly')}
          className={`flex flex-col items-center gap-1 py-1 px-2 ${activeTab === 'assembly' ? 'text-amber-300 font-bold' : 'text-stone-400'}`}
        >
          <Users className="w-4 h-4" />
          <span>ዙም</span>
        </button>

        <button
          onClick={() => handleNavigate('secret-room')}
          className={`flex flex-col items-center gap-1 py-1 px-2 ${activeTab === 'secret-room' ? 'text-red-400 font-bold' : 'text-stone-400'}`}
        >
          <Shield className="w-4 h-4 text-red-400" />
          <span>ሚስጥር ቤት</span>
        </button>

        <button
          onClick={() => handleNavigate('ai-advisor')}
          className={`flex flex-col items-center gap-1 py-1 px-2 ${activeTab === 'ai-advisor' ? 'text-amber-300 font-bold' : 'text-stone-400'}`}
        >
          <Sparkles className="w-4 h-4" />
          <span>ኤአይ</span>
        </button>

        <button
          onClick={() => handleNavigate('wallet')}
          className={`flex flex-col items-center gap-1 py-1 px-2 ${activeTab === 'wallet' ? 'text-amber-300 font-bold' : 'text-stone-400'}`}
        >
          <Wallet className="w-4 h-4" />
          <span>ዋሌት</span>
        </button>

        <button
          onClick={() => handleNavigate('offline-books')}
          className={`flex flex-col items-center gap-1 py-1 px-2 ${activeTab === 'offline-books' ? 'text-amber-300 font-bold' : 'text-stone-400'}`}
        >
          <BookOpen className="w-4 h-4" />
          <span>ጸሎት</span>
        </button>
      </div>

      <footer className="border-t border-amber-900/20 bg-stone-950 py-8 text-center text-xs text-stone-500 space-y-2">
        <div className="flex items-center justify-center gap-2">
          <Flame className="w-4 h-4 text-amber-500 animate-candle" />
          <span className="font-heading font-semibold text-amber-200">ቀሲስ ሄኖክ — የንስሐና የመንፈሳዊ አገልግሎት ሥርዓት</span>
        </div>
        <p className="max-w-md mx-auto text-stone-400">
          "አቤቱ፥ ንጹሕ ልብን ፍጠርልኝ፥ የቀናውንም መንፈስ በውስጤ አድስ።" (መዝሙረ ዳዊት ፶፩:፲)
        </p>
        <p className="text-[11px] text-stone-600">
          © {new Date().getFullYear()} ቀሲስ ሄኖክ. ሁሉም መብቱ የተጠበቀ ነው።
        </p>
      </footer>

      <Suspense fallback={null}>
        {isDashboardOpen && (
          <SuperDashboardDrawer
            isOpen={isDashboardOpen}
            onClose={() => setIsDashboardOpen(false)}
            bookings={bookings}
            onUpdateBookingStatus={handleUpdateBookingStatus}
            walletState={walletState}
            transactions={transactions}
            currentUser={user}
            onUpdateUser={handleUpdateUser}
            onOpenAuthModal={() => setIsAuthModalOpen(true)}
          />
        )}

        {isAuthModalOpen && (
          <AuthProfileModal
            isOpen={isAuthModalOpen}
            onClose={() => setIsAuthModalOpen(false)}
            currentUser={user}
            onUpdateUser={handleUpdateUser}
          />
        )}

        {isInstallModalOpen && (
          <PWAInstallModal
            isOpen={isInstallModalOpen}
            onClose={() => setIsInstallModalOpen(false)}
          />
        )}
      </Suspense>

    </div>
  );
}
