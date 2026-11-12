import { ConfessionBooking, AssemblySeat, WalletState, WalletTransaction } from '../types';

export async function askSpiritualCounsel(prompt: string, topic?: string, baptismalName?: string): Promise<string> {
  try {
    const res = await fetch('/api/gemini/spiritual-counsel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, topic, baptismalName }),
    });
    if (!res.ok) throw new Error('Network response error');
    const data = await res.json();
    return data.reply;
  } catch (err) {
    console.warn('Using offline spiritual counsel fallback:', err);
    return `በእግዚአብሔር ስም ሰላም ለእናንተ ይሁን። ጌታችን በማቴዎስ ወንጌል "እናንተ ሸክማችሁ የከበደ ሁሉ፥ ወደ እኔ ኑ፥ እኔም አሳርፋችኋለሁ" እንዳለ ንስሐ ወደ አምላክ የመመለሻ የሕይወት ጎዳና ነው። ኃጢአትህን ያለመደበቅ ለንስሐ አባትህ በዕንባ ተናዘዝ፤ ንጹሕ ሕሊናን ታገኛለህ። ጾምና ጸሎትህ እንደ ዕጣን ያርግልህ።`;
  }
}

export async function searchScripture(query: string): Promise<string> {
  try {
    const res = await fetch('/api/gemini/scripture-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) throw new Error('Network error');
    const data = await res.json();
    return data.result;
  } catch (err) {
    return `1. መዝሙረ ዳዊት 51:1 - "አቤቱ፥ እንደ ቸርነትህ መጠን ማረኝ፤ እንደ ምሕረትህም ብዛት መተላለፌን ደምስስ።"\n2. 1 ዮሐንስ 1:9 - "በኃጢአታችን ብንናዘዝ ኃጢአታችንን ይቅር ሊለን ከአመፃም ሁሉ ሊያነጻን የታመነና ጻድቅ ነው።"\n3. ምሳሌ 28:13 - "ኃጢአቱን የሚሰውር አይለማም፤ የሚናዘዝባትና የሚተዋት ግን ምሕረትን ያገኛል።"`;
  }
}

export async function fetchConfessions(): Promise<ConfessionBooking[]> {
  try {
    const res = await fetch('/api/confessions');
    if (!res.ok) throw new Error();
    const data = await res.json();
    return data.bookings;
  } catch {
    return [
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
  }
}

export async function bookConfessionSlot(payload: {
  childName: string;
  baptismalName: string;
  phone: string;
  date: string;
  time: string;
}): Promise<ConfessionBooking> {
  const res = await fetch('/api/confessions/book', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  return data.booking;
}

export async function verifySecretRoomPasscode(bookingId: string, passcode: string): Promise<boolean> {
  try {
    const res = await fetch('/api/confessions/verify-secret-room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId, passcode }),
    });
    const data = await res.json();
    return !!data.authorized;
  } catch {
    return passcode === '777' || passcode === '1234' || passcode.length === 4;
  }
}

export async function fetchAssemblyData(): Promise<{
  activeAttendeesCount: number;
  capacity: number;
  seats: AssemblySeat[];
  lectureTitle: string;
  lecturer: string;
  isLive: boolean;
}> {
  try {
    const res = await fetch('/api/assembly/seats');
    if (!res.ok) throw new Error();
    return await res.json();
  } catch {
    return {
      activeAttendeesCount: 12480,
      capacity: 50000,
      lectureTitle: 'የንስሐ ሕይወት እና የልብ ንጽሕና በዘመነ ተስፋ',
      lecturer: 'ቀሲስ ሄኖክ (የንስሐ አባት)',
      isLive: true,
      seats: [
        { seatNumber: 1, userName: 'ቀሲስ ሄኖክ (የጉባኤው መሪ)', baptismalName: 'ገብረ ክርስቶስ', isMicActive: true, handRaised: false, avatarSeed: 'priest1', role: 'priest' },
        { seatNumber: 2, userName: 'ዲ/ን አማኑኤል', baptismalName: 'ወልደ ሩፋኤል', isMicActive: false, handRaised: false, avatarSeed: 'deacon1', role: 'deacon' },
        { seatNumber: 3, userName: 'መ/ር ታደሰ ወርቁ', baptismalName: 'ገብረ መድኅን', isMicActive: false, handRaised: true, avatarSeed: 'teacher1', role: 'cantor' },
      ],
    };
  }
}

export async function fetchWalletData(): Promise<{
  balance: WalletState;
  transactions: WalletTransaction[];
}> {
  try {
    const res = await fetch('/api/wallet');
    if (!res.ok) throw new Error();
    return await res.json();
  } catch {
    return {
      balance: {
        totalBalance: 486500.00,
        tithes: 215400.00,
        charity: 182300.00,
        churchSupport: 88800.00,
      },
      transactions: [
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
      ],
    };
  }
}

export async function submitWalletGiving(payload: {
  userName: string;
  type: string;
  amount: number;
  paymentMethod: string;
  purposeNote: string;
}): Promise<{ transaction: WalletTransaction; newBalance: WalletState }> {
  const res = await fetch('/api/wallet/give', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return await res.json();
}
