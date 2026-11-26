import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  collection,
  query,
  where,
  limit,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import blueprint from '../firebase-blueprint.json';
import {
  UserProfile,
  ConfessionBooking,
  AbatRoomRecord,
  AbatAnnouncementRecord,
  AbatMessageRecord,
} from './types';

export const BOOTSTRAPPED_ADMIN_EMAIL = 'zebeneasfye5@gmail.com';

export const ABAT_COLLECTIONS = {
  admins: 'abat_admins',
  users: 'abat_users',
  rooms: 'abat_rooms',
  schedules: 'abat_schedules',
  announcements: 'abat_announcements',
  messages: 'abat_messages',
} as const;

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Blueprint-Synchronized Sanitization & Validation Helpers ---
const ID_PATTERN = new RegExp(blueprint.entities.AbatUser.properties.uid.pattern);

function clampString(val: unknown, maxLen: number, fallback = ''): string {
  const str = typeof val === 'string' ? val.trim() : fallback;
  return str.slice(0, maxLen);
}

function clampNonEmpty(val: unknown, maxLen: number, fallback: string): string {
  const s = clampString(val, maxLen);
  return s.length > 0 ? s : fallback.slice(0, maxLen);
}

export function sanitizeFirestoreId(rawId: string, fallbackPrefix = 'id'): string {
  const cleaned = (rawId || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  if (cleaned && ID_PATTERN.test(cleaned)) {
    return cleaned;
  }
  return `${fallbackPrefix}_${Date.now()}`.slice(0, 128);
}

export function isFirebaseBootstrappedAdmin(fbUser: FirebaseUser | null | undefined): boolean {
  return Boolean(
    fbUser &&
      fbUser.emailVerified === true &&
      (fbUser.email || '').toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL
  );
}

function toMillis(val: unknown): number {
  if (val instanceof Timestamp) return val.toMillis();
  if (val && typeof (val as any).toMillis === 'function') return (val as any).toMillis();
  return Date.now();
}

const VALID_STAGES = new Set<UserProfile['confessionStage']>(['ጀማሪ', 'መካከለኛ', 'የበረታ/የቆረበ']);

function normalizeStage(stage?: string): UserProfile['confessionStage'] {
  if (stage && VALID_STAGES.has(stage as UserProfile['confessionStage'])) {
    return stage as UserProfile['confessionStage'];
  }
  return 'ጀማሪ';
}

function mapDocToUserProfile(uid: string, data: Record<string, any>): UserProfile {
  return {
    id: uid,
    fullName: String(data.fullName || 'ምዕመን'),
    baptismalName: String(data.baptismalName || data.fullName || 'ምዕመን'),
    phone: String(data.phone || ''),
    email: String(data.email || ''),
    role: data.role === 'admin' || data.role === 'priest' || data.role === 'deacon' ? data.role : 'child',
    confessorPriest: String(data.confessorPriest || 'ቀሲስ ሄኖክ'),
    confessionStage: normalizeStage(data.confessionStage),
    spiritualNotes: typeof data.spiritualNotes === 'string' ? data.spiritualNotes : undefined,
    avatarSeed: String(data.avatarSeed || data.fullName || uid),
    isAuthenticated: true,
  };
}

// --- Google Authentication Actions ---
export async function signInWithGooglePopup(): Promise<UserProfile> {
  const cred = await signInWithPopup(auth, googleProvider);
  const fbUser = cred.user;
  return ensureAbatUserProfile(fbUser);
}

export async function signOutFirebase(): Promise<void> {
  try {
    await signOut(auth);
  } catch (err) {
    console.warn('Firebase signOut notice:', err);
  }
}

// --- abat_users CRUD ---
export async function ensureAbatUserProfile(
  fbUser: FirebaseUser,
  overrides?: Partial<UserProfile>
): Promise<UserProfile> {
  const uid = sanitizeFirestoreId(fbUser.uid, 'user');
  const userPath = `${ABAT_COLLECTIONS.users}/${uid}`;
  const ref = doc(db, ABAT_COLLECTIONS.users, uid);

  let existingSnap;
  try {
    existingSnap = await getDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userPath);
  }

  const userProps = blueprint.entities.AbatUser.properties;

  if (existingSnap.exists()) {
    const data = existingSnap.data();
    return mapDocToUserProfile(uid, data);
  }

  const isAdminEmail = isFirebaseBootstrappedAdmin(fbUser);
  const displayName = clampNonEmpty(
    overrides?.fullName || fbUser.displayName || fbUser.email?.split('@')[0],
    userProps.fullName.maxLength,
    'የንስሐ ልጅ'
  );
  const baptismalName = clampNonEmpty(
    overrides?.baptismalName || displayName,
    userProps.baptismalName.maxLength,
    displayName
  );
  const email = clampNonEmpty(fbUser.email, userProps.email.maxLength, 'member@abat.local');
  const phone = clampString(overrides?.phone || fbUser.phoneNumber || '', userProps.phone.maxLength);
  const role: UserProfile['role'] = isAdminEmail
    ? 'admin'
    : overrides?.role === 'deacon'
    ? 'deacon'
    : 'child';

  const newDoc = {
    uid,
    fullName: displayName,
    baptismalName,
    phone,
    email,
    role,
    confessorPriest: clampString(overrides?.confessorPriest || 'ቀሲስ ሄኖክ', userProps.confessorPriest.maxLength, 'ቀሲስ ሄኖክ'),
    confessionStage: normalizeStage(overrides?.confessionStage),
    avatarSeed: clampString(fbUser.photoURL || displayName, userProps.avatarSeed.maxLength, displayName),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(ref, newDoc);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, userPath);
  }

  return mapDocToUserProfile(uid, newDoc);
}

