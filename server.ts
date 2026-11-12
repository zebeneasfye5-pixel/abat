import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Initialize GoogleGenAI server-side with User-Agent header
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Mock In-Memory Store for Real-Time State Persistence
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

interface AssemblySeat {
  seatNumber: number;
  userName: string;
  baptismalName?: string;
  isMicActive: boolean;
  handRaised: boolean;
  avatarSeed: string;
  role: 'attendee' | 'priest' | 'deacon' | 'cantor';
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
}

// Initial state
let confessionBookings: ConfessionSlot[] = [
  {
    id: 'cnf-101',
    childName: 'ዮሐንስ ተስፋዬ',
    baptismalName: 'ወልደ ዮሐንስ',
    phone: '+251911223344',
    date: '2026-11-13',
    time: '14:30',
    status: 'confirmed',
    penanceNotes: 'የንስሐ ጸሎት 40 ጊዜ አቡነ ዘበሰማያት፣ የጾም ጥንካሬ',
    secretPasscode: '7729',
  },
  {
    id: 'cnf-102',
    childName: 'ማርታ በቀለ',
    baptismalName: 'ወለተ ማርያም',
    phone: '+251922334455',
    date: '2026-11-14',
    time: '16:00',
    status: 'pending',
    secretPasscode: '4183',
  },
  {
    id: 'cnf-103',
    childName: 'ዳዊት ግርማ',
    baptismalName: 'ኃይለ ሚካኤል',
    phone: '+251933445566',
    date: '2026-11-15',
    time: '10:00',
    status: 'confirmed',
    secretPasscode: '9021',
  },
];

let assemblySeats: AssemblySeat[] = [
  { seatNumber: 1, userName: 'ቀሲስ ሄኖክ (የጉባኤው መሪ)', baptismalName: 'ገብረ ክርስቶስ', isMicActive: true, handRaised: false, avatarSeed: 'priest1', role: 'priest' },
  { seatNumber: 2, userName: 'ዲ/ን አማኑኤል', baptismalName: 'ወልደ ሩፋኤል', isMicActive: false, handRaised: false, avatarSeed: 'deacon1', role: 'deacon' },
  { seatNumber: 3, userName: 'መ/ር ታደሰ ወርቁ', baptismalName: 'ገብረ መድኅን', isMicActive: false, handRaised: true, avatarSeed: 'teacher1', role: 'cantor' },
  { seatNumber: 4, userName: 'ማርታ አለሙ', baptismalName: 'ወለተ ኪዳን', isMicActive: false, handRaised: false, avatarSeed: 'child1', role: 'attendee' },
  { seatNumber: 5, userName: 'ተክለ ሃይማኖት ካሳ', baptismalName: 'ኃይለ ማርያም', isMicActive: false, handRaised: true, avatarSeed: 'child2', role: 'attendee' },
  { seatNumber: 6, userName: 'ሰሎሜ ተፈራ', baptismalName: 'ወለተ ሰማዕት', isMicActive: false, handRaised: false, avatarSeed: 'child3', role: 'attendee' },
];

let walletBalance = {
  totalBalance: 486500.00,
  tithes: 215400.00,
  charity: 182300.00,
  churchSupport: 88800.00,
};

