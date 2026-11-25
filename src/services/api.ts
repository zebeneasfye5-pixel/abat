import {
  ConfessionBooking,
  WalletState,
  WalletTransaction,
  UserProfile,
  BankAccountInfo,
  MinistryBankAccounts,
  CommunityEngagement,
  PhoneContactRecord,
  MemberDirectoryRecord,
} from '../types';

const AUTH_TOKEN_KEY = 'qh_auth_token';
const SAVED_USER_KEY = 'qh_saved_user_v1';
const RECOVERY_RECORDS_KEY = 'qh_recovery_records_v1';
const WALLET_BACKUP_KEY = 'qh_wallet_backup_v1';
const BANK_BACKUP_KEY = 'qh_bank_backup_v1';

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

export function getSavedUserSnapshot(): UserProfile | null {
  try {
    const token = getAuthToken();
    const raw = localStorage.getItem(SAVED_USER_KEY);
    if (!token || !raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.isAuthenticated && parsed.id) {
      return parsed as UserProfile;
    }
  } catch {}
  return null;
}

function saveUserSnapshot(user: UserProfile | null, recoveryRecord?: string) {
  try {
    if (user && user.isAuthenticated) {
      localStorage.setItem(SAVED_USER_KEY, JSON.stringify(user));
      if (recoveryRecord) {
        const mapRaw = localStorage.getItem(RECOVERY_RECORDS_KEY);
        const map: Record<string, string> = mapRaw ? JSON.parse(mapRaw) : {};
        if (user.phone) map[user.phone.trim()] = recoveryRecord;
        if (user.email) map[user.email.trim().toLowerCase()] = recoveryRecord;
        map.__latest__ = recoveryRecord;
        localStorage.setItem(RECOVERY_RECORDS_KEY, JSON.stringify(map));
      }
    } else {
      localStorage.removeItem(SAVED_USER_KEY);
    }
  } catch {}
}

function findRecoveryRecord(identifier?: string): string | null {
  try {
    const mapRaw = localStorage.getItem(RECOVERY_RECORDS_KEY);
    if (!mapRaw) return null;
    const map: Record<string, string> = JSON.parse(mapRaw);
    if (identifier) {
      const key = identifier.trim();
      return map[key] || map[key.toLowerCase()] || map.__latest__ || null;
    }
    return map.__latest__ || null;
  } catch {
    return null;
  }
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
    const errorObj: any = new Error(data?.message || data?.error || `የሰርቨር ስህተት (${res.status})`);
    errorObj.status = res.status;
    errorObj.code = data?.code;
    throw errorObj;
  }

  return data as T;
}

// --- 1. REAL PERMANENT AUTHENTICATION API ---
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
  const data = await safeFetchJson<{ user: UserProfile; token: string; recoveryRecord?: string }>(
    '/api/auth/register',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
  setAuthToken(data.token);
  saveUserSnapshot(data.user, data.recoveryRecord);
  return data;
}

export async function loginUser(identifier: string, password: string): Promise<{ user: UserProfile; token: string }> {
  try {
    const data = await safeFetchJson<{ user: UserProfile; token: string; recoveryRecord?: string }>(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      }
    );
    setAuthToken(data.token);
    saveUserSnapshot(data.user, data.recoveryRecord);
    return data;
  } catch (err: any) {
    // If server disk reset on Render Free Tier, automatically restore from signed recovery record
    if (err?.status === 404 || err?.code === 'USER_NOT_FOUND') {
      const rec = findRecoveryRecord(identifier);
      if (rec) {
        const restored = await safeFetchJson<{ user: UserProfile; token: string; recoveryRecord?: string }>(
          '/api/auth/restore',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recoveryRecord: rec, identifier, password }),
          }
        );
        setAuthToken(restored.token);
        saveUserSnapshot(restored.user, restored.recoveryRecord);
        return restored;
      }
    }
    throw err;
  }
}

export async function fetchCurrentUser(): Promise<UserProfile | null> {
  const token = getAuthToken();
  if (!token) return null;
  try {
    const data = await safeFetchJson<{ user: UserProfile; token?: string; recoveryRecord?: string }>(
      '/api/auth/me',
      { headers: { Authorization: `Bearer ${token}` } },
      12000
    );
    if (data.token) setAuthToken(data.token);
    saveUserSnapshot(data.user, data.recoveryRecord);
    return data.user;
  } catch (err: any) {
    // If Render restarted and token was legacy or expired, try auto-restoring using signed recoveryRecord
    const rec = findRecoveryRecord();
    if (rec && (err?.status === 401 || err?.status === 404)) {
      try {
        const restored = await safeFetchJson<{ user: UserProfile; token: string; recoveryRecord?: string }>(
          '/api/auth/restore',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recoveryRecord: rec }),
          },
          12000
        );
        setAuthToken(restored.token);
        saveUserSnapshot(restored.user, restored.recoveryRecord);
        return restored.user;
      } catch {}
    }
    // Keep saved local snapshot intact on offline/transient network errors so user is NEVER kicked out
    return getSavedUserSnapshot();
  }
}

