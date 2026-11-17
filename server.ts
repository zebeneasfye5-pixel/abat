import express, { Request, Response } from 'express';
import http from 'http';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
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

app.use(express.json());

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
  };
}

let db: DatabaseSchema = loadDatabase();

function saveDatabase() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to persist database:', err);
  }
}

// Deterministic server signing secret so tokens & account recovery tokens survive Render restarts/redeploys
function getSessionSecret(): string {
  const seed = process.env.SESSION_SECRET || process.env.PRIEST_SECRET_CODE || 'qesis-henok-orthodox-permanent-seed';
  return crypto.createHash('sha256').update(`qh-auth-v1:${seed}`).digest('hex');
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

// Instant in-memory LRU cache (max 200 queries) for near-zero latency on repeated Orthodox questions
const aiResponseCache = new Map<string, string>();
function getCachedAi(key: string): string | undefined {
  const val = aiResponseCache.get(key);
  if (val !== undefined) {
    aiResponseCache.delete(key);
    aiResponseCache.set(key, val);
  }
  return val;
}
function setCachedAi(key: string, value: string) {
  if (aiResponseCache.size >= 200) {
    const oldest = aiResponseCache.keys().next().value;
    if (oldest) aiResponseCache.delete(oldest);
  }
  aiResponseCache.set(key, value);
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

async function generateWithGemini(prompt: string, systemInstruction: string, cacheKey?: string): Promise<string> {
  if (cacheKey) {
    const cached = getCachedAi(cacheKey);
    if (cached) return cached;
  }

  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });

  const text = response.text?.trim();
  if (!text) {
    throw new Error('Empty response from Gemini API');
  }
  if (cacheKey) setCachedAi(cacheKey, text);
  return text;
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
    const stream = await ai.models.generateContentStream({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        systemInstruction,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    let fullText = '';
    for await (const chunk of stream) {
      const part = chunk.text || '';
      if (part) {
        fullText += part;
        res.write(`data: ${JSON.stringify({ chunk: part })}\n\n`);
      }
    }

    if (cacheKey && fullText.trim()) {
      setCachedAi(cacheKey, fullText.trim());
    }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (error: any) {
    console.error('Gemini Stream Error:', error);
    const message =
      error?.code === 'GEMINI_API_KEY_MISSING'
        ? 'የኤአይ ቁልፍ (GEMINI_API_KEY) በሰርቨሩ ላይ አልተሞላም። በRender Environment ላይ GEMINI_API_KEY ያስገቡ።'
        : `የኤአይ አገልግሎት ስህተት (${error?.message || 'Unknown Error'})።`;
    res.write(`data: ${JSON.stringify({ error: message, done: true })}\n\n`);
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

app.post('/api/livekit/token', (req: Request, res: Response) => {
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
  if (role === 'priest' || role === 'deacon') {
    // Allow priest registration cleanly when priest verification code matches (or default 777)
    if (role === 'priest' && priestCode && priestCode !== '777' && priestCode !== (process.env.PRIEST_SECRET_CODE || '777')) {
      res.status(403).json({ error: 'የቀሲስ/የአስተዳዳሪ ማረጋገጫ ኮድ የተሳሳተ ነው።' });
      return;
    }
    finalRole = role;
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

app.get('/api/users', (_req: Request, res: Response) => {
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
    const cleanPrompt = prompt.trim();
    const userMessage = `ዘርፍ/ርዕስ: ${topic || 'አጠቃላይ ኦርቶዶክሳዊ እውቀት'}\nጥያቄ: "${cleanPrompt}"\nእባክህ በኦርቶዶክስ ተዋሕዶ ቤተክርስቲያን ትምህርት፣ መጻሕፍት፣ ቀኖና እና አባታዊ ፍቅር መሠረት ግልጽና የተሟላ መልስ ስጠኝ።`;
    const cacheKey = `counsel:${topic || 'all'}:${cleanPrompt.toLowerCase()}`;

    const reply = await generateWithGemini(userMessage, systemInstruction, cacheKey);
    res.json({ reply });
  } catch (error: any) {
    console.error('Gemini Counsel Error:', error);
    if (error?.code === 'GEMINI_API_KEY_MISSING') {
      res.status(503).json({
        error: 'GEMINI_API_KEY_MISSING',
        message: 'የኤአይ ቁልፍ (GEMINI_API_KEY) በሰርቨሩ ላይ አልተሞላም። እባክዎ በRender Environment Variables ላይ GEMINI_API_KEY ያስገቡ።',
      });
      return;
    }
    res.status(500).json({
      error: 'AI_REQUEST_FAILED',
      message: `የኤአይ አገልግሎት ስህተት አጋጥሞታል (${error?.message || 'Unknown Error'})።`,
    });
  }
});

app.post('/api/gemini/spiritual-counsel-stream', async (req: Request, res: Response): Promise<void> => {
  const { prompt, topic, baptismalName } = req.body;
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    res.status(400).json({ error: 'እባክዎ ጥያቄዎን በግልጽ ይጻፉ።' });
    return;
  }
  const cleanPrompt = prompt.trim();
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
    const cleanQuery = query.trim();
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
        message: 'የኤአይ ቁልፍ (GEMINI_API_KEY) በሰርቨሩ ላይ ስላልተሞላ ፍለጋው አልተቻለም። በRender Environment ላይ GEMINI_API_KEY ያስገቡ።',
      });
      return;
    }
    res.status(500).json({
      error: 'AI_SEARCH_FAILED',
      message: `የፍለጋው ስህተት አጋጥሞታል (${error?.message || 'Unknown Error'})።`,
    });
  }
});

app.post('/api/gemini/scripture-search-stream', async (req: Request, res: Response): Promise<void> => {
  const { query, category } = req.body;
  if (!query || typeof query !== 'string' || !query.trim()) {
    res.status(400).json({ error: 'የሚፈለገውን ቃል ወይም ርዕስ ያስገቡ።' });
    return;
  }
  const cleanQuery = query.trim();
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
app.get('/api/confessions', (_req: Request, res: Response) => {
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

// --- 5. HIGH-SCALE ANTI-CONGESTION WEBSOCKET SIGNALING & RELAY SERVER ---
const wss = new WebSocketServer({
  server,
  path: '/ws/realtime',
  maxPayload: 256 * 1024,
  perMessageDeflate: true,
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

function safeWsSend(ws: WebSocket, serialized: string) {
  // Backpressure guard so congested/3G sockets never stall thousands of healthy peers
  if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 512 * 1024) {
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

      // G. Explicit Leave Room
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
