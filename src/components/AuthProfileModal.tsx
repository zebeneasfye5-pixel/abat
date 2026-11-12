import React, { useState } from 'react';
import { X, User, LogIn, LogOut, CheckCircle, Flame, Shield } from 'lucide-react';
import { UserProfile, UserRole } from '../types';

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

  const [formData, setFormData] = useState({
    fullName: currentUser.fullName || '',
    baptismalName: currentUser.baptismalName || '',
    phone: currentUser.phone || '',
    email: currentUser.email || '',
    confessorPriest: currentUser.confessorPriest || 'ቀሲስ ሄኖክ',
    confessionStage: currentUser.confessionStage || 'መካከለኛ',
    role: currentUser.role || 'child',
  });

  if (!isOpen) return null;

  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: UserProfile = {
      ...currentUser,
      fullName: formData.fullName || 'ዮሐንስ ተስፋዬ',
      baptismalName: formData.baptismalName || 'ወልደ ዮሐንስ',
      phone: formData.phone || '+251911223344',
      isAuthenticated: true,
    };
    onUpdateUser(updated);
    setMode('profile');
    onClose();
  };

  const handleSignUp = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: UserProfile = {
      ...currentUser,
      fullName: formData.fullName || 'አዲስ የንስሐ ልጅ',
      baptismalName: formData.baptismalName || 'ወልደ ማርያም',
      phone: formData.phone || '+251900000000',
      email: formData.email || '',
      confessorPriest: formData.confessorPriest || 'ቀሲስ ሄኖክ',
      confessionStage: formData.confessionStage as any,
      role: formData.role as UserRole,
      isAuthenticated: true,
    };
    onUpdateUser(updated);
    setMode('profile');
    onClose();
  };

  const handleSignOut = () => {
    const updated: UserProfile = {
      ...currentUser,
      isAuthenticated: false,
    };
    onUpdateUser(updated);
    setMode('signin');
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: UserProfile = {
      ...currentUser,
      ...formData,
      confessionStage: formData.confessionStage as any,
      role: formData.role as UserRole,
    };
    onUpdateUser(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-3xl bg-stone-950 border-2 border-amber-700/50 shadow-2xl p-6 sm:p-8 space-y-6 animate-scale-up relative">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-lg bg-stone-900 text-stone-400 hover:text-stone-100 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-950/80 border border-amber-500/50 flex items-center justify-center text-amber-300 font-bold">
            <Flame className="w-6 h-6 animate-candle text-amber-400" />
          </div>
          <div>
            <h2 className="text-xl font-heading font-bold text-amber-100">
              {mode === 'profile' ? 'የተጠቃሚ ሙሉ መንፈሳዊ ፕሮፋይል' : mode === 'signin' ? 'ወደ አካውንትዎ ይግቡ (Sign In)' : 'አዲስ የንስሐ ልጅ ምዝገባ (Sign Up)'}
            </h2>
            <p className="text-xs text-stone-400">ቀሲስ ሄኖክ - የመንፈሳዊ አገልግሎት ማዕከል</p>
          </div>
        </div>

        {/* PROFILE VIEW (When logged in) */}
        {mode === 'profile' && (
          <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
            
            <div className="p-3.5 rounded-xl bg-stone-900/60 border border-stone-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-amber-900/60 border border-amber-500/40 flex items-center justify-center text-amber-200 font-bold text-base">
                  {currentUser.baptismalName.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-bold text-amber-200">{currentUser.baptismalName}</p>
                  <p className="text-stone-400">{currentUser.fullName} · {currentUser.phone}</p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-md bg-emerald-950 border border-emerald-700 text-emerald-300 font-medium">
                አካውንት ገብቷል
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-stone-300 font-semibold mb-1">መጠሪያ ሙሉ ስም</label>
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3 py-2 text-stone-100"
                />
              </div>

              <div>
                <label className="block text-stone-300 font-semibold mb-1">የክርስትና ስም (Baptismal Name)</label>
                <input
                  type="text"
                  value={formData.baptismalName}
                  onChange={(e) => setFormData({ ...formData, baptismalName: e.target.value })}
                  className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3 py-2 text-stone-100"
                />
              </div>

              <div>
                <label className="block text-stone-300 font-semibold mb-1">ስልክ ቁጥር</label>
                <input
                  type="tel"
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
              <label className="block text-stone-300 font-semibold mb-1">የንስሐና የመንፈሳዊ ጉዞ ደረጃ</label>
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
                className="flex-1 py-2.5 rounded-xl bg-amber-900/80 hover:bg-amber-900 border border-amber-600/50 text-amber-200 font-bold transition"
              >
                መረጃውን አድስ (Save Changes)
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-stone-900 hover:bg-red-950 border border-stone-700 hover:border-red-800 text-stone-300 hover:text-red-300 transition"
              >
                <LogOut className="w-4 h-4" />
                <span>ሳይን አውት (Sign Out)</span>
              </button>
            </div>

          </form>
        )}

        {/* SIGN IN VIEW */}
        {mode === 'signin' && (
          <form onSubmit={handleSignIn} className="space-y-4 text-xs">
            <div>
              <label className="block text-stone-300 font-semibold mb-1">ስልክ ቁጥር ወይም ኢሜይል</label>
              <input
                type="text"
                required
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+251911..."
                className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3 py-2.5 text-stone-100"
              />
            </div>

            <div>
              <label className="block text-stone-300 font-semibold mb-1">የይለፍ ቃል (Password)</label>
              <input
                type="password"
                required
                defaultValue="••••••••"
                className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3 py-2.5 text-stone-100"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-gradient-to-r from-red-950 via-amber-900 to-red-950 border border-amber-600 text-amber-200 font-bold transition flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              <span>ወደ አካውንት ግባ (Sign In)</span>
            </button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => setMode('signup')}
                className="text-amber-400 hover:underline"
              >
                አካውንት የለዎትም? አዲስ ይመዝገቡ (Sign Up)
              </button>
            </div>
          </form>
        )}

        {/* SIGN UP VIEW */}
        {mode === 'signup' && (
          <form onSubmit={handleSignUp} className="space-y-3 text-xs">
            <div>
              <label className="block text-stone-300 font-semibold mb-1">መጠሪያ ስም</label>
              <input
                type="text"
                required
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                placeholder="ዮሐንስ ተስፋዬ"
                className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3 py-2 text-stone-100"
              />
            </div>

            <div>
              <label className="block text-stone-300 font-semibold mb-1">የክርስትና ስም (ለጸሎትና ለንስሐ)</label>
              <input
                type="text"
                required
                value={formData.baptismalName}
                onChange={(e) => setFormData({ ...formData, baptismalName: e.target.value })}
                placeholder="ወልደ ዮሐንስ / ወለተ ማርያም..."
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
                placeholder="0911..."
                className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3 py-2 text-stone-100"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-gradient-to-r from-red-950 via-amber-900 to-red-950 border border-amber-600 text-amber-200 font-bold transition"
            >
              አካውንት ፍጠርና ተመዝገብ (Register)
            </button>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => setMode('signin')}
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
