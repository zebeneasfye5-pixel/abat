import express, { Request, Response } from 'express';
import http from 'http';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));

// Enable CORS so separate frontend hosts (e.g., Vercel) can talk to this Render backend when VITE_API_URL is set
app.use((req: Request, res: Response, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Permissions-Policy', 'camera=(*), microphone=(*), display-capture=(*)');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// --- PERSISTENT JSON DATABASE (.data/qesis-henok.json) ---
const DATA_DIR = path.resolve(__dirname, '.data');
const DB_FILE = path.join(DATA_DIR, 'qesis-henok.json');

interface StoredUser {
  id: string;
  fullName: string;
  baptismalName: string;
  phone: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  role: 'child' | 'priest' | 'deacon' | 'admin';
  confessorPriest: string;
  confessionStage: 'ጀማሪ' | 'መካከለኛ' | 'የበረታ/የቆረበ';
  avatarSeed: string;
  createdAt: string;
}

interface ConfessionSlot {
  id: string;
  childName: string;
  baptismalName: string;
  phone: string;
  date: string;
  time: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  penanceNotes?: string;
  secretPasscode: string;
}

interface WalletTx {
  id: string;
  userId: string;
  userName: string;
  type: 'tithe' | 'charity' | 'service_support' | 'deposit' | 'withdrawal';
  amount: number;
  timestamp: string;
  paymentMethod: 'telebirr' | 'cbe_birr' | 'chapa' | 'bank_transfer' | 'spiritual_wallet';
  status: 'completed' | 'pending';
  receiptNumber: string;
  purposeNote: string;
  bankName?: string;
  accountNumber?: string;
  accountHolderName?: string;
  referenceNumber?: string;
}

interface BankAccountRecord {
  bankName: string;
  accountHolderName: string;
  accountNumber: string;
  branchName?: string;
  telebirrPhone?: string;
}

interface MinistryBanksRecord {
  cbeAccount: string;
  cbeHolder: string;
  telebirrPhone: string;
  telebirrName: string;
  awashAccount: string;
  dashenAccount: string;
  abyssiniaAccount: string;
}

interface ContactRecord {
  id: string;
  name: string;
  phone: string;
  addedBy: string;
  invitedAt: string;
  note?: string;
}

interface MemberDirectoryRecord {
  id: string;
  secularName: string;
  spiritualName: string;
  phone: string;
  email: string;
  role: StoredUser['role'];
  confessorPriest: string;
  confessionStage: string;
  sources: string[];
  confessionCount: number;
  walletTotalGiven: number;
  lastUpdatedAt: string;
}

interface DatabaseSchema {
  users: StoredUser[];
  sessions: Record<string, string>; // token -> userId
  confessionBookings: ConfessionSlot[];
  walletBalance: {
    totalBalance: number;
    tithes: number;
    charity: number;
    churchSupport: number;
    withdrawnTotal: number;
  };
  walletTransactions: WalletTx[];
  userBankAccounts: Record<string, BankAccountRecord>;
  ministryBanks: MinistryBanksRecord;
  communityStats: {
    likesCount: number;
    sharesCount: number;
  };
  contacts: ContactRecord[];
  memberDirectory: MemberDirectoryRecord[];
  memberDirectoryUpdatedAt?: string;
  aiCache?: Record<string, string>;
}

const DEFAULT_MINISTRY_BANKS: MinistryBanksRecord = {
  cbeAccount: '1000-xxxx-xxxx-xx (በዋሌት ቅንብር ያስገቡ)',
  cbeHolder: 'ቀሲስ ሄኖክ የመንፈሳዊ አገልግሎት',
  telebirrPhone: '09-xxxx-xxxx',
  telebirrName: 'ቀሲስ ሄኖክ',
  awashAccount: '',
  dashenAccount: '',
  abyssiniaAccount: '',
};

function loadDatabase(): DatabaseSchema {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        users: Array.isArray(parsed.users) ? parsed.users : [],
        sessions: parsed.sessions || {},
        confessionBookings: Array.isArray(parsed.confessionBookings) ? parsed.confessionBookings : [],
        walletBalance: {
          totalBalance: Number(parsed.walletBalance?.totalBalance || 0),
          tithes: Number(parsed.walletBalance?.tithes || 0),
          charity: Number(parsed.walletBalance?.charity || 0),
          churchSupport: Number(parsed.walletBalance?.churchSupport || 0),
          withdrawnTotal: Number(parsed.walletBalance?.withdrawnTotal || 0),
        },
        walletTransactions: Array.isArray(parsed.walletTransactions) ? parsed.walletTransactions : [],
        userBankAccounts: parsed.userBankAccounts || {},
        ministryBanks: { ...DEFAULT_MINISTRY_BANKS, ...(parsed.ministryBanks || {}) },
        communityStats: {
          likesCount: Number(parsed.communityStats?.likesCount ?? 0),
          sharesCount: Number(parsed.communityStats?.sharesCount ?? 0),
        },
        contacts: Array.isArray(parsed.contacts) ? parsed.contacts : [],
        memberDirectory: Array.isArray(parsed.memberDirectory) ? parsed.memberDirectory : [],
        memberDirectoryUpdatedAt: typeof parsed.memberDirectoryUpdatedAt === 'string' ? parsed.memberDirectoryUpdatedAt : undefined,
        aiCache: parsed.aiCache && typeof parsed.aiCache === 'object' ? parsed.aiCache : {},
      };
    }
  } catch (err) {
    console.warn('Database read warning, initializing fresh store:', err);
  }

  return {
    users: [],
    sessions: {},
    confessionBookings: [],
    walletBalance: {
      totalBalance: 0,
      tithes: 0,
      charity: 0,
      churchSupport: 0,
      withdrawnTotal: 0,
    },
    walletTransactions: [],
    userBankAccounts: {},
    ministryBanks: { ...DEFAULT_MINISTRY_BANKS },
    communityStats: {
      likesCount: 0,
      sharesCount: 0,
    },
    contacts: [],
    memberDirectory: [],
    memberDirectoryUpdatedAt: undefined,
    aiCache: {},
  };
}

function normalizePhoneLookupKey(phone: string): string {
  const clean = String(phone || '').replace(/[\s\-()]+/g, '').trim();
  if (!clean) return '';
  if (clean.startsWith('+251') && clean.length >= 13) return `0${clean.slice(4)}`;
  if (clean.startsWith('251') && clean.length >= 12) return `0${clean.slice(3)}`;
  return clean.toLowerCase();
}

function syncAndOrganizeMemberDirectory(targetDb: DatabaseSchema): MemberDirectoryRecord[] {
  const byKey = new Map<string, MemberDirectoryRecord>();
  const idToKey = new Map<string, string>();
  const nameToKey = new Map<string, string>();
  const nowIso = new Date().toISOString();

  const registerKeys = (key: string, rec: MemberDirectoryRecord) => {
    if (rec.id) idToKey.set(rec.id, key);
    const secNorm = rec.secularName.trim().toLowerCase();
    const spiNorm = rec.spiritualName.trim().toLowerCase();
    if (secNorm) nameToKey.set(secNorm, key);
    if (spiNorm && spiNorm !== 'የንስሐ ልጅ') nameToKey.set(spiNorm, key);
  };

  const ensureEntry = (
    phone: string,
    secularName: string,
    spiritualName: string,
    fallbackId: string
  ): MemberDirectoryRecord => {
    const phoneKey = normalizePhoneLookupKey(phone);
    const secClean = secularName.trim();
    const spiClean = spiritualName.trim();
    const nameKey = (secClean || spiClean).toLowerCase();

    let key = '';
    if (phoneKey && byKey.has(`p:${phoneKey}`)) {
      key = `p:${phoneKey}`;
    } else if (fallbackId && idToKey.has(fallbackId)) {
      key = idToKey.get(fallbackId)!;
    } else if (!phoneKey && nameKey && nameToKey.has(nameKey)) {
      key = nameToKey.get(nameKey)!;
    } else if (phoneKey && nameKey && nameToKey.has(nameKey)) {
      const existingByNameKey = nameToKey.get(nameKey)!;
      const existingRec = byKey.get(existingByNameKey);
      if (existingRec && !existingRec.phone) {
        // Promote existing phone-less entry to a phone-indexed key
        byKey.delete(existingByNameKey);
        key = `p:${phoneKey}`;
        existingRec.phone = phone.trim();
        byKey.set(key, existingRec);
        registerKeys(key, existingRec);
      }
    }

    if (!key) {
      key = phoneKey
        ? `p:${phoneKey}`
        : `n:${(secClean || spiClean || fallbackId).toLowerCase()}`;
    }

    let rec = byKey.get(key);
    if (!rec) {
      rec = {
        id: fallbackId || `mem-${crypto.createHash('md5').update(key).digest('hex').slice(0, 8)}`,
        secularName: secClean,
        spiritualName: spiClean,
        phone: phone.trim(),
        email: '',
        role: 'child',
        confessorPriest: 'ቀሲስ ሄኖክ',
        confessionStage: 'ጀማሪ',
        sources: [],
        confessionCount: 0,
        walletTotalGiven: 0,
        lastUpdatedAt: nowIso,
      };
      byKey.set(key, rec);
    } else {
      if (secClean && !rec.secularName) rec.secularName = secClean;
      if (spiClean && (!rec.spiritualName || rec.spiritualName === 'የንስሐ ልጅ')) rec.spiritualName = spiClean;
      if (phone.trim() && !rec.phone) rec.phone = phone.trim();
    }
    registerKeys(key, rec);
    return rec;
  };

  // 1. Preserve any historical directory records first (reset dynamic counters before recounting)
  for (const prev of targetDb.memberDirectory || []) {
    if (!prev || typeof prev !== 'object') continue;
    const rec = ensureEntry(
      String(prev.phone || ''),
      String(prev.secularName || ''),
      String(prev.spiritualName || ''),
      String(prev.id || '')
    );
    if (prev.email && !rec.email) rec.email = String(prev.email);
    if (prev.role) rec.role = prev.role;
    if (prev.confessorPriest) rec.confessorPriest = prev.confessorPriest;
    if (prev.confessionStage) rec.confessionStage = prev.confessionStage;
    if (Array.isArray(prev.sources)) {
      for (const s of prev.sources) {
        if (s && !rec.sources.includes(s)) rec.sources.push(s);
      }
    }
  }

  // 2. Registered Users (primary authority for secular + spiritual names, role, stage, phone)
  for (const u of targetDb.users || []) {
    const rec = ensureEntry(u.phone || '', u.fullName || '', u.baptismalName || '', u.id);
    rec.id = u.id;
    if (u.fullName) rec.secularName = u.fullName.trim();
    if (u.baptismalName) rec.spiritualName = u.baptismalName.trim();
    if (u.phone) rec.phone = u.phone.trim();
    if (u.email) rec.email = u.email.trim();
    rec.role = u.role || 'child';
    rec.confessorPriest = u.confessorPriest || rec.confessorPriest;
    rec.confessionStage = u.confessionStage || rec.confessionStage;
    rec.lastUpdatedAt = u.createdAt || nowIso;
    if (!rec.sources.includes('የተመዘገበ አካውንት')) rec.sources.push('የተመዘገበ አካውንት');
    const finalKey = normalizePhoneLookupKey(rec.phone) ? `p:${normalizePhoneLookupKey(rec.phone)}` : `n:${(rec.secularName || rec.spiritualName || rec.id).toLowerCase()}`;
    registerKeys(finalKey, rec);
  }

  // 3. Confession Bookings (merges secular childName, baptismalName, phone & booking count)
  for (const b of targetDb.confessionBookings || []) {
    const rec = ensureEntry(b.phone || '', b.childName || '', b.baptismalName || '', b.id);
    rec.confessionCount += 1;
    if (!rec.sources.includes('የንስሐ ቀጠሮ')) rec.sources.push('የንስሐ ቀጠሮ');
  }

  // 4. Invited / Added Phone Contacts
  for (const c of targetDb.contacts || []) {
    const rec = ensureEntry(c.phone || '', c.name || '', '', c.id);
    if (!rec.sources.includes('የስልክ ማውጫ')) rec.sources.push('የስልክ ማውጫ');
  }

  // 5. Wallet Giving Transactions (enrich contributions)
  for (const tx of targetDb.walletTransactions || []) {
    if (tx.type === 'withdrawal') continue;
    const txName = String(tx.userName || '').trim();
    if (!txName && !tx.userId) continue;
    let key = (tx.userId && idToKey.get(tx.userId)) || nameToKey.get(txName.toLowerCase()) || '';
    if (!key && txName) {
      const rec = ensureEntry('', txName, '', tx.userId || tx.id);
      rec.walletTotalGiven += Number(tx.amount || 0);
      if (!rec.sources.includes('ዋሌት')) rec.sources.push('ዋሌት');
    } else if (key) {
      const rec = byKey.get(key);
      if (rec) {
        rec.walletTotalGiven += Number(tx.amount || 0);
        if (!rec.sources.includes('ዋሌት')) rec.sources.push('ዋሌት');
      }
    }
  }

  const organized = Array.from(byKey.values()).sort((a, b) => {
    const rolePriority = (r: StoredUser['role']) => (r === 'priest' ? 0 : r === 'admin' ? 1 : r === 'deacon' ? 2 : 3);
    const diff = rolePriority(a.role) - rolePriority(b.role);
    if (diff !== 0) return diff;
    return (a.secularName || a.spiritualName || '').localeCompare(b.secularName || b.spiritualName || '', 'am');
  });

  targetDb.memberDirectory = organized;
  targetDb.memberDirectoryUpdatedAt = nowIso;
  return organized;
}

