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
  const res = await fetch(apiUrl('/api/auth/register'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'ምዝገባው አልተሳካም');
  }
  setAuthToken(data.token);
  return data;
}

export async function loginUser(identifier: string, password: string): Promise<{ user: UserProfile; token: string }> {
  const res = await fetch(apiUrl('/api/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'መግባት አልተቻለም');
  }
  setAuthToken(data.token);
  return data;
}

export async function fetchCurrentUser(): Promise<UserProfile | null> {
  const token = getAuthToken();
  if (!token) return null;
  try {
    const res = await fetch(apiUrl('/api/auth/me'), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      setAuthToken(null);
      return null;
    }
    const data = await res.json();
    return data.user;
  } catch {
    return null;
  }
}

export async function updateUserProfile(payload: Partial<UserProfile>): Promise<UserProfile> {
  const token = getAuthToken();
  const res = await fetch(apiUrl('/api/auth/profile'), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'ፕሮፋይሉን ማደስ አልተቻለም');
  }
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
    const res = await fetch(apiUrl('/api/users'));
    if (!res.ok) return [];
    const data = await res.json();
    return data.users || [];
  } catch {
    return [];
  }
}

// --- 2. REAL GEMINI AI SPIRITUAL COUNSEL & SCRIPTURE SEARCH ---
export async function askSpiritualCounsel(prompt: string, topic?: string, baptismalName?: string): Promise<string> {
  const res = await fetch(apiUrl('/api/gemini/spiritual-counsel'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, topic, baptismalName }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'የኤአይ አገልግሎት ችግር አጋጥሞታል');
  }
  return data.reply;
}

export async function searchScripture(query: string): Promise<string> {
  const res = await fetch(apiUrl('/api/gemini/scripture-search'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'የመጽሐፍ ቅዱስ ፍለጋው አልተሳካም');
  }
  return data.result;
}

// --- 3. WEBRTC ICE / TURN CONFIG ---
export async function fetchWebRTCConfig(): Promise<RTCConfiguration> {
  try {
    const res = await fetch(apiUrl('/api/webrtc-config'));
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.iceServers)) {
        return { iceServers: data.iceServers };
      }
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
    const res = await fetch(apiUrl('/api/confessions'));
    if (!res.ok) return [];
    const data = await res.json();
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
  const res = await fetch(apiUrl('/api/confessions/book'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'ቀጠሮ ማስያዝ አልተቻለም');
  return data.booking;
}

export async function updateConfessionStatus(
  id: string,
  status: 'confirmed' | 'completed' | 'cancelled',
  penanceNotes?: string
): Promise<ConfessionBooking> {
  const res = await fetch(apiUrl('/api/confessions/update-status'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, status, penanceNotes }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'ቀጠሮውን ማደስ አልተቻለም');
  return data.booking;
}

export async function verifySecretRoomPasscode(passcode: string): Promise<{ authorized: boolean; roomId?: string; error?: string }> {
  const res = await fetch(apiUrl('/api/confessions/verify-secret-room'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passcode }),
  });
  const data = await res.json();
  return data;
}

// --- 5. SPIRITUAL WALLET API ---
export async function fetchWalletData(): Promise<{
  balance: WalletState;
  transactions: WalletTransaction[];
}> {
  try {
    const res = await fetch(apiUrl('/api/wallet'));
    if (!res.ok) throw new Error();
    return await res.json();
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
  const res = await fetch(apiUrl('/api/wallet/give'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'ክፍያው አልተሳካም');
  return data;
}
