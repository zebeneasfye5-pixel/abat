import React, { useState, useEffect } from 'react';
import {
  Wallet,
  ArrowDownRight,
  ArrowUpRight,
  Heart,
  Sparkles,
  CheckCircle2,
  Receipt,
  Download,
  CreditCard,
  ShieldCheck,
  Landmark,
  Copy,
  Check,
  AlertCircle,
  Save,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  WalletState,
  WalletTransaction,
  UserProfile,
  BankAccountInfo,
  MinistryBankAccounts,
} from '../types';
import {
  submitWalletGiving,
  submitWalletWithdrawal,
  saveBankAccountConfig,
} from '../services/api';

interface SpiritualWalletProps {
  user: UserProfile;
  walletState: WalletState;
  transactions: WalletTransaction[];
  ministryBanks?: MinistryBankAccounts;
  userBankAccount?: BankAccountInfo | null;
  onGivingSuccess: (newTx: WalletTransaction, newBal: WalletState) => void;
  onBankConfigUpdated?: (ministryBanks: MinistryBankAccounts, userBankAccount: BankAccountInfo | null) => void;
}

const ETHIOPIAN_BANKS = [
  'CBE (የኢትዮጵያ ንግድ ባንክ)',
  'ቴሌብር (Telebirr)',
  'አዋሽ ባንክ (Awash Bank)',
  'ዳሽን ባንክ (Dashen Bank)',
  'አቢሲኒያ ባንክ (Bank of Abyssinia)',
  'ኦሮሚያ ኅብረት ሥራ ባንክ (Coop Bank)',
  'አማራ ባንክ (Amhara Bank)',
  'ሕብረት ባንክ (Hibret Bank)',
  'ዘመን ባንክ (Zemen Bank)',
];

const DEFAULT_MINISTRY_BANKS: MinistryBankAccounts = {
  cbeAccount: '1000-xxxx-xxxx-xx',
  cbeHolder: 'ቀሲስ ሄኖክ የመንፈሳዊ አገልግሎት',
  telebirrPhone: '09-xxxx-xxxx',
  telebirrName: 'ቀሲስ ሄኖክ',
  awashAccount: '',
  dashenAccount: '',
  abyssiniaAccount: '',
};