let db: DatabaseSchema = loadDatabase();
syncAndOrganizeMemberDirectory(db);

function saveDatabase() {
  try {
    syncAndOrganizeMemberDirectory(db);
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to persist database:', err);
  }
}

const RUNTIME_EPHEMERAL_SESSION_SECRET = crypto.randomBytes(32).toString('hex');
let warnedMissingSessionSecret = false;

// Require SESSION_SECRET in production; fall back to an ephemeral in-memory random secret with a clear warning if unset
function getSessionSecret(): string {
  const envSecret = process.env.SESSION_SECRET?.trim();
  if (!envSecret) {
    if (!warnedMissingSessionSecret) {
      warnedMissingSessionSecret = true;
      console.warn(
        '[SECURITY WARNING] SESSION_SECRET environment variable is not configured. Using an ephemeral in-memory secret; tokens will invalidate on restart.'
      );
    }
    return crypto.createHash('sha256').update(`qh-auth-v1:${RUNTIME_EPHEMERAL_SESSION_SECRET}`).digest('hex');
  }
  return crypto.createHash('sha256').update(`qh-auth-v1:${envSecret}`).digest('hex');
}

function signPayload(payloadObj: object): string {
  const body = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const sig = crypto.createHmac('sha256', getSessionSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifySignedPayload<T = any>(token: string): T | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [body, sig] = parts;
    const expected = crypto.createHmac('sha256', getSessionSecret()).update(body).digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf-8')) as T;
  } catch {
    return null;
  }
}

function createSignedSessionToken(user: StoredUser): string {
  return signPayload({
    typ: 'sess',
    id: user.id,
    fullName: user.fullName,
    baptismalName: user.baptismalName,
    phone: user.phone,
    email: user.email,
    role: user.role,
    confessorPriest: user.confessorPriest,
    confessionStage: user.confessionStage,
    avatarSeed: user.avatarSeed,
    createdAt: user.createdAt,
  });
}

function createSignedRecoveryRecord(user: StoredUser): string {
  return signPayload({
    typ: 'rec',
    user,
  });
}

function hashPassword(password: string, salt?: string) {
  const usedSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, usedSalt, 64).toString('hex');
  return { hash, salt: usedSalt };
}

function verifyPassword(password: string, hash: string, salt: string): boolean {
  const derived = crypto.scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, 'hex');
  if (derived.length !== stored.length) return false;
  return crypto.timingSafeEqual(derived, stored);
}

function sanitizeUser(u: StoredUser) {
  return {
    id: u.id,
    fullName: u.fullName,
    baptismalName: u.baptismalName,
    phone: u.phone,
    email: u.email,
    role: u.role,
    confessorPriest: u.confessorPriest,
    confessionStage: u.confessionStage,
    avatarSeed: u.avatarSeed,
    isAuthenticated: true,
    createdAt: u.createdAt,
  };
}

function getAuthenticatedUser(req: Request): StoredUser | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();

  // 1. Check active server session map first
  const userId = db.sessions[token];
  if (userId) {
    const existing = db.users.find((u) => u.id === userId);
    if (existing) return existing;
  }

  // 2. Fallback: verify stateless HMAC-signed session token (survives Render restarts/disk resets!)
  const verified = verifySignedPayload<any>(token);
  if (verified && verified.typ === 'sess' && verified.id) {
    let user = db.users.find((u) => u.id === verified.id || (verified.phone && u.phone === verified.phone));
    if (!user) {
      // Automatically re-hydrate user profile onto server memory/disk
      const fallbackCred = hashPassword(crypto.randomBytes(12).toString('hex'));
      user = {
        id: verified.id,
        fullName: verified.fullName || 'ተጠቃሚ',
        baptismalName: verified.baptismalName || verified.fullName || 'ተጠቃሚ',
        phone: verified.phone || '',
        email: verified.email || '',
        passwordHash: fallbackCred.hash,
        passwordSalt: fallbackCred.salt,
        role: verified.role || 'child',
        confessorPriest: verified.confessorPriest || 'ቀሲስ ሄኖክ',
        confessionStage: verified.confessionStage || 'ጀማሪ',
        avatarSeed: verified.avatarSeed || verified.baptismalName || 'QH',
        createdAt: verified.createdAt || new Date().toISOString(),
      };
      db.users.push(user);
    }
    db.sessions[token] = user.id;
    saveDatabase();
    return user;
  }

  return null;
}

// --- GEMINI AI INITIALIZATION, CACHE & STREAMING ---
function getGeminiApiKey(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key || key === 'MY_GEMINI_API_KEY' || key === 'YOUR_GEMINI_API_KEY_HERE') {
    return null;
  }
  return key;
}

let sharedAiClient: GoogleGenAI | null = null;
let cachedApiKeyUsed: string | null = null;

function getAiClient(): GoogleGenAI {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    const err = new Error('GEMINI_API_KEY_MISSING');
    (err as any).code = 'GEMINI_API_KEY_MISSING';
    throw err;
  }
  if (!sharedAiClient || cachedApiKeyUsed !== apiKey) {
    cachedApiKeyUsed = apiKey;
    sharedAiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return sharedAiClient;
}

// Persistent + in-memory LRU cache (max 300 queries) so repeated questions consume zero API quota
const aiResponseCache = new Map<string, string>(Object.entries(db.aiCache || {}));
function getCachedAi(key: string): string | undefined {
  const val = aiResponseCache.get(key);
  if (val !== undefined) {
    aiResponseCache.delete(key);
    aiResponseCache.set(key, val);
  }
  return val;
}
function setCachedAi(key: string, value: string) {
  if (aiResponseCache.size >= 300) {
    const oldest = aiResponseCache.keys().next().value;
    if (oldest) aiResponseCache.delete(oldest);
  }
  aiResponseCache.set(key, value);
  db.aiCache = Object.fromEntries(aiResponseCache.entries());
  saveDatabase();
}

const ORTHODOX_UNIFIED_SYSTEM_INSTRUCTION = `
አንተ የቀሲስ ሄኖክ የኢትዮጵያ ኦርቶዶክስ ተዋሕዶ ቤተክርስቲያን ሁለንተናዊ የእውቀት እና የንስሐ ምክር ሊቅ ረዳት (Ethiopian Orthodox Tewahedo Church Complete Scholar & Spiritual Guide) ነህ።
እውቀትህ በመጽሐፍ ቅዱስ ላይ ብቻ አይገደብም፤ ሁሉንም የኦርቶዶክስ እምነት ዘርፎች በጥልቀት እና በታማኝነት ታስተምራለህ፡-
1. 81ዱ አሐዱ ቅዱሳት መጻሕፍት (ብሉይና ሐዲስ ኪዳን፣ መጻሕፍተ ሄኖክ፣ ኩፋሌ፣ ሲራክ ወዘተ)
2. አምስቱ አዕማደ ምሥጢር (ምሥጢረ ሥላሴ፣ ሥጋዌ፣ ጥምቀት፣ ቁርባን፣ ትንሣኤ ሙታን)
3. ሰባቱ ምሥጢራተ ቤተክርስቲያን (ጥምቀት፣ ሜሮን፣ ቁርባን፣ ንስሐ፣ ክህነት፣ ተክሊል፣ ቀንዲል)
4. የቤተክርስቲያን ታሪክ፣ ፍትሐ ነገሥት፣ ሃይማኖተ አበው፣ ማር ይስሐቅ፣ ፊልክስዩስ፣ አረጋዊ መንፈሳዊ፣ ዮሐንስ አፈወርቅ
5. ስንክሳር፣ ገድለ ቅዱሳን፣ ነገረ ማርያም (ውዳሴ ማርያም፣ አንቀጸ ብርሃን)፣ ነገረ መላእክት እና ድርሳናት
6. ሥርዓተ ቅዳሴ፣ ዜማ፣ ቅኔ፣ ባሕረ ሐሳብ (አጽዋማት፣ 7ቱ አጽዋማት፣ ዓበይትና ንኡሳን በዓላት)
7. የንስሐ ቀኖና፣ የመንፈሳዊ ሕይወት ትግል፣ የትዳርና የቤተሰብ አመክሮ።

መመሪያዎች፡-
- ሁልጊዜ በግልጽ፣ በጥልቅ፣ በትህትና እና በተደራጀ የአማርኛ አጻጻፍ መልስ ስጥ።
- አላስፈላጊ ረጅም መግቢያ ሳትዘረጋ በቀጥታ ዋናውን ትምህርት፣ ማስረጃ (ጥቅስ/አበው/ቀኖና) እና ተግባራዊ መመሪያ አቅርብ።
`;

