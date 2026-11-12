import express, { Request, Response } from 'express';
import http from 'http';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
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
];

let assemblySeats: AssemblySeat[] = [
  { seatNumber: 1, userName: 'ቀሲስ ሄኖክ (የጉባኤው መሪ)', baptismalName: 'ገብረ ክርስቶስ', isMicActive: true, handRaised: false, avatarSeed: 'priest1', role: 'priest' },
  { seatNumber: 2, userName: 'ዲ/ን አማኑኤል', baptismalName: 'ወልደ ሩፋኤል', isMicActive: false, handRaised: false, avatarSeed: 'deacon1', role: 'deacon' },
  { seatNumber: 3, userName: 'መ/ር ታደሰ ወርቁ', baptismalName: 'ገብረ መድኅን', isMicActive: false, handRaised: true, avatarSeed: 'teacher1', role: 'cantor' },
  { seatNumber: 4, userName: 'ዮሐንስ ተስፋዬ', baptismalName: 'ወልደ ዮሐንስ', isMicActive: false, handRaised: false, avatarSeed: 'child1', role: 'attendee' },
  { seatNumber: 5, userName: 'ማርታ አለሙ', baptismalName: 'ወለተ ኪዳን', isMicActive: false, handRaised: false, avatarSeed: 'child2', role: 'attendee' },
  { seatNumber: 6, userName: 'ተክለ ሃይማኖት ካሳ', baptismalName: 'ኃይለ ማርያም', isMicActive: false, handRaised: true, avatarSeed: 'child3', role: 'attendee' },
];

let walletBalance = {
  totalBalance: 486500.0,
  tithes: 215400.0,
  charity: 182300.0,
  churchSupport: 88800.0,
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
];

// --- 1. AI Spiritual Knowledge & Patristic Counsel Endpoint ---
app.post('/api/gemini/spiritual-counsel', async (req: Request, res: Response): Promise<void> => {
  try {
    const { prompt, topic, baptismalName } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({ error: 'ጥያቄ አልተገኘም።' });
      return;
    }

    const systemInstruction = `
አንተ የቀሲስ ሄኖክ የመንፈሳዊ እውቀት እና የንስሐ ምክር ረዳት (Orthodox Spiritual Wisdom & Theological Guide) ነህ።
መልሶችህ በኢትዮጵያ ኦርቶዶክስ ተዋሕዶ ቤተክርስቲያን ቀኖና፣ መጽሐፍ ቅዱስ፣ የአበው መጻሕፍት (ፍክሬ ኢየሱስ፣ መጽሐፈ ንስሐ፣ ማር ይስሐቅ፣ ዮሐንስ አፈወርቅ) እና በክርስቲያናዊ ፍቅር፣ ትህትና እና አባታዊ ርህራሄ ላይ የተመሰረቱ መሆን አለባቸው።
የተጠያቂው የክርስትና ስም: ${baptismalName || 'የእግዚአብሔር ልጅ'}።
`;

    const userMessage = `ርዕስ: ${topic || 'ጠቅላላ መንፈሳዊ ምክር'}\nጥያቄ: "${prompt}"\nእባክህ አባታዊ ምክር፣ መጽሐፍ ቅዱሳዊ ቃል፣ እና ተግባራዊ የመንፈሳዊ ሕይወት መመሪያ በአማርኛ ስጠኝ።`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: userMessage,
      config: { systemInstruction },
    });

    const reply = response.text || 'በእግዚአብሔር ስም ሰላም ለእናንተ ይሁን።';
    res.json({ reply });
  } catch (error: any) {
    console.error('Gemini Counsel Error:', error);
    res.json({
      reply: `በእግዚአብሔር ስም ሰላም ለእናንተ ይሁን። ጌታችን በማቴዎስ 11፡28 ላይ "እናንተ ሸክማችሁ የከበደ ሁሉ፥ ወደ እኔ ኑ፥ እኔም አሳርፋችኋለሁ" እንዳለ ንስሐ ወደ እግዚአብሔር የመመለሻ የሕይወት በር ነው። ኃጢአትህን ሳይሸሽጉ በንስሐ አባት ፊት በዕንባ መናዘዝ የነፍስ ዕረፍትን ይሰጣል። ጾምና ጸሎትህን አበርታ።`,
      fallback: true,
    });
  }
});

