export type UserRole = 'child' | 'priest' | 'admin' | 'deacon';

export interface UserProfile {
  id: string;
  fullName: string;
  baptismalName: string; // የክርስትና ስም
  phone: string;
  email: string;
  role: UserRole;
  confessorPriest: string; // የንስሐ አባት ስም
  confessionStage: 'ጀማሪ' | 'መካከለኛ' | 'የበረታ/የቆረበ';
  spiritualNotes?: string;
  avatarSeed: string;
  isAuthenticated: boolean;
}

export interface ConfessionBooking {
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

export interface AssemblySeat {
  seatNumber: number;
  userName: string;
  baptismalName?: string;
  isMicActive: boolean;
  handRaised: boolean;
  avatarSeed: string;
  role: 'attendee' | 'priest' | 'deacon' | 'cantor';
}

export interface WalletTransaction {
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

export interface WalletState {
  totalBalance: number;
  tithes: number;
  charity: number;
  churchSupport: number;
  withdrawnTotal?: number;
}

export interface BankAccountInfo {
  bankName: string;
  accountHolderName: string;
  accountNumber: string;
  branchName?: string;
  telebirrPhone?: string;
}

export interface MinistryBankAccounts {
  cbeAccount: string;
  cbeHolder: string;
  telebirrPhone: string;
  telebirrName: string;
  awashAccount: string;
  dashenAccount: string;
  abyssiniaAccount: string;
}

export interface OfflinePrayer {
  id: string;
  title: string;
  category: 'ጸሎት' | 'ውዳሴ' | 'ቀኖና' | 'ጾም';
  geezText: string;
  amharicText: string;
  description: string;
}

export interface CommunityEngagement {
  likesCount: number;
  sharesCount: number;
  contactsCount: number;
}

export interface PhoneContactRecord {
  id: string;
  name: string;
  phone: string;
  addedBy: string;
  invitedAt: string;
  note?: string;
}

export interface MemberDirectoryRecord {
  id: string;
  secularName: string;
  spiritualName: string;
  phone: string;
  email: string;
  role: UserRole;
  confessorPriest: string;
  confessionStage: string;
  sources: string[];
  confessionCount: number;
  walletTotalGiven: number;
  lastUpdatedAt: string;
}