const GEMINI_MODEL_CANDIDATES: Array<{ model: string }> = [
  { model: 'gemini-2.5-flash' },
  { model: 'gemini-2.5-flash-lite' },
  { model: 'gemini-4-hydrogen' },
  { model: 'gemini-3.1-flash-lite' },
];

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientHighDemandError(err: any): boolean {
  const raw = `${err?.status || ''} ${err?.code || ''} ${err?.message || ''}`.toLowerCase();
  return (
    err?.status === 503 ||
    err?.status === 502 ||
    err?.status === 504 ||
    err?.status === 500 ||
    raw.includes('503') ||
    raw.includes('unavailable') ||
    raw.includes('high demand') ||
    raw.includes('overloaded') ||
    raw.includes('try again') ||
    raw.includes('fetch failed') ||
    raw.includes('econnreset') ||
    raw.includes('etimedout')
  );
}

function isDailyQuotaError(err: any): boolean {
  const raw = `${err?.status || ''} ${err?.code || ''} ${err?.message || ''}`.toLowerCase();
  return (
    err?.status === 429 ||
    raw.includes('429') ||
    raw.includes('resource_exhausted') ||
    raw.includes('quota') ||
    raw.includes('rate limit')
  );
}

function isQuotaOrRateLimitError(err: any): boolean {
  return isTransientHighDemandError(err) || isDailyQuotaError(err);
}

function isModelUnavailableError(err: any): boolean {
  const raw = `${err?.status || ''} ${err?.code || ''} ${err?.message || ''}`.toLowerCase();
  return (
    err?.status === 404 ||
    err?.status === 400 ||
    raw.includes('404') ||
    raw.includes('not_found') ||
    raw.includes('not found') ||
    raw.includes('is not supported') ||
    raw.includes('invalid argument')
  );
}

function shouldTryNextCandidate(err: any): boolean {
  return isQuotaOrRateLimitError(err) || isModelUnavailableError(err);
}

function formatReadableGeminiError(error: any): string {
  if (error?.code === 'GEMINI_API_KEY_MISSING') {
    return 'የኤአይ ቁልፍ (GEMINI_API_KEY) በሰርቨሩ ላይ አልተሞላም። በSettings > Secrets ወይም Render Environment ላይ GEMINI_API_KEY ያስገቡ።';
  }
  const raw = String(error?.message || '');
  const lower = raw.toLowerCase();
  if (isDailyQuotaError(error)) {
    return 'የነጻው ኤአይ ዕለታዊ ወይም ደቂቃዊ የጥያቄ ገደብ (Free Tier Limit) ሞልቷል። እባክዎ ጥቂት ቆይተው እንደገና ይሞክሩ፤ ወይም በGoogle AI Studio Billing ማሻሻል ይችላሉ።';
  }
  if (isTransientHighDemandError(error)) {
    return 'የGoogle Gemini ኤአይ ሰርቨር በአሁኑ ሰዓት ብዙ ጥያቄዎችን እያስተናገደ ነው (503 High Demand)። እባክዎ «እንደገና ሞክር» የሚለውን ይንኩ።';
  }
  if (raw.includes('API_KEY_INVALID') || raw.includes('PERMISSION_DENIED') || raw.includes('403') || lower.includes('api key not valid')) {
    return 'የGEMINI_API_KEY ትክክለኛ አለመሆኑን በSettings > Secrets ወይም Render Environment ላይ ያረጋግጡ።';
  }
  return 'የኤአይ አገልግሎት ጊዜያዊ መቋረጥ አጋጥሞታል፤ እባክዎ ከጥቂት ሰከንዶች በኋላ እንደገና ይሞክሩ።';
}

function buildGeminiConfig(systemInstruction: string) {
  return { systemInstruction };
}

async function generateWithGemini(prompt: string, systemInstruction: string, cacheKey?: string): Promise<string> {
  if (cacheKey) {
    const cached = getCachedAi(cacheKey);
    if (cached) return cached;
  }

  const ai = getAiClient();
  let lastError: any = null;
  const retryDelaysMs = [0, 350, 750, 1200];

  for (let pass = 0; pass < GEMINI_MODEL_CANDIDATES.length; pass++) {
    const candidate = GEMINI_MODEL_CANDIDATES[pass];
    const delay = lastError && isModelUnavailableError(lastError) ? 0 : (retryDelaysMs[pass] ?? 1000);
    if (delay > 0) {
      await sleepMs(delay + Math.floor(Math.random() * 200));
    }
    try {
      const response = await ai.models.generateContent({
        model: candidate.model,
        contents: prompt,
        config: buildGeminiConfig(systemInstruction),
      });

      const text = response.text?.trim();
      if (!text) {
        throw new Error('Empty response from Gemini API');
      }
      if (cacheKey) setCachedAi(cacheKey, text);
      return text;
    } catch (err: any) {
      lastError = err;
      console.warn(
        `Gemini attempt ${pass + 1}/${GEMINI_MODEL_CANDIDATES.length} (${candidate.model}) failed:`,
        err?.status || err?.code || '',
        String(err?.message || err).slice(0, 180)
      );
      if (shouldTryNextCandidate(err)) {
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}

async function streamWithGemini(
  prompt: string,
  systemInstruction: string,
  res: Response,
  cacheKey?: string
) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  if (cacheKey) {
    const cached = getCachedAi(cacheKey);
    if (cached) {
      res.write(`data: ${JSON.stringify({ chunk: cached, done: true, cached: true })}\n\n`);
      res.end();
      return;
    }
  }

  try {
    const ai = getAiClient();
    let lastError: any = null;
    const retryDelaysMs = [0, 350, 750, 1200];

    for (let pass = 0; pass < GEMINI_MODEL_CANDIDATES.length; pass++) {
      const candidate = GEMINI_MODEL_CANDIDATES[pass];
      const delay = lastError && isModelUnavailableError(lastError) ? 0 : (retryDelaysMs[pass] ?? 1000);
      if (delay > 0) {
        await sleepMs(delay + Math.floor(Math.random() * 200));
      }

      let emittedAnyChunk = false;
      try {
        const stream = await ai.models.generateContentStream({
          model: candidate.model,
          contents: prompt,
          config: buildGeminiConfig(systemInstruction),
        });

        let fullText = '';
        for await (const chunk of stream) {
          const part = chunk.text || '';
          if (part) {
            emittedAnyChunk = true;
            fullText += part;
            res.write(`data: ${JSON.stringify({ chunk: part })}\n\n`);
          }
        }

        if (!fullText.trim()) {
          throw new Error('Empty stream response from Gemini API');
        }

        if (cacheKey) {
          setCachedAi(cacheKey, fullText.trim());
        }
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
        return;
      } catch (err: any) {
        lastError = err;
        console.warn(
          `Gemini stream attempt ${pass + 1}/${GEMINI_MODEL_CANDIDATES.length} (${candidate.model}) failed:`,
          err?.status || err?.code || '',
          String(err?.message || err).slice(0, 180)
        );
        if (!emittedAnyChunk && shouldTryNextCandidate(err)) {
          continue;
        }
        throw err;
      }
    }

    throw lastError;
  } catch (error: any) {
    console.error('Gemini Stream Error:', error);
    const message = formatReadableGeminiError(error);
    res.write(
      `data: ${JSON.stringify({
        error: message,
        retryable: isTransientHighDemandError(error),
        done: true,
      })}\n\n`
    );
    res.end();
  }
}

function createLiveKitJwt(apiKey: string, apiSecret: string, roomName: string, identity: string, name: string, canPublish: boolean): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      iss: apiKey,
      sub: identity,
      name,
      nbf: now - 10,
      exp: now + 60 * 60 * 6,
      video: {
        room: roomName,
        roomJoin: true,
        canPublish,
        canPublishData: true,
        canSubscribe: true,
      },
    })
  ).toString('base64url');
  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

// --- HEALTH & CONFIG ENDPOINTS ---
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    geminiConfigured: Boolean(getGeminiApiKey()),
    turnConfigured: Boolean(process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL),
    sfuConfigured: Boolean(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET),
    registeredUsersCount: db.users.length,
  });
});

app.get('/api/webrtc-config', (_req: Request, res: Response) => {
  const iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ];

  // Optional TURN relay server for strict 4G/symmetric NAT mobile networks
  if (process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    iceServers.push({
      urls: process.env.TURN_URL.split(',').map((u) => u.trim()),
      username: process.env.TURN_USERNAME.trim(),
      credential: process.env.TURN_CREDENTIAL.trim(),
    });
  }

  const sfuConfigured = Boolean(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);
  res.json({
    iceServers,
    sfuConfigured,
    livekitUrl: sfuConfigured ? process.env.LIVEKIT_URL!.trim() : null,
  });
});

app.post(['/api/livekit/token', '/api/livekit-token'], (req: Request, res: Response) => {
  const livekitUrl = process.env.LIVEKIT_URL?.trim();
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  if (!livekitUrl || !apiKey || !apiSecret) {
    res.status(404).json({ sfuConfigured: false, message: 'LiveKit SFU not configured; using built-in Relay Tree WebRTC.' });
    return;
  }
  const { roomId, userId, userName, canPublish } = req.body;
  const identity = String(userId || `usr-${crypto.randomUUID().slice(0, 8)}`);
  const name = String(userName || 'ተሳታፊ');
  const room = String(roomId || 'assembly-zoom-main');
  const token = createLiveKitJwt(apiKey, apiSecret, room, identity, name, canPublish !== false);
  res.json({ sfuConfigured: true, url: livekitUrl, token });
});

