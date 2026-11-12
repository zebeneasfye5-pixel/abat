import React from 'react';
import { X, Smartphone, Download, Share2, PlusSquare, Check } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PWAInstallModal: React.FC<PWAInstallModalProps> = ({ isOpen, onClose }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  if (!isOpen) return null;

  const handleInstallClick = async () => {
    const success = await install();
    if (success) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl bg-stone-950 border-2 border-amber-600/50 shadow-2xl p-6 sm:p-8 space-y-6 animate-scale-up relative text-center">
        
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-lg bg-stone-900 text-stone-400 hover:text-stone-100 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-red-950 to-amber-950 border-2 border-amber-500/60 flex items-center justify-center text-amber-400 shadow-xl">
          <Smartphone className="w-8 h-8" />
        </div>

        <div>
          <h3 className="text-xl font-heading font-bold text-amber-100">
            "ቀሲስ ሄኖክ" አፕሊኬሽንን ወደ ስልክዎ ይጫኑ
          </h3>
          <p className="text-xs sm:text-sm text-stone-300 mt-1.5">
            ያለ ምንም ክፍያ በቀጥታ ወደ ስልክዎ በመጫን ያለ ኢንተርኔት (ኦፍላይን) እና በፍጥነት ይጠቀሙ።
          </p>
        </div>

        {/* Status Check if Already Installed */}
        {isInstalled ? (
          <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-600/60 text-xs text-emerald-200 flex items-center justify-center gap-2">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>አፕሊኬሽኑ በስልክዎ ላይ በተሳካ ሁኔታ ተጭኗል!</span>
          </div>
        ) : isInstallable ? (
          /* Android / Chrome One-Tap Install */
          <div className="space-y-3">
            <button
              onClick={handleInstallClick}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-red-950 via-amber-900 to-red-950 border border-amber-400 text-white font-bold text-sm shadow-xl hover:scale-[1.02] transition flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4 text-amber-300" />
              <span>ወደ ስልክ ጫን (Install to Phone)</span>
            </button>
            <p className="text-[11px] text-stone-400">
              በአንድ ጠቅታ ልክ እንደ Play Store አፕሊኬሽን ወደ ስልክዎ ይጫናል።
            </p>
          </div>
        ) : (
          /* iOS Safari / Manual Installation Guidance */
          <div className="p-4 rounded-2xl bg-stone-900/80 border border-stone-800 text-left space-y-3 text-xs text-stone-300">
            <p className="font-semibold text-amber-200">በiPhone / Safari ላይ ለመጫን፡</p>
            
            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-amber-950 border border-amber-600/60 flex items-center justify-center text-amber-300 shrink-0 font-bold text-[10px]">1</span>
              <p>ከታች ባለው የSafari ሜኑ ላይ የ <strong className="text-amber-300">"Share" (ማጋሪያ)</strong> <Share2 className="w-3.5 h-3.5 inline mx-0.5 text-amber-400" /> ምልክትን ይጫኑ።</p>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-amber-950 border border-amber-600/60 flex items-center justify-center text-amber-300 shrink-0 font-bold text-[10px]">2</span>
              <p>ወደ ታች ዝቅ ብለው <strong className="text-amber-300">"Add to Home Screen" (ወደ መነሻ ገጽ አክል)</strong> <PlusSquare className="w-3.5 h-3.5 inline mx-0.5 text-amber-400" /> የሚለውን ይምረጡ።</p>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-amber-950 border border-amber-600/60 flex items-center justify-center text-amber-300 shrink-0 font-bold text-[10px]">3</span>
              <p>ከላይ በስተቀኝ <strong className="text-amber-300">"Add"</strong> የሚለውን ሲጫኑ ሙሉ አፕሊኬሽኑ በስልክዎ ገጽ ላይ ይቀመጣል!</p>
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-300 text-xs transition"
        >
          ዝጋ (Close)
        </button>

      </div>
    </div>
  );
};