export async function updateAbatUserProfile(
  fbUser: FirebaseUser,
  updates: Partial<UserProfile>
): Promise<UserProfile> {
  const uid = sanitizeFirestoreId(fbUser.uid, 'user');
  const userPath = `${ABAT_COLLECTIONS.users}/${uid}`;
  const ref = doc(db, ABAT_COLLECTIONS.users, uid);
  const userProps = blueprint.entities.AbatUser.properties;

  // Ensure document exists before update
  const current = await ensureAbatUserProfile(fbUser, updates);

  const patch: Record<string, any> = {
    fullName: clampNonEmpty(updates.fullName ?? current.fullName, userProps.fullName.maxLength, current.fullName),
    baptismalName: clampNonEmpty(
      updates.baptismalName ?? current.baptismalName,
      userProps.baptismalName.maxLength,
      current.baptismalName
    ),
    phone: clampString(updates.phone ?? current.phone, userProps.phone.maxLength),
    confessorPriest: clampString(
      updates.confessorPriest ?? current.confessorPriest,
      userProps.confessorPriest.maxLength,
      'ቀሲስ ሄኖክ'
    ),
    confessionStage: normalizeStage(updates.confessionStage ?? current.confessionStage),
    avatarSeed: clampString(updates.avatarSeed ?? current.avatarSeed, userProps.avatarSeed.maxLength, current.fullName),
    updatedAt: serverTimestamp(),
  };

  if (typeof updates.spiritualNotes === 'string') {
    patch.spiritualNotes = clampString(updates.spiritualNotes, userProps.spiritualNotes.maxLength);
  }

  try {
    await updateDoc(ref, patch);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, userPath);
  }

  return {
    ...current,
    ...patch,
    updatedAt: undefined,
    isAuthenticated: true,
  } as UserProfile;
}

export async function fetchAllAbatUsersForAdmin(): Promise<UserProfile[]> {
  const fbUser = auth.currentUser;
  if (!isFirebaseBootstrappedAdmin(fbUser)) return [];

  try {
    const snap = await getDocs(query(collection(db, ABAT_COLLECTIONS.users), limit(250)));
    return snap.docs.map((d) => mapDocToUserProfile(d.id, d.data()));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, ABAT_COLLECTIONS.users);
  }
}