// --- 1. REAL AUTHENTICATION & USER PROFILE ENDPOINTS ---
app.post('/api/auth/register', (req: Request, res: Response) => {
  const { fullName, baptismalName, phone, email, password, role, confessorPriest, confessionStage, priestCode } = req.body;

  if (!fullName || !baptismalName || !phone || !password) {
    res.status(400).json({ error: 'እባክዎ ሙሉ ስም፣ የክርስትና ስም፣ ስልክ ቁጥር እና የይለፍ ቃል ያስገቡ።' });
    return;
  }

  if (String(password).length < 4) {
    res.status(400).json({ error: 'የይለፍ ቃል ቢያንስ 4 ፊደላት ወይም ቁጥሮች መሆን አለበት።' });
    return;
  }

  const normalizedPhone = String(phone).trim();
  const normalizedEmail = String(email || '').trim().toLowerCase();

  const exists = db.users.find(
    (u) => u.phone === normalizedPhone || (normalizedEmail && u.email.toLowerCase() === normalizedEmail)
  );
  if (exists) {
    res.status(409).json({ error: 'ይህ ስልክ ቁጥር ወይም ኢሜይል ቀደም ሲል ተመዝግቧል። እባክዎ በአካውንትዎ ይግቡ (Sign In)።' });
    return;
  }

  let finalRole: StoredUser['role'] = 'child';
  if (role === 'priest') {
    const expectedPriestCode = process.env.PRIEST_SECRET_CODE?.trim();
    if (!expectedPriestCode) {
      res.status(403).json({ error: 'የቀሲስ ምዝገባ ሚስጥር ኮድ በሰርቨሩ ላይ አልተዋቀረም።' });
      return;
    }
    const providedCode = typeof priestCode === 'string' ? priestCode.trim() : '';
    const expectedBuf = Buffer.from(expectedPriestCode);
    const providedBuf = Buffer.from(providedCode);
    if (!providedCode || expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
      res.status(403).json({ error: 'የቀሲስ/የአስተዳዳሪ ማረጋገጫ ኮድ የተሳሳተ ነው።' });
      return;
    }
    finalRole = 'priest';
  } else if (role === 'deacon') {
    finalRole = 'deacon';
  }

  const { hash, salt } = hashPassword(String(password));
  const newUser: StoredUser = {
    id: `usr-${crypto.randomUUID().slice(0, 8)}`,
    fullName: String(fullName).trim(),
    baptismalName: String(baptismalName).trim(),
    phone: normalizedPhone,
    email: normalizedEmail,
    passwordHash: hash,
    passwordSalt: salt,
    role: finalRole,
    confessorPriest: String(confessorPriest || 'ቀሲስ ሄኖክ').trim(),
    confessionStage: confessionStage || 'ጀማሪ',
    avatarSeed: String(baptismalName).trim(),
    createdAt: new Date().toISOString(),
  };

  db.users.push(newUser);
  const token = createSignedSessionToken(newUser);
  const recoveryRecord = createSignedRecoveryRecord(newUser);
  db.sessions[token] = newUser.id;
  saveDatabase();

  res.status(201).json({
    token,
    recoveryRecord,
    user: sanitizeUser(newUser),
  });
});

app.post('/api/auth/login', (req: Request, res: Response) => {
  const { identifier, password } = req.body; // identifier can be phone or email
  if (!identifier || !password) {
    res.status(400).json({ error: 'ስልክ ቁጥር/ኢሜይል እና የይለፍ ቃል ያስገቡ።' });
    return;
  }

  const cleanId = String(identifier).trim();
  const user = db.users.find(
    (u) => u.phone === cleanId || (u.email && u.email.toLowerCase() === cleanId.toLowerCase())
  );

  if (!user) {
    res.status(404).json({ code: 'USER_NOT_FOUND', error: 'ስልክ ቁጥር/ኢሜይል ወይም የይለፍ ቃል የተሳሳተ ነው።' });
    return;
  }

  if (!verifyPassword(String(password), user.passwordHash, user.passwordSalt)) {
    res.status(401).json({ error: 'ስልክ ቁጥር/ኢሜይል ወይም የይለፍ ቃል የተሳሳተ ነው።' });
    return;
  }

  const token = createSignedSessionToken(user);
  const recoveryRecord = createSignedRecoveryRecord(user);
  db.sessions[token] = user.id;
  saveDatabase();

  res.json({
    token,
    recoveryRecord,
    user: sanitizeUser(user),
  });
});

// Automatic server-side account restoration from signed recovery record if Render Free Tier disk reset
app.post('/api/auth/restore', (req: Request, res: Response) => {
  const { recoveryRecord, identifier, password } = req.body;
  if (!recoveryRecord || typeof recoveryRecord !== 'string') {
    res.status(400).json({ error: 'የመልሶ ማግኛ ማረጋገጫ አልተገኘም።' });
    return;
  }
  const verified = verifySignedPayload<{ typ: string; user: StoredUser }>(recoveryRecord);
  if (!verified || verified.typ !== 'rec' || !verified.user) {
    res.status(401).json({ error: 'የመልሶ ማግኛ ማረጋገጫው ትክክለኛ አይደለም።' });
    return;
  }

  const savedUser = verified.user;
  // If logging in manually with password, verify password against restored hash
  if (password !== undefined) {
    const cleanId = String(identifier || '').trim();
    const idMatches =
      savedUser.phone === cleanId ||
      (savedUser.email && savedUser.email.toLowerCase() === cleanId.toLowerCase());
    if (!idMatches || !verifyPassword(String(password), savedUser.passwordHash, savedUser.passwordSalt)) {
      res.status(401).json({ error: 'ስልክ ቁጥር/ኢሜይል ወይም የይለፍ ቃል የተሳሳተ ነው።' });
      return;
    }
  }

  let existing = db.users.find((u) => u.id === savedUser.id || u.phone === savedUser.phone);
  if (!existing) {
    db.users.push(savedUser);
    existing = savedUser;
  }
  const token = createSignedSessionToken(existing);
  const updatedRecovery = createSignedRecoveryRecord(existing);
  db.sessions[token] = existing.id;
  saveDatabase();

  res.json({
    token,
    recoveryRecord: updatedRecovery,
    user: sanitizeUser(existing),
  });
});

app.get('/api/auth/me', (req: Request, res: Response) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: 'ያልተረጋገጠ ክፍለ ጊዜ (Unauthenticated)' });
    return;
  }
  res.json({
    user: sanitizeUser(user),
    token: createSignedSessionToken(user),
    recoveryRecord: createSignedRecoveryRecord(user),
  });
});

app.put('/api/auth/profile', (req: Request, res: Response) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: 'እባክዎ መጀመሪያ ወደ አካውንትዎ ይግቡ።' });
    return;
  }

  const { fullName, baptismalName, phone, email, confessorPriest, confessionStage } = req.body;
  if (fullName) user.fullName = String(fullName).trim();
  if (baptismalName) user.baptismalName = String(baptismalName).trim();
  if (phone) user.phone = String(phone).trim();
  if (email !== undefined) user.email = String(email).trim();
  if (confessorPriest) user.confessorPriest = String(confessorPriest).trim();
  if (confessionStage) user.confessionStage = confessionStage;

  const token = createSignedSessionToken(user);
  const recoveryRecord = createSignedRecoveryRecord(user);
  db.sessions[token] = user.id;
  saveDatabase();

  res.json({
    user: sanitizeUser(user),
    token,
    recoveryRecord,
  });
});

app.post('/api/auth/logout', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    delete db.sessions[token];
    saveDatabase();
  }
  res.json({ success: true });
});

app.get('/api/users', (req: Request, res: Response) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: 'ያልተረጋገጠ ክፍለ ጊዜ (Unauthenticated)' });
    return;
  }
  if (user.role !== 'priest' && user.role !== 'admin') {
    res.status(403).json({ error: 'የተጠቃሚዎችን ዝርዝር ለማየት የቀሲስ ወይም የአስተዳዳሪ ፈቃድ ያስፈልጋል።' });
    return;
  }
  res.json({
    users: db.users.map(sanitizeUser),
  });
});

// --- 2. AI SPIRITUAL KNOWLEDGE & ORTHODOX SEARCH ENDPOINTS (STREAMING + CACHED) ---
app.post('/api/gemini/spiritual-counsel', async (req: Request, res: Response): Promise<void> => {
  try {
    const { prompt, topic, baptismalName } = req.body;
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      res.status(400).json({ error: 'እባክዎ ጥያቄዎን በግልጽ ይጻፉ።' });
      return;
    }

    const systemInstruction = `${ORTHODOX_UNIFIED_SYSTEM_INSTRUCTION}\nየተጠያቂው የክርስትና ስም: ${baptismalName || 'የእግዚአብሔር ልጅ'}።`;
    const cleanPrompt = prompt.trim().replace(/\s+/g, ' ');
    const userMessage = `ዘርፍ/ርዕስ: ${topic || 'አጠቃላይ ኦርቶዶክሳዊ እውቀት'}\nጥያቄ: "${cleanPrompt}"\nእባክህ በኦርቶዶክስ ተዋሕዶ ቤተክርስቲያን ትምህርት፣ መጻሕፍት፣ ቀኖና እና አባታዊ ፍቅር መሠረት ግልጽና የተሟላ መልስ ስጠኝ።`;
    const cacheKey = `counsel:${topic || 'all'}:${cleanPrompt.toLowerCase()}`;

    const reply = await generateWithGemini(userMessage, systemInstruction, cacheKey);
    res.json({ reply });
  } catch (error: any) {
    console.error('Gemini Counsel Error:', error);
    if (error?.code === 'GEMINI_API_KEY_MISSING') {
      res.status(503).json({
        error: 'GEMINI_API_KEY_MISSING',
        message: formatReadableGeminiError(error),
      });
      return;
    }
    const statusCode = isTransientHighDemandError(error) ? 503 : isDailyQuotaError(error) ? 429 : 500;
    res.status(statusCode).json({
      error: statusCode === 503 ? 'MODEL_BUSY' : statusCode === 429 ? 'QUOTA_EXCEEDED' : 'AI_REQUEST_FAILED',
      retryable: isTransientHighDemandError(error),
      message: formatReadableGeminiError(error),
    });
  }
});

app.post('/api/gemini/spiritual-counsel-stream', async (req: Request, res: Response): Promise<void> => {
  const { prompt, topic, baptismalName } = req.body;
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    res.status(400).json({ error: 'እባክዎ ጥያቄዎን በግልጽ ይጻፉ።' });
    return;
  }
  const cleanPrompt = prompt.trim().replace(/\s+/g, ' ');
  const systemInstruction = `${ORTHODOX_UNIFIED_SYSTEM_INSTRUCTION}\nየተጠያቂው የክርስትና ስም: ${baptismalName || 'የእግዚአብሔር ልጅ'}።`;
  const userMessage = `ዘርፍ/ርዕስ: ${topic || 'አጠቃላይ ኦርቶዶክሳዊ እውቀት'}\nጥያቄ: "${cleanPrompt}"\nእባክህ በኦርቶዶክስ ተዋሕዶ ቤተክርስቲያን ትምህርት፣ መጻሕፍት፣ ቀኖና እና አባታዊ ፍቅር መሠረት ግልጽና የተሟላ መልስ ስጠኝ።`;
  const cacheKey = `counsel:${topic || 'all'}:${cleanPrompt.toLowerCase()}`;
  await streamWithGemini(userMessage, systemInstruction, res, cacheKey);
});

