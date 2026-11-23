import React, { useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  Send,
  Volume2,
  VolumeX,
  BookOpen,
  Search,
  Copy,
  Check,
  Share2,
  Download,
  Zap,
  X,
  RotateCcw,
} from 'lucide-react';
import { streamOrthodoxSearch, streamSpiritualCounsel } from '../services/api';
import { UserProfile } from '../types';

interface SpiritualAIAdvisorProps {
  user: UserProfile;
}

const COUNSEL_TOPICS = [
  'አጠቃላይ ኦርቶዶክስ',
  'ምሥጢራተ ቤተክርስቲያን',
  'ቀኖናና ፍትሐ ነገሥት',
  'ቅዱሳንና ታሪክ',
  'ጾም፣ ጸሎትና ቅዳሴ',
  'ንስሐና ቤተሰብ',
];

const SEARCH_CATEGORIES = [
  'ሁሉም የኦርቶዶክስ እውቀት',
  'መጽሐፍ ቅዱስ (81ዱ)',
  'አዕማደ ምሥጢርና ነገረ መለኮት',
  'ቅዱሳን፣ ስንክሳርና ገድላት',
  'ሥርዓተ ቅዳሴ፣ በዓላትና አጽዋማት',
];

function downloadAsTextFile(title: string, body: string) {
  const header = `ቀሲስ ሄኖክ - የኢትዮጵያ ኦርቶዶክስ ተዋሕዶ እውቀት ማህደር\nርዕስ: ${title}\nቀን: ${new Date().toLocaleDateString()}\n${'='.repeat(45)}\n\n`;
  const blob = new Blob(['\uFEFF' + header + body], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `qesis-henok-${Date.now().toString().slice(-6)}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const SpiritualAIAdvisor: React.FC<SpiritualAIAdvisorProps> = ({ user }) => {
  const [prompt, setPrompt] = useState('');
  const [topic, setTopic] = useState(COUNSEL_TOPICS[0]);
  const [loading, setLoading] = useState(false);
  const [conversation, setConversation] = useState<Array<{ role: 'user' | 'priest_ai'; text: string; isError?: boolean; retryQuestion?: string }>>([
    {
      role: 'priest_ai',
      text: `በእግዚአብሔር ስም ሰላም ለእናንተ ይሁን ${user.baptismalName || 'ልጄ'}። እኔ የቀሲስ ሄኖክ ሁለንተናዊ የኢትዮጵያ ኦርቶዶክስ ተዋሕዶ እውቀት እና የኤአይ ረዳት ነኝ። በመጽሐፍ ቅዱስ፣ በነገረ መለኮት፣ በምሥጢራተ ቤተክርስቲያን፣ በፍትሐ ነገሥት፣ በቅዱሳን ታሪክ፣ በቅዳሴ፣ በጾምና በንስሐ ዙሪያ ያለዎትን ማንኛውንም ጥያቄ ይጠይቁኝ — መልሱ በፍጥነት በቀጥታ ይታያል።`,
    },
  ]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [sharedKey, setSharedKey] = useState<string | null>(null);

  // Fast Orthodox Universal Search (Auto-Search defaults off so partial keystrokes don't exhaust Free Tier daily quota)
  const [scriptureQuery, setScriptureQuery] = useState('');
  const [searchCategory, setSearchCategory] = useState(SEARCH_CATEGORIES[0]);
  const [autoSearchEnabled, setAutoSearchEnabled] = useState(false);
  const [scriptureResult, setScriptureResult] = useState<string | null>(null);
  const [scriptureLoading, setScriptureLoading] = useState(false);

  const chatAbortRef = useRef<AbortController | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchLocalCacheRef = useRef<Map<string, string>>(new Map());
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const promptInputRef = useRef<HTMLInputElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const presetQuestions = [
    'ሰባቱ ምሥጢራተ ቤተክርስቲያን ምንድን ናቸው?',
    'የንስሐ ጸሎትና ቀኖና እንዴት ይፈጸማል?',
    'አምስቱ አዕማደ ምሥጢር በዝርዝር',
    'የቅድስት ድንግል ማርያም ነገረ ማርያም በኦርቶዶክስ',
    'የሰባቱ አጽዋማት ስምና ትርጉም',
  ];

  const quickSearchTopics = [
    'ምሥጢረ ሥላሴ',
    'ቅዱስ ያሬድ እና ዜማ',
    'ጥምቀት እና ሜሮን',
    'ጾመ ነነዌ እና ዐቢይ ጾም',
    'ፍትሐ ነገሥት',
    'መዝሙረ ዳዊት 51',
  ];

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation]);

  const handleAsk = async (userQuestion?: string) => {
    const q = (userQuestion ?? prompt).trim();
    if (!q || loading) return;

    chatAbortRef.current?.abort();
    const controller = new AbortController();
    chatAbortRef.current = controller;

    setConversation((prev) => [...prev, { role: 'user', text: q }, { role: 'priest_ai', text: '', retryQuestion: q }]);
    if (!userQuestion) setPrompt('');
    setLoading(true);

    try {
      await streamSpiritualCounsel(
        q,
        topic,
        user.baptismalName,
        (accumulated) => {
          setConversation((prev) => {
            const copy = [...prev];
            if (copy.length > 0 && copy[copy.length - 1].role === 'priest_ai') {
              copy[copy.length - 1] = { role: 'priest_ai', text: accumulated };
            }
            return copy;
          });
        },
        controller.signal
      );
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setConversation((prev) => {
        const copy = [...prev];
        if (copy.length > 0 && copy[copy.length - 1].role === 'priest_ai') {
          copy[copy.length - 1] = {
            role: 'priest_ai',
            text: `⚠️ ${err?.message || 'ከኤአይ ሰርቨር ጋር መገናኘት አልተቻለም። እባክዎ የGEMINI_API_KEY መሞላቱን ያረጋግጡ።'}`,
            isError: true,
            retryQuestion: q,
          };
        }
        return copy;
      });
    } finally {
      setLoading(false);
    }
  };

  const executeOrthodoxSearch = async (queryText: string, cat = searchCategory) => {
    const clean = queryText.trim();
    if (clean.length < 2) return;

    const localKey = `${cat}:${clean.toLowerCase()}`;
    const cached = searchLocalCacheRef.current.get(localKey);
    if (cached) {
      setScriptureResult(cached);
      return;
    }

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setScriptureLoading(true);
    setScriptureResult('');
    let finalAccumulated = '';
    try {
      finalAccumulated = await streamOrthodoxSearch(
        clean,
        cat,
        (accumulated) => {
          setScriptureResult(accumulated);
        },
        controller.signal
      );
      if (finalAccumulated && !finalAccumulated.startsWith('⚠️')) {
        searchLocalCacheRef.current.set(localKey, finalAccumulated);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setScriptureResult(`⚠️ ${err?.message || 'መረጃውን ከኤአይ ማምጣት አልተቻለም።'}`);
    } finally {
      setScriptureLoading(false);
    }
  };

  // Optional Automatic Debounced Search (uses 1500ms pause & >=5 chars to conserve API quota)
  useEffect(() => {
    if (!autoSearchEnabled) return;
    const trimmed = scriptureQuery.trim();
    if (trimmed.length < 5) return;
    const timer = setTimeout(() => {
      executeOrthodoxSearch(trimmed, searchCategory);
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptureQuery, searchCategory, autoSearchEnabled]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeOrthodoxSearch(scriptureQuery, searchCategory);
  };

  const handleSpeech = (text: string) => {
    if ('speechSynthesis' in window) {
      if (isSpeaking) {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'am-ET';
      utterance.rate = 0.95;
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      setIsSpeaking(true);
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard?.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {}
  };

  const handleShare = async (title: string, text: string, key: string) => {
    const shareBody = `${title}\n\n${text}\n\nምንጭ፡ ቀሲስ ሄኖክ (${window.location.origin})`;
    if (navigator.share) {
      try {
        await navigator.share({ title, text: shareBody, url: window.location.origin });
        setSharedKey(key);
        setTimeout(() => setSharedKey(null), 2000);
        return;
      } catch {}
    }
    await handleCopy(shareBody, key);
    setSharedKey(key);
    setTimeout(() => setSharedKey(null), 2000);
  };

  const handleDownloadFullChat = () => {
    const transcript = conversation
      .filter((m) => m.text.trim())
      .map((m) => `[${m.role === 'user' ? user.baptismalName || 'ጠያቂ' : 'ቀሲስ ሄኖክ AI'}]\n${m.text}`)
      .join('\n\n------------------------------\n\n');
    downloadAsTextFile('የኤአይ መንፈሳዊ ውይይት ማህደር', transcript);
  };

  const handleClearPrompt = () => {
    setPrompt('');
    promptInputRef.current?.focus();
  };

  const handleClearSearch = () => {
    searchAbortRef.current?.abort();
    setScriptureQuery('');
    setScriptureResult(null);
    setScriptureLoading(false);
    searchInputRef.current?.focus();
  };

  const handleClearConversation = () => {
    chatAbortRef.current?.abort();
    setLoading(false);
    setPrompt('');
    setConversation([
      {
        role: 'priest_ai',
        text: `ሰላም ${user.baptismalName || 'ልጄ'}። የቀድሞ ውይይቱ ጸድቷል፤ አዲስ መንፈሳዊ ጥያቄ መጻፍ ይችላሉ።`,
      },
    ]);
    promptInputRef.current?.focus();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Title Header */}
      <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-r from-stone-900 via-amber-950/40 to-stone-900 border border-amber-800/40 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-950/80 border border-amber-700/50 text-amber-300 text-xs font-bold">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>እጅግ ፈጣን ቀጥታ የኦርቶዶክስ እውቀት ኤአይ (Streaming)</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-heading font-extrabold text-amber-100 mt-2">
              የቀሲስ ሄኖክ ሁለንተናዊ የኦርቶዶክስ እውቀት ማህደር
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleClearConversation}
              className="px-3 py-2 rounded-xl bg-stone-950 hover:bg-red-950/60 border border-stone-700 hover:border-red-700/60 text-stone-200 hover:text-red-200 text-xs font-extrabold inline-flex items-center gap-1.5 transition"
              title="ውይይቱን በአንድ ንክኪ አጽዳ"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              <span>ውይይት አጽዳ</span>
            </button>
            <button
              onClick={handleDownloadFullChat}
              className="px-3.5 py-2 rounded-xl bg-stone-950 hover:bg-stone-800 border border-amber-600/60 text-amber-200 text-xs font-extrabold inline-flex items-center gap-2 transition"
            >
              <Download className="w-4 h-4 text-amber-400" />
              <span>ሙሉ ውይይቱን ዳውንሎድ አድርግ</span>
            </button>
          </div>
        </div>

        {/* Comprehensive Orthodox Topic Selector Tabs */}
        <div className="flex flex-wrap gap-1.5 p-1.5 bg-stone-950 rounded-xl border border-stone-800 text-xs">
          {COUNSEL_TOPICS.map((t) => (
            <button
              key={t}
              onClick={() => setTopic(t)}
              className={`px-3 py-1.5 rounded-lg transition font-bold ${
                topic === t
                  ? 'bg-amber-800 text-amber-100 border border-amber-500/60 shadow'
                  : 'text-stone-300 hover:text-amber-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid: Live Streaming Counsel & Comprehensive Orthodox Search */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (7 cols): Interactive Streaming Dialogue */}
        <div className="lg:col-span-7 flex flex-col h-[640px] rounded-2xl bg-stone-900/70 border border-amber-900/40 overflow-hidden shadow-xl">
          {/* Conversation Stream */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {conversation.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'priest_ai' && (
                  <div className="w-9 h-9 rounded-full bg-amber-950 border border-amber-500/70 flex items-center justify-center text-amber-200 font-extrabold shrink-0 text-sm">
                    ሄ
                  </div>
                )}

                <div
                  className={`max-w-[88%] sm:max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-amber-950/90 text-amber-100 border border-amber-700/70 rounded-br-none font-bold'
                      : 'bg-stone-950/95 text-stone-100 border border-stone-800 rounded-bl-none shadow-md'
                  }`}
                >
                  {msg.text ? (
                    <p className="whitespace-pre-wrap font-semibold">{msg.text}</p>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-amber-300 font-bold">
                      <Sparkles className="w-4 h-4 animate-spin text-amber-400" />
                      <span>በፍጥነት በመመለስ ላይ...</span>
                    </div>
                  )}

                  {msg.role === 'priest_ai' && msg.text && (
                    <div className="flex flex-wrap items-center gap-2 mt-3 pt-2.5 border-t border-stone-800/80 text-xs text-stone-300">
                      {msg.isError && msg.retryQuestion && (
                        <button
                          type="button"
                          onClick={() => handleAsk(msg.retryQuestion)}
                          disabled={loading}
                          className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-stone-950 flex items-center gap-1.5 transition font-extrabold"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>እንደገና ሞክር</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleSpeech(msg.text)}
                        className="px-2 py-1 rounded-lg bg-stone-900 hover:bg-stone-800 hover:text-amber-200 flex items-center gap-1 transition font-bold"
                      >
                        {isSpeaking ? (
                          <VolumeX className="w-3.5 h-3.5 text-red-400" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                        )}
                        <span>{isSpeaking ? 'አቁም' : 'አድምጥ'}</span>
                      </button>
                      <button
                        onClick={() => handleCopy(msg.text, `chat-${idx}`)}
                        className="px-2 py-1 rounded-lg bg-stone-900 hover:bg-stone-800 hover:text-amber-200 flex items-center gap-1 transition font-bold"
                      >
                        {copiedKey === `chat-${idx}` ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copiedKey === `chat-${idx}` ? 'ተቀድቷል' : 'ቅዳ'}</span>
                      </button>
                      <button
                        onClick={() => handleShare('የቀሲስ ሄኖክ የኦርቶዶክስ ትምህርት', msg.text, `share-chat-${idx}`)}
                        className="px-2 py-1 rounded-lg bg-stone-900 hover:bg-stone-800 hover:text-amber-200 flex items-center gap-1 transition font-bold"
                      >
                        <Share2 className="w-3.5 h-3.5 text-sky-400" />
                        <span>{sharedKey === `share-chat-${idx}` ? 'ሼር ተደርጓል' : 'ሼር'}</span>
                      </button>
                      <button
                        onClick={() => downloadAsTextFile(topic, msg.text)}
                        className="px-2 py-1 rounded-lg bg-stone-900 hover:bg-stone-800 hover:text-emerald-300 flex items-center gap-1 transition font-bold"
                      >
                        <Download className="w-3.5 h-3.5 text-emerald-400" />
                        <span>ዳውንሎድ</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={chatBottomRef} />
          </div>

          {/* Quick Preset Questions */}
          <div className="p-2.5 bg-stone-950/90 border-t border-stone-800 flex items-center gap-1.5 overflow-x-auto">
            {presetQuestions.map((pq, i) => (
              <button
                key={i}
                onClick={() => handleAsk(pq)}
                className="px-3 py-1.5 rounded-lg bg-stone-900 border border-stone-700/70 text-xs text-stone-200 font-bold whitespace-nowrap hover:text-amber-200 hover:border-amber-500 transition"
              >
                {pq}
              </button>
            ))}
          </div>

          {/* User Input Bar with 1-Tap Clear Button */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAsk();
            }}
            className="p-3 bg-stone-950 border-t border-stone-800 flex gap-2"
          >
            <div className="relative flex-1 flex items-center">
              <input
                ref={promptInputRef}
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="ማንኛውንም የኦርቶዶክስ እምነት፣ ቀኖና፣ ታሪክ ወይም መንፈሳዊ ጥያቄ ይጻፉ..."
                className="w-full bg-stone-900 border border-stone-700 rounded-xl pl-4 pr-20 py-3 text-sm text-stone-100 placeholder-stone-400 focus:outline-none focus:border-amber-500"
              />
              {prompt.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearPrompt}
                  className="absolute right-2 px-2.5 py-1 rounded-lg bg-stone-800 hover:bg-red-950 border border-stone-600 hover:border-red-500 text-amber-200 hover:text-red-200 text-xs font-extrabold flex items-center gap-1 transition"
                  title="የጻፉትን አጽዳ (Clear)"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>አጽዳ</span>
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={loading || !prompt.trim()}
              className="px-5 py-3 rounded-xl bg-gradient-to-r from-red-900 to-amber-800 border border-amber-500 text-white font-extrabold text-sm hover:border-amber-300 disabled:opacity-50 transition flex items-center gap-1.5 shrink-0"
            >
              <Send className="w-4 h-4" />
              <span>ጠይቅ</span>
            </button>
          </form>
        </div>

        {/* Right Column (5 cols): Ultra-Fast Auto Orthodox Encyclopedia Search + Share + Download */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-5 rounded-2xl bg-stone-900/70 border border-amber-900/40 space-y-4 shadow-xl">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-amber-400 shrink-0" />
                <h3 className="text-base sm:text-lg font-extrabold font-heading text-amber-100">
                  ሁለንተናዊ የኦርቶዶክስ እውቀት ፍለጋ
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setAutoSearchEnabled((v) => !v)}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-extrabold shrink-0 transition ${
                  autoSearchEnabled
                    ? 'bg-emerald-950/80 border-emerald-500/70 text-emerald-300'
                    : 'bg-stone-950 border-stone-700 text-stone-400'
                }`}
              >
                {autoSearchEnabled ? '⚡ Auto-Search: በርቷል' : 'Auto-Search: ጠፍቷል'}
              </button>
            </div>

            <p className="text-xs text-stone-300 font-semibold">
              መጽሐፍ ቅዱስ፣ አዕማደ ምሥጢር፣ ፍትሐ ነገሥት፣ ገድለ ቅዱሳን፣ ቅዳሴ፣ በዓላትና አጽዋማት — ሲጽፉ በቀጥታ ይፈልጋል!
            </p>

            {/* Category Selector */}
            <select
              value={searchCategory}
              onChange={(e) => setSearchCategory(e.target.value)}
              className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-xs text-amber-200 font-bold focus:outline-none focus:border-amber-500"
            >
              {SEARCH_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  ዘርፍ: {c}
                </option>
              ))}
            </select>

            <form onSubmit={handleSearchSubmit} className="flex gap-2">
              <div className="relative flex-1 flex items-center">
                <Search className="w-4 h-4 absolute left-3 text-stone-400 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={scriptureQuery}
                  onChange={(e) => setScriptureQuery(e.target.value)}
                  placeholder="ቃል ወይም ርዕስ ይጻፉ (ምሳሌ፡ ሥላሴ፣ ጥምቀት፣ ኪዳነ ምሕረት...)"
                  className="w-full bg-stone-950 border border-stone-700 rounded-xl pl-9 pr-20 py-2.5 text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500"
                />
                {scriptureQuery.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    className="absolute right-1.5 px-2 py-1 rounded-lg bg-stone-900 hover:bg-red-950 border border-stone-700 hover:border-red-500 text-amber-200 hover:text-red-200 text-xs font-extrabold flex items-center gap-1 transition"
                    title="የፍለጋ ጽሑፉን አጽዳ (Clear)"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>አጽዳ</span>
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={scriptureLoading || !scriptureQuery.trim()}
                className="px-4 py-2.5 rounded-xl bg-amber-700 hover:bg-amber-600 border border-amber-500 text-stone-950 text-xs font-extrabold disabled:opacity-50 transition shrink-0"
              >
                ፈልግ
              </button>
            </form>

            {/* Quick Tap Topics */}
            <div className="flex flex-wrap gap-1.5">
              {quickSearchTopics.map((qt) => (
                <button
                  key={qt}
                  type="button"
                  onClick={() => {
                    setScriptureQuery(qt);
                    executeOrthodoxSearch(qt, searchCategory);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-stone-950 hover:bg-amber-950/60 border border-stone-800 hover:border-amber-600/50 text-[11px] text-amber-200 font-bold transition"
                >
                  {qt}
                </button>
              ))}
            </div>

            {/* Live Streaming Search Output + Share & Download */}
            {scriptureResult !== null ? (
              <div className="space-y-2.5">
                <div className="p-4 rounded-xl bg-stone-950 border border-stone-800 text-sm text-stone-100 whitespace-pre-wrap leading-relaxed max-h-[340px] overflow-y-auto font-semibold">
                  {scriptureResult || (
                    <span className="text-amber-300 animate-pulse text-xs">
                      ከኦርቶዶክስ እውቀት ማህደር በፍጥነት በማምጣት ላይ...
                    </span>
                  )}
                </div>

                {scriptureResult && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {scriptureResult.startsWith('⚠️') && scriptureQuery.trim().length >= 2 && (
                      <button
                        type="button"
                        onClick={() => executeOrthodoxSearch(scriptureQuery, searchCategory)}
                        disabled={scriptureLoading}
                        className="py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-stone-950 font-extrabold inline-flex items-center justify-center gap-1.5 transition"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>እንደገና ሞክር</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleShare(`ኦርቶዶክሳዊ እውቀት: ${scriptureQuery}`, scriptureResult, 'search-share')}
                      className="flex-1 py-2 px-3 rounded-xl bg-sky-950/70 hover:bg-sky-900 border border-sky-700/60 text-sky-200 font-bold inline-flex items-center justify-center gap-1.5 transition"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>{sharedKey === 'search-share' ? 'ተጋርቷል!' : 'ሼር አድርግ'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => downloadAsTextFile(scriptureQuery || 'የኦርቶዶክስ እውቀት', scriptureResult)}
                      className="flex-1 py-2 px-3 rounded-xl bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-200 font-bold inline-flex items-center justify-center gap-1.5 transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>ዳውንሎድ (.txt)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCopy(scriptureResult, 'search-copy')}
                      className="py-2 px-3 rounded-xl bg-stone-950 hover:bg-stone-800 border border-stone-700 text-stone-200 font-bold inline-flex items-center gap-1.5 transition"
                    >
                      {copiedKey === 'search-copy' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedKey === 'search-copy' ? 'ተቀድቷል' : 'ቅዳ'}</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-stone-950/70 border border-stone-800 text-xs text-stone-300 space-y-2">
                <p className="font-extrabold text-amber-300">በቀላሉ ጠቅ አድርገው መፈለግ የሚችሉባቸው ርዕሶች፡</p>
                <ul className="space-y-1 list-disc list-inside font-bold">
                  <li>ምሥጢረ ሥላሴና አምስቱ አዕማደ ምሥጢር</li>
                  <li>ሰባቱ ምሥጢራተ ቤተክርስቲያን</li>
                  <li>ፍትሐ ነገሥትና የንስሐ ቀኖና</li>
                  <li>የቅዱሳን ገድል፣ ስንክሳርና ነገረ ማርያም</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