// --- abat_rooms CRUD & Real-Time Subscription ---
export async function syncAbatRoomMetadata(room: {
  roomId: string;
  title: string;
  roomType: 'assembly' | 'confession' | 'study';
  status: 'live' | 'scheduled' | 'ended';
  visibility: 'community' | 'private';
  qualityPreset: '360p' | '720p' | '1080p';
  participantCount: number;
  hostName: string;
}): Promise<void> {
  const fbUser = auth.currentUser;
  if (!fbUser || !fbUser.emailVerified) return;

  const roomId = sanitizeFirestoreId(room.roomId, 'room');
  const roomPath = `${ABAT_COLLECTIONS.rooms}/${roomId}`;
  const ref = doc(db, ABAT_COLLECTIONS.rooms, roomId);
  const props = blueprint.entities.AbatRoom.properties;
  const boundedCount = Math.max(0, Math.min(50000, Math.round(room.participantCount || 0)));

  let existingSnap;
  try {
    existingSnap = await getDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, roomPath);
  }

  if (existingSnap.exists()) {
    const existingData = existingSnap.data();
    if (existingData.status === 'ended' && !isFirebaseBootstrappedAdmin(fbUser)) {
      return;
    }
    const isHostOrAdmin = existingData.hostUid === fbUser.uid || isFirebaseBootstrappedAdmin(fbUser);
    try {
      if (isHostOrAdmin) {
        await updateDoc(ref, {
          title: clampNonEmpty(room.title, props.title.maxLength, existingData.title || 'የቀጥታ ጉባኤ'),
          hostName: clampNonEmpty(room.hostName, props.hostName.maxLength, existingData.hostName || 'አስተናጋጅ'),
          status: room.status,
          visibility: room.visibility,
          qualityPreset: room.qualityPreset,
          participantCount: boundedCount,
          updatedAt: serverTimestamp(),
        });
      } else if (existingData.visibility === 'community' && existingData.status === 'live') {
        await updateDoc(ref, {
          participantCount: boundedCount,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, roomPath);
    }
    return;
  }

  // Only admins can create 'community' visibility rooms; regular users create 'private' rooms
  if (room.visibility === 'community' && !isFirebaseBootstrappedAdmin(fbUser)) {
    return;
  }

  try {
    await setDoc(ref, {
      roomId,
      title: clampNonEmpty(room.title, props.title.maxLength, 'ታላቁ የጸሎትና የምክር አዳራሽ'),
      hostUid: sanitizeFirestoreId(fbUser.uid, 'host'),
      hostName: clampNonEmpty(room.hostName, props.hostName.maxLength, fbUser.displayName || 'ቀሲስ ሄኖክ'),
      roomType: room.roomType,
      status: room.status,
      visibility: room.visibility,
      qualityPreset: room.qualityPreset,
      participantCount: boundedCount,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, roomPath);
  }
}

export function subscribeAbatRooms(
  onData: (rooms: AbatRoomRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const fbUser = auth.currentUser;
  if (!fbUser || !fbUser.emailVerified) return () => {};

  const q = isFirebaseBootstrappedAdmin(fbUser)
    ? query(collection(db, ABAT_COLLECTIONS.rooms), limit(50))
    : query(collection(db, ABAT_COLLECTIONS.rooms), where('visibility', '==', 'community'), limit(50));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: AbatRoomRecord[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          roomId: String(data.roomId || d.id),
          title: String(data.title || ''),
          hostUid: String(data.hostUid || ''),
          hostName: String(data.hostName || ''),
          roomType: data.roomType || 'assembly',
          status: data.status || 'live',
          visibility: data.visibility || 'community',
          qualityPreset: data.qualityPreset || '360p',
          participantCount: Number(data.participantCount || 0),
        };
      });
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, ABAT_COLLECTIONS.rooms);
      } catch (wrappedErr: any) {
        onError?.(wrappedErr);
      }
    }
  );
}