export async function updateUserProfile(payload: Partial<UserProfile>): Promise<UserProfile> {
  const token = getAuthToken();
  const data = await safeFetchJson<{ user: UserProfile; token?: string; recoveryRecord?: string }>(
    '/api/auth/profile',
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    }
  );
  if (data.token) setAuthToken(data.token);
  saveUserSnapshot(data.user, data.recoveryRecord);
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
  saveUserSnapshot(null);
}

export async function fetchRegisteredUsers(): Promise<UserProfile[]> {
  const token = getAuthToken();
  if (!token) return [];
  try {
    const data = await safeFetchJson<{ users: UserProfile[] }>(
      '/api/users',
      { headers: { Authorization: `Bearer ${token}` } },
      12000
    );
    return data.users || [];
  } catch {
    return [];
  }
}

// --- 2. REAL GEMINI AI SPIRITUAL COUNSEL & ORTHODOX SEARCH (STREAMING + FAST CACHE) ---
async function readSseStreamOnce(
  path: string,
  body: object,
  onChunk: (accumulatedText: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text();
    let msg = `የኤአይ ሰርቨር ስህተት (${res.status})`;
    let retryable = res.status === 502 || res.status === 503 || res.status === 504;
    try {
      const parsed = JSON.parse(text);
      msg = parsed.message || parsed.error || msg;
      if (parsed.retryable !== undefined) retryable = Boolean(parsed.retryable);
    } catch {}
    const err: any = new Error(msg);
    err.status = res.status;
    err.retryable = retryable;
    throw err;
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('text/event-stream') || !res.body) {
    const json = await res.json();
    const full = json.reply || json.result || '';
    onChunk(full);
    return full;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let accumulated = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';

    for (const evt of events) {
      for (const line of evt.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const raw = line.slice(5).trim();
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw);
          if (parsed.error) {
            const err: any = new Error(parsed.error);
            err.retryable = Boolean(parsed.retryable) || String(parsed.error).includes('503') || String(parsed.error).includes('ተጨናንቋል');
            throw err;
          }
          if (parsed.chunk) {
            accumulated += parsed.chunk;
            onChunk(accumulated);
          }
        } catch (err: any) {
          if (err instanceof Error && err.message && !err.message.includes('JSON')) {
            throw err;
          }
        }
      }
    }
  }

  return accumulated;
}

async function readSseStream(
  path: string,
  body: object,
  onChunk: (accumulatedText: string) => void,
  signal?: AbortSignal
): Promise<string> {
  try {
    return await readSseStreamOnce(path, body, onChunk, signal);
  } catch (err: any) {
    if (err?.name === 'AbortError' || signal?.aborted) throw err;
    const isTransient = Boolean(err?.retryable) || err?.status === 502 || err?.status === 503 || err?.status === 504;
    if (!isTransient) throw err;
    // Wait 1.6s and retry automatically once when Gemini server reports transient high demand (503)
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, 1600);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(t);
          reject(new DOMException('Aborted', 'AbortError'));
        },
        { once: true }
      );
    });
    return readSseStreamOnce(path, body, onChunk, signal);
  }
}

export async function streamSpiritualCounsel(
  prompt: string,
  topic: string,
  baptismalName: string | undefined,
  onChunk: (accumulatedText: string) => void,
  signal?: AbortSignal
): Promise<string> {
  return readSseStream(
    '/api/gemini/spiritual-counsel-stream',
    { prompt, topic, baptismalName },
    onChunk,
    signal
  );
}

export async function streamOrthodoxSearch(
  query: string,
  category: string,
  onChunk: (accumulatedText: string) => void,
  signal?: AbortSignal
): Promise<string> {
  return readSseStream(
    '/api/gemini/scripture-search-stream',
    { query, category },
    onChunk,
    signal
  );
}

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

export async function searchScripture(query: string, category?: string): Promise<string> {
  const data = await safeFetchJson<{ result: string }>(
    '/api/gemini/scripture-search',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, category }),
    },
    35000
  );
  return data.result;
}

// --- 2B. COMMUNITY ENGAGEMENT (LIKE, SHARE & PHONE CONTACTS) ---
export async function fetchCommunityEngagement(): Promise<CommunityEngagement> {
  try {
    return await safeFetchJson<CommunityEngagement>('/api/community/engagement', {}, 8000);
  } catch {
    return { likesCount: 0, sharesCount: 0, contactsCount: 0 };
  }
}