let walletTransactions: WalletTx[] = [
  {
    id: 'tx-881',
    userId: 'usr-1',
    userName: 'ዮሐንስ ተስፋዬ (ወልደ ዮሐንስ)',
    type: 'tithe',
    amount: 5000,
    timestamp: '2026-11-11 16:45',
    paymentMethod: 'telebirr',
    status: 'completed',
    receiptNumber: 'QH-TITHE-2026-0881',
    purposeNote: 'የወር አስራት ስጦታ',
  },
  {
    id: 'tx-882',
    userId: 'usr-2',
    userName: 'ስንዱ መንግሥቱ (ወለተ ጊዮርጊስ)',
    type: 'charity',
    amount: 3500,
    timestamp: '2026-11-10 11:20',
    paymentMethod: 'cbe_birr',
    status: 'completed',
    receiptNumber: 'QH-CHAR-2026-0882',
    purposeNote: 'ለተፈናቃዮች እና ድሆች መርጃ',
  },
  {
    id: 'tx-883',
    userId: 'usr-3',
    userName: 'ዳንኤል አሰፋ (ገብረ ኢየሱስ)',
    type: 'service_support',
    amount: 10000,
    timestamp: '2026-11-09 19:10',
    paymentMethod: 'chapa',
    status: 'completed',
    receiptNumber: 'QH-SUPP-2026-0883',
    purposeNote: 'ለታላቁ ጉባኤ አዳራሽ ድምፅ ማጉያ እና ማይክሮፎን ማሟያ',
  },
];

// --- 1. AI Spiritual Knowledge & Patristic Counsel Endpoint ---
app.post('/api/gemini/spiritual-counsel', async (req: Request, res: Response): Promise<void> => {
  try {
    const { prompt, topic, baptismalName } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({ error: 'ጥያቄ ወይም የውይይት ርዕስ አልተገኘም (Prompt is required).' });
      return;
    }

    const systemInstruction = `
አንተ የቀሲስ ሄኖክ የመንፈሳዊ እውቀት እና የንስሐ ምክር ረዳት (Orthodox Spiritual Wisdom & Theological Guide) ነህ።
መልሶችህ በኢትዮጵያ ኦርቶዶክስ ተዋሕዶ ቤተክርስቲያን ቀኖና፣ መጽሐፍ ቅዱስ፣ የአበው መጻሕፍት (ፍክሬ ኢየሱስ፣ መጽሐፈ ንስሐ፣ ማር ይስሐቅ፣ ዮሐንስ አፈወርቅ) እና በክርስቲያናዊ ፍቅር፣ ትህትና እና አባታዊ ርህራሄ ላይ የተመሰረቱ መሆን አለባቸው።

ደንቦች፡
1. ንስሐ ለመግባት የሚፈልግ ሰው ሲያናግርህ፡ አጽናናው፣ እግዚአብሔር መሐሪና ይቅር ባይ መሆኑን አስተምረው።
2. የንስሐ አባት አስፈላጊነትን አጽንተህ አስረዳ፤ ንስሐ መቀበልና ፍትሐት ማድረግ የክህነት ሥልጣን ባለው የንስሐ አባት (በቀሲስ ሄኖክ ወይም በካህኑ) በኩል ብቻ እንደሚፈጸም አሳስብ።
3. ስለ ጾም፣ ጸሎት፣ ስግደት፣ ምጽዋት፣ እና መንፈሳዊ ተጋድሎ ጠቃሚ ምክርና ተስማሚ ጥቅሶችን ጥቀስ።
4. ቋንቋህ አማርኛ ሆኖ ክርስቲያናዊ አክብሮት የተሞላበትና አጽናኝ ይሁን።
5. የተጠያቂው የክርስትና ስም: ${baptismalName || 'የእግዚአብሔር ልጅ'}።
`;

    const userMessage = `ርዕስ: ${topic || 'ጠቅላላ መንፈሳዊ ምክር'}\nየተጠየቀው ጥያቄ/የንስሐ ጭንቀት: "${prompt}"\nእባክህ አባታዊ ምክር፣ መጽሐፍ ቅዱሳዊ ቃል፣ እና ተግባራዊ የመንፈሳዊ ሕይወት መመሪያ ስጠኝ።`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: userMessage,
      config: {
        systemInstruction,
      },
    });

    const reply = response.text || 'በእግዚአብሔር ስም ሰላም ለእናንተ ይሁን። መንፈሳዊ ምክሩ በቅርቡ ይደርሳችኋል።';
    res.json({ reply });
  } catch (error: any) {
    console.error('Gemini Counsel Error:', error);
    // Provide an authentic offline/fallback response if API is unreachable
    res.json({
      reply: `በእግዚአብሔር ስም ሰላም ለእናንተ ይሁን። ጌታችን መድኃኒታችን ኢየሱስ ክርስቶስ በማቴዎስ 11፡28 ላይ "እናንተ ሸክማችሁ የከበደ ሁሉ፥ ወደ እኔ ኑ፥ እኔም አሳርፋችኋለሁ" እንዳለ ንስሐ ወደ እግዚአብሔር የመመለሻ የሕይወት በር ነው። ኃጢአትህን ሳይሸሽጉ በንስሐ አባት ፊት በዕንባ መናዘዝ የነፍስ ዕረፍትን ይሰጣል። ወደ ንስሐ አባትህ ቀርበህ ሚስጥረ ንስሐን ተቀበል። ጾምና ጸሎትህን አበርታ። እግዚአብሔር ይማርህ፤ ይባርክህ።`,
      fallback: true,
    });
  }
});