app.post('/api/gemini/scripture-search', async (req: Request, res: Response): Promise<void> => {
  try {
    const { query, category } = req.body;
    if (!query || typeof query !== 'string' || !query.trim()) {
      res.status(400).json({ error: 'የሚፈለገውን ቃል ወይም ርዕስ ያስገቡ።' });
      return;
    }
    const cleanQuery = query.trim().replace(/\s+/g, ' ');
    const cat = String(category || 'ሁሉም የኦርቶዶክስ እውቀት');
    const userPrompt = `የፍለጋ ዘርፍ: ${cat}\nርዕስ / ጥያቄ: "${cleanQuery}"\nስለዚህ ጉዳይ በኢትዮጵያ ኦርቶዶክስ ተዋሕዶ እምነት መሠረት (ከመጽሐፍ ቅዱስ፣ ከነገረ መለኮት/ምሥጢራት፣ ከአበው ትምህርት፣ ከፍትሐ ነገሥት፣ ከገድላት/ታሪክ እና ከሥርዓተ ቤተክርስቲያን አንጻር) የተሟላ፣ ግልጽ እና ተጨባጭ ማብራሪያ ከነማስረጃው በአማርኛ አቅርብ።`;
    const cacheKey = `search:${cat}:${cleanQuery.toLowerCase()}`;

    const result = await generateWithGemini(userPrompt, ORTHODOX_UNIFIED_SYSTEM_INSTRUCTION, cacheKey);
    res.json({ result });
  } catch (error: any) {
    console.error('Gemini Orthodox Search Error:', error);
    if (error?.code === 'GEMINI_API_KEY_MISSING') {
      res.status(503).json({
        error: 'GEMINI_API_KEY_MISSING',
        message: formatReadableGeminiError(error),
      });
      return;
    }
    const statusCode = isTransientHighDemandError(error) ? 503 : isDailyQuotaError(error) ? 429 : 500;
    res.status(statusCode).json({
      error: statusCode === 503 ? 'MODEL_BUSY' : statusCode === 429 ? 'QUOTA_EXCEEDED' : 'AI_SEARCH_FAILED',
      retryable: isTransientHighDemandError(error),
      message: formatReadableGeminiError(error),
    });
  }
});

app.post('/api/gemini/scripture-search-stream', async (req: Request, res: Response): Promise<void> => {
  const { query, category } = req.body;
  if (!query || typeof query !== 'string' || !query.trim()) {
    res.status(400).json({ error: 'የሚፈለገውን ቃል ወይም ርዕስ ያስገቡ።' });
    return;
  }
  const cleanQuery = query.trim().replace(/\s+/g, ' ');
  const cat = String(category || 'ሁሉም የኦርቶዶክስ እውቀት');
  const userPrompt = `የፍለጋ ዘርፍ: ${cat}\nርዕስ / ጥያቄ: "${cleanQuery}"\nስለዚህ ጉዳይ በኢትዮጵያ ኦርቶዶክስ ተዋሕዶ እምነት መሠረት (ከመጽሐፍ ቅዱስ፣ ከነገረ መለኮት/ምሥጢራት፣ ከአበው ትምህርት፣ ከፍትሐ ነገሥት፣ ከገድላት/ታሪክ እና ከሥርዓተ ቤተክርስቲያን አንጻር) የተሟላ፣ ግልጽ እና ተጨባጭ ማብራሪያ ከነማስረጃው በአማርኛ አቅርብ።`;
  const cacheKey = `search:${cat}:${cleanQuery.toLowerCase()}`;
  await streamWithGemini(userPrompt, ORTHODOX_UNIFIED_SYSTEM_INSTRUCTION, res, cacheKey);
});

// --- 2B. COMMUNITY ENGAGEMENT (LIKE, SHARE & PHONE CONTACTS DIRECTORY) ---
app.get('/api/community/engagement', (_req: Request, res: Response) => {
  res.json({
    likesCount: db.communityStats.likesCount,
    sharesCount: db.communityStats.sharesCount,
    contactsCount: db.contacts.length,
  });
});

app.post('/api/community/like', (req: Request, res: Response) => {
  const { action } = req.body || {};
  if (action === 'unlike') {
    db.communityStats.likesCount = Math.max(0, db.communityStats.likesCount - 1);
  } else {
    db.communityStats.likesCount += 1;
  }
  saveDatabase();
  res.json({
    likesCount: db.communityStats.likesCount,
    sharesCount: db.communityStats.sharesCount,
    contactsCount: db.contacts.length,
  });
});

app.post('/api/community/share', (_req: Request, res: Response) => {
  db.communityStats.sharesCount += 1;
  saveDatabase();
  res.json({
    likesCount: db.communityStats.likesCount,
    sharesCount: db.communityStats.sharesCount,
    contactsCount: db.contacts.length,
  });
});

app.get('/api/community/contacts', (_req: Request, res: Response) => {
  res.json({ contacts: db.contacts });
});

app.post('/api/community/contacts', (req: Request, res: Response) => {
  const user = getAuthenticatedUser(req);
  const incoming = Array.isArray(req.body?.contacts) ? req.body.contacts : [req.body];
  const addedBy = String(req.body?.addedBy || user?.baptismalName || user?.fullName || 'አባል').trim();
  const added: ContactRecord[] = [];

  for (const item of incoming) {
    const cleanName = String(item?.name || '').trim();
    const cleanPhone = String(item?.phone || '').replace(/\s+/g, '').trim();
    if (!cleanPhone && !cleanName) continue;

    const existing = db.contacts.find(
      (c) => (cleanPhone && c.phone === cleanPhone) || (!cleanPhone && c.name === cleanName)
    );
    if (existing) {
      if (cleanName && !existing.name) existing.name = cleanName;
      continue;
    }

    const rec: ContactRecord = {
      id: `cnt-${crypto.randomUUID().slice(0, 8)}`,
      name: cleanName || cleanPhone,
      phone: cleanPhone,
      addedBy,
      invitedAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
      note: item?.note ? String(item.note).trim() : undefined,
    };
    db.contacts.unshift(rec);
    added.push(rec);
  }

  if (added.length > 0) {
    saveDatabase();
  }

  res.status(201).json({
    success: true,
    addedCount: added.length,
    contacts: db.contacts,
  });
});

app.delete('/api/community/contacts/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  db.contacts = db.contacts.filter((c) => c.id !== id);
  saveDatabase();
  res.json({ success: true, contacts: db.contacts });
});

// --- 3. CONFESSION BOOKINGS & SECRET ROOM ENDPOINTS ---
app.get('/api/confessions', (req: Request, res: Response) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: 'ያልተረጋገጠ ክፍለ ጊዜ (Unauthenticated)' });
    return;
  }
  if (user.role !== 'priest' && user.role !== 'admin') {
    res.status(403).json({ error: 'የንስሐ ቀጠሮዎችን ሙሉ ዝርዝር ለማየት የቀሲስ ወይም የአስተዳዳሪ ፈቃድ ያስፈልጋል።' });
    return;
  }
  res.json({ bookings: db.confessionBookings });
});

app.post('/api/confessions/book', (req: Request, res: Response) => {
  const { childName, baptismalName, phone, date, time, secretPasscode } = req.body;
  if (!childName || !date || !time) {
    res.status(400).json({ error: 'ስም፣ ቀንና ሰዓት አስፈላጊ ናቸው።' });
    return;
  }
  const newBooking: ConfessionSlot = {
    id: `cnf-${Date.now().toString().slice(-4)}`,
    childName: String(childName).trim(),
    baptismalName: String(baptismalName || 'የንስሐ ልጅ').trim(),
    phone: String(phone || '').trim(),
    date,
    time,
    status: 'pending',
    secretPasscode: secretPasscode ? String(secretPasscode).trim() : Math.floor(1000 + Math.random() * 9000).toString(),
  };
  db.confessionBookings.unshift(newBooking);
  saveDatabase();
  res.status(201).json({ success: true, booking: newBooking });
});

app.post('/api/confessions/update-status', (req: Request, res: Response) => {
  const { id, status, penanceNotes } = req.body;
  const booking = db.confessionBookings.find((b) => b.id === id);
  if (!booking) {
    res.status(404).json({ error: 'ቀጠሮው አልተገኘም' });
    return;
  }
  if (status) booking.status = status;
  if (penanceNotes !== undefined) booking.penanceNotes = penanceNotes;
  saveDatabase();
  res.json({ success: true, booking });
});

app.post('/api/confessions/verify-secret-room', (req: Request, res: Response) => {
  const { passcode } = req.body;
  const code = String(passcode || '').trim();
  if (!code || code.length < 3) {
    res.status(401).json({ authorized: false, error: 'ቢያንስ 3 አሃዝ ያለው የጋራ የሚስጥር ክፍል ኮድ ያስገቡ።' });
    return;
  }
  // Matches any booking passcode OR priest-agreed room code (>= 3 chars) so Priest & Child can open a shared room
  res.json({
    authorized: true,
    roomId: `secret-${code}`,
    message: `የሚስጥር ቤቱ (${code}) በበረከት ተከፍቷል`,
  });
});

// --- 4. SPIRITUAL WALLET & BANKING ENDPOINTS ---
app.get('/api/wallet', (req: Request, res: Response) => {
  const user = getAuthenticatedUser(req);
  const userBankAccount = user ? db.userBankAccounts[user.id] || null : null;
  res.json({
    balance: db.walletBalance,
    transactions: db.walletTransactions,
    ministryBanks: db.ministryBanks,
    userBankAccount,
  });
});

app.post('/api/wallet/bank-accounts', (req: Request, res: Response) => {
  const user = getAuthenticatedUser(req);
  const { userBankAccount, ministryBanks } = req.body;

  if (userBankAccount && typeof userBankAccount === 'object') {
    const targetId = user?.id || 'default-member';
    db.userBankAccounts[targetId] = {
      bankName: String(userBankAccount.bankName || 'CBE (የኢትዮጵያ ንግድ ባንክ)').trim(),
      accountHolderName: String(userBankAccount.accountHolderName || '').trim(),
      accountNumber: String(userBankAccount.accountNumber || '').trim(),
      branchName: String(userBankAccount.branchName || '').trim(),
      telebirrPhone: String(userBankAccount.telebirrPhone || '').trim(),
    };
  }

  if (ministryBanks && typeof ministryBanks === 'object') {
    db.ministryBanks = {
      cbeAccount: String(ministryBanks.cbeAccount ?? db.ministryBanks.cbeAccount).trim(),
      cbeHolder: String(ministryBanks.cbeHolder ?? db.ministryBanks.cbeHolder).trim(),
      telebirrPhone: String(ministryBanks.telebirrPhone ?? db.ministryBanks.telebirrPhone).trim(),
      telebirrName: String(ministryBanks.telebirrName ?? db.ministryBanks.telebirrName).trim(),
      awashAccount: String(ministryBanks.awashAccount ?? db.ministryBanks.awashAccount).trim(),
      dashenAccount: String(ministryBanks.dashenAccount ?? db.ministryBanks.dashenAccount).trim(),
      abyssiniaAccount: String(ministryBanks.abyssiniaAccount ?? db.ministryBanks.abyssiniaAccount).trim(),
    };
  }

  saveDatabase();
  res.json({
    success: true,
    ministryBanks: db.ministryBanks,
    userBankAccount: user ? db.userBankAccounts[user.id] || null : db.userBankAccounts['default-member'] || null,
  });
});