// --- abat_schedules CRUD & Real-Time Subscription ---
export async function createAbatSchedule(payload: {
  childName: string;
  baptismalName: string;
  phone: string;
  date: string;
  time: string;
  scheduleType?: 'confession' | 'assembly' | 'prayer';
  secretPasscode?: string;
  penanceNotes?: string;
}): Promise<ConfessionBooking> {
  const fbUser = auth.currentUser;
  if (!fbUser || !fbUser.emailVerified) {
    throw new Error('የንስሐ ቀጠሮ በFirestore ለማስቀመጥ በGoogle አካውንት መግባት ያስፈልጋል።');
  }

  const props = blueprint.entities.AbatSchedule.properties;
  const uid = sanitizeFirestoreId(fbUser.uid, 'user');
  const scheduleId = sanitizeFirestoreId(`sch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, 'sch');
  const schedulePath = `${ABAT_COLLECTIONS.schedules}/${scheduleId}`;

  const docData: Record<string, any> = {
    ownerUid: uid,
    childName: clampNonEmpty(payload.childName, props.childName.maxLength, 'ተጠቃሚ'),
    baptismalName: clampNonEmpty(payload.baptismalName, props.baptismalName.maxLength, 'የንስሐ ልጅ'),
    phone: clampString(payload.phone, props.phone.maxLength),
    date: clampNonEmpty(payload.date, props.date.maxLength, new Date().toISOString().slice(0, 10)),
    time: clampNonEmpty(payload.time, props.time.maxLength, '10:00'),
    scheduleType: payload.scheduleType || 'confession',
    status: 'pending',
    secretPasscode: clampString(payload.secretPasscode || String(Math.floor(1000 + Math.random() * 9000)), props.secretPasscode.maxLength),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (payload.penanceNotes && payload.penanceNotes.trim()) {
    docData.penanceNotes = clampString(payload.penanceNotes, props.penanceNotes.maxLength);
  }

  try {
    await setDoc(doc(db, ABAT_COLLECTIONS.schedules, scheduleId), docData);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, schedulePath);
  }

  return {
    id: scheduleId,
    childName: docData.childName,
    baptismalName: docData.baptismalName,
    phone: docData.phone,
    date: docData.date,
    time: docData.time,
    status: 'pending',
    penanceNotes: docData.penanceNotes,
    secretPasscode: docData.secretPasscode,
  };
}

export async function updateAbatScheduleStatus(
  scheduleId: string,
  status: 'confirmed' | 'completed' | 'cancelled'
): Promise<void> {
  const fbUser = auth.currentUser;
  if (!fbUser || !fbUser.emailVerified) return;

  const cleanId = sanitizeFirestoreId(scheduleId, 'sch');
  const schedulePath = `${ABAT_COLLECTIONS.schedules}/${cleanId}`;
  const ref = doc(db, ABAT_COLLECTIONS.schedules, cleanId);

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    await updateDoc(ref, {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, schedulePath);
  }
}

export function subscribeAbatSchedules(
  onData: (bookings: ConfessionBooking[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const fbUser = auth.currentUser;
  if (!fbUser || !fbUser.emailVerified) return () => {};

  const q = isFirebaseBootstrappedAdmin(fbUser)
    ? query(collection(db, ABAT_COLLECTIONS.schedules), limit(200))
    : query(
        collection(db, ABAT_COLLECTIONS.schedules),
        where('ownerUid', '==', sanitizeFirestoreId(fbUser.uid, 'user')),
        limit(100)
      );

  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            childName: String(data.childName || ''),
            baptismalName: String(data.baptismalName || ''),
            phone: String(data.phone || ''),
            date: String(data.date || ''),
            time: String(data.time || ''),
            status: (data.status || 'pending') as ConfessionBooking['status'],
            penanceNotes: typeof data.penanceNotes === 'string' ? data.penanceNotes : undefined,
            secretPasscode: String(data.secretPasscode || ''),
            _createdMs: toMillis(data.createdAt),
          };
        })
        .sort((a, b) => b._createdMs - a._createdMs)
        .map(({ _createdMs: _unused, ...booking }) => booking);
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, ABAT_COLLECTIONS.schedules);
      } catch (wrappedErr: any) {
        onError?.(wrappedErr);
      }
    }
  );
}

// --- abat_announcements CRUD & Real-Time Subscription ---
export async function publishAbatAnnouncement(payload: {
  title: string;
  body: string;
  category: 'general' | 'assembly' | 'fasting' | 'urgent';
  authorName: string;
}): Promise<void> {
  const fbUser = auth.currentUser;
  if (!fbUser || !fbUser.emailVerified) {
    throw new Error('ማስታወቂያ ለመልቀቅ በGoogle አስተዳዳሪ አካውንት መግባት ያስፈልጋል።');
  }

  const props = blueprint.entities.AbatAnnouncement.properties;
  const announcementId = sanitizeFirestoreId(`ann_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, 'ann');
  const path = `${ABAT_COLLECTIONS.announcements}/${announcementId}`;

  try {
    await setDoc(doc(db, ABAT_COLLECTIONS.announcements, announcementId), {
      authorUid: sanitizeFirestoreId(fbUser.uid, 'admin'),
      authorName: clampNonEmpty(payload.authorName, props.authorName.maxLength, 'ቀሲስ ሄኖክ'),
      title: clampNonEmpty(payload.title, props.title.maxLength, 'ማስታወቂያ'),
      body: clampNonEmpty(payload.body, props.body.maxLength, 'መረጃ'),
      category: payload.category || 'general',
      visibility: 'public',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function archiveAbatAnnouncement(announcementId: string): Promise<void> {
  const fbUser = auth.currentUser;
  if (!fbUser || !fbUser.emailVerified) return;

  const cleanId = sanitizeFirestoreId(announcementId, 'ann');
  const path = `${ABAT_COLLECTIONS.announcements}/${cleanId}`;
  try {
    await updateDoc(doc(db, ABAT_COLLECTIONS.announcements, cleanId), {
      visibility: 'archived',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function subscribeAbatAnnouncements(
  onData: (announcements: AbatAnnouncementRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const fbUser = auth.currentUser;
  if (!fbUser || !fbUser.emailVerified) return () => {};

  const q = query(
    collection(db, ABAT_COLLECTIONS.announcements),
    where('visibility', '==', 'public'),
    limit(50)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: AbatAnnouncementRecord[] = snapshot.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            authorUid: String(data.authorUid || ''),
            authorName: String(data.authorName || 'ቀሲስ ሄኖክ'),
            title: String(data.title || ''),
            body: String(data.body || ''),
            category: data.category || 'general',
            visibility: data.visibility || 'public',
            createdAtMs: toMillis(data.createdAt),
          };
        })
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, ABAT_COLLECTIONS.announcements);
      } catch (wrappedErr: any) {
        onError?.(wrappedErr);
      }
    }
  );
}

// --- abat_messages CRUD & Real-Time Subscription ---
export async function sendAbatRoomMessage(payload: {
  roomId: string;
  senderName: string;
  isPriest: boolean;
  text: string;
  timeLabel: string;
}): Promise<void> {
  const fbUser = auth.currentUser;
  if (!fbUser || !fbUser.emailVerified) return;

  const props = blueprint.entities.AbatMessage.properties;
  const cleanRoomId = sanitizeFirestoreId(payload.roomId, 'room');
  const cleanSenderUid = sanitizeFirestoreId(fbUser.uid, 'user');
  const safeIsPriest = Boolean(payload.isPriest) && isFirebaseBootstrappedAdmin(fbUser);

  try {
    await addDoc(collection(db, ABAT_COLLECTIONS.messages), {
      roomId: cleanRoomId,
      senderUid: cleanSenderUid,
      senderName: clampNonEmpty(payload.senderName, props.senderName.maxLength, fbUser.displayName || 'ተሳታፊ'),
      isPriest: safeIsPriest,
      text: clampNonEmpty(payload.text, props.text.maxLength, 'አሜን'),
      timeLabel: clampNonEmpty(payload.timeLabel, props.timeLabel.maxLength, 'አሁን'),
      visibility: 'room',
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, ABAT_COLLECTIONS.messages);
  }
}

export function subscribeAbatRoomMessages(
  roomId: string,
  onData: (messages: AbatMessageRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const fbUser = auth.currentUser;
  if (!fbUser || !fbUser.emailVerified) return () => {};

  const cleanRoomId = sanitizeFirestoreId(roomId, 'room');
  const q = query(
    collection(db, ABAT_COLLECTIONS.messages),
    where('roomId', '==', cleanRoomId),
    where('visibility', '==', 'room'),
    limit(150)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const msgs: AbatMessageRecord[] = snapshot.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            roomId: String(data.roomId || cleanRoomId),
            senderUid: String(data.senderUid || ''),
            senderName: String(data.senderName || 'ተሳታፊ'),
            isPriest: Boolean(data.isPriest),
            text: String(data.text || ''),
            timeLabel: String(data.timeLabel || ''),
            visibility: data.visibility || 'room',
            createdAtMs: toMillis(data.createdAt),
          };
        })
        .sort((a, b) => a.createdAtMs - b.createdAtMs);
      onData(msgs);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, ABAT_COLLECTIONS.messages);
      } catch (wrappedErr: any) {
        onError?.(wrappedErr);
      }
    }
  );
}