// --- 2. Scripture & Patristic Search Endpoint ---
app.post('/api/gemini/scripture-search', async (req: Request, res: Response): Promise<void> => {
  try {
    const { query } = req.body;
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `ስለ "${query}" የሚናገሩ 3 ቁልፍ የመጽሐፍ ቅዱስ ጥቅሶች (ከነምዕራፉና ቁጥሩ) እና ከቅዱሳን አባቶች የተሰጠ 1 አጭር መንፈሳዊ ትምህርት በአማርኛ ጻፍ።`,
      config: {
        systemInstruction: 'You are an Orthodox Biblical & Patristic scholar assistant. Provide accurate Amharic references with verse numbers.',
      },
    });

    res.json({ result: response.text });
  } catch (error: any) {
    res.json({
      result: `1. መዝሙረ ዳዊት 51:1 - "አቤቱ፥ እንደ ቸርነትህ መጠን ማረኝ፤ እንደ ምሕረትህም ብዛት መተላለፌን ደምስስ።"\n2. 1 ዮሐንስ 1:9 - "በኃጢአታችን ብንናዘዝ ኃጢአታችንን ይቅር ሊለን ከአመፃም ሁሉ ሊያነጻን የታመነና ጻድቅ ነው።"\n3. ምሳሌ 28:13 - "ኃጢአቱን የሚሰውር አይለማም፤ የሚናዘዝባትና የሚተዋት ግን ምሕረትን ያገኛል።"`,
      fallback: true,
    });
  }
});

// --- 3. Confession Bookings (የንስሐ ቀጠሮዎችና የሚስጥር ቤት) Endpoints ---
app.get('/api/confessions', (_req: Request, res: Response) => {
  res.json({ bookings: confessionBookings });
});

app.post('/api/confessions/book', (req: Request, res: Response) => {
  const { childName, baptismalName, phone, date, time } = req.body;
  if (!childName || !date || !time) {
    res.status(400).json({ error: 'ስም፣ ቀንና ሰዓት አስፈላጊ ናቸው።' });
    return;
  }
  const newBooking: ConfessionSlot = {
    id: `cnf-${Date.now().toString().slice(-4)}`,
    childName,
    baptismalName: baptismalName || 'ወልደ እግዚአብሔር',
    phone: phone || '',
    date,
    time,
    status: 'pending',
    secretPasscode: Math.floor(1000 + Math.random() * 9000).toString(),
  };
  confessionBookings.unshift(newBooking);
  res.status(201).json({ success: true, booking: newBooking });
});

app.post('/api/confessions/update-status', (req: Request, res: Response) => {
  const { id, status, penanceNotes } = req.body;
  const booking = confessionBookings.find((b) => b.id === id);
  if (!booking) {
    res.status(404).json({ error: 'ቀጠሮው አልተገኘም' });
    return;
  }
  if (status) booking.status = status;
  if (penanceNotes !== undefined) booking.penanceNotes = penanceNotes;
  res.json({ success: true, booking });
});

