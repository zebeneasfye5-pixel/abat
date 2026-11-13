import React from 'react';
import { Shield, Sparkles, Smartphone, Menu, User, Flame, Wifi, WifiOff } from 'lucide-react';
import { UserProfile } from '../types';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  user: UserProfile;
  onOpenAuth: () => void;
  onOpenDashboard: () => void;
  onOpenInstall: () => void;
  isOnline: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  user,
  onOpenAuth,
  onOpenDashboard,
  onOpenInstall,
  isOnline,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-stone-950/90 backdrop-blur-md border-b border-amber-900/30 transition-all">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-18 gap-2 sm:gap-4">
          
          {/* Zone 1: Brand Wordmark with 3-bars Dashboard trigger */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* 3-Horizontal Bars (የ3 ሰረዞች ምልክት - Super Dashboard) */}
            <button
              onClick={onOpenDashboard}
              title="የስርዓቱ እና የተጠቃሚዎች መቆጣጠሪያ ዳሽቦርድ (3 ሰረዞች)"
              className="p-2 shrink-0 rounded-lg bg-stone-900 border border-amber-900/40 text-amber-300 hover:bg-amber-950/50 hover:text-amber-100 hover:border-amber-700/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Logo and Name */}
            <button
              onClick={() => setActiveTab('home')}
              className="flex items-center gap-2 text-left group min-w-0"
            >
              <div className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-xl bg-gradient-to-br from-red-950 via-amber-950 to-stone-950 border border-amber-600/40 flex items-center justify-center shadow-inner group-hover:border-amber-400 transition-colors">
                <Flame className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400 animate-candle" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-base sm:text-xl font-bold font-heading text-amber-200 tracking-wide whitespace-nowrap">
                  ቀሲስ ሄኖክ
                </span>
                <span className="text-[11px] text-stone-400 font-sans tracking-tight -mt-1 hidden sm:inline">
                  የንስሐና የመንፈሳዊ አገልግሎት
                </span>
              </div>
            </button>
          </div>

          {/* Zone 2: Navigation Links (Single line, text with subtle hover) */}
          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium">
            <button
              onClick={() => setActiveTab('assembly')}
              className={`whitespace-nowrap transition-colors py-1 ${
                activeTab === 'assembly'
                  ? 'text-amber-300 border-b-2 border-amber-400 font-semibold'
                  : 'text-stone-300 hover:text-amber-200'
              }`}
            >
              ቀጥታ የዙም ጉባኤ (Zoom Meeting)
            </button>

            <button
              onClick={() => setActiveTab('secret-room')}
              className={`whitespace-nowrap flex items-center gap-1.5 transition-colors py-1 ${
                activeTab === 'secret-room'
                  ? 'text-red-400 border-b-2 border-red-500 font-semibold'
                  : 'text-stone-300 hover:text-red-300'
              }`}
            >
              <Shield className="w-3.5 h-3.5 text-red-400" />
              <span>የንስሐ ሚስጥር ቤት</span>
            </button>

            <button
              onClick={() => setActiveTab('ai-advisor')}
              className={`whitespace-nowrap flex items-center gap-1.5 transition-colors py-1 ${
                activeTab === 'ai-advisor'
                  ? 'text-amber-300 border-b-2 border-amber-400 font-semibold'
                  : 'text-stone-300 hover:text-amber-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>የኤአይ ጭንቅላት</span>
            </button>

            <button
              onClick={() => setActiveTab('wallet')}
              className={`whitespace-nowrap transition-colors py-1 ${
                activeTab === 'wallet'
                  ? 'text-amber-300 border-b-2 border-amber-400 font-semibold'
                  : 'text-stone-300 hover:text-amber-200'
              }`}
            >
              መንፈሳዊ ዋሌት
            </button>

            <button
              onClick={() => setActiveTab('offline-books')}
              className={`whitespace-nowrap flex items-center gap-1.5 transition-colors py-1 ${
                activeTab === 'offline-books'
                  ? 'text-amber-300 border-b-2 border-amber-400 font-semibold'
                  : 'text-stone-300 hover:text-amber-200'
              }`}
            >
              {!isOnline ? <WifiOff className="w-3.5 h-3.5 text-amber-400" /> : <Wifi className="w-3.5 h-3.5 text-emerald-400" />}
              <span>የኦፍላይን ጸሎት</span>
            </button>
          </nav>

          {/* Zone 3: Primary Action & Install / User Profile */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {/* Install to Phone Quick Button */}
            <button
              onClick={onOpenInstall}
              title="አፕሊኬሽኑን ወደ ስልክ ጫን"
              className="flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-950 to-stone-900 border border-amber-600/50 text-amber-200 text-[11px] sm:text-xs font-bold hover:text-white hover:border-amber-400 transition-colors shadow-sm"
            >
              <Smartphone className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="whitespace-nowrap">አፑን ጫን</span>
            </button>

            {/* User Profile / Sign In trigger */}
            <button
              onClick={onOpenAuth}
              className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-lg bg-gradient-to-r from-red-950/70 to-amber-950/70 border border-amber-700/50 text-amber-200 hover:border-amber-400 transition-colors text-[11px] sm:text-xs font-medium shadow-sm"
            >
              <div className="w-5 h-5 sm:w-6 sm:h-6 shrink-0 rounded-full bg-amber-600/30 flex items-center justify-center text-amber-300 font-bold border border-amber-500/30">
                {user.isAuthenticated ? user.baptismalName.charAt(0) : <User className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
              </div>
              <span className="whitespace-nowrap max-w-[78px] sm:max-w-[120px] truncate">
                {user.isAuthenticated ? user.baptismalName : 'ግባ / ተመዝገብ'}
              </span>
            </button>
          </div>

        </div>
      </div>
    </header>
  );
};
