import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  ArrowLeft,
  Users,
  Calendar,
  Mic,
  Wallet,
  Shield,
  KeyRound,
  User,
  Save,
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  Phone,
  Copy,
  FileSpreadsheet,
} from 'lucide-react';
import { ConfessionBooking, WalletState, WalletTransaction, UserProfile, MemberDirectoryRecord } from '../types';
import {
  fetchMembersDirectory,
  organizeMembersDirectory,
  updateUserProfile,
  exportDatabaseBackup,
  importDatabaseBackup,
  MemberDirectoryPayload,
} from '../services/api';

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
  onDataRestored?: () => void;
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
  onDataRestored,
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

  // Auto-organized member directory loaded from server (priest/admin only)
  const [directoryMembers, setDirectoryMembers] = useState<MemberDirectoryRecord[]>([]);
  const [directoryStats, setDirectoryStats] = useState<MemberDirectoryPayload['stats'] | null>(null);
  const [directoryUpdatedAt, setDirectoryUpdatedAt] = useState<string>('');
  const [memberSearch, setMemberSearch] = useState('');
  const [isOrganizingMembers, setIsOrganizingMembers] = useState(false);
  const [memberNotice, setMemberNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copiedPhoneId, setCopiedPhoneId] = useState<string | null>(null);

  const [systemStatus, setSystemStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [assemblyNotice, setAssemblyNotice] = useState<string | null>(null);
  const [isBackupBusy, setIsBackupBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isPriestOrAdmin = currentUser.isAuthenticated && (currentUser.role === 'priest' || currentUser.role === 'admin');

  useEffect(() => {
    if (isOpen) {
      if (isPriestOrAdmin) {
        fetchMembersDirectory().then((payload) => {
          if (payload) {
            setDirectoryMembers(payload.members || []);
            setDirectoryStats(payload.stats || null);
            setDirectoryUpdatedAt(payload.updatedAt || '');
          }
        });
      } else {
        setDirectoryMembers([]);
        setDirectoryStats(null);
        setDirectoryUpdatedAt('');
      }
      setSystemStatus(null);
      setAssemblyNotice(null);
      setMemberNotice(null);
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

  const handleExportBackup = async () => {
    setSystemStatus(null);
    setIsBackupBusy(true);
    try {
      const backupPayload = await exportDatabaseBackup();
      const jsonText = JSON.stringify(backupPayload, null, 2);
      const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const dateStr = new Date().toISOString().slice(0, 10);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `qesis-henok-backup-${dateStr}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      setSystemStatus({
        type: 'success',
        message: 'ሙሉ የዳታቤዝ ባክአፕ (JSON) በስኬት ወርዷል።',
      });
    } catch (err: any) {
      setSystemStatus({
        type: 'error',
        message: err?.message || 'ባክአፕ ማውረድ አልተቻለም።',
      });
    } finally {
      setIsBackupBusy(false);
    }
  };

  const handleImportBackupFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setSystemStatus(null);
    setIsBackupBusy(true);
    try {
      const rawText = await file.text();
      const parsed = JSON.parse(rawText);
      const result = await importDatabaseBackup(parsed);
      const refreshedDirectory = await fetchMembersDirectory();
      if (refreshedDirectory) {
        setDirectoryMembers(refreshedDirectory.members || []);
        setDirectoryStats(refreshedDirectory.stats || null);
        setDirectoryUpdatedAt(refreshedDirectory.updatedAt || '');
      }
      if (onDataRestored) onDataRestored();
      setSystemStatus({
        type: 'success',
        message: `ዳታቤዙ በስኬት ተመልሷል (${result.counts.users} ተጠቃሚዎች፣ ${result.counts.confessionBookings} ቀጠሮዎች፣ ${result.counts.walletTransactions} የዋሌት ዝውውሮች)።`,
      });
    } catch (err: any) {
      setSystemStatus({
        type: 'error',
        message: err?.message || 'የተመረጠው የJSON ፋይል ትክክለኛ አይደለም ወይም መመለስ አልተቻለም።',
      });
    } finally {
      setIsBackupBusy(false);
    }
  };

  const handleOneClickOrganizeMembers = async () => {
    setMemberNotice(null);
    setIsOrganizingMembers(true);
    try {
      const result = await organizeMembersDirectory();
      setDirectoryMembers(result.members || []);
      setDirectoryStats(result.stats || null);
      setDirectoryUpdatedAt(result.updatedAt || '');
      setMemberNotice({
        type: 'success',
        message: `ሁሉም ${result.members.length} አባላት (ዓለማዊ ስም፣ መንፈሳዊ ስም እና ስልክ ቁጥር) በራስ-ሰር ተደራጅተው በዳሽቦርዱ ዳታቤዝ በስተጀርባ ተቀምጠዋል!`,
      });
    } catch (err: any) {
      setMemberNotice({
        type: 'error',
        message: err?.message || 'የአባላቱን መረጃ ማደራጀት አልተቻለም።',
      });
    } finally {
      setIsOrganizingMembers(false);
    }
  };

  const handleExportMembersCsv = () => {
    const header = ['ተ.ቁ', 'ዓለማዊ ስም', 'መንፈሳዊ (የክርስትና) ስም', 'ስልክ ቁጥር', 'ድርሻ', 'የንስሐ ደረጃ', 'ምንጮች', 'የቀጠሮ ብዛት'];
    const escapeCsv = (val: string | number) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const rows = directoryMembers.map((m, idx) =>
      [
        idx + 1,
        m.secularName || '-',
        m.spiritualName || '-',
        m.phone || '-',
        m.role === 'priest' ? 'ቀሲስ' : m.role === 'deacon' ? 'ዲያቆን' : m.role === 'admin' ? 'አስተዳዳሪ' : 'የንስሐ ልጅ',
        m.confessionStage || '-',
        (m.sources || []).join(' / '),
        m.confessionCount || 0,
      ]
        .map(escapeCsv)
        .join(',')
    );
    const csvContent = '\uFEFF' + [header.map(escapeCsv).join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `qesis-henok-members-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    setMemberNotice({
      type: 'success',
      message: 'የአባላቱ ዝርዝር (ዓለማዊ ስም፣ መንፈሳዊ ስም እና ስልክ ቁጥር) በExcel/CSV ፋይል ወርዷል።',
    });
  };

  const handleCopyPhone = (id: string, phone: string) => {
    if (!phone) return;
    navigator.clipboard?.writeText(phone).catch(() => {});
    setCopiedPhoneId(id);
    setTimeout(() => setCopiedPhoneId(null), 1500);
  };

  const filteredDirectoryMembers = directoryMembers.filter((m) => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      m.secularName.toLowerCase().includes(q) ||
      m.spiritualName.toLowerCase().includes(q) ||
      m.phone.toLowerCase().includes(q) ||
      m.sources.some((s) => s.toLowerCase().includes(q))
    );
  });

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 overflow-hidden bg-black/80 backdrop-blur-sm flex justify-end"
    >
      
      {/* Sliding Drawer Container */}
      <div className="w-full max-w-3xl bg-stone-950 border-l border-amber-800/40 h-full flex flex-col shadow-2xl animate-slide-left">
        
        {/* Drawer Header */}
        <div className="p-4 sm:p-5 border-b border-stone-800 bg-gradient-to-r from-stone-950 via-red-950/30 to-amber-950/30 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-stone-900 hover:bg-amber-950/70 border border-amber-700/50 text-amber-200 text-xs font-bold shrink-0 transition"
              title="ወደ ኋላ ተመለስ"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>ተመለስ</span>
            </button>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-heading font-bold text-amber-100 truncate">
                የጀርባው ሙሉ መቆጣጠሪያ ዳሽቦርድ
              </h2>
              <p className="text-[11px] text-stone-400 truncate">
                የተጠቃሚ ፕሮፋይል፣ የገንዘብ ዋሌት፣ የንስሐ ልጆችና የስርዓቱ መቆጣጠሪያ
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="ዝጋ"
            className="p-2 rounded-lg bg-stone-900 hover:bg-stone-800 text-stone-400 hover:text-stone-100 shrink-0 transition"
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

          {/* TAB 1: Organized Master Member Directory (ዓለማዊ ስም፣ መንፈሳዊ ስም እና ስልክ ቁጥር) */}
          {activeTab === 'children' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-amber-200">
                    የሁሉም አባላት ሙሉ መዝገብ ({directoryMembers.length})
                  </h3>
                  <p className="text-xs text-stone-400">
                    የአባላት ዓለማዊ ስም፣ መንፈሳዊ (የክርስትና) ስም እና ስልክ ቁጥር በራስ-ሰር ተደራጅቶ በዳሽቦርዱ በስተጀርባ የሚቀመጥበት
                  </p>
                </div>
                {directoryUpdatedAt && (
                  <span className="text-[11px] text-emerald-400 font-mono shrink-0">
                    መጨረሻ የተቀመጠው፡ {directoryUpdatedAt.replace('T', ' ').slice(0, 16)}
                  </span>
                )}
              </div>

              {!isPriestOrAdmin ? (
                <div className="p-6 rounded-xl border border-amber-800/40 bg-stone-900/50 text-center text-xs text-stone-300 space-y-1.5">
                  <p className="font-semibold text-amber-200">ይህ ዝርዝር ለቀሲስ / አስተዳዳሪ ብቻ የተጠበቀ ነው</p>
                  <p className="text-stone-400">
                    የሁሉንም አባላት ዓለማዊ ስም፣ መንፈሳዊ ስም እና ስልክ ቁጥር ለማየት እና ለማደራጀት በቀሲስ አካውንት ይግቡ።
                  </p>
                </div>
              ) : (
                <>
                  {/* One-Click Auto-Organize & Save Bar + Stats */}
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-950/40 via-stone-900/80 to-stone-950 border border-amber-700/40 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2.5">
                      <button
                        type="button"
                        disabled={isOrganizingMembers}
                        onClick={handleOneClickOrganizeMembers}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-700 to-amber-600 hover:from-amber-600 hover:to-amber-500 text-stone-950 font-bold text-xs shadow-lg transition disabled:opacity-50"
                      >
                        <RefreshCw className={`w-4 h-4 ${isOrganizingMembers ? 'animate-spin' : ''}`} />
                        <span>
                          {isOrganizingMembers
                            ? 'መረጃውን በማደራጀትና በማስቀመጥ ላይ...'
                            : 'ሁሉንም አባላት በራስ-ሰር አደራጅና አስቀምጥ (One-Click Save)'}
                        </span>
                      </button>

                      <button
                        type="button"
                        disabled={directoryMembers.length === 0}
                        onClick={handleExportMembersCsv}
                        className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 border border-emerald-700/60 text-emerald-300 font-semibold text-xs transition disabled:opacity-40"
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                        <span>በExcel / CSV አውርድ</span>
                      </button>
                    </div>

                    {directoryStats && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-[11px]">
                        <div className="p-2 rounded-lg bg-stone-950/80 border border-stone-800">
                          <span className="text-stone-400 block">ጠቅላላ አባላት</span>
                          <span className="text-sm font-bold text-amber-300 font-mono">{directoryStats.totalMembers}</span>
                        </div>
                        <div className="p-2 rounded-lg bg-stone-950/80 border border-stone-800">
                          <span className="text-stone-400 block">ስልክ ቁጥር ያላቸው</span>
                          <span className="text-sm font-bold text-emerald-300 font-mono">{directoryStats.withPhoneCount}</span>
                        </div>
                        <div className="p-2 rounded-lg bg-stone-950/80 border border-stone-800">
                          <span className="text-stone-400 block">አካውንት የከፈቱ</span>
                          <span className="text-sm font-bold text-stone-100 font-mono">{directoryStats.registeredAccountsCount}</span>
                        </div>
                        <div className="p-2 rounded-lg bg-stone-950/80 border border-stone-800">
                          <span className="text-stone-400 block">ቀጠሮ / ስልክ ማውጫ</span>
                          <span className="text-sm font-bold text-amber-200 font-mono">
                            {directoryStats.confessionMembersCount} / {directoryStats.contactsCount}
                          </span>
                        </div>
                      </div>
                    )}

                    {memberNotice && (
                      <div
                        className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                          memberNotice.type === 'success'
                            ? 'bg-emerald-950/70 border-emerald-700/60 text-emerald-200'
                            : 'bg-red-950/70 border-red-700/60 text-red-200'
                        }`}
                      >
                        {memberNotice.type === 'success' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                        )}
                        <span>{memberNotice.message}</span>
                      </div>
                    )}
                  </div>

                  {/* Search Filter */}
                  <div className="relative">
                    <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      placeholder="በዓለማዊ ስም፣ በመንፈሳዊ ስም ወይም በስልክ ቁጥር ይፈልጉ..."
                      className="w-full bg-stone-900 border border-stone-700 rounded-xl pl-9 pr-3 py-2 text-xs text-stone-100 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  {filteredDirectoryMembers.length === 0 ? (
                    <div className="p-6 rounded-xl border border-stone-800 bg-stone-900/40 text-center text-xs text-stone-400">
                      {directoryMembers.length === 0
                        ? 'እስካሁን የተመዘገበ አባል የለም። አዳዲስ ተጠቃሚዎች ሲመዘገቡ፣ ቀጠሮ ሲይዙ ወይም ከስልክ ሲጨመሩ እዚህ በራስ-ሰር ይደራጃሉ።'
                        : 'ከፍለጋዎ ጋር የሚመሳሰል አባል አልተገኘም።'}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-stone-800 bg-stone-900/50 overflow-hidden">
                      {/* Column Headers (Desktop/Tablet) */}
                      <div className="hidden sm:grid sm:grid-cols-12 gap-2 px-3.5 py-2.5 bg-stone-950/90 border-b border-stone-800 text-[11px] font-bold text-amber-300">
                        <div className="col-span-1">#</div>
                        <div className="col-span-3">ዓለማዊ ስም</div>
                        <div className="col-span-3">መንፈሳዊ (ክርስትና) ስም</div>
                        <div className="col-span-3">ስልክ ቁጥር</div>
                        <div className="col-span-2 text-right">ደረጃ / ምንጭ</div>
                      </div>

                      <div className="divide-y divide-stone-800">
                        {filteredDirectoryMembers.map((member, index) => (
                          <div
                            key={member.id}
                            className="p-3.5 grid grid-cols-1 sm:grid-cols-12 gap-2 sm:items-center text-xs hover:bg-stone-900/80 transition"
                          >
                            <div className="hidden sm:block sm:col-span-1 text-stone-500 font-mono">
                              {index + 1}
                            </div>

                            <div className="sm:col-span-3 flex items-center gap-2.5">
                              <div className="w-7 h-7 shrink-0 rounded-full bg-amber-950/80 border border-amber-700/40 flex items-center justify-center text-amber-300 font-bold text-[11px]">
                                {(member.spiritualName || member.secularName || 'አ').charAt(0)}
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-stone-100 truncate">
                                  {member.secularName || '—'}
                                </p>
                                <p className="sm:hidden text-[11px] text-amber-300/90 truncate">
                                  መንፈሳዊ ስም፡ {member.spiritualName || 'አልተሞላም'}
                                </p>
                              </div>
                            </div>

                            <div className="hidden sm:block sm:col-span-3 text-amber-200 font-medium truncate">
                              {member.spiritualName || <span className="text-stone-500">አልተሞላም</span>}
                            </div>

                            <div className="sm:col-span-3 flex items-center gap-1.5">
                              {member.phone ? (
                                <>
                                  <a
                                    href={`tel:${member.phone}`}
                                    className="inline-flex items-center gap-1 text-emerald-300 hover:text-emerald-200 font-mono font-medium"
                                  >
                                    <Phone className="w-3 h-3 shrink-0" />
                                    <span>{member.phone}</span>
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyPhone(member.id, member.phone)}
                                    className="p-1 rounded bg-stone-950 border border-stone-700 text-stone-400 hover:text-amber-300 transition"
                                    title="ስልክ ቁጥሩን ቅዳ"
                                  >
                                    {copiedPhoneId === member.id ? (
                                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                  </button>
                                </>
                              ) : (
                                <span className="text-stone-500">ስልክ የለም</span>
                              )}
                            </div>

                            <div className="sm:col-span-2 flex flex-wrap sm:justify-end gap-1">
                              <span className="px-2 py-0.5 rounded bg-stone-950 border border-stone-700 text-amber-300 font-medium text-[10px]">
                                {member.role === 'priest'
                                  ? 'ቀሲስ'
                                  : member.role === 'deacon'
                                  ? 'ዲያቆን'
                                  : member.role === 'admin'
                                  ? 'አስተዳዳሪ'
                                  : member.confessionStage || 'የንስሐ ልጅ'}
                              </span>
                              {member.sources.map((src) => (
                                <span
                                  key={src}
                                  className="px-1.5 py-0.5 rounded bg-amber-950/40 border border-amber-800/30 text-stone-300 text-[10px]"
                                >
                                  {src}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
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
                    onClick={() => setAssemblyNotice('ሁሉም የማይክሮፎን ድምጾች በዋናው መቆጣጠሪያ ተዘግተዋል (All Muted)!')}
                    className="w-full py-2 rounded-lg bg-red-950 hover:bg-red-900 border border-red-700 text-red-200 text-xs font-medium transition"
                  >
                    ሁሉንም ማይኮች ዝጋ (Mute All)
                  </button>
                </div>

                <div className="p-4 rounded-xl bg-stone-900/60 border border-stone-800 space-y-2">
                  <p className="text-xs font-semibold text-stone-200">የቀጥታ ስርጭት ጥራት (HD Streaming)</p>
                  <p className="text-[11px] text-stone-400">ከፍተኛ ጥራት ያለው 1080p ቪዲዮ እና ዝቅተኛ የኔትወርክ ፍጆታ</p>
                  <button
                    onClick={() => setAssemblyNotice('የስርጭት ፍጥነት ወደ ሱፐር ፋስት (Low-Latency) ተቀይሯል')}
                    className="w-full py-2 rounded-lg bg-amber-950 hover:bg-amber-900 border border-amber-700 text-amber-200 text-xs font-medium transition"
                  >
                    ፈጣን የስርጭት ሞድ (Ultra Fast)
                  </button>
                </div>
              </div>
              {assemblyNotice && (
                <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-700/60 text-emerald-200 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{assemblyNotice}</span>
                </div>
              )}
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
                  {transactions.slice(0, 8).map((t) => {
                    const isWithdrawal = t.type === 'withdrawal';
                    return (
                      <div key={t.id} className="p-3 flex justify-between items-center">
                        <div>
                          <span className="font-semibold text-stone-200">{t.userName}</span>
                          <span className="text-stone-400 text-[11px] block">
                            {t.purposeNote} {t.bankName ? `· ${t.bankName}` : ''}
                          </span>
                        </div>
                        <span className={`font-mono font-bold ${isWithdrawal ? 'text-red-400' : 'text-emerald-400'}`}>
                          {isWithdrawal ? '-' : '+'}{t.amount.toLocaleString()} ብር
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: System & Security */}
          {activeTab === 'system' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-amber-200">የስርዓት ደህንነትና የዳታቤዝ ባክአፕ</h3>
                <p className="text-xs text-stone-400">የመተግበሪያው ቅንብሮች፣ ባክአፕ እና መልሶ ማግኛ</p>
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
                  <span className="text-amber-200">Gemini 2.5 Flash (Server-Side)</span>
                </div>

                {isPriestOrAdmin && (
                  <div className="pt-3 border-t border-stone-800 space-y-2.5">
                    <div>
                      <p className="font-semibold text-amber-200">የRender ዳታቤዝ ባክአፕ እና መልሶ ማግኛ (Backup & Restore)</p>
                      <p className="text-[11px] text-stone-400">
                        ሰርቨሩ እንደገና ሲጫን (Redeploy) የተጠቃሚዎች፣ የቀጠሮዎች እና የዋሌት መረጃ እንዳይጠፋ ሙሉ JSON ባክአፕ ያውርዱ ወይም ይመልሱ።
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={isBackupBusy}
                        onClick={handleExportBackup}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-900/70 hover:bg-amber-900 border border-amber-600/60 text-amber-100 font-semibold transition disabled:opacity-50"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>{isBackupBusy ? 'በመሥራት ላይ...' : 'ሙሉ ባክአፕ አውርድ (Export JSON)'}</span>
                      </button>

                      <button
                        type="button"
                        disabled={isBackupBusy}
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-200 font-semibold transition disabled:opacity-50"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>ባክአፕ መልስ (Import JSON)</span>
                      </button>

                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json,application/json"
                        onChange={handleImportBackupFile}
                        className="hidden"
                      />
                    </div>
                  </div>
                )}

                {systemStatus && (
                  <div
                    className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                      systemStatus.type === 'success'
                        ? 'bg-emerald-950/70 border-emerald-700/60 text-emerald-200'
                        : 'bg-red-950/70 border-red-700/60 text-red-200'
                    }`}
                  >
                    {systemStatus.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    )}
                    <span>{systemStatus.message}</span>
                  </div>
                )}

                <div className="pt-3 border-t border-stone-800 flex gap-2">
                  <button
                    onClick={() => {
                      localStorage.clear();
                      setSystemStatus({ type: 'success', message: 'የስልኩ ካሽ ጸድቷል (Cache Cleared)' });
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