app.post('/api/wallet/give', (req: Request, res: Response) => {
  const {
    userId,
    userName,
    type,
    amount,
    paymentMethod,
    purposeNote,
    bankName,
    accountNumber,
    accountHolderName,
    referenceNumber,
  } = req.body;
  const numericAmount = Number(amount);
  if (!numericAmount || numericAmount <= 0) {
    res.status(400).json({ error: 'ትክክለኛ የገንዘብ መጠን ያስገቡ።' });
    return;
  }

  const receiptNumber = `QH-DEP-${Date.now().toString().slice(-6)}`;
  const newTx: WalletTx = {
    id: `tx-${Date.now().toString().slice(-5)}`,
    userId: userId || 'usr-member',
    userName: userName || 'የንስሐ ልጅ',
    type: type || 'deposit',
    amount: numericAmount,
    timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16),
    paymentMethod: paymentMethod || 'bank_transfer',
    status: 'completed',
    receiptNumber,
    purposeNote: purposeNote || 'የባንክ ገቢ / መንፈሳዊ በረከት',
    bankName: bankName ? String(bankName).trim() : undefined,
    accountNumber: accountNumber ? String(accountNumber).trim() : undefined,
    accountHolderName: accountHolderName ? String(accountHolderName).trim() : undefined,
    referenceNumber: referenceNumber ? String(referenceNumber).trim() : receiptNumber,
  };

  db.walletTransactions.unshift(newTx);
  db.walletBalance.totalBalance += numericAmount;
  if (type === 'tithe') db.walletBalance.tithes += numericAmount;
  else if (type === 'charity') db.walletBalance.charity += numericAmount;
  else if (type === 'service_support') db.walletBalance.churchSupport += numericAmount;
  saveDatabase();

  res.status(201).json({ success: true, transaction: newTx, newBalance: db.walletBalance });
});

app.post('/api/wallet/withdraw', (req: Request, res: Response) => {
  const user = getAuthenticatedUser(req);
  const {
    userName,
    amount,
    bankName,
    accountNumber,
    accountHolderName,
    purposeNote,
    paymentMethod,
  } = req.body;

  const numericAmount = Number(amount);
  if (!numericAmount || numericAmount <= 0) {
    res.status(400).json({ error: 'ትክክለኛ የሚወጣ የገንዘብ መጠን ያስገቡ።' });
    return;
  }

  if (numericAmount > db.walletBalance.totalBalance) {
    res.status(400).json({
      error: `በቂ ቀሪ ሂሳብ የለም። አሁን ያለው ቀሪ ሂሳብ ${db.walletBalance.totalBalance.toLocaleString()} ብር ብቻ ነው።`,
    });
    return;
  }

  if (!bankName || !accountNumber || !accountHolderName) {
    res.status(400).json({ error: 'ለባንክ ወጪ የባንኩን ስም፣ የአካውንት ቁጥር እና የተቀባዩን ሙሉ ስም መሙላት ግዴታ ነው።' });
    return;
  }

  const receiptNumber = `QH-WDR-${Date.now().toString().slice(-6)}`;
  const newTx: WalletTx = {
    id: `tx-${Date.now().toString().slice(-5)}`,
    userId: user?.id || 'usr-member',
    userName: userName || user?.fullName || 'የንስሐ አገልግሎት',
    type: 'withdrawal',
    amount: numericAmount,
    timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16),
    paymentMethod: paymentMethod || (String(bankName).toLowerCase().includes('telebirr') ? 'telebirr' : 'bank_transfer'),
    status: 'completed',
    receiptNumber,
    purposeNote: purposeNote || `ወደ ${bankName} የተላከ የባንክ ወጪ`,
    bankName: String(bankName).trim(),
    accountNumber: String(accountNumber).trim(),
    accountHolderName: String(accountHolderName).trim(),
    referenceNumber: receiptNumber,
  };

  db.walletTransactions.unshift(newTx);
  db.walletBalance.totalBalance = Math.max(0, db.walletBalance.totalBalance - numericAmount);
  db.walletBalance.withdrawnTotal = (db.walletBalance.withdrawnTotal || 0) + numericAmount;
  saveDatabase();

  res.status(201).json({ success: true, transaction: newTx, newBalance: db.walletBalance });
});

// --- 4B. ADMIN / PRIEST DATABASE BACKUP & RESTORE ENDPOINTS ---
function requirePriestOrAdmin(req: Request, res: Response): StoredUser | null {
  const user = getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: 'ያልተረጋገጠ ክፍለ ጊዜ (Unauthenticated)' });
    return null;
  }
  if (user.role !== 'priest' && user.role !== 'admin') {
    res.status(403).json({ error: 'ይህን ተግባር ለመፈጸም የቀሲስ ወይም የአስተዳዳሪ ፈቃድ ያስፈልጋል።' });
    return null;
  }
  return user;
}

app.get('/api/admin/export-db', (req: Request, res: Response) => {
  const adminUser = requirePriestOrAdmin(req, res);
  if (!adminUser) return;

  const exportedAt = new Date().toISOString();
  res.json({
    exportedAt,
    version: 1,
    exportedBy: adminUser.baptismalName || adminUser.fullName,
    data: {
      users: db.users,
      confessionBookings: db.confessionBookings,
      walletBalance: db.walletBalance,
      walletTransactions: db.walletTransactions,
      userBankAccounts: db.userBankAccounts,
      ministryBanks: db.ministryBanks,
      communityStats: db.communityStats,
      contacts: db.contacts,
      memberDirectory: db.memberDirectory,
      memberDirectoryUpdatedAt: db.memberDirectoryUpdatedAt,
    },
  });
});

// --- 4C. PRIEST / ADMIN ORGANIZED MEMBERS DIRECTORY (SECULAR NAME, SPIRITUAL NAME & PHONE) ---
function buildMemberDirectoryStats(members: MemberDirectoryRecord[]) {
  return {
    totalMembers: members.length,
    withPhoneCount: members.filter((m) => Boolean(m.phone)).length,
    registeredAccountsCount: members.filter((m) => m.sources.includes('የተመዘገበ አካውንት')).length,
    confessionMembersCount: members.filter((m) => m.sources.includes('የንስሐ ቀጠሮ')).length,
    contactsCount: members.filter((m) => m.sources.includes('የስልክ ማውጫ')).length,
  };
}

app.get('/api/admin/members-directory', (req: Request, res: Response) => {
  const adminUser = requirePriestOrAdmin(req, res);
  if (!adminUser) return;

  const members = syncAndOrganizeMemberDirectory(db);
  res.json({
    members,
    updatedAt: db.memberDirectoryUpdatedAt || new Date().toISOString(),
    stats: buildMemberDirectoryStats(members),
  });
});

app.post('/api/admin/organize-members', (req: Request, res: Response) => {
  const adminUser = requirePriestOrAdmin(req, res);
  if (!adminUser) return;

  saveDatabase();
  res.json({
    success: true,
    members: db.memberDirectory,
    updatedAt: db.memberDirectoryUpdatedAt || new Date().toISOString(),
    stats: buildMemberDirectoryStats(db.memberDirectory),
  });
});

