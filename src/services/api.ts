import { ConfessionBooking, WalletState, WalletTransaction, UserProfile } from '../types';

const AUTH_TOKEN_KEY = 'qh_auth_token';

// Optional external backend URL (used if frontend is on Vercel and backend is on Render)
const RAW_API_BASE = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return RAW_API_BASE ? `${RAW_API_BASE}${normalizedPath}` : normalizedPath;
}

export function getRealtimeWsUrl(): string {
  if (RAW_API_BASE) {
    try {
      const parsed = new URL(RAW_API_BASE);
      const wsProto = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${wsProto}//${parsed.host}/ws/realtime`;
    } catch {}
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/realtime`;
}

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch {}
}

async function safeFetchJson<T = any>(
  path: string,
  options: RequestInit = {},
  timeoutMs = 25000
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      ...options,
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timer);
    if (err?.name === 'AbortError') {
      throw new Error('ሰርቨሩ መልስ ለመስጠት ዘግይቷል (Timeout)። የRender ሰርቨር ከእንቅልፍ እየተነሳ ሊሆን ስለሚችል ከ30 ሰከንድ በኋላ ደግመው ይሞክሩ።');
    }
    throw new Error('ከሰርቨሩ ጋር መገናኘት አልተቻለም። ኢንተርኔትዎን ወይም የሰርቨሩን መስራት ያረጋግጡ።');
  }
  clearTimeout(timer);

  const rawText = await res.text();
  let data: any = null;
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    // Non-JSON response (e.g., Vercel 404 "The page could not be found" or Render HTML error page)
    const isVercelHost =
      typeof window !== 'undefined' && window.location.hostname.includes('vercel.app');
    if (res.status === 404 || rawText.includes('The page could not be found')) {
      if (isVercelHost && !RAW_API_BASE) {
        throw new Error(
          'ይህ የVercel ገፅ ከRender ሰርቨር ጋር አልተገናኘም! በቀጥታ የRender ሊንክዎን (.onrender.com) ይጠቀሙ፣ ወይም Vercel ላይ VITE_API_URL ሞልተው Redeploy ያድርጉ።'
        );
      }
      throw new Error('የተጠየቀው የሰርቨር አገልግሎት (API 404) አልተገኘም። ሰርቨሩ ላይ አዲሱ ኮድ መጫኑን ያረጋግጡ።');
    }
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      throw new Error('የRender ሰርቨሩ ከእንቅልፍ እየተነሳ ነው (503)። እባክዎ 30 ሰከንድ ጠብቀው ደግመው ይሞክሩ።');
    }
    throw new Error('ሰርቨሩ ትክክለኛ መረጃ አልመለሰም። እባክዎ የRender ሊንክዎን ወይም የሰርቨሩን ሁኔታ ያረጋግጡ።');
  }

  if (!res.ok) {
    throw new Error(data?.message || data?.error || `የሰርቨር ስህተት (${res.status})`);
  }

  return data as T;
}

// --- 1. REAL AUTHENTICATION API ---
export async function registerUser(payload: {
  fullName: string;
  baptismalName: string;
  phone: string;
  email?: string;
  password: string;
  role?: 'child' | 'priest' | 'deacon';
  confessorPriest?: string;
  confessionStage?: string;
  priestCode?: string;
}): Promise<{ user: UserProfile; token: string }> {
  const data = await safeFetchJson<{ user: UserProfile; token: string }>('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  setAuthToken(data.token);
  return data;
}

export async function loginUser(identifier: string, password: string): Promise<{ user: UserProfile; token: string }> {
  const data = await safeFetchJson<{ user: UserProfile; token: string }>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  setAuthToken(data.token);
  return data;
}

export async function fetchCurrentUser(): Promise<UserProfile | null> {
  const token = getAuthToken();
  if (!token) return null;
  try {
    const data = await safeFetchJson<{ user: UserProfile }>(
      '/api/auth/me',
      { headers: { Authorization: `Bearer ${token}` } },
      12000
    );
    return data.user;
  } catch {
    return null;
  }
}

export async function updateUserProfile(payload: Partial<UserProfile>): Promise<UserProfile> {
  const token = getAuthToken();
  const data = await safeFetchJson<{ user: UserProfile }>('/api/auth/profile', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  return data.user;
}

export async function logoutUser(): Promise<void> {
  const token = getAuthToken();
  if (token) {
    fetch(apiUrl('/api/auth/logout'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }
  setAuthToken(null);
}

export async function fetchRegisteredUsers(): Promise<UserProfile[]> {
  try {
    const data = await safeFetchJson<{ users: UserProfile[] }>('/api/users', {}, 12000);
    return data.users || [];
  } catch {
    return [];
  }
}

// --- 2. REAL GEMINI AI SPIRITUAL COUNSEL & SCRIPTURE SEARCH ---
export async function askSpiritualCounsel(prompt: string, topic?: string, baptismalName?: string): Promise<string> {
  const data = await safeFetchJson<{ reply: string }>(
    '/api/gemini/spiritual-counsel',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, topic, baptismalName }),
    },
    35000
  );
  return data.reply;
}

export async function searchScripture(query: string): Promise<string> {
  const data = await safeFetchJson<{ result: string }>(
    '/api/gemini/scripture-search',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    },
    35000
  );
  return data.result;
}

// --- 3. WEBRTC ICE / TURN CONFIG ---
export async function fetchWebRTCConfig(): Promise<RTCConfiguration> {
  try {
    const data = await safeFetchJson<{ iceServers: RTCIceServer[] }>('/api/webrtc-config', {}, 10000);
    if (Array.isArray(data.iceServers)) {
      return { iceServers: data.iceServers };
    }
  } catch {}
  return {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
    ],
  };
}

// --- 4. CONFESSIONS & SECRET ROOM API ---
export async function fetchConfessions(): Promise<ConfessionBooking[]> {
  try {
    const data = await safeFetchJson<{ bookings: ConfessionBooking[] }>('/api/confessions', {}, 12000);
    return data.bookings || [];
  } catch {
    return [];
  }
}

export async function bookConfessionSlot(payload: {
  childName: string;
  baptismalName: string;
  phone: string;
  date: string;
  time: string;
  secretPasscode?: string;
}): Promise<ConfessionBooking> {
  const data = await safeFetchJson<{ booking: ConfessionBooking }>('/api/confessions/book', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return data.booking;
}

export async function updateConfessionStatus(
  id: string,
  status: 'confirmed' | 'completed' | 'cancelled',
  penanceNotes?: string
): Promise<ConfessionBooking> {
  const data = await safeFetchJson<{ booking: ConfessionBooking }>('/api/confessions/update-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, status, penanceNotes }),
  });
  return data.booking;
}

export async function verifySecretRoomPasscode(passcode: string): Promise<{ authorized: boolean; roomId?: string; error?: string }> {
  try {
    return await safeFetchJson<{ authorized: boolean; roomId?: string; error?: string }>(
      '/api/confessions/verify-secret-room',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      }
    );
  } catch (err: any) {
    return { authorized: false, error: err.message };
  }
}

// --- 5. SPIRITUAL WALLET API ---
export async function fetchWalletData(): Promise<{
  balance: WalletState;
  transactions: WalletTransaction[];
}> {
  try {
    return await safeFetchJson<{ balance: WalletState; transactions: WalletTransaction[] }>('/api/wallet', {}, 12000);
  } catch {
    return {
      balance: { totalBalance: 0, tithes: 0, charity: 0, churchSupport: 0 },
      transactions: [],
    };
  }
}

export async function submitWalletGiving(payload: {
  userId?: string;
  userName: string;
  type: string;
  amount: number;
  paymentMethod: string;
  purposeNote: string;
}): Promise<{ transaction: WalletTransaction; newBalance: WalletState }> {
  return safeFetchJson<{ transaction: WalletTransaction; newBalance: WalletState }>('/api/wallet/give', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
