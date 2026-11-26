import React, { useState, useEffect } from 'react';
import { X, LogIn, LogOut, Flame, Shield, AlertCircle, CheckCircle2 } from 'lucide-react';
import { UserProfile, UserRole } from '../types';
import { registerUser, loginUser, updateUserProfile, logoutUser, getAuthToken } from '../services/api';
import { auth, signInWithGooglePopup, signOutFirebase, updateAbatUserProfile } from '../firebase';

interface AuthProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  onUpdateUser: (updatedUser: UserProfile) => void;
}

export const AuthProfileModal: React.FC<AuthProfileModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onUpdateUser,
}) => {
  const [mode, setMode] = useState<'profile' | 'signin' | 'signup'>(
    currentUser.isAuthenticated ? 'profile' : 'signin'
  );
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [formData, setFormData] = useState({
    fullName: currentUser.fullName || '',
    baptismalName: currentUser.baptismalName || '',
    phone: currentUser.phone || '',
    email: currentUser.email || '',
    password: '',
    confessorPriest: currentUser.confessorPriest || 'ቀሲስ ሄኖክ',
    confessionStage: currentUser.confessionStage || 'ጀማሪ',
    role: (currentUser.role || 'child') as UserRole,
    priestCode: '',
  });

  useEffect(() => {
    if (isOpen) {
      setErrorMsg('');
      setSuccessMsg('');
      const params = new URLSearchParams(window.location.search);
      const inviteName = params.get('inviteName')?.trim() || '';
      const invitePhone = params.get('invitePhone')?.trim() || '';

      if (!currentUser.isAuthenticated && (inviteName || invitePhone)) {
        setMode('signup');
        setFormData((prev) => ({
          ...prev,
          fullName: inviteName || prev.fullName,
          baptismalName: inviteName || prev.baptismalName,
          phone: invitePhone || prev.phone,
        }));
        return;
      }

      setMode(currentUser.isAuthenticated ? 'profile' : 'signin');
      if (currentUser.isAuthenticated) {
        setFormData((prev) => ({
          ...prev,
          fullName: currentUser.fullName || '',
          baptismalName: currentUser.baptismalName || '',
          phone: currentUser.phone || '',
          email: currentUser.email || '',
          confessorPriest: currentUser.confessorPriest || 'ቀሲስ ሄኖክ',
          confessionStage: currentUser.confessionStage || 'ጀማሪ',
          role: currentUser.role || 'child',
        }));
      }
    }
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);
    try {
      const { user } = await loginUser(loginIdentifier, loginPassword);
      onUpdateUser(user);
      setMode('profile');
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'መግባት አልተቻለም። ስልክ ቁጥርዎንና የይለፍ ቃልዎን ያረጋግጡ።');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);
    try {
      const { user } = await registerUser({
        fullName: formData.fullName,
        baptismalName: formData.baptismalName,
        phone: formData.phone,
        email: '',
        password: formData.password,
        role: formData.role === 'priest' ? 'priest' : formData.role === 'deacon' ? 'deacon' : 'child',
        confessorPriest: formData.confessorPriest,
        confessionStage: formData.confessionStage,
        priestCode: formData.priestCode,
      });
      onUpdateUser(user);
      setMode('profile');
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'ምዝገባው አልተሳካም።');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);
    try {
      const profile = await signInWithGooglePopup();
      onUpdateUser(profile);
      setMode('profile');
      onClose();
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user') {
        setErrorMsg('የGoogle መግቢያ መስኮቱ ተዘግቷል። እባክዎ ደግመው ይሞክሩ።');
      } else {
        setErrorMsg(err?.message || 'በGoogle አካውንት መግባት አልተቻለም።');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await Promise.allSettled([logoutUser(), signOutFirebase()]);
    onUpdateUser({
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
    });
    setLoginIdentifier('');
    setLoginPassword('');
    setMode('signin');
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);
    try {
      let updated: UserProfile | null = null;
      if (auth.currentUser) {
        updated = await updateAbatUserProfile(auth.currentUser, {
          fullName: formData.fullName,
          baptismalName: formData.baptismalName,
          phone: formData.phone,
          confessorPriest: formData.confessorPriest,
          confessionStage: formData.confessionStage as any,
        });
      }
      if (getAuthToken()) {
        const apiUpdated = await updateUserProfile({
          fullName: formData.fullName,
          baptismalName: formData.baptismalName,
          phone: formData.phone,
          email: formData.email,
          confessorPriest: formData.confessorPriest,
          confessionStage: formData.confessionStage as any,
        });
        if (!updated) updated = apiUpdated;
      }
      if (!updated) {
        throw new Error('መረጃውን ለማደስ መግባት ያስፈልጋል።');
      }
      onUpdateUser(updated);
      setSuccessMsg('መረጃዎ በሰርቨሩ ላይ በትክክል ተቀምጧል!');
      setTimeout(() => {
        setSuccessMsg('');
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMsg(err.message || 'መረጃውን ማደስ አልተቻለም።');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="w-full max-w-lg rounded-3xl bg-stone-950 border-2 border-amber-700/50 shadow-2xl p-6 sm:p-8 space-y-5 animate-scale-up relative">
        
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-lg bg-stone-900 text-stone-400 hover:text-stone-100 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 pr-10">
          <div className="w-11 h-11 shrink-0 rounded-2xl bg-amber-950/80 border border-amber-500/50 flex items-center justify-center text-amber-300 font-bold">
            <Flame className="w-5 h-5 animate-candle text-amber-400" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-heading font-bold text-amber-100 leading-snug">
              {mode === 'profile'
                ? 'የተጠቃሚ መንፈሳዊ ፕሮፋይል'
                : mode === 'signin'
                ? 'ወደ አካውንትዎ ይግቡ'
                : 'አዲስ አካውንት ይፍጠሩ'}
            </h2>
            <p className="text-xs text-stone-400 truncate">ቀሲስ ሄኖክ - የንስሐና የጉባኤ አገልግሎት</p>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-950/70 border border-red-700/70 text-xs text-red-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-700/70 text-xs text-emerald-200 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* PROFILE VIEW */}
        {mode === 'profile' && (
          <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
            <div className="p-3.5 rounded-xl bg-stone-900/60 border border-stone-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-amber-900/60 border border-amber-500/40 flex items-center justify-center text-amber-200 font-bold text-base">
                  {(currentUser.baptismalName || currentUser.fullName || 'ተ').charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-bold text-amber-200">{currentUser.baptismalName}</p>
                  <p className="text-stone-400">
                    {currentUser.fullName} · {currentUser.phone}
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-md bg-emerald-950 border border-emerald-700 text-emerald-300 font-medium">
                {currentUser.role === 'priest' ? 'የንስሐ አባት' : 'የንስሐ ልጅ'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-stone-300 font-semibold mb-1">መጠሪያ ሙሉ ስም</label>
                <input
                  type="text"
                  required
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3 py-2 text-stone-100"
                />
              </div>

              <div>
                <label className="block text-stone-300 font-semibold mb-1">የክርስትና ስም</label>
                <input
                  type="text"
                  required
                  value={formData.baptismalName}
                  onChange={(e) => setFormData({ ...formData, baptismalName: e.target.value })}
                  className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3 py-2 text-stone-100"
                />
              </div>

              <div>
                <label className="block text-stone-300 font-semibold mb-1">ስልክ ቁጥር</label>
                <input
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3 py-2 text-stone-100"
                />
              </div>

              <div>
                <label className="block text-stone-300 font-semibold mb-1">የንስሐ አባት ስም</label>
                <input
                  type="text"
                  value={formData.confessorPriest}
                  onChange={(e) => setFormData({ ...formData, confessorPriest: e.target.value })}
                  className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3 py-2 text-stone-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-stone-300 font-semibold mb-1">የንስሐ ደረጃ</label>
              <select
                value={formData.confessionStage}
                onChange={(e) => setFormData({ ...formData, confessionStage: e.target.value as any })}
                className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3 py-2 text-stone-100"
              >
                <option value="ጀማሪ">ጀማሪ (በንስሐ መንገድ የጀመረ)</option>
                <option value="መካከለኛ">መካከለኛ (ዘወትር የሚናዘዝ)</option>
                <option value="የበረታ/የቆረበ">የበረታ / የቆረበ (ቅዱስ ቁርባን የሚቀበል)</option>
              </select>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl bg-amber-900/80 hover:bg-amber-900 border border-amber-600/50 text-amber-200 font-bold transition disabled:opacity-50"
              >
                {loading ? 'በማስቀመጥ ላይ...' : 'መረጃውን አድስ (Save)'}
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-stone-900 hover:bg-red-950 border border-stone-700 hover:border-red-800 text-stone-300 hover:text-red-300 transition"
              >
                <LogOut className="w-4 h-4" />
                <span>ሳይን አውት</span>
              </button>
            </div>
          </form>
        )}

        {/* SIGN IN VIEW */}
        {mode === 'signin' && (
          <form onSubmit={handleSignIn} className="space-y-4 text-xs">
            <button
              type="button"
              disabled={loading}
              onClick={handleGoogleSignIn}
              className="w-full py-3 rounded-xl bg-stone-900 hover:bg-stone-800 border border-amber-500/60 text-amber-100 font-bold transition flex items-center justify-center gap-2.5 shadow-md disabled:opacity-50"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#EA4335" d="M12 5c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.09 14.97 0 12 0 7.39 0 3.4 2.64 1.44 6.5l3.66 2.84C5.98 6.81 8.75 5 12 5z" />
                <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58l3.76 2.91c2.2-2.03 3.66-5.02 3.66-8.73z" />
                <path fill="#FBBC05" d="M5.1 14.66A7.16 7.16 0 0 1 4.72 12c0-.92.16-1.82.38-2.66L1.44 6.5A11.97 11.97 0 0 0 0 12c0 1.94.46 3.77 1.44 5.5l3.66-2.84z" />
                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.76-2.91c-1.08.72-2.45 1.16-4.17 1.16-3.25 0-6.02-1.81-6.9-4.34l-3.66 2.84C3.4 21.36 7.39 24 12 24z" />
              </svg>
              <span>በGoogle አካውንት ይግቡ (Sign in with Google)</span>
            </button>

            <div className="flex items-center gap-2 text-[11px] text-stone-500">
              <div className="flex-1 h-px bg-stone-800" />
              <span>ወይም በስልክ ቁጥር</span>
              <div className="flex-1 h-px bg-stone-800" />
            </div>

            <div>
              <label className="block text-stone-300 font-semibold mb-1">ስልክ ቁጥር</label>
              <input
                type="text"
                required
                value={loginIdentifier}
                onChange={(e) => setLoginIdentifier(e.target.value)}
                placeholder="0911..."
                className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3 py-2.5 text-stone-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-stone-300 font-semibold mb-1">የይለፍ ቃል (Password)</label>
              <input
                type="password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="የይለፍ ቃልዎን ያስገቡ"
                className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3 py-2.5 text-stone-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-red-950 via-amber-900 to-red-950 border border-amber-600 text-amber-200 font-bold transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <LogIn className="w-4 h-4" />
              <span>{loading ? 'በመግባት ላይ...' : 'ወደ አካውንት ግባ (Sign In)'}</span>
            </button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => {
                  setErrorMsg('');
                  setMode('signup');
                }}
                className="text-amber-400 hover:underline font-medium"
              >
                አካውንት የለዎትም? አዲስ ይመዝገቡ (Sign Up)
              </button>
            </div>
          </form>
        )}

        {/* SIGN UP VIEW */}
        {mode === 'signup' && (
          <form onSubmit={handleSignUp} className="space-y-3 text-xs">
            <button
              type="button"
              disabled={loading}
              onClick={handleGoogleSignIn}
              className="w-full py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 border border-amber-500/60 text-amber-100 font-bold transition flex items-center justify-center gap-2.5 shadow-md disabled:opacity-50"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#EA4335" d="M12 5c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.09 14.97 0 12 0 7.39 0 3.4 2.64 1.44 6.5l3.66 2.84C5.98 6.81 8.75 5 12 5z" />
                <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58l3.76 2.91c2.2-2.03 3.66-5.02 3.66-8.73z" />
                <path fill="#FBBC05" d="M5.1 14.66A7.16 7.16 0 0 1 4.72 12c0-.92.16-1.82.38-2.66L1.44 6.5A11.97 11.97 0 0 0 0 12c0 1.94.46 3.77 1.44 5.5l3.66-2.84z" />
                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.76-2.91c-1.08.72-2.45 1.16-4.17 1.16-3.25 0-6.02-1.81-6.9-4.34l-3.66 2.84C3.4 21.36 7.39 24 12 24z" />
              </svg>
              <span>በGoogle በቀጥታ ተመዝገብ / ግባ</span>
            </button>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-stone-300 font-semibold mb-1">መጠሪያ ሙሉ ስም *</label>
                <input
                  type="text"
                  required
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  placeholder="ሙሉ ስም"
                  className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3 py-2 text-stone-100"
                />
              </div>

              <div>
                <label className="block text-stone-300 font-semibold mb-1">የክርስትና ስም *</label>
                <input
                  type="text"
                  required
                  value={formData.baptismalName}
                  onChange={(e) => setFormData({ ...formData, baptismalName: e.target.value })}
                  placeholder="ለምሳሌ፡ ወልደ ዮሐንስ"
                  className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3 py-2 text-stone-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-stone-300 font-semibold mb-1">ስልክ ቁጥር *</label>
              <input
                type="tel"
                required
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="09..."
                className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3 py-2 text-stone-100"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-stone-300 font-semibold mb-1">የይለፍ ቃል (Password) *</label>
                <input
                  type="password"
                  required
                  minLength={4}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="ቢያንስ 4 ቁጥር/ፊደል"
                  className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3 py-2 text-stone-100"
                />
              </div>

              <div>
                <label className="block text-stone-300 font-semibold mb-1">የአገልግሎት ድርሻ</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                  className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3 py-2 text-stone-100"
                >
                  <option value="child">የንስሐ ልጅ (ምዕመን)</option>
                  <option value="deacon">ዲያቆን / አገልጋይ</option>
                  <option value="priest">ቀሲስ (የንስሐ አባት)</option>
                </select>
              </div>
            </div>

            {formData.role === 'priest' && (
              <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-700/50 space-y-1.5">
                <label className="flex items-center gap-1.5 text-amber-300 font-semibold">
                  <Shield className="w-3.5 h-3.5" />
                  <span>የቀሲስ ማረጋገጫ ሚስጥር ኮድ</span>
                </label>
                <input
                  type="password"
                  required
                  value={formData.priestCode}
                  onChange={(e) => setFormData({ ...formData, priestCode: e.target.value })}
                  placeholder="የቀሲስ ማረጋገጫ ኮድ ያስገቡ"
                  className="w-full bg-stone-900 border border-amber-700/60 rounded-xl px-3 py-2 text-stone-100"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-red-950 via-amber-900 to-red-950 border border-amber-600 text-amber-200 font-bold transition disabled:opacity-50"
            >
              {loading ? 'በመመዝገብ ላይ...' : 'አካውንት ፍጠርና ተመዝገብ (Register)'}
            </button>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => {
                  setErrorMsg('');
                  setMode('signin');
                }}
                className="text-stone-400 hover:text-amber-300 hover:underline"
              >
                ቀደም ሲል ተመዝግበዋል? ወደ አካውንት ይግቡ
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