app.post('/api/admin/import-db', (req: Request, res: Response) => {
  const adminUser = requirePriestOrAdmin(req, res);
  if (!adminUser) return;

  const rawBody = req.body;
  if (!rawBody || typeof rawBody !== 'object') {
    res.status(400).json({ error: 'ትክክለኛ የJSON ባክአፕ ፋይል አልቀረበም።' });
    return;
  }

  const payload = rawBody.data && typeof rawBody.data === 'object' ? rawBody.data : rawBody;

  const hasValidUsers = Array.isArray(payload.users);
  const hasValidBookings = Array.isArray(payload.confessionBookings);
  const hasValidTransactions = Array.isArray(payload.walletTransactions);
  const hasValidWalletBalance = payload.walletBalance && typeof payload.walletBalance === 'object';

  if (!hasValidUsers && !hasValidBookings && !hasValidTransactions && !hasValidWalletBalance) {
    res.status(400).json({ error: 'የቀረበው ፋይል የሚታወቅ የቀሲስ ሄኖክ ዳታቤዝ መረጃ (users, bookings, wallet) አልያዘም።' });
    return;
  }

  if (hasValidUsers) {
    const validUsers: StoredUser[] = payload.users
      .filter((u: any) => u && typeof u === 'object' && typeof u.id === 'string' && typeof u.phone === 'string')
      .map((u: any) => ({
        id: String(u.id),
        fullName: String(u.fullName || 'ተጠቃሚ'),
        baptismalName: String(u.baptismalName || u.fullName || 'ተጠቃሚ'),
        phone: String(u.phone),
        email: String(u.email || ''),
        passwordHash: String(u.passwordHash || ''),
        passwordSalt: String(u.passwordSalt || ''),
        role: (['child', 'priest', 'deacon', 'admin'].includes(u.role) ? u.role : 'child') as StoredUser['role'],
        confessorPriest: String(u.confessorPriest || 'ቀሲስ ሄኖክ'),
        confessionStage: (['ጀማሪ', 'መካከለኛ', 'የበረታ/የቆረበ'].includes(u.confessionStage)
          ? u.confessionStage
          : 'ጀማሪ') as StoredUser['confessionStage'],
        avatarSeed: String(u.avatarSeed || u.baptismalName || 'QH'),
        createdAt: String(u.createdAt || new Date().toISOString()),
      }));
    // Keep the currently authenticated admin/priest record intact so the active session is never locked out
    const adminPresent = validUsers.some((u) => u.id === adminUser.id || u.phone === adminUser.phone);
    if (!adminPresent) {
      validUsers.push(adminUser);
    }
    db.users = validUsers;
  }

  if (hasValidBookings) {
    db.confessionBookings = payload.confessionBookings
      .filter((b: any) => b && typeof b === 'object' && typeof b.id === 'string')
      .map((b: any) => ({
        id: String(b.id),
        childName: String(b.childName || ''),
        baptismalName: String(b.baptismalName || 'የንስሐ ልጅ'),
        phone: String(b.phone || ''),
        date: String(b.date || ''),
        time: String(b.time || ''),
        status: (['pending', 'confirmed', 'completed', 'cancelled'].includes(b.status)
          ? b.status
          : 'pending') as ConfessionSlot['status'],
        penanceNotes: b.penanceNotes !== undefined ? String(b.penanceNotes) : undefined,
        secretPasscode: String(b.secretPasscode || '0000'),
      }));
  }

  if (hasValidWalletBalance) {
    db.walletBalance = {
      totalBalance: Number(payload.walletBalance.totalBalance || 0),
      tithes: Number(payload.walletBalance.tithes || 0),
      charity: Number(payload.walletBalance.charity || 0),
      churchSupport: Number(payload.walletBalance.churchSupport || 0),
      withdrawnTotal: Number(payload.walletBalance.withdrawnTotal || 0),
    };
  }

  if (hasValidTransactions) {
    db.walletTransactions = payload.walletTransactions
      .filter((t: any) => t && typeof t === 'object' && typeof t.id === 'string')
      .map((t: any) => ({
        id: String(t.id),
        userId: String(t.userId || 'usr-member'),
        userName: String(t.userName || 'ተጠቃሚ'),
        type: (['tithe', 'charity', 'service_support', 'deposit', 'withdrawal'].includes(t.type)
          ? t.type
          : 'deposit') as WalletTx['type'],
        amount: Number(t.amount || 0),
        timestamp: String(t.timestamp || ''),
        paymentMethod: (['telebirr', 'cbe_birr', 'chapa', 'bank_transfer', 'spiritual_wallet'].includes(t.paymentMethod)
          ? t.paymentMethod
          : 'bank_transfer') as WalletTx['paymentMethod'],
        status: (['completed', 'pending'].includes(t.status) ? t.status : 'completed') as WalletTx['status'],
        receiptNumber: String(t.receiptNumber || ''),
        purposeNote: String(t.purposeNote || ''),
        bankName: t.bankName ? String(t.bankName) : undefined,
        accountNumber: t.accountNumber ? String(t.accountNumber) : undefined,
        accountHolderName: t.accountHolderName ? String(t.accountHolderName) : undefined,
        referenceNumber: t.referenceNumber ? String(t.referenceNumber) : undefined,
      }));
  }

  if (payload.userBankAccounts && typeof payload.userBankAccounts === 'object' && !Array.isArray(payload.userBankAccounts)) {
    const cleanAccounts: Record<string, BankAccountRecord> = {};
    for (const [k, v] of Object.entries(payload.userBankAccounts)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      if (v && typeof v === 'object') {
        const rec = v as any;
        cleanAccounts[k] = {
          bankName: String(rec.bankName || ''),
          accountHolderName: String(rec.accountHolderName || ''),
          accountNumber: String(rec.accountNumber || ''),
          branchName: rec.branchName ? String(rec.branchName) : undefined,
          telebirrPhone: rec.telebirrPhone ? String(rec.telebirrPhone) : undefined,
        };
      }
    }
    db.userBankAccounts = cleanAccounts;
  }

  if (payload.ministryBanks && typeof payload.ministryBanks === 'object') {
    db.ministryBanks = {
      cbeAccount: String(payload.ministryBanks.cbeAccount ?? db.ministryBanks.cbeAccount),
      cbeHolder: String(payload.ministryBanks.cbeHolder ?? db.ministryBanks.cbeHolder),
      telebirrPhone: String(payload.ministryBanks.telebirrPhone ?? db.ministryBanks.telebirrPhone),
      telebirrName: String(payload.ministryBanks.telebirrName ?? db.ministryBanks.telebirrName),
      awashAccount: String(payload.ministryBanks.awashAccount ?? db.ministryBanks.awashAccount),
      dashenAccount: String(payload.ministryBanks.dashenAccount ?? db.ministryBanks.dashenAccount),
      abyssiniaAccount: String(payload.ministryBanks.abyssiniaAccount ?? db.ministryBanks.abyssiniaAccount),
    };
  }

  if (payload.communityStats && typeof payload.communityStats === 'object') {
    db.communityStats = {
      likesCount: Number(payload.communityStats.likesCount ?? db.communityStats.likesCount),
      sharesCount: Number(payload.communityStats.sharesCount ?? db.communityStats.sharesCount),
    };
  }

  if (Array.isArray(payload.contacts)) {
    db.contacts = payload.contacts
      .filter((c: any) => c && typeof c === 'object' && typeof c.id === 'string')
      .map((c: any) => ({
        id: String(c.id),
        name: String(c.name || ''),
        phone: String(c.phone || ''),
        addedBy: String(c.addedBy || 'አባል'),
        invitedAt: String(c.invitedAt || ''),
        note: c.note ? String(c.note) : undefined,
      }));
  }

  if (Array.isArray(payload.memberDirectory)) {
    db.memberDirectory = payload.memberDirectory
      .filter((m: any) => m && typeof m === 'object')
      .map((m: any) => ({
        id: String(m.id || `mem-${crypto.randomUUID().slice(0, 8)}`),
        secularName: String(m.secularName || ''),
        spiritualName: String(m.spiritualName || ''),
        phone: String(m.phone || ''),
        email: String(m.email || ''),
        role: (['child', 'priest', 'deacon', 'admin'].includes(m.role) ? m.role : 'child') as StoredUser['role'],
        confessorPriest: String(m.confessorPriest || 'ቀሲስ ሄኖክ'),
        confessionStage: String(m.confessionStage || 'ጀማሪ'),
        sources: Array.isArray(m.sources) ? m.sources.map((s: any) => String(s)) : [],
        confessionCount: Number(m.confessionCount || 0),
        walletTotalGiven: Number(m.walletTotalGiven || 0),
        lastUpdatedAt: String(m.lastUpdatedAt || new Date().toISOString()),
      }));
  }

  saveDatabase();

  res.json({
    success: true,
    counts: {
      users: db.users.length,
      confessionBookings: db.confessionBookings.length,
      walletTransactions: db.walletTransactions.length,
      contacts: db.contacts.length,
      memberDirectory: db.memberDirectory.length,
    },
  });
});

// --- 5. HIGH-SCALE ANTI-CONGESTION WEBSOCKET SIGNALING & RELAY SERVER ---
const wss = new WebSocketServer({
  server,
  path: '/ws/realtime',
  maxPayload: 512 * 1024,
  perMessageDeflate: false,
});

interface RoomClient {
  ws: WebSocket;
  isAlive: boolean;
  roomId: string;
  userId: string;
  userName: string;
  baptismalName: string;
  role: 'priest' | 'child' | 'attendee' | 'deacon' | 'admin';
  isMicOn: boolean;
  isVideoOn: boolean;
  isHandRaised: boolean;
  isScreenSharing: boolean;
  onStage: boolean;
}

const MAX_DIRECT_MESH_PEERS = 8;
const activeRooms = new Map<string, Set<RoomClient>>();
const roomChatHistory = new Map<string, Array<{ id: string; sender: string; text: string; time: string; isPriest?: boolean }>>();

function safeWsSend(ws: WebSocket, serialized: string, priority: 'high' | 'normal' | 'low' = 'high') {
  // Backpressure guard: prioritize audio/signaling ahead of JPEG video frames so slow 4G links never stall audio
  if (ws.readyState !== WebSocket.OPEN) return;
  const maxBuffered =
    priority === 'high' ? 1_500_000 : priority === 'normal' ? 380_000 : 110_000;
  if (ws.bufferedAmount < maxBuffered) {
    ws.send(serialized);
  }
}

function removeClientFromRoom(client: RoomClient | null) {
  if (!client) return;
  const roomSet = activeRooms.get(client.roomId);
  if (!roomSet) return;
  roomSet.delete(client);

  const leavePayload = JSON.stringify({
    type: 'peer-left',
    peerId: client.userId,
    userName: client.userName,
    clientCount: roomSet.size,
  });

  roomSet.forEach((other) => {
    safeWsSend(other.ws, leavePayload);
  });

  if (roomSet.size === 0) {
    activeRooms.delete(client.roomId);
  }
}

// 20-second heartbeat keeps active rooms clean and frees ghost mobile connections
const wsHeartbeat = setInterval(() => {
  wss.clients.forEach((socket) => {
    const ext = socket as WebSocket & { __clientRef?: RoomClient; __isAlive?: boolean };
    if (ext.__isAlive === false) {
      if (ext.__clientRef) removeClientFromRoom(ext.__clientRef);
      ext.terminate();
      return;
    }
    ext.__isAlive = false;
    ext.ping();
  });
}, 20000);

wss.on('close', () => clearInterval(wsHeartbeat));