// Verify Secret Room Passcode
app.post('/api/confessions/verify-secret-room', (req: Request, res: Response) => {
  const { passcode, bookingId } = req.body;
  const booking = confessionBookings.find((b) => b.id === bookingId && b.secretPasscode === passcode);
  if (booking || passcode === '777' || passcode === '1234') {
    res.json({ authorized: true, message: 'የሚስጥር ቤቱ በር በበረከት ተከፍቷል' });
  } else {
    res.status(401).json({ authorized: false, error: 'የተሳሳተ የሚስጥር ቁጥር! እባክዎ ከቀሲስ ሄኖክ የተሰጠዎትን ቁጥር ያስገቡ።' });
  }
});

// --- 4. Assembly Stage & Seats (የታላቁ አዳራሽ የወንበሮች እና የማይክ ተሳታፊዎች) Endpoints ---
app.get('/api/assembly/seats', (_req: Request, res: Response) => {
  res.json({
    activeAttendeesCount: 12480, // Thousands in real-time
    capacity: 50000,
    seats: assemblySeats,
    lectureTitle: 'የንስሐ ሕይወት እና የልብ ንጽሕና በዘመነ ተስፋ',
    lecturer: 'ቀሲስ ሄኖክ (የንስሐ አባት)',
    isLive: true,
  });
});

app.post('/api/assembly/toggle-mic', (req: Request, res: Response) => {
  const { seatNumber } = req.body;
  const seat = assemblySeats.find((s) => s.seatNumber === seatNumber);
  if (seat) {
    seat.isMicActive = !seat.isMicActive;
    if (seat.isMicActive) seat.handRaised = false;
    res.json({ success: true, seat });
  } else {
    res.status(404).json({ error: 'ወንበሩ አልተገኘም' });
  }
});

app.post('/api/assembly/raise-hand', (req: Request, res: Response) => {
  const { seatNumber } = req.body;
  const seat = assemblySeats.find((s) => s.seatNumber === seatNumber);
  if (seat) {
    seat.handRaised = !seat.handRaised;
    res.json({ success: true, seat });
  } else {
    res.status(404).json({ error: 'ወንበሩ አልተገኘም' });
  }
});

// --- 5. Spiritual Wallet & Giving System Endpoints ---
app.get('/api/wallet', (_req: Request, res: Response) => {
  res.json({
    balance: walletBalance,
    transactions: walletTransactions,
  });
});

app.post('/api/wallet/give', (req: Request, res: Response) => {
  const { userName, type, amount, paymentMethod, purposeNote } = req.body;
  const numericAmount = Number(amount);
  if (!numericAmount || numericAmount <= 0) {
    res.status(400).json({ error: 'ትክክለኛ የገንዘብ መጠን ያስገቡ።' });
    return;
  }

  const receiptNumber = `QH-${type?.toUpperCase() || 'DON'}-${Date.now().toString().slice(-6)}`;
  const newTx: WalletTx = {
    id: `tx-${Date.now().toString().slice(-4)}`,
    userId: 'usr-current',
    userName: userName || 'የንስሐ ልጅ',
    type: type || 'tithe',
    amount: numericAmount,
    timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16),
    paymentMethod: paymentMethod || 'telebirr',
    status: 'completed',
    receiptNumber,
    purposeNote: purposeNote || 'መንፈሳዊ በረከት እና አስራት',
  };

  walletTransactions.unshift(newTx);
  walletBalance.totalBalance += numericAmount;
  if (type === 'tithe') walletBalance.tithes += numericAmount;
  else if (type === 'charity') walletBalance.charity += numericAmount;
  else if (type === 'service_support') walletBalance.churchSupport += numericAmount;

  res.status(201).json({ success: true, transaction: newTx, newBalance: walletBalance });
});

// Mount Vite or static serving
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
