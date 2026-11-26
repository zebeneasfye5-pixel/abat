# Security Specification — `abat_` Firestore Collections

## 1. Data Invariants
1. **Default-Deny Catch-All**: All paths not explicitly matched under `abat_admins`, `abat_users`, `abat_rooms`, `abat_schedules`, `abat_announcements`, and `abat_messages` are unconditionally denied (`allow read, write: if false;`).
2. **Verified Google Identity Only**: Every authenticated read/write requires `request.auth != null && request.auth.token.email_verified == true`.
3. **Bootstrapped Admin & Role Integrity**:
   - The runtime administrator email `zebeneasfye5@gmail.com` is only recognized when `request.auth.token.email_verified == true`.
   - Regular users creating `/abat_users/{userId}` can ONLY assign `role` in `['child', 'deacon']` and CANNOT self-assign `'priest'` or `'admin'`, nor mutate `role`, `uid`, `email`, or `createdAt` on update.
4. **PII Isolation (`abat_users` & `abat_schedules`)**:
   - Email and phone fields live exclusively in `/abat_users/{userId}` and `/abat_schedules/{scheduleId}`.
   - `get` and `list` on `/abat_users` and `/abat_schedules` are strictly limited to the document owner (`uid == request.auth.uid` / `ownerUid == request.auth.uid`) or verified admin; blanket `isSignedIn()` reads are forbidden.
5. **Path Variable Hardening & Boundary Limits**:
   - Every single-doc `get`, `create`, `update`, and `delete` enforces `isValidId(id)` (`^[a-zA-Z0-9_\-]+$`, max 128 chars).
   - Every string field enforces strict `.size()` bounds synchronized verbatim with `firebase-blueprint.json`.
6. **Temporal Integrity & Terminal State Locking**:
   - `createdAt == request.time` on create and `incoming().createdAt == existing().createdAt` on update.
   - `updatedAt == request.time` on create and update.
   - Once an `abat_schedules` entry reaches `'completed'` or `'cancelled'`, non-admin updates are blocked.
7. **Zero-Trust List Queries (No `get()`/`exists()` inside `allow list`)**:
   - Every `allow list` rule evaluates `resource.data` directly (plus token-only `isBootstrappedAdmin()`) with zero database lookups inside `allow list`.

## 2. The "Dirty Dozen" Attack Payloads
1. **Shadow Field Injection on `abat_users` Create**: `{ uid, fullName, ..., ghostAdminFlag: true }` -> `PERMISSION_DENIED`.
2. **Self-Assigned Privilege Escalation on `abat_users` Create**: `{ uid: callerUid, ..., role: "admin" }` from non-admin -> `PERMISSION_DENIED`.
3. **Email Spoofing Attack**: Token with `email: "zebeneasfye5@gmail.com"`, `email_verified: false` reading `abat_users` -> `PERMISSION_DENIED`.
4. **PII Cross-User Read on `abat_users`**: Signed-in user A calling `get(/abat_users/userB)` -> `PERMISSION_DENIED`.
5. **Blanket List Scraping on `abat_users`**: Signed-in user A running `getDocs(collection(db, 'abat_users'))` without `where('uid', '==', userA)` -> `PERMISSION_DENIED`.
6. **Role Escalation via Profile Update**: User A updating `abat_users/userA` with `{ role: "priest", updatedAt: serverTimestamp() }` -> `PERMISSION_DENIED`.
7. **Path ID Poisoning**: Creating `/abat_rooms/invalid$id..with..chars` or >128-char ID -> `PERMISSION_DENIED`.
8. **Value Poisoning / Oversized String in `abat_messages`**: Sending `text` > 1000 chars or numeric `text` -> `PERMISSION_DENIED`.
9. **Identity Spoofing in `abat_messages`**: User A creating a message with `senderUid: "userB"` or `isPriest: true` when not admin -> `PERMISSION_DENIED`.
10. **Client-Forged Timestamp on `abat_schedules`**: Creating schedule with `createdAt: Timestamp.fromMillis(1000)` instead of `serverTimestamp()` -> `PERMISSION_DENIED`.
11. **Terminal State Bypass on `abat_schedules`**: Owner updating a `'completed'` schedule back to `'pending'` -> `PERMISSION_DENIED`.
12. **Unauthorized Announcement Publishing**: Non-admin user creating `/abat_announcements/ann1` -> `PERMISSION_DENIED`.