export const SpiritualWallet: React.FC<SpiritualWalletProps> = ({
  user,
  walletState,
  transactions,
  ministryBanks,
  userBankAccount,
  onGivingSuccess,
  onBankConfigUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'give' | 'withdraw' | 'bank_setup' | 'transactions' | 'receipt'>('give');

  // Deposit Form State
  const [givingType, setGivingType] = useState<'deposit' | 'tithe' | 'charity' | 'service_support'>('deposit');
  const [amount, setAmount] = useState('1000');
  const [paymentMethod, setPaymentMethod] = useState<'telebirr' | 'cbe_birr' | 'chapa' | 'bank_transfer'>('cbe_birr');
  const [senderBankName, setSenderBankName] = useState(ETHIOPIAN_BANKS[0]);
  const [senderAccountNumber, setSenderAccountNumber] = useState(user.phone || '');
  const [senderHolderName, setSenderHolderName] = useState(user.fullName || '');
  const [bankReference, setBankReference] = useState('');
  const [purposeNote, setPurposeNote] = useState('');

  // Withdrawal Form State
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawBank, setWithdrawBank] = useState(userBankAccount?.bankName || ETHIOPIAN_BANKS[0]);
  const [withdrawAccountNumber, setWithdrawAccountNumber] = useState(userBankAccount?.accountNumber || '');
  const [withdrawHolderName, setWithdrawHolderName] = useState(userBankAccount?.accountHolderName || user.fullName || '');
  const [withdrawNote, setWithdrawNote] = useState('');

  // Bank Setup Form State (Personal + Ministry)
  const [personalBank, setPersonalBank] = useState<BankAccountInfo>({
    bankName: userBankAccount?.bankName || ETHIOPIAN_BANKS[0],
    accountHolderName: userBankAccount?.accountHolderName || user.fullName || '',
    accountNumber: userBankAccount?.accountNumber || '',
    branchName: userBankAccount?.branchName || '',
    telebirrPhone: userBankAccount?.telebirrPhone || user.phone || '',
  });
  const [orgBanks, setOrgBanks] = useState<MinistryBankAccounts>(ministryBanks || DEFAULT_MINISTRY_BANKS);

  // UI feedback states
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [lastReceipt, setLastReceipt] = useState<WalletTransaction | null>(null);
  const [txFilter, setTxFilter] = useState<'all' | 'in' | 'out'>('all');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    if (ministryBanks) {
      setOrgBanks(ministryBanks);
    }
  }, [ministryBanks]);

  useEffect(() => {
    if (userBankAccount) {
      setPersonalBank({
        bankName: userBankAccount.bankName || ETHIOPIAN_BANKS[0],
        accountHolderName: userBankAccount.accountHolderName || user.fullName || '',
        accountNumber: userBankAccount.accountNumber || '',
        branchName: userBankAccount.branchName || '',
        telebirrPhone: userBankAccount.telebirrPhone || user.phone || '',
      });
      if (!withdrawAccountNumber && userBankAccount.accountNumber) {
        setWithdrawBank(userBankAccount.bankName || ETHIOPIAN_BANKS[0]);
        setWithdrawAccountNumber(userBankAccount.accountNumber);
        setWithdrawHolderName(userBankAccount.accountHolderName || user.fullName || '');
      }
    }
  }, [userBankAccount, user.fullName, user.phone]);

  const quickAmounts = ['200', '500', '1000', '2500', '5000', '10000'];

  const copyValue = (key: string, val: string) => {
    navigator.clipboard?.writeText(val).catch(() => {});
    setCopiedField(key);
    setTimeout(() => setCopiedField(null), 1800);
  };

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    const num = Number(amount);
    if (!num || num <= 0) {
      setErrorMsg('እባክዎ ትክክለኛ የገንዘብ መጠን ያስገቡ።');
      return;
    }

    setLoading(true);
    try {
      const defaultNote =
        givingType === 'deposit'
          ? 'የዋሌት ባንክ ገቢ'
          : givingType === 'tithe'
          ? 'የወር አስራትና በኩራት'
          : givingType === 'charity'
          ? 'የችግረኞች ምጽዋት'
          : 'የአገልግሎት ድጋፍ';

      const res = await submitWalletGiving({
        userId: user.id,
        userName: `${user.baptismalName || user.fullName}`,
        type: givingType,
        amount: num,
        paymentMethod,
        bankName: senderBankName,
        accountNumber: senderAccountNumber,
        accountHolderName: senderHolderName || user.fullName,
        referenceNumber: bankReference.trim() || undefined,
        purposeNote: purposeNote.trim() || defaultNote,
      });

      onGivingSuccess(res.transaction, res.newBalance);
      setLastReceipt(res.transaction);
      setBankReference('');
      setPurposeNote('');
      setActiveTab('receipt');

      try {
        confetti({
          particleCount: 70,
          spread: 65,
          origin: { y: 0.6 },
          colors: ['#D4AF37', '#800020', '#10B981'],
        });
      } catch {}
    } catch (err: any) {
      setErrorMsg(err?.message || 'የገንዘብ ገቢው ሊጠናቀቅ አልቻለም።');
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    const num = Number(withdrawAmount);
    if (!num || num <= 0) {
      setErrorMsg('እባክዎ የሚወጣውን የገንዘብ መጠን ያስገቡ።');
      return;
    }
    if (num > walletState.totalBalance) {
      setErrorMsg(`በቂ ቀሪ ሂሳብ የለም! አሁን ያለዎት ቀሪ ሂሳብ ${walletState.totalBalance.toLocaleString()} ብር ነው።`);
      return;
    }
    if (!withdrawAccountNumber.trim() || !withdrawHolderName.trim()) {
      setErrorMsg('የባንክ አካውንት ቁጥር እና የተቀባዩን ሙሉ ስም ያስገቡ።');
      return;
    }

    setLoading(true);
    try {
      const res = await submitWalletWithdrawal({
        userName: `${user.baptismalName || user.fullName}`,
        amount: num,
        bankName: withdrawBank,
        accountNumber: withdrawAccountNumber.trim(),
        accountHolderName: withdrawHolderName.trim(),
        purposeNote: withdrawNote.trim() || `ወደ ${withdrawBank} የተላከ የባንክ ወጪ`,
        paymentMethod: withdrawBank.toLowerCase().includes('telebirr') ? 'telebirr' : 'bank_transfer',
      });

      onGivingSuccess(res.transaction, res.newBalance);
      setLastReceipt(res.transaction);
      setWithdrawAmount('');
      setWithdrawNote('');
      setActiveTab('receipt');
    } catch (err: any) {
      setErrorMsg(err?.message || 'የባንክ ወጪው ሊጠናቀቅ አልቻለም።');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveBankInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);
    try {
      const res = await saveBankAccountConfig({
        userBankAccount: personalBank,
        ministryBanks: orgBanks,
      });
      if (onBankConfigUpdated) {
        onBankConfigUpdated(res.ministryBanks, res.userBankAccount);
      }
      setWithdrawBank(personalBank.bankName);
      setWithdrawAccountNumber(personalBank.accountNumber);
      setWithdrawHolderName(personalBank.accountHolderName);
      setSuccessMsg('የግል እና የመንፈሳዊ አገልግሎት የባንክ አካውንት መረጃዎች በቋሚነት ተቀምጠዋል!');
      setTimeout(() => setSuccessMsg(''), 3500);
    } catch (err: any) {
      setErrorMsg(err?.message || 'የባንክ መረጃውን ማስቀመጥ አልተቻለም።');
    } finally {
      setLoading(false);
    }
  };

  const filteredTransactions = transactions.filter((tx) => {
    if (txFilter === 'out') return tx.type === 'withdrawal';
    if (txFilter === 'in') return tx.type !== 'withdrawal';
    return true;
  });

  const getTxTypeLabel = (type: WalletTransaction['type']) => {
    switch (type) {
      case 'withdrawal':
        return 'የባንክ ወጪ (Withdrawal)';
      case 'deposit':
        return 'የባንክ ገቢ (Deposit)';
      case 'tithe':
        return 'አስራትና በኩራት';
      case 'charity':
        return 'የድሆች ምጽዋት';
      case 'service_support':
        return 'የአገልግሎት ድጋፍ';
      default:
        return 'ዝውውር';
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Wallet Top Header */}
      <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-r from-stone-900 via-amber-950/40 to-stone-900 border border-amber-800/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-950/80 border border-amber-700/50 text-amber-300 text-xs font-medium">
            <Landmark className="w-3.5 h-3.5 text-amber-400" />
            <span>እውነተኛ የባንክ ገቢና ወጪ ዋሌት ሲስተም</span>
          </div>
          <h2 className="text-xl sm:text-3xl font-heading font-bold text-amber-100 mt-2">
            የቀሲስ ሄኖክ መንፈሳዊ ዋሌት እና ባንክ
          </h2>
        </div>

        {/* Balance Summary Card */}
        <div className="p-4 rounded-xl bg-stone-950/85 border border-amber-600/40 text-left sm:text-right min-w-[230px]">
          <p className="text-xs text-stone-400">አሁን ያለው ቀሪ ሂሳብ (Available Balance)</p>
          <p className="text-2xl font-bold font-heading text-amber-300 tabular-nums">
            {walletState.totalBalance.toLocaleString()} <span className="text-xs text-amber-400">ብር (ETB)</span>
          </p>
          <div className="flex items-center sm:justify-end gap-3 mt-1 text-[11px]">
            <span className="text-emerald-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>የወጣ: {(walletState.withdrawnTotal || 0).toLocaleString()} ብር</span>
            </span>
          </div>
        </div>
      </div>

      {/* 3 Fund Categories Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-stone-900/60 border border-amber-800/30 flex items-center gap-3">
          <div className="p-3 rounded-lg bg-amber-950/70 border border-amber-700/40 text-amber-400 shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-stone-400">አስራትና በኩራት</p>
            <p className="text-lg font-bold font-heading text-amber-200 tabular-nums">
              {walletState.tithes.toLocaleString()} ብር
            </p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-stone-900/60 border border-amber-800/30 flex items-center gap-3">
          <div className="p-3 rounded-lg bg-emerald-950/70 border border-emerald-700/40 text-emerald-400 shrink-0">
            <Heart className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-stone-400">የበጎ አድራጎትና የችግረኞች ፈንድ</p>
            <p className="text-lg font-bold font-heading text-emerald-300 tabular-nums">
              {walletState.charity.toLocaleString()} ብር
            </p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-stone-900/60 border border-amber-800/30 flex items-center gap-3">
          <div className="p-3 rounded-lg bg-red-950/70 border border-red-700/40 text-red-400 shrink-0">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-stone-400">የአዳራሽና የአገልግሎት ድጋፍ</p>
            <p className="text-lg font-bold font-heading text-amber-200 tabular-nums">
              {walletState.churchSupport.toLocaleString()} ብር
            </p>
          </div>
        </div>
      </div>

      {/* Status Alerts */}
      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-red-950/70 border border-red-700 text-xs text-red-200 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-950/70 border border-emerald-700 text-xs text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Sub-Navigation Tabs */}
      <div className="flex overflow-x-auto border-b border-stone-800 gap-4 sm:gap-6 text-xs sm:text-sm font-medium pb-0.5">
        <button
          onClick={() => { setActiveTab('give'); setErrorMsg(''); }}
          className={`pb-3 whitespace-nowrap flex items-center gap-1.5 transition-colors ${
            activeTab === 'give'
              ? 'text-emerald-300 border-b-2 border-emerald-400 font-bold'
              : 'text-stone-400 hover:text-stone-200'
          }`}
        >
          <ArrowDownRight className="w-4 h-4" />
          <span>ገቢ አድርግ (Deposit)</span>
        </button>

        <button
          onClick={() => { setActiveTab('withdraw'); setErrorMsg(''); }}
          className={`pb-3 whitespace-nowrap flex items-center gap-1.5 transition-colors ${
            activeTab === 'withdraw'
              ? 'text-red-300 border-b-2 border-red-400 font-bold'
              : 'text-stone-400 hover:text-stone-200'
          }`}
        >
          <ArrowUpRight className="w-4 h-4" />
          <span>ወጪ አድርግ (Withdraw)</span>
        </button>

        <button
          onClick={() => { setActiveTab('bank_setup'); setErrorMsg(''); }}
          className={`pb-3 whitespace-nowrap flex items-center gap-1.5 transition-colors ${
            activeTab === 'bank_setup'
              ? 'text-amber-300 border-b-2 border-amber-400 font-bold'
              : 'text-stone-400 hover:text-stone-200'
          }`}
        >
          <Landmark className="w-4 h-4" />
          <span>የባንክ መረጃ መሙሊያ ፎርም</span>
        </button>

        <button
          onClick={() => { setActiveTab('transactions'); setErrorMsg(''); }}
          className={`pb-3 whitespace-nowrap transition-colors ${
            activeTab === 'transactions'
              ? 'text-amber-300 border-b-2 border-amber-400 font-bold'
              : 'text-stone-400 hover:text-stone-200'
          }`}
        >
          የገቢና ወጪ ታሪክ ({transactions.length})
        </button>

        {lastReceipt && (
          <button
            onClick={() => setActiveTab('receipt')}
            className={`pb-3 whitespace-nowrap flex items-center gap-1.5 transition-colors ${
              activeTab === 'receipt'
                ? 'text-amber-300 border-b-2 border-amber-400 font-bold'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <Receipt className="w-4 h-4 text-amber-400" />
            <span>ደረሰኝ</span>
          </button>
        )}
      </div>

      {/* VIEW 1: DEPOSIT / GIVE */}
      {activeTab === 'give' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form onSubmit={handleDeposit} className="lg:col-span-7 p-5 sm:p-6 rounded-2xl bg-stone-900/60 border border-amber-900/30 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-amber-200 mb-2">
                ፩. የገቢው ዓይነት (Deposit Category)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: 'deposit', label: 'የዋሌት ገቢ' },
                  { id: 'tithe', label: 'አስራትና በኩራት' },
                  { id: 'charity', label: 'የድሆች ምጽዋት' },
                  { id: 'service_support', label: 'የአገልግሎት ድጋፍ' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setGivingType(t.id as any)}
                    className={`py-2 px-2.5 rounded-xl text-xs font-medium border transition-all ${
                      givingType === t.id
                        ? 'bg-emerald-950/80 border-emerald-500 text-emerald-200 font-bold'
                        : 'bg-stone-950 border-stone-800 text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-amber-200 mb-2">
                ፪. የገቢ መጠን (ብር - ETB)
              </label>
              <input
                type="number"
                min="1"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="የገንዘብ መጠን ያስገቡ..."
                className="w-full bg-stone-950 border border-stone-700 rounded-xl px-4 py-3 text-lg font-bold font-mono text-emerald-300 focus:outline-none focus:border-emerald-500"
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-amber-200 mb-1">
                  ፫. የላኩበት ባንክ / ዋሌት
                </label>
                <select
                  value={senderBankName}
                  onChange={(e) => {
                    const b = e.target.value;
                    setSenderBankName(b);
                    if (b.includes('Telebirr') || b.includes('ቴሌብር')) setPaymentMethod('telebirr');
                    else if (b.includes('CBE')) setPaymentMethod('cbe_birr');
                    else setPaymentMethod('bank_transfer');
                  }}
                  className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2.5 text-xs text-stone-100 focus:outline-none focus:border-amber-500"
                >
                  {ETHIOPIAN_BANKS.map((bank) => (
                    <option key={bank} value={bank}>
                      {bank}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-amber-200 mb-1">
                  ፬. የላኪው አካውንት ወይም ስልክ ቁጥር
                </label>
                <input
                  type="text"
                  required
                  value={senderAccountNumber}
                  onChange={(e) => setSenderAccountNumber(e.target.value)}
                  placeholder="1000... ወይም 09..."
                  className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2.5 text-xs text-stone-100 focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-amber-200 mb-1">
                  ፭. የላኪው ስም (Sender Name)
                </label>
                <input
                  type="text"
                  required
                  value={senderHolderName}
                  onChange={(e) => setSenderHolderName(e.target.value)}
                  placeholder="ሙሉ ስም..."
                  className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2.5 text-xs text-stone-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-amber-200 mb-1">
                  ፮. የባንክ ደረሰኝ ቁጥር / Reference ID
                </label>
                <input
                  type="text"
                  value={bankReference}
                  onChange={(e) => setBankReference(e.target.value)}
                  placeholder="ለምሳሌ፡ FT24113XYZ..."
                  className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2.5 text-xs text-stone-100 focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-amber-200 mb-1">
                ፯. የገቢ ማስታወሻ / የጸሎት ዓላማ (አማራጭ)
              </label>
              <input
                type="text"
                value={purposeNote}
                onChange={(e) => setPurposeNote(e.target.value)}
                placeholder="ለምሳሌ፡ የወር አስራት፣ ስለ ቤተሰብ ሰላም..."
                className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3.5 py-2.5 text-xs text-stone-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-900 via-amber-900 to-emerald-900 border border-amber-500/50 text-white font-bold text-sm shadow-xl hover:scale-[1.01] transition-all disabled:opacity-50"
            >
              {loading ? 'ገቢው እየተመዘገበ ነው...' : `${Number(amount || 0).toLocaleString()} ብር ገቢ አረጋግጥ (Confirm Deposit)`}
            </button>
          </form>

          {/* Right: Receiving Ministry Bank Accounts */}
          <div className="lg:col-span-5 space-y-4">
            <div className="p-5 rounded-2xl bg-stone-900/60 border border-amber-800/40 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold font-heading text-amber-200 flex items-center gap-2">
                  <Landmark className="w-4 h-4 text-amber-400" />
                  <span>ገቢ የሚደረግባቸው የባንክ አካውንቶች</span>
                </h4>
                <button
                  type="button"
                  onClick={() => setActiveTab('bank_setup')}
                  className="text-[11px] text-amber-400 hover:underline"
                >
                  አካውንት ቀይር →
                </button>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="p-3 rounded-xl bg-stone-950 border border-stone-800 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-amber-300 font-semibold">የኢትዮጵያ ንግድ ባንክ (CBE)</p>
                    <p className="font-mono text-stone-200 text-sm mt-0.5">{orgBanks.cbeAccount}</p>
                    <p className="text-stone-400 text-[11px]">{orgBanks.cbeHolder}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyValue('cbe', orgBanks.cbeAccount)}
                    className="p-2 rounded-lg bg-stone-900 border border-stone-700 text-amber-300 hover:text-white"
                    title="ቅዳ"
                  >
                    {copiedField === 'cbe' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>

                <div className="p-3 rounded-xl bg-stone-950 border border-stone-800 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-emerald-300 font-semibold">ቴሌብር (Telebirr)</p>
                    <p className="font-mono text-stone-200 text-sm mt-0.5">{orgBanks.telebirrPhone}</p>
                    <p className="text-stone-400 text-[11px]">{orgBanks.telebirrName}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyValue('telebirr', orgBanks.telebirrPhone)}
                    className="p-2 rounded-lg bg-stone-900 border border-stone-700 text-emerald-300 hover:text-white"
                    title="ቅዳ"
                  >
                    {copiedField === 'telebirr' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>

                {orgBanks.awashAccount && (
                  <div className="p-3 rounded-xl bg-stone-950 border border-stone-800 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-blue-300 font-semibold">አዋሽ ባንክ (Awash Bank)</p>
                      <p className="font-mono text-stone-200 text-sm mt-0.5">{orgBanks.awashAccount}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyValue('awash', orgBanks.awashAccount)}
                      className="p-2 rounded-lg bg-stone-900 border border-stone-700 text-amber-300"
                    >
                      {copiedField === 'awash' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                )}

                {orgBanks.dashenAccount && (
                  <div className="p-3 rounded-xl bg-stone-950 border border-stone-800 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-purple-300 font-semibold">ዳሽን ባንክ (Dashen Bank)</p>
                      <p className="font-mono text-stone-200 text-sm mt-0.5">{orgBanks.dashenAccount}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyValue('dashen', orgBanks.dashenAccount)}
                      className="p-2 rounded-lg bg-stone-900 border border-stone-700 text-amber-300"
                    >
                      {copiedField === 'dashen' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                )}

                {orgBanks.abyssiniaAccount && (
                  <div className="p-3 rounded-xl bg-stone-950 border border-stone-800 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-amber-300 font-semibold">አቢሲኒያ ባንክ (Bank of Abyssinia)</p>
                      <p className="font-mono text-stone-200 text-sm mt-0.5">{orgBanks.abyssiniaAccount}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyValue('abyssinia', orgBanks.abyssiniaAccount)}
                      className="p-2 rounded-lg bg-stone-900 border border-stone-700 text-amber-300"
                    >
                      {copiedField === 'abyssinia' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-stone-900/60 border border-stone-800 text-xs text-stone-300 space-y-1.5">
              <p className="font-semibold text-amber-200 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>የባንክ ገቢ ማረጋገጫ ሂደት</span>
              </p>
              <p className="text-stone-400 leading-relaxed">
                ከላይ ካሉት አካውንቶች በአንዱ ገንዘብ ከላኩ በኋላ በግራ በኩል ያለውን ፎርም ሞልተው ሲያረጋግጡ በዋሌቱ ሒሳብ ውስጥ በቋሚነት ይመዘገባል፤ ዲጂታል ደረሰኝም ወዲያው ይሰጥዎታል።
              </p>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: WITHDRAW TO BANK */}
      {activeTab === 'withdraw' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form onSubmit={handleWithdraw} className="lg:col-span-7 p-5 sm:p-6 rounded-2xl bg-stone-900/60 border border-red-900/40 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-800">
              <div>
                <h3 className="text-base font-heading font-bold text-amber-100">ከዋሌት ወደ ባንክ ወጪ ማድረጊያ ፎርም</h3>
                <p className="text-xs text-stone-400">የተሰበሰበውን ገንዘብ ወደ ባንክ አካውንት ወይም ቴሌብር በቀጥታ ወጪ ያድርጉ</p>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-stone-400 block">ሊወጣ የሚችል ቀሪ</span>
                <span className="text-sm font-bold font-mono text-emerald-300">
                  {walletState.totalBalance.toLocaleString()} ብር
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-amber-200 mb-1.5">
                ፩. የሚወጣው የገንዘብ መጠን (ብር - ETB)
              </label>
              <input
                type="number"
                min="1"
                max={Math.max(1, walletState.totalBalance)}
                required
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="የሚወጣውን መጠን ያስገቡ..."
                className="w-full bg-stone-950 border border-stone-700 rounded-xl px-4 py-3 text-lg font-bold font-mono text-red-300 focus:outline-none focus:border-red-500"
              />
              {walletState.totalBalance > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {[0.25, 0.5, 1].map((pct) => {
                    const val = Math.floor(walletState.totalBalance * pct);
                    return (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setWithdrawAmount(String(val))}
                        className="px-3 py-1 rounded-lg bg-stone-950 border border-stone-800 text-xs text-stone-300 hover:border-red-500 hover:text-red-200 transition"
                      >
                        {pct === 1 ? 'ሙሉውን (100%)' : `${pct * 100}% (${val.toLocaleString()} ብር)`}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-amber-200 mb-1">
                  ፪. መቀበያ ባንክ ይምረጡ
                </label>
                <select
                  value={withdrawBank}
                  onChange={(e) => setWithdrawBank(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2.5 text-xs text-stone-100 focus:outline-none focus:border-amber-500"
                >
                  {ETHIOPIAN_BANKS.map((bank) => (
                    <option key={bank} value={bank}>
                      {bank}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-amber-200 mb-1">
                  ፫. የባንክ አካውንት ቁጥር / ቴሌብር
                </label>
                <input
                  type="text"
                  required
                  value={withdrawAccountNumber}
                  onChange={(e) => setWithdrawAccountNumber(e.target.value)}
                  placeholder="1000... ወይም 09..."
                  className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2.5 text-xs text-stone-100 font-mono focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-amber-200 mb-1">
                ፬. የተቀባዩ ሙሉ ስም (Account Holder Name)
              </label>
              <input
                type="text"
                required
                value={withdrawHolderName}
                onChange={(e) => setWithdrawHolderName(e.target.value)}
                placeholder="በባንኩ ላይ የተመዘገበው ሙሉ ስም..."
                className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3.5 py-2.5 text-xs text-stone-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-amber-200 mb-1">
                ፭. የወጪው ምክንያት / ዝርዝር (Purpose of Withdrawal)
              </label>
              <input
                type="text"
                value={withdrawNote}
                onChange={(e) => setWithdrawNote(e.target.value)}
                placeholder="ለምሳሌ፡ ለድሆች መርጃ፣ ለቤተክርስቲያን ሥራ፣ ለግል ወጪ..."
                className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3.5 py-2.5 text-xs text-stone-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading || walletState.totalBalance <= 0}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-red-900 via-amber-900 to-red-900 border border-red-500/50 text-white font-bold text-sm shadow-xl hover:scale-[1.01] transition-all disabled:opacity-50"
            >
              {loading
                ? 'የባንክ ወጪው እየተላከ ነው...'
                : walletState.totalBalance <= 0
                ? 'መጀመሪያ ገንዘብ ገቢ ያድርጉ (ቀሪ ሂሳብ 0 ነው)'
                : `${Number(withdrawAmount || 0).toLocaleString()} ብር ወደ ባንክ ወጪ አድርግ (Withdraw)`}
            </button>
          </form>

          <div className="lg:col-span-5 space-y-4">
            <div className="p-5 rounded-2xl bg-stone-900/60 border border-stone-800 space-y-3 text-xs">
              <h4 className="text-sm font-semibold font-heading text-amber-200">የተቀመጠ የግል ባንክ አካውንትዎ</h4>
              {personalBank.accountNumber ? (
                <div className="p-3.5 rounded-xl bg-stone-950 border border-amber-800/40 space-y-1.5">
                  <p className="font-bold text-amber-200">{personalBank.bankName}</p>
                  <p className="font-mono text-stone-100 text-sm">{personalBank.accountNumber}</p>
                  <p className="text-stone-400">ባለቤት፡ {personalBank.accountHolderName}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setWithdrawBank(personalBank.bankName);
                      setWithdrawAccountNumber(personalBank.accountNumber);
                      setWithdrawHolderName(personalBank.accountHolderName);
                    }}
                    className="mt-2 px-3 py-1.5 rounded-lg bg-amber-950 border border-amber-700 text-amber-200 font-semibold hover:bg-amber-900 transition"
                  >
                    ይህን አካውንት በፎርሙ ላይ ሙላ
                  </button>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-stone-950 border border-stone-800 space-y-2 text-stone-400">
                  <p>እስካሁን የግል የባንክ አካውንት አላስቀመጡም።</p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('bank_setup')}
                    className="px-3 py-1.5 rounded-lg bg-amber-950 border border-amber-700 text-amber-200 font-semibold"
                  >
                    የባንክ መረጃ መሙሊያ ፎርም ክፈት →
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: BANK ACCOUNT SETUP FORM */}
      {activeTab === 'bank_setup' && (
        <form onSubmit={handleSaveBankInfo} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Card 1: Personal Bank Account Form */}
          <div className="p-5 sm:p-6 rounded-2xl bg-stone-900/60 border border-amber-800/40 space-y-4">
            <div className="border-b border-stone-800 pb-3">
              <h3 className="text-base font-heading font-bold text-amber-200 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-amber-400" />
                <span>የግል የባንክ አካውንት መረጃ (ለወጪ መቀበያ)</span>
              </h3>
              <p className="text-xs text-stone-400 mt-0.5">
                ገንዘብ ወጪ በሚያደርጉበት ጊዜ በራስ-ሰር የሚሞላ የባንክ መረጃ
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-stone-300 font-semibold mb-1">የባንኩ ስም</label>
                <select
                  value={personalBank.bankName}
                  onChange={(e) => setPersonalBank({ ...personalBank, bankName: e.target.value })}
                  className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2.5 text-stone-100"
                >
                  {ETHIOPIAN_BANKS.map((bank) => (
                    <option key={bank} value={bank}>{bank}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-stone-300 font-semibold mb-1">የአካውንት ባለቤት ሙሉ ስም</label>
                <input
                  type="text"
                  value={personalBank.accountHolderName}
                  onChange={(e) => setPersonalBank({ ...personalBank, accountHolderName: e.target.value })}
                  placeholder="ሙሉ ስም..."
                  className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2.5 text-stone-100"
                />
              </div>

              <div>
                <label className="block text-stone-300 font-semibold mb-1">የባንክ አካውንት ቁጥር</label>
                <input
                  type="text"
                  value={personalBank.accountNumber}
                  onChange={(e) => setPersonalBank({ ...personalBank, accountNumber: e.target.value })}
                  placeholder="ለምሳሌ፡ 1000123456789"
                  className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2.5 text-stone-100 font-mono"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-300 font-semibold mb-1">ቅርንጫፍ (Branch - አማራጭ)</label>
                  <input
                    type="text"
                    value={personalBank.branchName || ''}
                    onChange={(e) => setPersonalBank({ ...personalBank, branchName: e.target.value })}
                    placeholder="ለምሳሌ፡ ቦሌ / አራዳ"
                    className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2.5 text-stone-100"
                  />
                </div>
                <div>
                  <label className="block text-stone-300 font-semibold mb-1">የቴሌብር ስልክ ቁጥር</label>
                  <input
                    type="tel"
                    value={personalBank.telebirrPhone || ''}
                    onChange={(e) => setPersonalBank({ ...personalBank, telebirrPhone: e.target.value })}
                    placeholder="09..."
                    className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2.5 text-stone-100 font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Ministry / Receiving Bank Accounts Form */}
          <div className="p-5 sm:p-6 rounded-2xl bg-stone-900/60 border border-emerald-800/40 space-y-4">
            <div className="border-b border-stone-800 pb-3">
              <h3 className="text-base font-heading font-bold text-emerald-200 flex items-center gap-2">
                <Landmark className="w-4 h-4 text-emerald-400" />
                <span>የአገልግሎቱ መቀበያ ባንክ አካውንቶች (ለገቢ መቀበያ)</span>
              </h3>
              <p className="text-xs text-stone-400 mt-0.5">
                ተጠቃሚዎች አስራትና ገቢ ሲልኩ የሚጠቀሙባቸው ትክክለኛ የባንክ ቁጥሮች
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-300 font-semibold mb-1">የንግድ ባንክ (CBE) አካውንት ቁጥር</label>
                  <input
                    type="text"
                    value={orgBanks.cbeAccount}
                    onChange={(e) => setOrgBanks({ ...orgBanks, cbeAccount: e.target.value })}
                    placeholder="1000..."
                    className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2.5 text-stone-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-stone-300 font-semibold mb-1">የCBE አካውንት ስም</label>
                  <input
                    type="text"
                    value={orgBanks.cbeHolder}
                    onChange={(e) => setOrgBanks({ ...orgBanks, cbeHolder: e.target.value })}
                    className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2.5 text-stone-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-300 font-semibold mb-1">የቴሌብር ቁጥር (Telebirr)</label>
                  <input
                    type="text"
                    value={orgBanks.telebirrPhone}
                    onChange={(e) => setOrgBanks({ ...orgBanks, telebirrPhone: e.target.value })}
                    placeholder="09..."
                    className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2.5 text-stone-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-stone-300 font-semibold mb-1">የቴሌብር ስም</label>
                  <input
                    type="text"
                    value={orgBanks.telebirrName}
                    onChange={(e) => setOrgBanks({ ...orgBanks, telebirrName: e.target.value })}
                    className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2.5 text-stone-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-stone-300 font-semibold mb-1">አዋሽ ባንክ (Awash)</label>
                  <input
                    type="text"
                    value={orgBanks.awashAccount}
                    onChange={(e) => setOrgBanks({ ...orgBanks, awashAccount: e.target.value })}
                    placeholder="አካውንት ቁጥር..."
                    className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2.5 text-stone-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-stone-300 font-semibold mb-1">ዳሽን ባንክ (Dashen)</label>
                  <input
                    type="text"
                    value={orgBanks.dashenAccount}
                    onChange={(e) => setOrgBanks({ ...orgBanks, dashenAccount: e.target.value })}
                    placeholder="አካውንት ቁጥር..."
                    className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2.5 text-stone-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-stone-300 font-semibold mb-1">አቢሲኒያ ባንክ (BOA)</label>
                  <input
                    type="text"
                    value={orgBanks.abyssiniaAccount}
                    onChange={(e) => setOrgBanks({ ...orgBanks, abyssiniaAccount: e.target.value })}
                    placeholder="አካውንት ቁጥር..."
                    className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2.5 text-stone-100 font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-800 via-amber-700 to-amber-800 border border-amber-400/60 text-white font-bold text-sm flex items-center justify-center gap-2 hover:brightness-110 transition disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{loading ? 'በማስቀመጥ ላይ...' : 'ሁሉንም የባንክ መረጃዎች በቋሚነት አስቀምጥ (Save Bank Info)'}</span>
            </button>
          </div>
        </form>
      )}

      {/* VIEW 4: TRANSACTION HISTORY */}
      {activeTab === 'transactions' && (
        <div className="p-5 sm:p-6 rounded-2xl bg-stone-900/60 border border-amber-900/30 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-base font-semibold font-heading text-amber-200">
              የባንክ ገቢና ወጪ ዝርዝር ({filteredTransactions.length})
            </h3>
            <div className="flex gap-1.5 text-xs">
              {[
                { id: 'all', label: 'ሁሉም' },
                { id: 'in', label: 'ገቢ (+)' },
                { id: 'out', label: 'ወጪ (-)' },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setTxFilter(f.id as any)}
                  className={`px-3 py-1 rounded-lg border transition ${
                    txFilter === f.id
                      ? 'bg-amber-950 border-amber-500 text-amber-200 font-bold'
                      : 'bg-stone-950 border-stone-800 text-stone-400'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {filteredTransactions.length === 0 ? (
            <div className="p-8 text-center text-xs text-stone-400 border border-stone-800 rounded-xl bg-stone-950/60">
              እስካሁን የተመዘገበ የገቢ ወይም የወጪ ዝውውር የለም።
            </div>
          ) : (
            <div className="divide-y divide-stone-800">
              {filteredTransactions.map((tx) => {
                const isWithdrawal = tx.type === 'withdrawal';
                return (
                  <div
                    key={tx.id}
                    onClick={() => { setLastReceipt(tx); setActiveTab('receipt'); }}
                    className="py-3.5 px-2 hover:bg-stone-900/80 rounded-xl cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2.5 rounded-xl border ${
                          isWithdrawal
                            ? 'bg-red-950/70 border-red-600/50 text-red-400'
                            : 'bg-emerald-950/70 border-emerald-600/50 text-emerald-400'
                        }`}
                      >
                        {isWithdrawal ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-stone-100">{tx.purposeNote}</p>
                        <p className="text-xs text-stone-400">
                          {getTxTypeLabel(tx.type)} · {tx.bankName || tx.paymentMethod}
                          {tx.accountNumber ? ` (${tx.accountNumber})` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="text-left sm:text-right">
                      <p
                        className={`text-sm font-bold font-mono tabular-nums ${
                          isWithdrawal ? 'text-red-400' : 'text-emerald-400'
                        }`}
                      >
                        {isWithdrawal ? '-' : '+'}{tx.amount.toLocaleString()} ETB
                      </p>
                      <p className="text-[11px] text-stone-500 font-mono">
                        {tx.timestamp} · #{tx.receiptNumber}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW 5: OFFICIAL DIGITAL RECEIPT / VOUCHER */}
      {activeTab === 'receipt' && lastReceipt && (
        <div className="max-w-md mx-auto p-6 sm:p-8 rounded-3xl bg-stone-950 border-2 border-amber-600/60 shadow-2xl text-center space-y-5">
          <div className="w-16 h-16 mx-auto rounded-full bg-amber-950/80 border-2 border-amber-400 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
          </div>

          <div>
            <span className="text-[11px] uppercase tracking-widest text-amber-400 font-bold">
              {lastReceipt.type === 'withdrawal' ? 'ይፋዊ የባንክ ወጪ ማረጋገጫ (Withdrawal Voucher)' : 'ይፋዊ የባንክ ገቢ ደረሰኝ (Deposit Receipt)'}
            </span>
            <h3 className="text-xl font-heading font-bold text-amber-100 mt-1">ቀሲስ ሄኖክ የመንፈሳዊ አገልግሎት</h3>
            <p className="text-xs text-stone-400 font-mono mt-0.5">ደረሰኝ ቁጥር፡ {lastReceipt.receiptNumber}</p>
          </div>

          <div className="p-4 rounded-xl bg-stone-900/80 border border-stone-800 text-left space-y-2 text-xs">
            <div className="flex justify-between gap-2">
              <span className="text-stone-400">ስም / ተቀባይ፡</span>
              <span className="font-semibold text-amber-200 text-right">
                {lastReceipt.accountHolderName || lastReceipt.userName}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-stone-400">የዝውውሩ ዓይነት፡</span>
              <span className="font-semibold text-stone-200">{getTxTypeLabel(lastReceipt.type)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-stone-400">የገንዘብ መጠን፡</span>
              <span className={`font-bold text-sm font-mono ${lastReceipt.type === 'withdrawal' ? 'text-red-300' : 'text-emerald-300'}`}>
                {lastReceipt.type === 'withdrawal' ? '-' : '+'}{lastReceipt.amount.toLocaleString()} ብር
              </span>
            </div>
            {lastReceipt.bankName && (
              <div className="flex justify-between gap-2">
                <span className="text-stone-400">ባንክ፡</span>
                <span className="text-stone-200 text-right">{lastReceipt.bankName}</span>
              </div>
            )}
            {lastReceipt.accountNumber && (
              <div className="flex justify-between gap-2">
                <span className="text-stone-400">አካውንት / ስልክ፡</span>
                <span className="font-mono text-stone-200">{lastReceipt.accountNumber}</span>
              </div>
            )}
            {lastReceipt.referenceNumber && (
              <div className="flex justify-between gap-2">
                <span className="text-stone-400">ማረጋገጫ ቁጥር (Ref)፡</span>
                <span className="font-mono text-amber-300">{lastReceipt.referenceNumber}</span>
              </div>
            )}
            <div className="flex justify-between gap-2">
              <span className="text-stone-400">ቀንና ሰዓት፡</span>
              <span className="font-mono text-stone-300">{lastReceipt.timestamp}</span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              className="flex-1 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-200 text-xs font-semibold flex items-center justify-center gap-2 transition"
            >
              <Download className="w-4 h-4 text-amber-400" />
              <span>አትም / PDF አስቀምጥ</span>
            </button>
            <button
              onClick={() => setActiveTab('transactions')}
              className="px-4 py-2.5 rounded-xl bg-amber-950 border border-amber-700 text-amber-200 text-xs font-semibold"
            >
              ወደ ታሪክ ተመለስ
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
