import React, { useEffect, useState } from 'react';
import {
  X,
  UserPlus,
  Phone,
  Users,
  Send,
  Copy,
  Check,
  Trash2,
  Share2,
  Heart,
  Smartphone,
  MessageCircle,
} from 'lucide-react';
import { CommunityEngagement, PhoneContactRecord, UserProfile } from '../types';
import {
  addPhoneContacts,
  deleteSavedContact,
  fetchSavedContacts,
  recordWebsiteShare,
} from '../services/api';

interface CommunityInviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  engagement: CommunityEngagement;
  onEngagementChange: (next: CommunityEngagement) => void;
  onShareSite: () => Promise<void>;
}

export const CommunityInviteModal: React.FC<CommunityInviteModalProps> = ({
  isOpen,
  onClose,
  user,
  engagement,
  onEngagementChange,
  onShareSite,
}) => {
  const [contacts, setContacts] = useState<PhoneContactRecord[]>([]);
  const [nameInput, setNameInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [bulkInput, setBulkInput] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const supportsContactPicker =
    typeof navigator !== 'undefined' &&
    'contacts' in navigator &&
    typeof (navigator as any).contacts?.select === 'function';

  useEffect(() => {
    if (!isOpen) return;
    fetchSavedContacts().then(setContacts);
  }, [isOpen]);

  if (!isOpen) return null;

  const addedByName = user.baptismalName || user.fullName || 'የማኅበሩ አባል';

  const buildInviteLink = (contact?: PhoneContactRecord) => {
    const base = window.location.origin;
    if (!contact) return base;
    const params = new URLSearchParams();
    if (contact.name) params.set('inviteName', contact.name);
    if (contact.phone) params.set('invitePhone', contact.phone);
    return `${base}/?${params.toString()}`;
  };

  const buildInviteMessage = (contact?: PhoneContactRecord) => {
    const link = buildInviteLink(contact);
    return `ሰላም ${contact?.name || 'ወዳጄ'}! የ"ቀሲስ ሄኖክ" የኦርቶዶክስ መንፈሳዊ ጉባኤ፣ የቀጥታ ቪዲዮ ትምህርት፣ የንስሐ ሚስጥር ቤት እና የኤአይ እውቀት ማህደር ድህረገፅ ተከፍቷል። በዚህ ሊንክ ይግቡና አብረን እንሳተፍ: ${link}`;
  };

  const handlePickFromPhone = async () => {
    setStatusMsg(null);
    try {
      const selected: Array<{ name?: string[]; tel?: string[] }> = await (
        navigator as any
      ).contacts.select(['name', 'tel'], { multiple: true });

      if (!selected || selected.length === 0) return;

      const normalized = selected
        .map((c) => ({
          name: (c.name && c.name[0]) || '',
          phone: (c.tel && c.tel[0]) || '',
        }))
        .filter((c) => c.phone || c.name);

      if (normalized.length === 0) {
        setStatusMsg('የተመረጡት ሰዎች ስልክ ቁጥር የላቸውም።');
        return;
      }

      setSaving(true);
      const res = await addPhoneContacts(normalized, addedByName);
      setContacts(res.contacts);
      onEngagementChange({ ...engagement, contactsCount: res.contacts.length });
      setStatusMsg(`${res.addedCount} ሰዎች ከስልክዎ ወደ ድህረገፁ በተሳካ ሁኔታ ተጨምረዋል!`);
    } catch (err: any) {
      setStatusMsg(err?.message || 'የስልክ አድራሻ ማውጫ መክፈት አልተቻለም፤ ከታች በእጅ ማስገባት ይችላሉ።');
    } finally {
      setSaving(false);
    }
  };

  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneInput.trim() && !nameInput.trim()) return;
    setSaving(true);
    setStatusMsg(null);
    try {
      const res = await addPhoneContacts(
        [{ name: nameInput.trim(), phone: phoneInput.trim() }],
        addedByName
      );
      setContacts(res.contacts);
      onEngagementChange({ ...engagement, contactsCount: res.contacts.length });
      setNameInput('');
      setPhoneInput('');
      setStatusMsg('ሰውየው ወደ ድህረገፁ ዝርዝር ተጨምረዋል! ከታች ባሉት ቁልፎች በቀጥታ መጋበዝ ይችላሉ።');
    } catch (err: any) {
      setStatusMsg(err?.message || 'ማስቀመጥ አልተቻለም።');
    } finally {
      setSaving(false);
    }
  };

  const handleBulkAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const lines = bulkInput
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    const parsed = lines.map((line) => {
      const parts = line.split(/[,|\t-]+/).map((p) => p.trim());
      if (parts.length >= 2) {
        return { name: parts[0], phone: parts[1] };
      }
      const match = line.match(/^(.*?)(\+?\d[\d\s]{7,})$/);
      if (match) {
        return { name: match[1].trim() || match[2].trim(), phone: match[2].trim() };
      }
      return { name: line, phone: line };
    });

    setSaving(true);
    setStatusMsg(null);
    try {
      const res = await addPhoneContacts(parsed, addedByName);
      setContacts(res.contacts);
      onEngagementChange({ ...engagement, contactsCount: res.contacts.length });
      setBulkInput('');
      setShowBulk(false);
      setStatusMsg(`${res.addedCount} ሰዎች በአንድ ጊዜ ወደ ድህረገፁ ተጨምረዋል!`);
    } catch (err: any) {
      setStatusMsg(err?.message || 'ማስቀመጥ አልተቻለም።');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const next = await deleteSavedContact(id);
    setContacts(next);
    onEngagementChange({ ...engagement, contactsCount: next.length });
  };

  const handleCopyInvite = async (contact: PhoneContactRecord) => {
    const msg = buildInviteMessage(contact);
    try {
      await navigator.clipboard.writeText(msg);
      setCopiedId(contact.id);
      const next = await recordWebsiteShare();
      onEngagementChange(next);
      setTimeout(() => setCopiedId(null), 2200);
    } catch {}
  };

  const handleInviteVia = async (platform: 'whatsapp' | 'telegram' | 'sms', contact: PhoneContactRecord) => {
    const text = buildInviteMessage(contact);
    const cleanPhone = contact.phone.replace(/[^\d+]/g, '');
    const next = await recordWebsiteShare().catch(() => null);
    if (next) onEngagementChange(next);

    if (platform === 'whatsapp') {
      const targetPhone = cleanPhone.startsWith('0') ? `251${cleanPhone.slice(1)}` : cleanPhone.replace('+', '');
      window.open(`https://wa.me/${targetPhone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
    } else if (platform === 'telegram') {
      window.open(
        `https://t.me/share/url?url=${encodeURIComponent(buildInviteLink(contact))}&text=${encodeURIComponent(text)}`,
        '_blank',
        'noopener,noreferrer'
      );
    } else {
      window.location.href = `sms:${cleanPhone}?body=${encodeURIComponent(text)}`;
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="w-full max-w-2xl rounded-3xl bg-stone-950 border-2 border-amber-600/50 shadow-2xl p-5 sm:p-7 space-y-5 relative max-h-[92vh] overflow-y-auto">
        <button
          onClick={onClose}
          aria-label="ዝጋ"
          className="absolute top-4 right-4 p-2 rounded-lg bg-stone-900 text-stone-300 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 pr-10">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-900 to-red-950 border border-amber-500/60 flex items-center justify-center text-amber-300 shrink-0">
            <UserPlus className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg sm:text-xl font-heading font-extrabold text-amber-100">
              ከስልክዎ ሰዎችን ወደ ድህረገፁ ይጨምሩ እና ያጋሩ
            </h3>
            <p className="text-xs text-stone-300">
              በስልክዎ ላይ ስልክ ቁጥራቸው ያለ ዘመድ፣ ጓደኛና ምዕመናንን በቀጥታ አድ አድርገው መልእክት ይላኩላቸው።
            </p>
          </div>
        </div>

        {/* Summary Engagement Row */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="p-3 rounded-xl bg-stone-900/90 border border-stone-800 text-center">
            <div className="flex items-center justify-center gap-1 text-rose-400 text-sm font-extrabold">
              <Heart className="w-4 h-4 fill-rose-500" />
              <span>{engagement.likesCount}</span>
            </div>
            <p className="text-[11px] text-stone-300 mt-0.5">ጠቅላላ ላይክ</p>
          </div>
          <div className="p-3 rounded-xl bg-stone-900/90 border border-stone-800 text-center">
            <div className="flex items-center justify-center gap-1 text-amber-300 text-sm font-extrabold">
              <Share2 className="w-4 h-4" />
              <span>{engagement.sharesCount}</span>
            </div>
            <p className="text-[11px] text-stone-300 mt-0.5">ጠቅላላ ሼር</p>
          </div>
          <div className="p-3 rounded-xl bg-stone-900/90 border border-stone-800 text-center">
            <div className="flex items-center justify-center gap-1 text-emerald-400 text-sm font-extrabold">
              <Users className="w-4 h-4" />
              <span>{contacts.length}</span>
            </div>
            <p className="text-[11px] text-stone-300 mt-0.5">የተጨመሩ ሰዎች</p>
          </div>
        </div>

        {/* Direct Android Contact Picker + Site Share */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={
              supportsContactPicker
                ? handlePickFromPhone
                : () => setStatusMsg('ይህ ብራውዘር ቀጥታ የስልክ ማውጫ መክፈት ስለማይፈቅድ ከታች በስም እና በስልክ ቁጥር በቀላሉ ያስገቡ።')
            }
            disabled={saving}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-700 via-amber-600 to-amber-700 hover:from-amber-600 hover:to-amber-500 text-stone-950 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg transition"
          >
            <Smartphone className="w-4 h-4" />
            <span>ከስልክ ኮንታክት ምረጥ (Phonebook)</span>
          </button>

          <button
            type="button"
            onClick={onShareSite}
            className="w-full py-3 px-4 rounded-xl bg-stone-900 hover:bg-stone-800 border border-amber-600/60 text-amber-200 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition"
          >
            <Share2 className="w-4 h-4 text-amber-400" />
            <span>ድህረገፁን ለሁሉም ሼር አድርግ</span>
          </button>
        </div>

        {statusMsg && (
          <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-600/60 text-xs text-emerald-200 font-bold">
            {statusMsg}
          </div>
        )}

        {/* Single Add Form */}
        <form onSubmit={handleManualAdd} className="p-4 rounded-2xl bg-stone-900/70 border border-stone-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-200 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-amber-400" />
              <span>ስምና ስልክ ቁጥር አድ ያድርጉ</span>
            </span>
            <button
              type="button"
              onClick={() => setShowBulk((v) => !v)}
              className="text-[11px] text-amber-400 hover:underline font-bold"
            >
              {showBulk ? 'ነጠላ መመዝገቢያ' : '+ ብዙ ቁጥር በአንድ ጊዜ አስገባ'}
            </button>
          </div>

          {!showBulk ? (
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="የሰውየው ስም (ምሳሌ፡ አቶ ዳዊት)"
                className="sm:col-span-5 bg-stone-950 border border-stone-700 rounded-xl px-3 py-2.5 text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500"
              />
              <input
                type="tel"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="ስልክ ቁጥር (09...)"
                className="sm:col-span-4 bg-stone-950 border border-stone-700 rounded-xl px-3 py-2.5 text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500"
                required
              />
              <button
                type="submit"
                disabled={saving || (!phoneInput.trim() && !nameInput.trim())}
                className="sm:col-span-3 py-2.5 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-stone-950 font-extrabold text-xs flex items-center justify-center gap-1.5 disabled:opacity-50 transition"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>አድ አድርግ</span>
              </button>
            </div>
          ) : null}
        </form>

        {showBulk && (
          <form onSubmit={handleBulkAdd} className="p-4 rounded-2xl bg-stone-900/70 border border-amber-700/40 space-y-2.5">
            <label className="block text-xs font-bold text-amber-200">
              በእያንዳንዱ መስመር ስምና ስልክ ቁጥር ያስገቡ፦
            </label>
            <textarea
              rows={4}
              value={bulkInput}
              onChange={(e) => setBulkInput(e.target.value)}
              placeholder={'አበበ ከበደ 0911223344\nማርታ ተስፋዬ 0912345678'}
              className="w-full bg-stone-950 border border-stone-700 rounded-xl p-3 text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500"
            />
            <button
              type="submit"
              disabled={saving || !bulkInput.trim()}
              className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-stone-950 font-extrabold text-xs transition"
            >
              ሁሉንም በአንድ ጊዜ አድ አድርግ
            </button>
          </form>
        )}

        {/* Saved Contacts Directory */}
        <div className="space-y-2.5">
          <h4 className="text-xs font-extrabold text-amber-200 flex items-center justify-between">
            <span>ወደ ድህረገፁ የተጨመሩ እውቂያዎች ({contacts.length})</span>
            <span className="text-[11px] text-stone-400 font-normal">በ1 ጠቅታ ግብዣ ይላኩ</span>
          </h4>

          {contacts.length === 0 ? (
            <div className="p-5 rounded-2xl bg-stone-900/50 border border-stone-800 text-center text-xs text-stone-400">
              እስካሁን የስልክ እውቂያ አልተጨመረም። ከላይ ባለው ቁልፍ ከስልክዎ ይምረጡ ወይም ስልክ ቁጥር አድ ያድርጉ።
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {contacts.map((c) => (
                <div
                  key={c.id}
                  className="p-3 rounded-xl bg-stone-900 border border-stone-800 flex flex-wrap items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold text-amber-100 truncate">{c.name}</p>
                    <p className="text-[11px] text-stone-300 font-mono">{c.phone}</p>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleInviteVia('whatsapp', c)}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-950 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-200 text-[11px] font-bold inline-flex items-center gap-1"
                    >
                      <MessageCircle className="w-3 h-3" />
                      <span>WhatsApp</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInviteVia('telegram', c)}
                      className="px-2.5 py-1.5 rounded-lg bg-sky-950 hover:bg-sky-900 border border-sky-700/60 text-sky-200 text-[11px] font-bold inline-flex items-center gap-1"
                    >
                      <Send className="w-3 h-3" />
                      <span>Telegram</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInviteVia('sms', c)}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-950 hover:bg-amber-900 border border-amber-700/60 text-amber-200 text-[11px] font-bold"
                    >
                      SMS
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopyInvite(c)}
                      title="ግብዣ ቅዳ"
                      className="p-1.5 rounded-lg bg-stone-950 border border-stone-700 text-stone-300 hover:text-amber-200"
                    >
                      {copiedId === c.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(c.id)}
                      title="አጥፋ"
                      className="p-1.5 rounded-lg bg-stone-950 border border-stone-800 text-stone-400 hover:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