export async function toggleWebsiteLike(action: 'like' | 'unlike'): Promise<CommunityEngagement> {
  return safeFetchJson<CommunityEngagement>('/api/community/like', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
}

export async function recordWebsiteShare(): Promise<CommunityEngagement> {
  return safeFetchJson<CommunityEngagement>('/api/community/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function fetchSavedContacts(): Promise<PhoneContactRecord[]> {
  try {
    const data = await safeFetchJson<{ contacts: PhoneContactRecord[] }>('/api/community/contacts', {}, 10000);
    return data.contacts || [];
  } catch {
    return [];
  }
}

export async function addPhoneContacts(
  contacts: Array<{ name: string; phone: string; note?: string }>,
  addedBy?: string
): Promise<{ addedCount: number; contacts: PhoneContactRecord[] }> {
  const token = getAuthToken();
  return safeFetchJson<{ addedCount: number; contacts: PhoneContactRecord[] }>('/api/community/contacts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ contacts, addedBy }),
  });
}

export async function deleteSavedContact(id: string): Promise<PhoneContactRecord[]> {
  const data = await safeFetchJson<{ contacts: PhoneContactRecord[] }>(`/api/community/contacts/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return data.contacts || [];
}

// --- 3. WEBRTC ICE / TURN / LIVEKIT SFU CONFIG ---
export interface ExtendedRTCConfig extends RTCConfiguration {
  sfuConfigured?: boolean;
  livekitUrl?: string | null;
}

export async function fetchWebRTCConfig(): Promise<ExtendedRTCConfig> {
  try {
    const data = await safeFetchJson<{
      iceServers: RTCIceServer[];
      sfuConfigured?: boolean;
      livekitUrl?: string | null;
    }>('/api/webrtc-config', {}, 10000);
    if (Array.isArray(data.iceServers)) {
      return {
        iceServers: data.iceServers,
        sfuConfigured: Boolean(data.sfuConfigured),
        livekitUrl: data.livekitUrl || null,
      };
    }
  } catch {}
  return {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
    ],
    sfuConfigured: false,
    livekitUrl: null,
  };
}

export async function fetchLiveKitToken(
  roomId: string,
  userId: string,
  userName: string,
  canPublish: boolean
): Promise<{ sfuConfigured: boolean; url?: string; token?: string }> {
  return safeFetchJson('/api/livekit/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomId, userId, userName, canPublish }),
  });
}

// --- 4. CONFESSIONS & SECRET ROOM API ---
export async function fetchConfessions(): Promise<ConfessionBooking[]> {
  const token = getAuthToken();
  if (!token) return [];
  try {
    const data = await safeFetchJson<{ bookings: ConfessionBooking[] }>(
      '/api/confessions',
      { headers: { Authorization: `Bearer ${token}` } },
      12000
    );
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

// --- 5. SPIRITUAL WALLET & BANKING API ---
export interface WalletDashboardPayload {
  balance: WalletState;
  transactions: WalletTransaction[];
  ministryBanks?: MinistryBankAccounts;
  userBankAccount?: BankAccountInfo | null;
}

function saveWalletLocalBackup(data: Partial<WalletDashboardPayload>) {
  try {
    if (data.balance || data.transactions) {
      const prevRaw = localStorage.getItem(WALLET_BACKUP_KEY);
      const prev = prevRaw ? JSON.parse(prevRaw) : {};
      localStorage.setItem(
        WALLET_BACKUP_KEY,
        JSON.stringify({
          balance: data.balance || prev.balance,
          transactions: data.transactions || prev.transactions || [],
        })
      );
    }
    if (data.ministryBanks || data.userBankAccount) {
      const prevRaw = localStorage.getItem(BANK_BACKUP_KEY);
      const prev = prevRaw ? JSON.parse(prevRaw) : {};
      localStorage.setItem(
        BANK_BACKUP_KEY,
        JSON.stringify({
          ministryBanks: data.ministryBanks || prev.ministryBanks,
          userBankAccount: data.userBankAccount !== undefined ? data.userBankAccount : prev.userBankAccount,
        })
      );
    }
  } catch {}
}

export async function fetchWalletData(): Promise<WalletDashboardPayload> {
  const token = getAuthToken();
  try {
    const data = await safeFetchJson<WalletDashboardPayload>(
      '/api/wallet',
      { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      12000
    );
    saveWalletLocalBackup(data);
    return data;
  } catch {
    try {
      const w = JSON.parse(localStorage.getItem(WALLET_BACKUP_KEY) || '{}');
      const b = JSON.parse(localStorage.getItem(BANK_BACKUP_KEY) || '{}');
      return {
        balance: w.balance || { totalBalance: 0, tithes: 0, charity: 0, churchSupport: 0, withdrawnTotal: 0 },
        transactions: w.transactions || [],
        ministryBanks: b.ministryBanks,
        userBankAccount: b.userBankAccount || null,
      };
    } catch {
      return {
        balance: { totalBalance: 0, tithes: 0, charity: 0, churchSupport: 0, withdrawnTotal: 0 },
        transactions: [],
      };
    }
  }
}

export async function submitWalletGiving(payload: {
  userId?: string;
  userName: string;
  type: string;
  amount: number;
  paymentMethod: string;
  purposeNote: string;
  bankName?: string;
  accountNumber?: string;
  accountHolderName?: string;
  referenceNumber?: string;
}): Promise<{ transaction: WalletTransaction; newBalance: WalletState }> {
  const token = getAuthToken();
  const res = await safeFetchJson<{ transaction: WalletTransaction; newBalance: WalletState }>(
    '/api/wallet/give',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    }
  );
  saveWalletLocalBackup({ balance: res.newBalance });
  return res;
}

export async function submitWalletWithdrawal(payload: {
  userName: string;
  amount: number;
  bankName: string;
  accountNumber: string;
  accountHolderName: string;
  purposeNote?: string;
  paymentMethod?: string;
}): Promise<{ transaction: WalletTransaction; newBalance: WalletState }> {
  const token = getAuthToken();
  const res = await safeFetchJson<{ transaction: WalletTransaction; newBalance: WalletState }>(
    '/api/wallet/withdraw',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    }
  );
  saveWalletLocalBackup({ balance: res.newBalance });
  return res;
}

export async function saveBankAccountConfig(payload: {
  userBankAccount?: BankAccountInfo;
  ministryBanks?: MinistryBankAccounts;
}): Promise<{ ministryBanks: MinistryBankAccounts; userBankAccount: BankAccountInfo | null }> {
  const token = getAuthToken();
  const res = await safeFetchJson<{ ministryBanks: MinistryBankAccounts; userBankAccount: BankAccountInfo | null }>(
    '/api/wallet/bank-accounts',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    }
  );
  saveWalletLocalBackup({
    ministryBanks: res.ministryBanks,
    userBankAccount: res.userBankAccount,
  });
  return res;
}

// --- 6. ADMIN / PRIEST DATABASE BACKUP & RESTORE API ---
export async function exportDatabaseBackup(): Promise<Record<string, any>> {
  const token = getAuthToken();
  if (!token) {
    throw new Error('የዳታቤዝ ባክአፕ ለማውረድ በቀሲስ/አስተዳዳሪ አካውንት መግባት ያስፈልጋል።');
  }
  return safeFetchJson<Record<string, any>>(
    '/api/admin/export-db',
    {
      headers: { Authorization: `Bearer ${token}` },
    },
    20000
  );
}

export async function importDatabaseBackup(backupData: Record<string, any>): Promise<{
  success: boolean;
  counts: { users: number; confessionBookings: number; walletTransactions: number; contacts: number };
}> {
  const token = getAuthToken();
  if (!token) {
    throw new Error('ዳታቤዝ ለመመለስ በቀሲስ/አስተዳዳሪ አካውንት መግባት ያስፈልጋል።');
  }
  return safeFetchJson<{
    success: boolean;
    counts: { users: number; confessionBookings: number; walletTransactions: number; contacts: number };
  }>(
    '/api/admin/import-db',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    body: JSON.stringify(backupData),
    },
    25000
  );
}

export interface MemberDirectoryPayload {
  members: MemberDirectoryRecord[];
  updatedAt: string;
  stats: {
    totalMembers: number;
    withPhoneCount: number;
    registeredAccountsCount: number;
    confessionMembersCount: number;
    contactsCount: number;
  };
}

export async function fetchMembersDirectory(): Promise<MemberDirectoryPayload | null> {
  const token = getAuthToken();
  if (!token) return null;
  try {
    return await safeFetchJson<MemberDirectoryPayload>(
      '/api/admin/members-directory',
      { headers: { Authorization: `Bearer ${token}` } },
      15000
    );
  } catch {
    return null;
  }
}

export async function organizeMembersDirectory(): Promise<MemberDirectoryPayload> {
  const token = getAuthToken();
  if (!token) {
    throw new Error('የአባላቱን መረጃ ለማደራጀት በቀሲስ/አስተዳዳሪ አካውንት መግባት ያስፈልጋል።');
  }
  return safeFetchJson<MemberDirectoryPayload>(
    '/api/admin/organize-members',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    },
    20000
  );
}
