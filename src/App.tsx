import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { HeroSection } from './components/HeroSection';
import { AssemblyHall } from './components/AssemblyHall';
import { SecretConfessionRoom } from './components/SecretConfessionRoom';
import { SpiritualAIAdvisor } from './components/SpiritualAIAdvisor';
import { SpiritualWallet } from './components/SpiritualWallet';
import { OfflineLibrary } from './components/OfflineLibrary';
import { SuperDashboardDrawer } from './components/SuperDashboardDrawer';
import { AuthProfileModal } from './components/AuthProfileModal';
import { PWAInstallModal } from './components/PWAInstallModal';
import { UserProfile, ConfessionBooking, WalletState, WalletTransaction } from './types';
import { fetchConfessions, fetchWalletData } from './services/api';
import { usePWAInstall } from './hooks/usePWAInstall';
import { Shield, Users, Sparkles, Wallet, BookOpen, Flame, WifiOff, Smartphone } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('home');
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);

  // User Profile
  const [user, setUser] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('qh_user_profile');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    return {
      id: 'usr-1',
      fullName: 'ዮሐንስ ተስፋዬ',
      baptismalName: 'ወልደ ዮሐንስ',
      phone: '+251911223344',
      email: 'yohannes@orthodox.et',
      role: 'child',
      confessorPriest: 'ቀሲስ ሄኖክ',
      confessionStage: 'መካከለኛ',
      avatarSeed: 'yohannes',
      isAuthenticated: true,
    };
  });

  // Confession bookings
  const [bookings, setBookings] = useState<ConfessionBooking[]>([]);

  // Wallet
  const [walletState, setWalletState] = useState<WalletState>({
    totalBalance: 486500.0,
    tithes: 215400.0,
    charity: 182300.0,
    churchSupport: 88800.0,
  });
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);

  // Network status listeners & register Service Worker
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    // Load initial data
    fetchConfessions().then(setBookings);
    fetchWalletData().then((data) => {
      if (data.balance) setWalletState(data.balance);
      if (data.transactions) setTransactions(data.transactions);
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleUpdateUser = (updated: UserProfile) => {
    setUser(updated);
    localStorage.setItem('qh_user_profile', JSON.stringify(updated));
  };

  const handleUpdateBookingStatus = (id: string, status: 'confirmed' | 'completed' | 'cancelled') => {
    setBookings((prev) =>
      prev.map((b) => (b.id === id ? { ...b, status } : b))
    );
  };

  const handleGivingSuccess = (newTx: WalletTransaction, newBal: WalletState) => {
    setTransactions((prev) => [newTx, ...prev]);
    setWalletState(newBal);
  };

  const { isInstalled } = usePWAInstall();

  return (
    <div className="min-h-screen flex flex-col bg-stone-950 text-stone-100 selection:bg-amber-700/30 selection:text-amber-200">
      
      {/* Offline Toast Banner */}
      {!isOnline && (
        <div className="bg-amber-600 text-stone-950 text-xs py-2 px-4 text-center font-bold flex items-center justify-center gap-2">
          <WifiOff className="w-4 h-4" />
          <span>የኢንተርኔት ግንኙነት የለም — መተግበሪያው በሙሉ አቅሙ በስልክዎ ኦፍላይን ማህደረ-ትውስታ እየሰራ ነው።</span>
        </div>
      )}

      {/* Top Navigation Bar with 3-bars Dashboard trigger */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onOpenDashboard={() => setIsDashboardOpen(true)}
        onOpenInstall={() => setIsInstallModalOpen(true)}
        isOnline={isOnline}
      />

      {/* Quick Mobile PWA Install Callout Banner */}
      {!isInstalled && (
        <div className="sm:hidden bg-gradient-to-r from-red-950 via-stone-900 to-amber-950 border-b border-amber-800/40 px-4 py-2 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-stone-200">
            <Smartphone className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="font-semibold text-[11px]">ቀሲስ ሄኖክ አፕን ወደ ስልክ ጫን</span>
          </div>
          <button
            onClick={() => setIsInstallModalOpen(true)}
            className="px-2.5 py-1 rounded-md bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-[11px] shadow transition"
          >
            አሁን ጫን
          </button>
        </div>
      )}

      {/* Main Dynamic View Content */}
      <main className="flex-1 pb-20 lg:pb-12">
        {activeTab === 'home' && (
          <>
            <HeroSection onNavigate={(tab) => setActiveTab(tab)} />
            
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                
                {/* Card 1: Assembly */}
                <div
                  onClick={() => setActiveTab('assembly')}
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

                {/* Card 2: Secret Room */}
                <div
                  onClick={() => setActiveTab('secret-room')}
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

                {/* Card 3: AI Brain */}
                <div
                  onClick={() => setActiveTab('ai-advisor')}
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

                {/* Card 4: Spiritual Wallet */}
                <div
                  onClick={() => setActiveTab('wallet')}
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

        {activeTab === 'assembly' && <AssemblyHall user={user} />}
        {activeTab === 'secret-room' && (
          <SecretConfessionRoom
            user={user}
            bookings={bookings}
            onCompleteConfession={(id) => handleUpdateBookingStatus(id, 'completed')}
          />
        )}
        {activeTab === 'ai-advisor' && <SpiritualAIAdvisor user={user} />}
        {activeTab === 'wallet' && (
          <SpiritualWallet
            user={user}
            walletState={walletState}
            transactions={transactions}
            onGivingSuccess={handleGivingSuccess}
          />
        )}
        {activeTab === 'offline-books' && <OfflineLibrary />}
      </main>

      {/* Mobile Floating Bottom Bar for Quick Navigation */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-stone-950/95 backdrop-blur-md border-t border-amber-900/30 px-3 py-2 flex items-center justify-around text-[10px]">
        <button
          onClick={() => setActiveTab('home')}
          className={`flex flex-col items-center gap-1 py-1 px-2 ${activeTab === 'home' ? 'text-amber-300 font-bold' : 'text-stone-400'}`}
        >
          <Flame className="w-4 h-4" />
          <span>መነሻ</span>
        </button>

        <button
          onClick={() => setActiveTab('assembly')}
          className={`flex flex-col items-center gap-1 py-1 px-2 ${activeTab === 'assembly' ? 'text-amber-300 font-bold' : 'text-stone-400'}`}
        >
          <Users className="w-4 h-4" />
          <span>ጉባኤ</span>
        </button>

        <button
          onClick={() => setActiveTab('secret-room')}
          className={`flex flex-col items-center gap-1 py-1 px-2 ${activeTab === 'secret-room' ? 'text-red-400 font-bold' : 'text-stone-400'}`}
        >
          <Shield className="w-4 h-4 text-red-400" />
          <span>ሚስጥር ቤት</span>
        </button>

        <button
          onClick={() => setActiveTab('ai-advisor')}
          className={`flex flex-col items-center gap-1 py-1 px-2 ${activeTab === 'ai-advisor' ? 'text-amber-300 font-bold' : 'text-stone-400'}`}
        >
          <Sparkles className="w-4 h-4" />
          <span>ኤአይ</span>
        </button>

        <button
          onClick={() => setActiveTab('wallet')}
          className={`flex flex-col items-center gap-1 py-1 px-2 ${activeTab === 'wallet' ? 'text-amber-300 font-bold' : 'text-stone-400'}`}
        >
          <Wallet className="w-4 h-4" />
          <span>ዋሌት</span>
        </button>

        <button
          onClick={() => setActiveTab('offline-books')}
          className={`flex flex-col items-center gap-1 py-1 px-2 ${activeTab === 'offline-books' ? 'text-amber-300 font-bold' : 'text-stone-400'}`}
        >
          <BookOpen className="w-4 h-4" />
          <span>ጸሎት</span>
        </button>
      </div>

      {/* Reverent Footer */}
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

      {/* 3-Bars Hamburger Super Dashboard Drawer */}
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

      {/* User Profile & Sign In Modal */}
      <AuthProfileModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        currentUser={user}
        onUpdateUser={handleUpdateUser}
      />

      {/* PWA Phone Installation Modal */}
      <PWAInstallModal
        isOpen={isInstallModalOpen}
        onClose={() => setIsInstallModalOpen(false)}
      />

    </div>
  );
}
