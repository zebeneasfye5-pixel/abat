import { useEffect, useState, useCallback } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

declare global {
  interface Window {
    __deferredInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

export interface PWAEnvironment {
  isInstallable: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isInAppBrowser: boolean;
  inAppName: string | null;
  isSafariOnIOS: boolean;
  isSamsungInternet: boolean;
  isFirefox: boolean;
  install: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
}

function detectEnvironment() {
  if (typeof window === 'undefined') {
    return {
      isStandalone: false,
      isIOS: false,
      isAndroid: false,
      isInAppBrowser: false,
      inAppName: null as string | null,
      isSafariOnIOS: false,
      isSamsungInternet: false,
      isFirefox: false,
    };
  }

  const ua = window.navigator.userAgent || '';
  const uaLower = ua.toLowerCase();

  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;

  const isIOS =
    /iphone|ipad|ipod/.test(uaLower) ||
    (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);

  const isAndroid = /android/.test(uaLower);

  let inAppName: string | null = null;
  if (/telegram/i.test(ua)) inAppName = 'Telegram';
  else if (/whatsapp/i.test(ua)) inAppName = 'WhatsApp';
  else if (/instagram/i.test(ua)) inAppName = 'Instagram';
  else if (/fban|fbav|fb_iab/i.test(ua)) inAppName = 'Facebook / Messenger';
  else if (/tiktok|bytedancewebview|musical_ly/i.test(ua)) inAppName = 'TikTok';
  else if (/; wv\)/i.test(ua)) inAppName = 'In-App Browser';

  const isInAppBrowser = Boolean(inAppName);
  const isSamsungInternet = /samsungbrowser/i.test(ua);
  const isFirefox = /firefox|fxios/i.test(ua);
  const isSafariOnIOS =
    isIOS &&
    /safari/i.test(ua) &&
    !/crios|fxios|edgios|opios|duckduckgo/i.test(ua) &&
    !isInAppBrowser;

  return {
    isStandalone,
    isIOS,
    isAndroid,
    isInAppBrowser,
    inAppName,
    isSafariOnIOS,
    isSamsungInternet,
    isFirefox,
  };
}

export function usePWAInstall(): PWAEnvironment {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() =>
    typeof window !== 'undefined' ? window.__deferredInstallPrompt || null : null
  );
  const [env, setEnv] = useState(detectEnvironment);
  const [isInstalled, setIsInstalled] = useState(() => detectEnvironment().isStandalone);

  useEffect(() => {
    setEnv(detectEnvironment());
    if (window.__deferredInstallPrompt) {
      setDeferredPrompt(window.__deferredInstallPrompt);
    }

    const syncPrompt = () => {
      setDeferredPrompt(window.__deferredInstallPrompt || null);
    };

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      window.__deferredInstallPrompt = e as BeforeInstallPromptEvent;
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      window.__deferredInstallPrompt = null;
      setDeferredPrompt(null);
      setIsInstalled(true);
    };

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = (e: MediaQueryListEvent) => {
      if (e.matches) setIsInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('pwa-install-available', syncPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('pwa-app-installed', handleAppInstalled);
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleDisplayModeChange);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('pwa-install-available', syncPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('pwa-app-installed', handleAppInstalled);
      if (typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', handleDisplayModeChange);
      }
    };
  }, []);

  const install = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    const promptEvent = deferredPrompt || window.__deferredInstallPrompt;
    if (!promptEvent) return 'unavailable';
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === 'accepted') {
      window.__deferredInstallPrompt = null;
      setDeferredPrompt(null);
      setIsInstalled(true);
      return 'accepted';
    }
    return 'dismissed';
  }, [deferredPrompt]);

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS: env.isIOS,
    isAndroid: env.isAndroid,
    isInAppBrowser: env.isInAppBrowser,
    inAppName: env.inAppName,
    isSafariOnIOS: env.isSafariOnIOS,
    isSamsungInternet: env.isSamsungInternet,
    isFirefox: env.isFirefox,
    install,
  };
}