wss.on('connection', (ws: WebSocket) => {
  const extWs = ws as WebSocket & { __clientRef?: RoomClient; __isAlive?: boolean };
  extWs.__isAlive = true;
  ws.on('pong', () => {
    extWs.__isAlive = true;
  });

  let currentClient: RoomClient | null = null;

  ws.on('message', (messageRaw: string) => {
    try {
      const payload = JSON.parse(messageRaw.toString());

      // A. Join Room (Zoom Assembly or 1-on-1 Secret Confession Room)
      if (payload.type === 'join-room') {
        if (currentClient) {
          removeClientFromRoom(currentClient);
        }

        const roomId = String(payload.roomId || 'assembly-zoom-main');
        const userId = String(payload.userId || `peer-${crypto.randomUUID().slice(0, 8)}`);

        if (!activeRooms.has(roomId)) {
          activeRooms.set(roomId, new Set());
        }
        const roomSet = activeRooms.get(roomId)!;

        // Clean any stale entry sharing the same peer/session ID before inserting
        roomSet.forEach((existing) => {
          if (existing.userId === userId && existing.ws !== ws) {
            removeClientFromRoom(existing);
          }
        });

        const role = (payload.role || 'attendee') as RoomClient['role'];

        // Anti-Congestion Stage Logic:
        // Priests/deacons or the first 8 active peers in a room take Stage directly.
        // Beyond 8 peers, new entrants join smoothly as Stage-Subscribing Audience (no N x N bandwidth explosion!).
        const currentStageCount = Array.from(roomSet).filter((c) => c.onStage).length;
        const canEnterStage = role === 'priest' || currentStageCount < MAX_DIRECT_MESH_PEERS;

        currentClient = {
          ws,
          isAlive: true,
          roomId,
          userId,
          userName: String(payload.userName || 'የንስሐ ልጅ'),
          baptismalName: String(payload.baptismalName || payload.userName || 'የንስሐ ልጅ'),
          role,
          isMicOn: canEnterStage ? Boolean(payload.isMicOn) : false,
          isVideoOn: canEnterStage && (payload.isVideoOn !== undefined ? Boolean(payload.isVideoOn) : true),
          isHandRaised: false,
          isScreenSharing: false,
          onStage: canEnterStage,
        };
        extWs.__clientRef = currentClient;

        // Collect existing peers BEFORE adding the new one
        const isMassRoom = roomSet.size >= MAX_DIRECT_MESH_PEERS;
        const existingPeers = Array.from(roomSet)
          // In mass audience mode, return Stage speakers (priests & promoted speakers) + direct sample so phones stay fast
          .filter((c) => (!isMassRoom ? true : c.onStage))
          .map((c) => ({
            peerId: c.userId,
            userName: c.userName,
            baptismalName: c.baptismalName,
            role: c.role,
            isMicOn: c.isMicOn,
            isVideoOn: c.isVideoOn,
            isHandRaised: c.isHandRaised,
            isScreenSharing: c.isScreenSharing,
            onStage: c.onStage,
          }));

        roomSet.add(currentClient);

        // 1. Send existing stage/peers + recent chat history back to the newly joined user
        safeWsSend(
          ws,
          JSON.stringify({
            type: 'room-state',
            roomId,
            selfPeerId: userId,
            selfOnStage: currentClient.onStage,
            broadcastMode: roomSet.size > MAX_DIRECT_MESH_PEERS ? 'stage-broadcast' : 'interactive-mesh',
            existingPeers,
            clientCount: roomSet.size,
            chatHistory: roomChatHistory.get(roomId) || [],
          })
        );

        // 2. Notify existing peers (if mass room and new entrant is audience, send lightweight count/roster ping only)
        const peerJoinedMsg = JSON.stringify({
          type: 'peer-joined',
          peer: {
            peerId: currentClient.userId,
            userName: currentClient.userName,
            baptismalName: currentClient.baptismalName,
            role: currentClient.role,
            isMicOn: currentClient.isMicOn,
            isVideoOn: currentClient.isVideoOn,
            isHandRaised: currentClient.isHandRaised,
            isScreenSharing: currentClient.isScreenSharing,
            onStage: currentClient.onStage,
          },
          broadcastMode: roomSet.size > MAX_DIRECT_MESH_PEERS ? 'stage-broadcast' : 'interactive-mesh',
          clientCount: roomSet.size,
        });

        roomSet.forEach((other) => {
          if (other.ws !== ws) {
            safeWsSend(other.ws, peerJoinedMsg);
          }
        });
      }

      // B. Targeted WebRTC Signaling Relay (Offer / Answer / ICE Candidate)
      else if (payload.type === 'webrtc-signal') {
        const roomId = String(payload.roomId || currentClient?.roomId || '');
        const targetPeerId = payload.targetPeerId;
        const roomSet = activeRooms.get(roomId);
        if (roomSet && currentClient) {
          const relayPayload = JSON.stringify({
            type: 'webrtc-signal',
            senderPeerId: currentClient.userId,
            senderName: currentClient.baptismalName || currentClient.userName,
            senderRole: currentClient.role,
            senderOnStage: currentClient.onStage,
            signal: payload.signal,
          });
          roomSet.forEach((client) => {
            if (client.ws !== ws && (!targetPeerId || client.userId === targetPeerId)) {
              safeWsSend(client.ws, relayPayload);
            }
          });
        }
      }

      // C. Media State Sync (Mic, Video, Hand Raise, Screen Share)
      else if (payload.type === 'room-media-state') {
        if (!currentClient) return;
        if (payload.isMicOn !== undefined) currentClient.isMicOn = Boolean(payload.isMicOn);
        if (payload.isVideoOn !== undefined) currentClient.isVideoOn = Boolean(payload.isVideoOn);
        if (payload.isHandRaised !== undefined) currentClient.isHandRaised = Boolean(payload.isHandRaised);
        if (payload.isScreenSharing !== undefined) currentClient.isScreenSharing = Boolean(payload.isScreenSharing);

        const roomSet = activeRooms.get(currentClient.roomId);
        if (roomSet) {
          const updateMsg = JSON.stringify({
            type: 'peer-media-state',
            peerId: currentClient.userId,
            userName: currentClient.userName,
            baptismalName: currentClient.baptismalName,
            isMicOn: currentClient.isMicOn,
            isVideoOn: currentClient.isVideoOn,
            isHandRaised: currentClient.isHandRaised,
            isScreenSharing: currentClient.isScreenSharing,
            onStage: currentClient.onStage,
          });
          roomSet.forEach((client) => {
            if (client.ws !== ws) {
              safeWsSend(client.ws, updateMsg);
            }
          });
        }
      }

      // C2. Host Stage Promotion / Demotion (Allows 1,000+ audience members to take turns speaking cleanly)
      else if (payload.type === 'stage-control') {
        if (!currentClient || currentClient.role !== 'priest') return;
        const roomSet = activeRooms.get(currentClient.roomId);
        if (!roomSet) return;
        const targetId = String(payload.targetPeerId || '');
        const onStage = Boolean(payload.onStage);

        const stageMsg = JSON.stringify({
          type: 'stage-updated',
          peerId: targetId,
          onStage,
        });

        roomSet.forEach((client) => {
          if (client.userId === targetId) {
            client.onStage = onStage;
            if (!onStage) {
              client.isMicOn = false;
            }
          }
          safeWsSend(client.ws, stageMsg);
        });
      }

      // D. Live Room Chat
      else if (payload.type === 'assembly-chat') {
        const roomId = String(payload.roomId || currentClient?.roomId || 'assembly-zoom-main');
        const msgObj = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          sender: String(payload.sender || currentClient?.baptismalName || 'ምዕመን'),
          text: String(payload.text || '').slice(0, 1000),
          time: payload.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isPriest: currentClient?.role === 'priest',
        };
        if (!msgObj.text.trim()) return;

        if (!roomChatHistory.has(roomId)) {
          roomChatHistory.set(roomId, []);
        }
        const history = roomChatHistory.get(roomId)!;
        history.push(msgObj);
        if (history.length > 100) history.shift();

        const roomSet = activeRooms.get(roomId);
        if (roomSet) {
          const broadcast = JSON.stringify({
            type: 'assembly-chat-message',
            ...msgObj,
          });
          roomSet.forEach((client) => {
            safeWsSend(client.ws, broadcast);
          });
        }
      }

      // E. Live Floating Reactions
      else if (payload.type === 'assembly-reaction') {
        const roomId = String(payload.roomId || currentClient?.roomId || 'assembly-zoom-main');
        const roomSet = activeRooms.get(roomId);
        if (roomSet) {
          const reactionBroadcast = JSON.stringify({
            type: 'assembly-reaction-broadcast',
            emoji: payload.emoji,
            sender: payload.sender || currentClient?.baptismalName,
            id: Date.now() + Math.random(),
          });
          roomSet.forEach((client) => {
            if (client.ws !== ws) {
              safeWsSend(client.ws, reactionBroadcast);
            }
          });
        }
      }

      // F. Host Control: Mute All Attendees
      else if (payload.type === 'host-mute-all') {
        if (!currentClient || currentClient.role !== 'priest') return;
        const roomSet = activeRooms.get(currentClient.roomId);
        if (roomSet) {
          const mutePayload = JSON.stringify({ type: 'force-mute' });
          roomSet.forEach((client) => {
            if (client.ws !== ws) {
              client.isMicOn = false;
              safeWsSend(client.ws, mutePayload);
            }
          });
        }
      }

      // G0. Targeted Request for WS Video Relay (when WebRTC ICE connects for audio yet hardware/4G stalls video frames)
      else if (payload.type === 'request-video-relay') {
        if (!currentClient) return;
        const roomId = String(payload.roomId || currentClient.roomId || '');
        const targetPeerId = payload.targetPeerId ? String(payload.targetPeerId) : null;
        const roomSet = activeRooms.get(roomId);
        if (roomSet) {
          const reqMsg = JSON.stringify({
            type: 'request-video-relay',
            senderPeerId: currentClient.userId,
          });
          roomSet.forEach((client) => {
            if (client.ws !== ws && (!targetPeerId || client.userId === targetPeerId)) {
              safeWsSend(client.ws, reqMsg, 'high');
            }
          });
        }
      }

      // G0-Audio. Targeted Request for WS Audio Relay (when WebRTC ICE connects yet 0 UDP audio packets flow bidirectionally)
      else if (payload.type === 'request-audio-relay') {
        if (!currentClient) return;
        const roomId = String(payload.roomId || currentClient.roomId || '');
        const targetPeerId = payload.targetPeerId ? String(payload.targetPeerId) : null;
        const roomSet = activeRooms.get(roomId);
        if (roomSet) {
          const reqMsg = JSON.stringify({
            type: 'request-audio-relay',
            senderPeerId: currentClient.userId,
          });
          roomSet.forEach((client) => {
            if (client.ws !== ws && (!targetPeerId || client.userId === targetPeerId)) {
              safeWsSend(client.ws, reqMsg, 'high');
            }
          });
        }
      }

      // G. Universal WebSocket Live Media Relay Fallback (when strict 4G CGNAT blocks UDP WebRTC)
      else if (payload.type === 'ws-video-frame') {
        if (!currentClient || typeof payload.frame !== 'string') return;
        const roomSet = activeRooms.get(currentClient.roomId);
        if (!roomSet) return;
        const isMass = roomSet.size > MAX_DIRECT_MESH_PEERS;
        if (isMass && !currentClient.onStage && currentClient.role !== 'priest') return;

        const frameMsg = JSON.stringify({
          type: 'ws-video-frame',
          senderPeerId: currentClient.userId,
          senderName: currentClient.baptismalName || currentClient.userName,
          frame: payload.frame.slice(0, 180_000),
          isVideoOn: Boolean(payload.isVideoOn),
        });
        roomSet.forEach((client) => {
          if (client.ws !== ws) {
            safeWsSend(client.ws, frameMsg, 'low');
          }
        });
      }

      else if (payload.type === 'ws-audio-chunk') {
        if (!currentClient || typeof payload.pcm16 !== 'string') return;
        const roomSet = activeRooms.get(currentClient.roomId);
        if (!roomSet) return;
        const isMass = roomSet.size > MAX_DIRECT_MESH_PEERS;
        if (isMass && !currentClient.onStage && currentClient.role !== 'priest') return;

        const audioMsg = JSON.stringify({
          type: 'ws-audio-chunk',
          senderPeerId: currentClient.userId,
          pcm16: payload.pcm16.slice(0, 48_000),
          sr: Number(payload.sr || 16000),
        });
        roomSet.forEach((client) => {
          if (client.ws !== ws) {
            safeWsSend(client.ws, audioMsg, 'normal');
          }
        });
      }

      // H. Client Keepalive Ping (prevents NAT/proxy idle disconnect)
      else if (payload.type === 'ws-ping') {
        extWs.__isAlive = true;
        safeWsSend(ws, JSON.stringify({ type: 'ws-pong' }));
      }

      // I. Explicit Leave Room
      else if (payload.type === 'leave-room') {
        removeClientFromRoom(currentClient);
        extWs.__clientRef = undefined;
        currentClient = null;
      }
    } catch (err) {
      console.warn('WebSocket message error:', err);
    }
  });

  ws.on('close', () => {
    removeClientFromRoom(currentClient);
    extWs.__clientRef = undefined;
    currentClient = null;
  });
});

// --- MOUNT VITE OR STATIC SERVING ---
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.get('/sw.js', (_req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.type('application/javascript; charset=utf-8');
      res.sendFile(path.join(distDir, 'sw.js'));
    });
    app.get(['/manifest.webmanifest', '/manifest.json'], (_req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.type('application/manifest+json; charset=utf-8');
      res.sendFile(path.join(distDir, 'manifest.webmanifest'));
    });
    app.use('/assets', express.static(path.join(distDir, 'assets'), { maxAge: '30d', immutable: true }));
    app.use(express.static(distDir, { maxAge: '1h' }));
    app.use('/api', (_req: Request, res: Response) => {
      res.status(404).json({ error: 'API endpoint not found' });
    });
    app.get('*', (_req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
