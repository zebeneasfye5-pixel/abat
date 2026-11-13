import React, { useState } from 'react';
import {
  X,
  Download,
  Share2,
  PlusSquare,
  Check,
  Copy,
  ExternalLink,
  MoreVertical,
  Compass,
  Menu,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PWAInstallModal: React.FC<PWAInstallModalProps> = ({ isOpen, onClose }) => {
  const {
    isInstallable,
    isInstalled,
    isIOS,
    isAndroid,
    isInAppBrowser,
    inAppName,
    isSafariOnIOS,
    isSamsungInternet,
    install,
  } = usePWAInstall();

  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleInstallClick = async () => {
    const result = await install();
    if (result === 'accepted') {
      onClose();
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="w-full max-w-md rounded-3xl bg-stone-950 border-2 border-amber-600/50 shadow-2xl p-6 sm:p-8 space-y-5 animate-scale-up relative text-center">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 p-2 rounded-lg bg-stone-900 text-stone-400 hover:text-stone-100 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Real App Icon Preview */}
        <div className="flex flex-col items-center gap-2">
          <img
            src="/pwa-192x192.png"
            alt="ቀሲስ ሄኖክ"
            className="w-16 h-16 rounded-2xl border-2 border-amber-500/60 shadow-xl"
          />
          <div>
            <h3 className="text-xl font-heading font-bold text-amber-100">
              "ቀሲስ ሄኖክ" አፕሊኬሽንን ወደ ስልክዎ ይጫኑ
            </h3>
            <p className="text-xs sm:text-sm text-stone-300 mt-1">
              ልክ እንደ Play Store / App Store መተግበሪያ በስልክዎ መነሻ ገጽ ላይ በቀጥታ ይቀመጣል።
            </p>
          </div>
        </div>

        {/* 1. Already Installed */}
        {isInstalled ? (
          <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-600/60 text-xs text-emerald-200 flex items-center justify-center gap-2">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>አፕሊኬሽኑ በስልክዎ ላይ በተሳካ ሁኔታ ተጭኗል!</span>
          </div>
        ) : isInstallable ? (
          /* 2. Native One-Tap Install (Android Chrome / Edge / Desktop Chrome) */
          <div className="space-y-3">
            <button
              onClick={handleInstallClick}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-red-950 via-amber-800 to-red-950 border border-amber-400 text-white font-bold text-sm shadow-xl hover:scale-[1.02] transition flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4 text-amber-300" />
              <span>አሁኑኑ ወደ ስልክ ጫን (1-Tap Install)</span>
            </button>
            <p className="text-[11px] text-stone-400">
              በአንድ ጠቅታ ያለ ፋይል ማውረድ በቀጥታ ወደ ስልክዎ ይጫናል።
            </p>
          </div>
        ) : isInAppBrowser ? (
          /* 3. Inside Telegram / WhatsApp / Facebook / TikTok In-App Browser */
          <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-600/50 text-left space-y-3 text-xs text-stone-200">
            <div className="flex items-center gap-2 text-amber-300 font-bold">
              <ExternalLink className="w-4 h-4 shrink-0" />
              <span>
                ከ {inAppName || 'መልእክት መተግበሪያ'} ውስጥ በመክፈትዎ ቀጥታ መጫን ታግዷል
              </span>
            </div>
            <p className="text-stone-300 text-[11px] leading-relaxed">
              Telegram ወይም WhatsApp የውስጥ ማሰሻ አፕሊኬሽን ለመጫን አይፈቅድም። በቀላሉ በChrome ወይም Safari ይክፈቱት፡
            </p>

            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-amber-950 border border-amber-600/60 flex items-center justify-center text-amber-300 shrink-0 font-bold text-[10px]">
                1
              </span>
              <p>
                ከላይ በስተቀኝ ያለውን <MoreVertical className="w-3.5 h-3.5 inline text-amber-300" /> (ወይም የማጋሪያ) ምልክት ተጭነው{' '}
                <strong className="text-amber-300">
                  {isIOS ? '"Open in Safari"' : '"Open in Chrome / Browser"'}
                </strong>{' '}
                የሚለውን ይምረጡ።
              </p>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-amber-950 border border-amber-600/60 flex items-center justify-center text-amber-300 shrink-0 font-bold text-[10px]">
                2
              </span>
              <p>
                ከዚያም <strong className="text-amber-300">"አሁን ጫን"</strong> የሚለው ቁልፍ ወዲያውኑ ይሠራል።
              </p>
            </div>

            <button
              onClick={handleCopyLink}
              className="w-full mt-1 py-2.5 px-3 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/60 text-amber-200 font-bold flex items-center justify-center gap-2 transition"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'ሊንኩ ተገልብጧል — Chrome/Safari ላይ ይክፈቱት' : 'ሊንኩን ኮፒ አድርግ (Copy Link)'}</span>
            </button>
          </div>
        ) : isIOS ? (
          /* 4. iPhone / iPad Instructions */
          <div className="p-4 rounded-2xl bg-stone-900/80 border border-stone-800 text-left space-y-3 text-xs text-stone-300">
            {!isSafariOnIOS && (
              <div className="p-2.5 rounded-xl bg-amber-950/50 border border-amber-600/50 text-amber-200 text-[11px] space-y-2">
                <div className="flex items-center gap-1.5 font-bold">
                  <Compass className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>በiPhone ላይ ለመጫን በSafari ብራውዘር ይክፈቱት</span>
                </div>
                <button
                  onClick={handleCopyLink}
                  className="w-full py-1.5 px-2.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/60 text-amber-200 font-bold flex items-center justify-center gap-1.5"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'ተገልብጧል!' : 'ሊንኩን ኮፒ አድርጎ Safari ላይ ክፈት'}</span>
                </button>
              </div>
            )}

            <p className="font-semibold text-amber-200">በiPhone / iPad Safari ላይ ለመጫን፡</p>

            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-amber-950 border border-amber-600/60 flex items-center justify-center text-amber-300 shrink-0 font-bold text-[10px]">
                1
              </span>
              <p>
                ከታች ባለው የSafari ሜኑ ላይ የ <strong className="text-amber-300">"Share" (ማጋሪያ)</strong>{' '}
                <Share2 className="w-3.5 h-3.5 inline mx-0.5 text-amber-400" /> ምልክትን ይጫኑ።
              </p>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-amber-950 border border-amber-600/60 flex items-center justify-center text-amber-300 shrink-0 font-bold text-[10px]">
                2
              </span>
              <p>
                ወደ ታች ዝቅ ብለው <strong className="text-amber-300">"Add to Home Screen" (ወደ መነሻ ገጽ አክል)</strong>{' '}
                <PlusSquare className="w-3.5 h-3.5 inline mx-0.5 text-amber-400" /> የሚለውን ይምረጡ።
              </p>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-amber-950 border border-amber-600/60 flex items-center justify-center text-amber-300 shrink-0 font-bold text-[10px]">
                3
              </span>
              <p>
                ከላይ በስተቀኝ <strong className="text-amber-300">"Add"</strong> የሚለውን ሲጫኑ አፕሊኬሽኑ በስልክዎ መነሻ ገጽ ላይ ይቀመጣል!
              </p>
            </div>
          </div>
        ) : (
          /* 5. Android Chrome / Samsung Internet / Desktop Browser Fallback */
          <div className="p-4 rounded-2xl bg-stone-900/80 border border-stone-800 text-left space-y-3 text-xs text-stone-300">
            <p className="font-semibold text-amber-200">
              {isSamsungInternet
                ? 'በSamsung Internet ላይ ለመጫን፡'
                : isAndroid
                  ? 'በAndroid ስልክ (Chrome / Browser) ላይ ለመጫን፡'
                  : 'በስልክ ወይም ኮምፒውተር ላይ ለመጫን፡'}
            </p>

            {isSamsungInternet ? (
              <>
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-amber-950 border border-amber-600/60 flex items-center justify-center text-amber-300 shrink-0 font-bold text-[10px]">
                    1
                  </span>
                  <p>
                    ከታች በስተቀኝ ያለውን <Menu className="w-3.5 h-3.5 inline mx-0.5 text-amber-400" /> (Menu) ምልክት ይጫኑ።
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-amber-950 border border-amber-600/60 flex items-center justify-center text-amber-300 shrink-0 font-bold text-[10px]">
                    2
                  </span>
                  <p>
                    <strong className="text-amber-300">"Add page to" → "Home screen"</strong> የሚለውን ይምረጡ።
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-amber-950 border border-amber-600/60 flex items-center justify-center text-amber-300 shrink-0 font-bold text-[10px]">
                    1
                  </span>
                  <p>
                    ከላይ በስተቀኝ ያለውን ባለ 3 ነጥብ <MoreVertical className="w-3.5 h-3.5 inline text-amber-400" /> (Menu) ምልክት ይጫኑ።
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-amber-950 border border-amber-600/60 flex items-center justify-center text-amber-300 shrink-0 font-bold text-[10px]">
                    2
                  </span>
                  <p>
                    <strong className="text-amber-300">"Add to Home screen"</strong> ወይም{' '}
                    <strong className="text-amber-300">"Install app"</strong> የሚለውን ይምረጡ።
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-amber-950 border border-amber-600/60 flex items-center justify-center text-amber-300 shrink-0 font-bold text-[10px]">
                    3
                  </span>
                  <p>
                    <strong className="text-amber-300">"Install / Add"</strong> ሲሉ ሙሉ አፕሊኬሽኑ በስልክዎ ላይ ይጫናል!
                  </p>
                </div>
              </>
            )}

            <button
              onClick={handleCopyLink}
              className="w-full mt-1 py-2 px-3 rounded-xl bg-stone-950 hover:bg-stone-800 border border-stone-700 text-stone-300 text-[11px] font-medium flex items-center justify-center gap-1.5 transition"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-amber-400" />}
              <span>{copied ? 'ሊንኩ ተገልብጧል!' : 'ሊንኩን ኮፒ አድርግ (Copy Link)'}</span>
            </button>
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
