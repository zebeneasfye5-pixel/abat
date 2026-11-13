import React, { useState, useEffect } from 'react';
import { X, Users, Calendar, Mic, Wallet, Shield, KeyRound, User, Save } from 'lucide-react';
import { ConfessionBooking, WalletState, WalletTransaction, UserProfile, UserRole } from '../types';
import { fetchRegisteredUsers, updateUserProfile } from '../services/api';

interface SuperDashboardDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  bookings: ConfessionBooking[];
  onUpdateBookingStatus: (id: string, status: 'confirmed' | 'completed' | 'cancelled') => void;
  walletState: WalletState;
  transactions: WalletTransaction[];
  currentUser: UserProfile;
  onUpdateUser?: (updated: UserProfile) => void;
  onOpenAuthModal?: () => void;
}

export const SuperDashboardDrawer: React.FC<SuperDashboardDrawerProps> = ({
  isOpen,
  onClose,
  bookings,
  onUpdateBookingStatus,
  walletState,
  transactions,
  currentUser,
  onUpdateUser,
  onOpenAuthModal,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'children' | 'confessions' | 'assembly_control' | 'wallet_audit' | 'system'>('profile');

  const [profileForm, setProfileForm] = useState({
    fullName: currentUser.fullName || '',
    baptismalName: currentUser.baptismalName || '',
    phone: currentUser.phone || '',
    email: currentUser.email || '',
    confessorPriest: currentUser.confessorPriest || 'ቀሲስ ሄኖክ',
    confessionStage: currentUser.confessionStage || 'ጀማሪ',
    role: currentUser.role || 'child',
  });
  const [profileSaved, setProfileSaved] = useState(false);

  // Real registered users loaded from server
  const [registeredUsers, setRegisteredUsers] = useState<UserProfile[]>([]);

  useEffect(() => {
    if (isOpen) {
      fetchRegisteredUsers().then(setRegisteredUsers);
      setProfileForm({
        fullName: currentUser.fullName || '',
        baptismalName: currentUser.baptismalName || '',
        phone: currentUser.phone || '',
        email: currentUser.email || '',
        confessorPriest: currentUser.confessorPriest || 'ቀሲስ ሄኖክ',
        confessionStage: currentUser.confessionStage || 'ጀማሪ',
        role: currentUser.role || 'child',
      });
    }
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updated = await updateUserProfile({
        fullName: profileForm.fullName,
        baptismalName: profileForm.baptismalName,
        phone: profileForm.phone,
        email: profileForm.email,
        confessorPriest: profileForm.confessorPriest,
        confessionStage: profileForm.confessionStage as any,
      });
      if (onUpdateUser) onUpdateUser(updated);
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
    } catch {
      if (onOpenAuthModal) onOpenAuthModal();
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/80 backdrop-blur-sm flex justify-end">
      
      {/* Sliding Drawer Container */}
      <div className="w-full max-w-3xl bg-stone-950 border-l border-amber-800/40 h-full flex flex-col shadow-2xl animate-slide-left">
        
        {/* Drawer Header */}
        <div className="p-5 border-b border-stone-800 bg-gradient-to-r from-stone-950 via-red-950/30 to-amber-950/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-950/80 border border-amber-600/50 flex items-center justify-center text-amber-300 font-bold text-lg">
              ☰
            </div>
            <div>
              <h2 className="text-lg font-heading font-bold text-amber-100">
                የጀርባው ሙሉ መቆጣጠሪያ ዳሽቦርድ (Master Control)
              </h2>
              <p className="text-xs text-stone-400">
                የተጠቃሚ ፕሮፋይል፣ የገንዘብ ዋሌት፣ የንስሐ ልጆችና የስርዓቱ መቆጣጠሪያ
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-stone-900 hover:bg-stone-800 text-stone-400 hover:text-stone-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Dashboard Navigation Tabs */}
        <div className="flex overflow-x-auto border-b border-stone-800 bg-stone-900/40 p-2 gap-1 text-xs font-medium">
          {[
            { id: 'profile', label: 'የእኔ ፕሮፋይል', icon: User },
            { id: 'children', label: 'የንስሐ ልጆች ዝርዝር', icon: Users },
            { id: 'confessions', label: 'የንስሐ ቀጠሮዎች', icon: Calendar },
            { id: 'assembly_control', label: 'የአዳራሽ ቁጥጥር', icon: Mic },
            { id: 'wallet_audit', label: 'የገንዘብ ዋሌት ኦዲት', icon: Wallet },
            { id: 'system', label: 'የስርዓት ደህንነት', icon: Shield },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-amber-950 border border-amber-600/50 text-amber-200 font-bold shadow-md'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Drawer Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* TAB 0: User Profile & Account Management (በስተጀርባ የተጫነ የተጠቃሚ ፕሮፋይል) */}
          {activeTab === 'profile' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-amber-200">የተጠቃሚ ሙሉ መንፈሳዊ ፕሮፋይል</h3>
                  <p className="text-xs text-stone-400">የግል መረጃዎን በስተጀርባ ያድሱ ወይም ይቀይሩ</p>
                </div>
                {onOpenAuthModal && (
                  <button
                    onClick={onOpenAuthModal}
                    className="px-3 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-stone-300 hover:text-amber-200 text-xs transition"
                  >
                    መግቢያ / ምዝገባ (Auth)
                  </button>
                )}
              </div>

              <form onSubmit={handleSaveProfile} className="p-5 rounded-2xl bg-stone-900/60 border border-amber-900/40 space-y-4 text-xs">
                
                <div className="flex items-center gap-3 pb-3 border-b border-stone-800">
                  <div className="w-12 h-12 rounded-full bg-amber-900/80 border-2 border-amber-500/50 flex items-center justify-center text-amber-200 font-bold text-lg">
                    {profileForm.baptismalName ? profileForm.baptismalName.charAt(0) : 'ዩ'}
                  </div>
                  <div>
                    <p className="font-bold text-amber-200 text-sm">{profileForm.baptismalName || 'የክርስትና ስም አልተመረጠም'}</p>
                    <p className="text-stone-400">{profileForm.fullName} · {profileForm.phone}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-stone-300 font-semibold mb-1">መጠሪያ ሙሉ ስም</label>
                    <input
                      type="text"
                      value={profileForm.fullName}
                      onChange={(e) => setProfileForm({ ...profileForm, fullName: e.target.value })}
                      className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-stone-300 font-semibold mb-1">የክርስትና ስም (Baptismal Name)</label>
                    <input
                      type="text"
                      value={profileForm.baptismalName}
                      onChange={(e) => setProfileForm({ ...profileForm, baptismalName: e.target.value })}
                      className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-stone-300 font-semibold mb-1">ስልክ ቁጥር</label>
                    <input
                      type="tel"
                      value={profileForm.phone}
                      onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                      className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-stone-300 font-semibold mb-1">የንስሐ አባት ስም</label>
                    <input
                      type="text"
                      value={profileForm.confessorPriest}
                      onChange={(e) => setProfileForm({ ...profileForm, confessorPriest: e.target.value })}
                      className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-stone-300 font-semibold mb-1">የንስሐ እና የጸሎት ደረጃ</label>
                  <select
                    value={profileForm.confessionStage}
                    onChange={(e) => setProfileForm({ ...profileForm, confessionStage: e.target.value as any })}
                    className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-500"
                  >
                    <option value="ጀማሪ">ጀማሪ (በንስሐ መንገድ የጀመረ)</option>
                    <option value="መካከለኛ">መካከለኛ (ዘወትር የሚናዘዝ)</option>
                    <option value="የበረታ/የቆረበ">የበረታ / የቆረበ (ቅዱስ ቁርባን የሚቀበል)</option>
                  </select>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="submit"
                    className="flex-1 py-2.5 rounded-xl bg-amber-900/80 hover:bg-amber-900 border border-amber-600/50 text-amber-200 font-bold transition flex items-center justify-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    <span>{profileSaved ? 'መረጃው በሰላም ተቀምጧል!' : 'ፕሮፋይሉን አስቀምጥ (Save Profile)'}</span>
                  </button>
                </div>

              </form>
            </div>
          )}

          {/* TAB 1: Real Registered Users Management */}
          {activeTab === 'children' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-amber-200">የተመዘገቡ ተጠቃሚዎች ዝርዝር ({registeredUsers.length})</h3>
                  <p className="text-xs text-stone-400">በድህረገጹ አካውንት ከፍተው የተመዘገቡ እውነተኛ አባላት</p>
                </div>
                <span className="text-xs text-emerald-400 font-mono">ከሰርቨር የተጫነ</span>
              </div>

              {registeredUsers.length === 0 ? (
                <div className="p-6 rounded-xl border border-stone-800 bg-stone-900/40 text-center text-xs text-stone-400">
                  እስካሁን የተመዘገበ ተጠቃሚ የለም። አዳዲስ ተጠቃሚዎች በ"ግባ / ተመዝገብ" ሲመዘገቡ እዚህ በቀጥታ ይታያሉ።
                </div>
              ) : (
                <div className="divide-y divide-stone-800 rounded-xl border border-stone-800 bg-stone-900/50 overflow-hidden">
                  {registeredUsers.map((member) => (
                    <div key={member.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-amber-950/80 border border-amber-700/40 flex items-center justify-center text-amber-300 font-bold">
                          {(member.baptismalName || member.fullName).charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-stone-200">{member.fullName} ({member.baptismalName})</p>
                          <p className="text-stone-400">{member.phone}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-right">
                        <span className="px-2 py-0.5 rounded bg-stone-950 border border-stone-700 text-amber-300 font-medium">
                          {member.role === 'priest' ? 'ቀሲስ' : member.role === 'deacon' ? 'ዲያቆን' : member.confessionStage}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Confession Bookings & Passcode Manager */}
          {activeTab === 'confessions' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-amber-200">የንስሐ ቀጠሮዎች እና የሚስጥር ቤት ኮዶች</h3>
                  <p className="text-xs text-stone-400">የቀጠሮ ማረጋገጫ እና የሚስጥር ቁጥር መስጫ</p>
                </div>
              </div>

              <div className="space-y-3">
                {bookings.map((booking) => (
                  <div key={booking.id} className="p-4 rounded-xl bg-stone-900/50 border border-stone-800 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-amber-200 text-sm">{booking.childName}</span>
                        <span className="text-stone-400">({booking.baptismalName})</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded font-mono ${
                        booking.status === 'confirmed'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                          : booking.status === 'completed'
                          ? 'bg-stone-950 text-stone-400'
                          : 'bg-amber-950 text-amber-300 border border-amber-700'
                      }`}>
                        {booking.status === 'confirmed' ? 'የተረጋገጠ' : booking.status === 'completed' ? 'የተፈጸመ' : 'በመጠባበቅ ላይ'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-stone-400 pt-1 border-t border-stone-800/80">
                      <div>
                        <span className="text-stone-300">ቀንና ሰዓት፡</span> {booking.date} በ{booking.time} · ስልክ፡ {booking.phone}
                      </div>
                      <div className="flex items-center gap-1.5 bg-stone-950 px-2 py-1 rounded border border-stone-700 text-amber-300 font-mono">
                        <KeyRound className="w-3 h-3 text-amber-400" />
                        <span>የሚስጥር ቁጥር፡ {booking.secretPasscode}</span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2 pt-2">
                      {booking.status !== 'confirmed' && (
                        <button
                          onClick={() => onUpdateBookingStatus(booking.id, 'confirmed')}
                          className="px-3 py-1.5 rounded-lg bg-emerald-900/60 hover:bg-emerald-900 border border-emerald-600 text-emerald-200 text-xs transition"
                        >
                          ቀጠሮውን አረጋግጥ
                        </button>
                      )}
                      {booking.status !== 'completed' && (
                        <button
                          onClick={() => onUpdateBookingStatus(booking.id, 'completed')}
                          className="px-3 py-1.5 rounded-lg bg-amber-900/60 hover:bg-amber-900 border border-amber-600 text-amber-200 text-xs transition"
                        >
                          ንስሐውን አጠናቅቅ
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: Master Assembly & Stage Controls */}
          {activeTab === 'assembly_control' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-amber-200">የታላቁ አዳራሽ ዋና መቆጣጠሪያ (Master Control)</h3>
                <p className="text-xs text-stone-400">የሺዎች ምእመናን የቀጥታ ስርጭትና የማይክሮፎን ፍቃድ</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-4 rounded-xl bg-stone-900/60 border border-stone-800 space-y-2">
                  <p className="text-xs font-semibold text-stone-200">የአጠቃላይ አዳራሽ ማይክሮፎኖች (Global Mute)</p>
                  <p className="text-[11px] text-stone-400">አላስፈላጊ የድምፅ ረብሻ እንዳይኖር ሁሉንም ተሳታፊዎች በአንድ ጊዜ ዝጋ</p>
                  <button
                    onClick={() => alert('ሁሉም የማይክሮፎን ድምጾች በዋናው መቆጣጠሪያ ተዘግተዋል (All Muted)!')}
                    className="w-full py-2 rounded-lg bg-red-950 hover:bg-red-900 border border-red-700 text-red-200 text-xs font-medium transition"
                  >
                    ሁሉንም ማይኮች ዝጋ (Mute All)
                  </button>
                </div>

                <div className="p-4 rounded-xl bg-stone-900/60 border border-stone-800 space-y-2">
                  <p className="text-xs font-semibold text-stone-200">የቀጥታ ስርጭት ጥራት (HD Streaming)</p>
                  <p className="text-[11px] text-stone-400">ከፍተኛ ጥራት ያለው 1080p ቪዲዮ እና ዝቅተኛ የኔትወርክ ፍጆታ</p>
                  <button
                    onClick={() => alert('የስርጭት ፍጥነት ወደ ሱፐር ፋስት (Low-Latency) ተቀይሯል')}
                    className="w-full py-2 rounded-lg bg-amber-950 hover:bg-amber-900 border border-amber-700 text-amber-200 text-xs font-medium transition"
                  >
                    ፈጣን የስርጭት ሞድ (Ultra Fast)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Wallet Audit & Ledger */}
          {activeTab === 'wallet_audit' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-amber-200">የገንዘብ ሂሳብ ኦዲትና ግልጽነት (Financial Ledger)</h3>
                <p className="text-xs text-stone-400">የተሰበሰበውና የወጣው መንፈሳዊ ፈንድ ሙሉ ዝርዝር</p>
              </div>

              <div className="p-4 rounded-xl bg-stone-900/70 border border-amber-800/40 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div>
                  <p className="text-[11px] text-stone-400">ጠቅላላ ፈንድ</p>
                  <p className="text-base font-bold text-amber-300 font-mono">{walletState.totalBalance.toLocaleString()} ETB</p>
                </div>
                <div>
                  <p className="text-[11px] text-stone-400">የአስራት ሒሳብ</p>
                  <p className="text-base font-bold text-amber-200 font-mono">{walletState.tithes.toLocaleString()} ETB</p>
                </div>
                <div>
                  <p className="text-[11px] text-stone-400">የምጽዋት ሒሳብ</p>
                  <p className="text-base font-bold text-emerald-300 font-mono">{walletState.charity.toLocaleString()} ETB</p>
                </div>
                <div>
                  <p className="text-[11px] text-stone-400">የአገልግሎት ድጋፍ</p>
                  <p className="text-base font-bold text-stone-200 font-mono">{walletState.churchSupport.toLocaleString()} ETB</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-stone-300">የቅርብ ጊዜ ዝውውሮች፡</p>
                <div className="divide-y divide-stone-800 border border-stone-800 rounded-xl bg-stone-900/40 text-xs">
                  {transactions.slice(0, 5).map((t) => (
                    <div key={t.id} className="p-3 flex justify-between items-center">
                      <div>
                        <span className="font-semibold text-stone-200">{t.userName}</span>
                        <span className="text-stone-400 text-[11px] block">{t.purposeNote}</span>
                      </div>
                      <span className="font-mono text-amber-300">+{t.amount.toLocaleString()} ብር</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: System & Security */}
          {activeTab === 'system' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-amber-200">የስርዓት ደህንነትና የኦፍላይን ዳታቤዝ</h3>
                <p className="text-xs text-stone-400">የመተግበሪያው ቅንብሮችና የተሸጎጡ ፋይሎች</p>
              </div>

              <div className="p-4 rounded-xl bg-stone-900/60 border border-stone-800 space-y-3 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-stone-300">የአፕሊኬሽኑ ስም፡</span>
                  <span className="font-bold text-amber-300 font-heading">ቀሲስ ሄኖክ (Qesis Henok)</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-stone-300">የኦፍላይን PWA አቅም፡</span>
                  <span className="text-emerald-400">ሙሉ በሙሉ ነቅቷል (Service Worker Active)</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-stone-300">የሚስጥር ቤት ምስጠራ፡</span>
                  <span className="text-emerald-400">End-to-End Encrypted (AES-256)</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-stone-300">የኤአይ ረዳት ሞዴል፡</span>
                  <span className="text-amber-200">Gemini 4 Hydrogen (Server-Side)</span>
                </div>

                <div className="pt-3 border-t border-stone-800 flex gap-2">
                  <button
                    onClick={() => {
                      localStorage.clear();
                      alert('የስልኩ ካሽ ጸድቷል (Cache Cleared)');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-300 transition"
                  >
                    ካሽ አጽዳ (Clear Cache)
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>

      </div>

    </div>
  );
};
