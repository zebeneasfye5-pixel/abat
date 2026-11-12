import React, { useState } from 'react';
import { Wallet, ArrowDownRight, ArrowUpRight, Heart, Sparkles, CheckCircle2, Receipt, Download, CreditCard, ShieldCheck } from 'lucide-react';
import confetti from 'canvas-confetti';
import { WalletState, WalletTransaction, UserProfile } from '../types';
import { submitWalletGiving } from '../services/api';

interface SpiritualWalletProps {
  user: UserProfile;
  walletState: WalletState;
  transactions: WalletTransaction[];
  onGivingSuccess: (newTx: WalletTransaction, newBal: WalletState) => void;
}

export const SpiritualWallet: React.FC<SpiritualWalletProps> = ({
  user,
  walletState,
  transactions,
  onGivingSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'give' | 'transactions' | 'receipt'>('give');
  const [givingType, setGivingType] = useState<'tithe' | 'charity' | 'service_support'>('tithe');
  const [amount, setAmount] = useState('1000');
  const [paymentMethod, setPaymentMethod] = useState<'telebirr' | 'cbe_birr' | 'chapa' | 'bank_transfer'>('telebirr');
  const [phoneNumber, setPhoneNumber] = useState(user.phone || '0911223344');
  const [purposeNote, setPurposeNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<WalletTransaction | null>(null);

  const quickAmounts = ['200', '500', '1000', '2500', '5000', '10000'];

  const handleGive = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(amount);
    if (!num || num <= 0) {
      alert('እባክዎ ትክክለኛ የገንዘብ መጠን ያስገቡ።');
      return;
    }

    setLoading(true);
    try {
      const res = await submitWalletGiving({
        userName: `${user.baptismalName} (${user.fullName})`,
        type: givingType,
        amount: num,
        paymentMethod,
        purposeNote: purposeNote || (givingType === 'tithe' ? 'የወር አስራት' : givingType === 'charity' ? 'የችግረኞች ምጽዋት' : 'የአገልግሎት ድጋፍ'),
      });

      onGivingSuccess(res.transaction, res.newBalance);
      setLastReceipt(res.transaction);
      setActiveTab('receipt');

      // Trigger Celebration
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#D4AF37', '#800020', '#10B981'],
        });
      } catch {}
    } catch {
      alert('የገንዘብ ክፍያው በኔትወርክ ምክንያት ሊጠናቀቅ አልቻለም።');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      
      {/* Wallet Top Header */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-stone-900 via-amber-950/40 to-stone-900 border border-amber-800/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-950/80 border border-amber-700/50 text-amber-300 text-xs font-medium">
            <Wallet className="w-3.5 h-3.5 text-amber-400" />
            <span>ዘመናዊ የመንፈሳዊ በረከትና አስራት ማዕከል</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-heading font-bold text-amber-100 mt-2">
            የቀሲስ ሄኖክ መንፈሳዊ ዋሌት
          </h2>
        </div>

        {/* Total Ledger Balance Card */}
        <div className="p-4 rounded-xl bg-stone-950/80 border border-amber-600/40 text-right">
          <p className="text-xs text-stone-400">አጠቃላይ የተሰበሰበ የመንፈሳዊ ፈንድ</p>
          <p className="text-2xl font-bold font-heading text-amber-300 tabular-nums">
            {walletState.totalBalance.toLocaleString()} <span className="text-xs text-amber-400">ብር (ETB)</span>
          </p>
          <p className="text-[11px] text-emerald-400 flex items-center justify-end gap-1 mt-0.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>በቀኖና ኦዲት የተረጋገጠ</span>
          </p>
        </div>
      </div>

      {/* 3 Fund Categories Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-stone-900/60 border border-amber-800/30 flex items-center gap-3">
          <div className="p-3 rounded-lg bg-amber-950/70 border border-amber-700/40 text-amber-400">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-stone-400">አስራትና በኩራት</p>
            <p className="text-lg font-bold font-heading text-amber-200 tabular-nums">
              {walletState.tithes.toLocaleString()} ብር
            </p>
            <p className="text-[11px] text-stone-500">"አስራቱን ሁሉ ወደ ጎተራ አግቡ" (ሚል 3:10)</p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-stone-900/60 border border-amber-800/30 flex items-center gap-3">
          <div className="p-3 rounded-lg bg-emerald-950/70 border border-emerald-700/40 text-emerald-400">
            <Heart className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-stone-400">የበጎ አድራጎትና የችግረኞች ፈንድ</p>
            <p className="text-lg font-bold font-heading text-emerald-300 tabular-nums">
              {walletState.charity.toLocaleString()} ብር
            </p>
            <p className="text-[11px] text-stone-500">ለአረጋውያን፣ ለህሙማንና ለተፈናቃዮች</p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-stone-900/60 border border-amber-800/30 flex items-center gap-3">
          <div className="p-3 rounded-lg bg-red-950/70 border border-red-700/40 text-red-400">
            <Wallet className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-stone-400">የአዳራሽና የአገልግሎት ድጋፍ</p>
            <p className="text-lg font-bold font-heading text-amber-200 tabular-nums">
              {walletState.churchSupport.toLocaleString()} ብር
            </p>
            <p className="text-[11px] text-stone-500">ለድምፅ፣ ለቪዲዮና ለአገልጋዮች ወጪ</p>
          </div>
        </div>
      </div>

      {/* Tabs: Give vs Transactions vs Receipt */}
      <div className="flex border-b border-stone-800 gap-6 text-sm font-medium">
        <button
          onClick={() => setActiveTab('give')}
          className={`pb-3 transition-colors ${
            activeTab === 'give'
              ? 'text-amber-300 border-b-2 border-amber-400 font-bold'
              : 'text-stone-400 hover:text-stone-200'
          }`}
        >
          ገንዘብ አስገባ / ስጦታ ስጥ (Give / Deposit)
        </button>

        <button
          onClick={() => setActiveTab('transactions')}
          className={`pb-3 transition-colors ${
            activeTab === 'transactions'
              ? 'text-amber-300 border-b-2 border-amber-400 font-bold'
              : 'text-stone-400 hover:text-stone-200'
          }`}
        >
          የገንዘብ ገቢና ወጪ ታሪክ ({transactions.length})
        </button>

        {lastReceipt && (
          <button
            onClick={() => setActiveTab('receipt')}
            className={`pb-3 transition-colors flex items-center gap-1.5 ${
              activeTab === 'receipt'
                ? 'text-amber-300 border-b-2 border-amber-400 font-bold'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <Receipt className="w-4 h-4 text-amber-400" />
            <span>የደረሰኝ ቅጂ (Receipt)</span>
          </button>
        )}
      </div>

      {/* View 1: Give / Deposit Form */}
      {activeTab === 'give' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          <form onSubmit={handleGive} className="lg:col-span-7 p-6 rounded-2xl bg-stone-900/60 border border-amber-900/30 space-y-5">
            
            {/* 1. Giving Type Selector */}
            <div>
              <label className="block text-xs font-semibold text-amber-200 mb-2">
                ፩. የስጦታው ወይም የአስራቱ ዓይነት
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'tithe', label: 'አስራትና በኩራት' },
                  { id: 'charity', label: 'የድሆች ምጽዋት' },
                  { id: 'service_support', label: 'የአገልግሎት ድጋፍ' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setGivingType(t.id as any)}
                    className={`py-2 px-3 rounded-xl text-xs font-medium border transition-all ${
                      givingType === t.id
                        ? 'bg-amber-950/80 border-amber-500 text-amber-200 font-bold'
                        : 'bg-stone-950 border-stone-800 text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Amount Input & Quick Chips */}
            <div>
              <label className="block text-xs font-semibold text-amber-200 mb-2">
                ፪. የገንዘብ መጠን (ብር - ETB)
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="የገንዘብ መጠን ያስገቡ..."
                className="w-full bg-stone-950 border border-stone-700 rounded-xl px-4 py-3 text-lg font-bold font-mono text-amber-300 focus:outline-none focus:border-amber-500"
              />
              <div className="flex flex-wrap gap-2 mt-2">
                {quickAmounts.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setAmount(amt)}
                    className="px-3 py-1 rounded-lg bg-stone-950 border border-stone-800 text-xs text-stone-300 hover:border-amber-600 hover:text-amber-200 transition"
                  >
                    +{amt} ብር
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Payment Method */}
            <div>
              <label className="block text-xs font-semibold text-amber-200 mb-2">
                ፫. የመክፈያ መንገድ (Payment Gateway)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {[
                  { id: 'telebirr', name: 'ቴሌብር (Telebirr)', color: 'border-emerald-600/50' },
                  { id: 'cbe_birr', name: 'CBE Birr (ንግድ ባንክ)', color: 'border-purple-600/50' },
                  { id: 'chapa', name: 'ቻፓ (Chapa / Card)', color: 'border-blue-600/50' },
                  { id: 'bank_transfer', name: 'የባንክ ዝውውር', color: 'border-amber-600/50' },
                ].map((method) => (
                  <button
                    key={method.id}
                    type="button"
                    onClick={() => setPaymentMethod(method.id as any)}
                    className={`p-3 rounded-xl text-left border transition-all ${
                      paymentMethod === method.id
                        ? `bg-stone-950 ${method.color} ring-1 ring-amber-400 font-bold text-amber-200`
                        : 'bg-stone-950/60 border-stone-800 text-stone-400 hover:border-stone-700'
                    }`}
                  >
                    <CreditCard className="w-4 h-4 mb-1 text-amber-400" />
                    <p className="text-xs">{method.name}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Phone Number / Account Input */}
            <div>
              <label className="block text-xs font-semibold text-amber-200 mb-1">
                ፬. የስልክ ቁጥር (ለመክፈያ ማረጋገጫ)
              </label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="09... ወይም +251..."
                className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3.5 py-2.5 text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* 5. Purpose Note */}
            <div>
              <label className="block text-xs font-semibold text-amber-200 mb-1">
                ፭. የጸሎት ማስታወሻ ወይም የተለየ ዓላማ (አማራጭ)
              </label>
              <input
                type="text"
                value={purposeNote}
                onChange={(e) => setPurposeNote(e.target.value)}
                placeholder="ለምሳሌ፡ ስለ ጤንነት፣ ስለ ቤተሰብ ሰላም፣ ለተፈናቃዮች..."
                className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3.5 py-2.5 text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-red-950 via-amber-900 to-red-950 border border-amber-500/50 text-white font-bold text-sm shadow-xl hover:scale-[1.01] transition-all disabled:opacity-50"
            >
              {loading ? 'ክፍያው እየተረጋገጠ ነው...' : `${amount} ብር በ${paymentMethod === 'telebirr' ? 'ቴሌብር' : paymentMethod === 'cbe_birr' ? 'CBE Birr' : 'ቻፓ'} በረከቱን አስገባ`}
            </button>

          </form>

          {/* Right: Spiritual Assurance & Guarantee */}
          <div className="lg:col-span-5 space-y-4">
            
            <div className="p-5 rounded-2xl bg-stone-900/60 border border-amber-900/30 space-y-3">
              <h4 className="text-sm font-semibold font-heading text-amber-200">
                የአስራት እና የምጽዋት መንፈሳዊ ትርጉም
              </h4>
              <p className="text-xs text-stone-300 leading-relaxed font-serif">
                "ሰው እግዚአብሔርን ይሰርቃልን? እናንተ ግን እኔን ሰርቃችኋል። እናንተም፡— በምን ሰረቅንህ? ብላችኋል። በአስራትና በበኩራት ነው።... 
                በጎተራዬም ውስጥ መብል እንዲሆን አስራቱን ሁሉ ወደ ጎተራ አግቡ፤ የሰማይንም መስኮት የማልከፍትላችሁ እንደ ሆነ፥ በረከትንም አትረፍርፌ የማላፈስስላችሁ 
                እንደ ሆነ በዚህ ፈትኑኝ፥ ይላል የሠራዊት ጌታ እግዚአብሔር።" (ሚል ፫:፰-፲)
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-stone-900/60 border border-amber-900/30 space-y-2">
              <h4 className="text-xs font-semibold text-amber-200 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>100% ግልጽና የታመነ የገንዘብ አያያዝ</span>
              </h4>
              <ul className="text-xs text-stone-400 space-y-1.5 list-disc list-inside">
                <li>እያንዳንዱ ስጦታ ይፋዊ ዲጂታል ደረሰኝ ወዲያው ይሰጠዋል።</li>
                <li>የተሰበሰበው ገንዘብ ለታለመለት የቤተክርስቲያንና የድሆች መርጃ ብቻ ይውላል።</li>
                <li>በዳሽቦርዱ በኩል ሙሉ የገቢና ወጪ ኦዲት በማንኛውም ጊዜ መመልከት ይቻላል።</li>
              </ul>
            </div>

          </div>

        </div>
      )}

      {/* View 2: Transaction History */}
      {activeTab === 'transactions' && (
        <div className="p-6 rounded-2xl bg-stone-900/60 border border-amber-900/30 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold font-heading text-amber-200">
              የዋሌት የገንዘብ ገቢና ወጪ ዝርዝር
            </h3>
            <span className="text-xs text-stone-400 font-mono">ጠቅላላ {transactions.length} ዝውውሮች</span>
          </div>

          <div className="divide-y divide-stone-800">
            {transactions.map((tx) => (
              <div key={tx.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl border ${
                    tx.type === 'tithe'
                      ? 'bg-amber-950/60 border-amber-700/40 text-amber-400'
                      : tx.type === 'charity'
                      ? 'bg-emerald-950/60 border-emerald-700/40 text-emerald-400'
                      : 'bg-red-950/60 border-red-700/40 text-red-400'
                  }`}>
                    <ArrowDownRight className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-stone-200">{tx.purposeNote}</p>
                    <p className="text-xs text-stone-400">
                      በ{tx.userName} · ደረሰኝ #{tx.receiptNumber}
                    </p>
                  </div>
                </div>

                <div className="text-right sm:text-right">
                  <p className="text-sm font-bold font-mono text-amber-300 tabular-nums">
                    +{tx.amount.toLocaleString()} ETB
                  </p>
                  <p className="text-[11px] text-stone-500 font-mono">{tx.timestamp} · {tx.paymentMethod}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* View 3: Official Digital Receipt */}
      {activeTab === 'receipt' && lastReceipt && (
        <div className="max-w-md mx-auto p-6 sm:p-8 rounded-3xl bg-stone-950 border-2 border-amber-600/60 shadow-2xl text-center space-y-5">
          
          <div className="w-16 h-16 mx-auto rounded-full bg-amber-950/80 border-2 border-amber-400 flex items-center justify-center text-amber-300">
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
          </div>

          <div>
            <span className="text-[11px] uppercase tracking-widest text-amber-400 font-bold">ይፋዊ የመንፈሳዊ ደረሰኝ</span>
            <h3 className="text-xl font-heading font-bold text-amber-100 mt-1">ቀሲስ ሄኖክ የመንፈሳዊ አገልግሎት</h3>
            <p className="text-xs text-stone-400 font-mono mt-0.5">ደረሰኝ ቁጥር፡ {lastReceipt.receiptNumber}</p>
          </div>

          <div className="p-4 rounded-xl bg-stone-900/80 border border-stone-800 text-left space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-stone-400">የከፋዩ ስም፡</span>
              <span className="font-semibold text-amber-200">{lastReceipt.userName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-400">የስጦታው ዓይነት፡</span>
              <span className="font-semibold text-stone-200">
                {lastReceipt.type === 'tithe' ? 'አስራትና በኩራት' : lastReceipt.type === 'charity' ? 'የድሆች ምጽዋት' : 'የአገልግሎት ድጋፍ'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-400">የተከፈለው መጠን፡</span>
              <span className="font-bold text-amber-300 text-sm font-mono">{lastReceipt.amount.toLocaleString()} ብር</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-400">የክፍያ መንገድ፡</span>
              <span className="font-mono text-stone-300">{lastReceipt.paymentMethod}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-400">ቀንና ሰዓት፡</span>
              <span className="font-mono text-stone-300">{lastReceipt.timestamp}</span>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-900/50 text-xs italic text-amber-200 font-serif">
            "በደስታ የሚሰጠውን እግዚአብሔር ይወዳል፤ የሰጡት አስራትና ምጽዋት በሰማይ በረከት ሆኖ ይጻፍልዎ!"
          </div>

          <button
            onClick={() => window.print()}
            className="w-full py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-200 text-xs font-semibold flex items-center justify-center gap-2 transition"
          >
            <Download className="w-4 h-4 text-amber-400" />
            <span>ደረሰኙን አትም / በፒዲኤፍ አስቀምጥ (Print Receipt)</span>
          </button>

        </div>
      )}

    </div>
  );
};