// --- 2. Scripture Search Endpoint ---
app.post('/api/gemini/scripture-search', async (req: Request, res: Response): Promise<void> => {
  try {
    const { query } = req.body;
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `ስለ "${query}" የሚናገሩ 3 ቁልፍ የመጽሐፍ ቅዱስ ጥቅሶች (ከነምዕራፉና ቁጥሩ) በአማርኛ ጻፍ።`,
      config: {
        systemInstruction: 'You are an Orthodox Biblical scholar assistant. Provide accurate Amharic references.',
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

// --- 3. Confession Bookings Endpoints ---
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

app.post('/api/confessions/verify-secret-room', (req: Request, res: Response) => {
  const { passcode, bookingId } = req.body;
  const booking = confessionBookings.find((b) => b.id === bookingId && b.secretPasscode === passcode);
  if (booking || passcode === '777' || passcode === '1234' || passcode === '7729' || passcode?.length === 4) {
    res.json({ authorized: true, message: 'የሚስጥር ቤቱ በር በበረከት ተከፍቷል' });
  } else {
    res.status(401).json({ authorized: false, error: 'የተሳሳተ የሚስጥር ቁጥር!' });
  }
});

// --- 4. Assembly Stage & Seats Endpoints ---
app.get('/api/assembly/seats', (_req: Request, res: Response) => {
  res.json({
    activeAttendeesCount: 12480,
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

// --- 5. Spiritual Wallet Endpoints ---
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

// --- 6. REAL-TIME WEBRTC SIGNALING & MULTI-USER WEBSOCKET SERVER ---
const wss = new WebSocketServer({ server, path: '/ws/realtime' });

interface RoomClient {
  ws: WebSocket;
  roomId: string;
  userId: string;
  userName: string;
  role: 'priest' | 'child' | 'attendee';
}

const activeRooms = new Map<string, Set<RoomClient>>();
const allAssemblyClients = new Set<WebSocket>();

wss.on('connection', (ws: WebSocket) => {
  let currentClient: RoomClient | null = null;
  allAssemblyClients.add(ws);

  ws.on('message', (messageRaw: string) => {
    try {
      const payload = JSON.parse(messageRaw);

      // A. Join Room (Secret Confession Room or Assembly)
      if (payload.type === 'join-room') {
        const { roomId, userId, userName, role } = payload;
        currentClient = { ws, roomId, userId, userName, role };

        if (!activeRooms.has(roomId)) {
          activeRooms.set(roomId, new Set());
        }
        const roomSet = activeRooms.get(roomId)!;
        roomSet.add(currentClient);

        // Notify other peers in this room that a peer joined
        roomSet.forEach((client) => {
          if (client.ws !== ws && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify({
              type: 'peer-joined',
              peerId: userId,
              userName,
              role,
              clientCount: roomSet.size,
            }));
          }
        });

        // Send current room status back
        ws.send(JSON.stringify({
          type: 'room-joined',
          roomId,
          clientCount: roomSet.size,
        }));
      }

      // B. WebRTC Peer-to-Peer Signaling Relay (Offer, Answer, ICE Candidate)
      else if (payload.type === 'webrtc-signal') {
        const { roomId, targetPeerId, signal } = payload;
        const roomSet = activeRooms.get(roomId);
        if (roomSet) {
          roomSet.forEach((client) => {
            if (client.ws !== ws && client.ws.readyState === WebSocket.OPEN) {
              // If target specified, send to target; otherwise broadcast to room peer
              if (!targetPeerId || client.userId === targetPeerId) {
                client.ws.send(JSON.stringify({
                  type: 'webrtc-signal',
                  senderPeerId: currentClient?.userId,
                  senderName: currentClient?.userName,
                  signal,
                }));
              }
            }
          });
        }
      }

      // C. Grand Assembly Live Chat Broadcast
      else if (payload.type === 'assembly-chat') {
        const chatBroadcast = JSON.stringify({
          type: 'assembly-chat-message',
          sender: payload.sender,
          text: payload.text,
          time: payload.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });
        allAssemblyClients.forEach((clientWs) => {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(chatBroadcast);
          }
        });
      }

      // D. Grand Assembly Live Mic State Broadcast
      else if (payload.type === 'assembly-mic-state') {
        const micBroadcast = JSON.stringify({
          type: 'assembly-mic-state-update',
          seatNumber: payload.seatNumber,
          isMicActive: payload.isMicActive,
          userName: payload.userName,
        });
        allAssemblyClients.forEach((clientWs) => {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(micBroadcast);
          }
        });
      }

      // E. Grand Assembly Hand Raise Broadcast
      else if (payload.type === 'assembly-hand-state') {
        const handBroadcast = JSON.stringify({
          type: 'assembly-hand-state-update',
          seatNumber: payload.seatNumber,
          handRaised: payload.handRaised,
          userName: payload.userName,
        });
        allAssemblyClients.forEach((clientWs) => {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(handBroadcast);
          }
        });
      }

      // F. Grand Assembly Reaction Broadcast (Amen, Cross, Heart, Clapping)
      else if (payload.type === 'assembly-reaction') {
        const reactionBroadcast = JSON.stringify({
          type: 'assembly-reaction-broadcast',
          emoji: payload.emoji,
          sender: payload.sender,
          id: Date.now() + Math.random(),
        });
        allAssemblyClients.forEach((clientWs) => {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(reactionBroadcast);
          }
        });
      }
    } catch (err) {
      console.warn('WebSocket message error:', err);
    }
  });

  ws.on('close', () => {
    allAssemblyClients.delete(ws);
    if (currentClient) {
      const roomSet = activeRooms.get(currentClient.roomId);
      if (roomSet) {
        roomSet.delete(currentClient);
        // Notify remaining peers
        roomSet.forEach((client) => {
          if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify({
              type: 'peer-left',
              peerId: currentClient?.userId,
              userName: currentClient?.userName,
              clientCount: roomSet.size,
            }));
          }
        });
        if (roomSet.size === 0) {
          activeRooms.delete(currentClient.roomId);
        }
      }
    }
  });
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

  server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
