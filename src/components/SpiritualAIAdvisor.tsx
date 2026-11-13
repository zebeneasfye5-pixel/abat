import React, { useState } from 'react';
import { Sparkles, Send, Volume2, VolumeX, BookOpen, Search, Copy, Check } from 'lucide-react';
import { askSpiritualCounsel, searchScripture } from '../services/api';
import { UserProfile } from '../types';

interface SpiritualAIAdvisorProps {
  user: UserProfile;
}

export const SpiritualAIAdvisor: React.FC<SpiritualAIAdvisorProps> = ({ user }) => {
  const [prompt, setPrompt] = useState('');
  const [topic, setTopic] = useState('የንስሐ ምስጢር');
  const [loading, setLoading] = useState(false);
  const [conversation, setConversation] = useState<Array<{ role: 'user' | 'priest_ai'; text: string }>>([
    {
      role: 'priest_ai',
      text: `በእግዚአብሔር ስም ሰላም ለእናንተ ይሁን ${user.baptismalName || 'ልጄ'}። እኔ የቀሲስ ሄኖክ የኦርቶዶክሳዊ እውቀት መረጃ ቋት እና የኤአይ ረዳት ነኝ። በንስሐ፣ በአስተምህሮ፣ በቀኖና፣ በጾም እና በመንፈሳዊ አመክሮ ዙሪያ ያለዎትን ማንኛውንም ጥያቄ ይጠይቁኝ። መጽሐፍ ቅዱሳዊ እና አበዋዊ መልሶችን እሰጣችኋለሁ።`,
    },
  ]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Scripture Quick Search
  const [scriptureQuery, setScriptureQuery] = useState('');
  const [scriptureResult, setScriptureResult] = useState<string | null>(null);
  const [scriptureLoading, setScriptureLoading] = useState(false);

  const presetQuestions = [
    'የንስሐ ጸሎት እንዴት ልጸልይ?',
    'የስጋዬን ድካም እና ፈተና እንዴት ላሸንፍ?',
    'የንስሐ ቀኖና ምንድን ነው? ጥቅሙስ?',
    'በጾም ወቅት በልብ ሊደረግ የሚገባው ጥንቃቄ ምንድን ነው?',
    'ስለ ባልና ሚስት ሰላም የመጽሐፍ ቅዱስ ምክር ምንድን ነው?',
  ];

  const handleAsk = async (userQuestion?: string) => {
    const q = userQuestion || prompt;
    if (!q.trim() || loading) return;

    setConversation((prev) => [...prev, { role: 'user', text: q }]);
    setPrompt('');
    setLoading(true);

    try {
      const response = await askSpiritualCounsel(q, topic, user.baptismalName);
      setConversation((prev) => [...prev, { role: 'priest_ai', text: response }]);
    } catch (err: any) {
      setConversation((prev) => [
        ...prev,
        {
          role: 'priest_ai',
          text: `⚠️ ${err?.message || 'ከኤአይ ሰርቨር ጋር መገናኘት አልተቻለም። እባክዎ የGEMINI_API_KEY እና የኢንተርኔት ግንኙነትዎን ያረጋግጡ።'}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchScripture = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scriptureQuery.trim() || scriptureLoading) return;
    setScriptureLoading(true);
    try {
      const res = await searchScripture(scriptureQuery);
      setScriptureResult(res);
    } catch (err: any) {
      setScriptureResult(`⚠️ ${err?.message || 'ጥቅሱን ከኤአይ ሰርቨር ማምጣት አልተቻለም። እባክዎ የGEMINI_API_KEY ትክክለኛ መሆኑን ያረጋግጡ።'}`);
    } finally {
      setScriptureLoading(false);
    }
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
      utterance.rate = 0.9;
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      setIsSpeaking(true);
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard?.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      
      {/* Title Header */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-stone-900 via-amber-950/40 to-stone-900 border border-amber-800/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-950/80 border border-amber-700/50 text-amber-300 text-xs font-medium">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>ዘመናዊ የኦርቶዶክሳዊ እውቀት መረጃ አመንጭ</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-heading font-bold text-amber-100 mt-2">
            የቀሲስ ሄኖክ የኤአይ ጭንቅላት
          </h2>
        </div>

        {/* Topic Selector Tabs */}
        <div className="flex flex-wrap gap-1.5 p-1 bg-stone-950 rounded-xl border border-stone-800 text-xs">
          {['የንስሐ ምስጢር', 'ቀኖናና ተግሣጽ', 'ጾምና ጸሎት', 'የቤተሰብ አመክሮ'].map((t) => (
            <button
              key={t}
              onClick={() => setTopic(t)}
              className={`px-3 py-1.5 rounded-lg transition font-medium ${
                topic === t ? 'bg-amber-900/80 text-amber-200 border border-amber-600/50' : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid: Chat Counsel & Scripture Search Engine */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column (8 cols): Interactive Spiritual Dialogue */}
        <div className="lg:col-span-8 flex flex-col h-[600px] rounded-2xl bg-stone-900/60 border border-amber-900/30 overflow-hidden">
          
          {/* Conversation Stream */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {conversation.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'priest_ai' && (
                  <div className="w-8 h-8 rounded-full bg-amber-950 border border-amber-600/60 flex items-center justify-center text-amber-300 font-bold shrink-0 text-xs">
                    ሄ
                  </div>
                )}

                <div
                  className={`max-w-[85%] sm:max-w-[75%] p-4 rounded-2xl text-xs sm:text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-amber-950/80 text-amber-100 border border-amber-700/60 rounded-br-none'
                      : 'bg-stone-950/90 text-stone-200 border border-stone-800 rounded-bl-none shadow-md font-serif'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                  
                  {msg.role === 'priest_ai' && (
                    <div className="flex items-center gap-2 mt-3 pt-2 border-t border-stone-800/80 text-[11px] text-stone-400 not-italic font-sans">
                      <button
                        onClick={() => handleSpeech(msg.text)}
                        className="hover:text-amber-300 flex items-center gap-1 transition"
                      >
                        {isSpeaking ? <VolumeX className="w-3.5 h-3.5 text-red-400" /> : <Volume2 className="w-3.5 h-3.5 text-amber-400" />}
                        <span>{isSpeaking ? 'አቁም' : 'በድምፅ አድምጥ'}</span>
                      </button>
                      <span>·</span>
                      <button
                        onClick={() => handleCopy(msg.text, idx)}
                        className="hover:text-amber-300 flex items-center gap-1 transition"
                      >
                        {copiedIndex === idx ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedIndex === idx ? 'ተቀድቷል' : 'ቅዳ'}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-stone-950/60 border border-stone-800 text-xs text-amber-300 w-fit">
                <Sparkles className="w-4 h-4 animate-spin text-amber-400" />
                <span>የቀሲስ ሄኖክ የኤአይ ጭንቅላት ከመጻሕፍት እየፈተሸ ነው...</span>
              </div>
            )}
          </div>

          {/* Quick Preset Buttons */}
          <div className="p-2.5 bg-stone-950/90 border-t border-stone-800 flex items-center gap-1.5 overflow-x-auto">
            {presetQuestions.map((pq, i) => (
              <button
                key={i}
                onClick={() => handleAsk(pq)}
                className="px-2.5 py-1 rounded-lg bg-stone-900 border border-stone-700/60 text-[11px] text-stone-300 whitespace-nowrap hover:text-amber-200 hover:border-amber-600 transition"
              >
                {pq}
              </button>
            ))}
          </div>

          {/* User Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAsk();
            }}
            className="p-3 bg-stone-950 border-t border-stone-800 flex gap-2"
          >
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="የንስሐ፣ የቀኖና ወይም የመንፈሳዊ ሕይወት ጥያቄዎን እዚህ ይጻፉ..."
              className="flex-1 bg-stone-900 border border-stone-700 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500"
            />
            <button
              type="submit"
              disabled={loading || !prompt.trim()}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-red-950 to-amber-900 border border-amber-600 text-amber-200 font-medium text-xs hover:border-amber-400 disabled:opacity-50 transition flex items-center gap-1.5"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">ጠይቅ</span>
            </button>
          </form>

        </div>

        {/* Right Column (4 cols): Scripture Cross-Referencing Tool */}
        <div className="lg:col-span-4 space-y-4">
          
          <div className="p-5 rounded-2xl bg-stone-900/60 border border-amber-900/30 space-y-4">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-amber-400" />
              <h3 className="text-base font-semibold font-heading text-amber-200">
                የመጽሐፍ ቅዱስ ጥቅሶች ፍለጋ
              </h3>
            </div>
            <p className="text-xs text-stone-400">
              በርዕስ ወይም በኃጢአት አይነት መሰረት አጽናኝ የመጽሐፍ ቅዱስ ጥቅሶችን ያግኙ።
            </p>

            <form onSubmit={handleSearchScripture} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
                <input
                  type="text"
                  value={scriptureQuery}
                  onChange={(e) => setScriptureQuery(e.target.value)}
                  placeholder="ለምሳሌ፡ ይቅርታ፣ ኃጢአት፣ ተስፋ..."
                  className="w-full bg-stone-950 border border-stone-700 rounded-xl pl-9 pr-3 py-2 text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500"
                />
              </div>
              <button
                type="submit"
                disabled={scriptureLoading || !scriptureQuery.trim()}
                className="px-3 py-2 rounded-xl bg-amber-950 border border-amber-700 text-amber-300 text-xs font-medium hover:bg-amber-900 disabled:opacity-50 transition"
              >
                ፈልግ
              </button>
            </form>

            {/* Scripture Search Results */}
            {scriptureLoading ? (
              <p className="text-xs text-amber-300 animate-pulse">ጥቅሶች ከመጽሐፍ ቅዱስ እየተፈለጉ ነው...</p>
            ) : scriptureResult ? (
              <div className="p-3.5 rounded-xl bg-stone-950 border border-stone-800 text-xs text-stone-200 whitespace-pre-wrap leading-relaxed font-serif">
                {scriptureResult}
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-stone-950/60 border border-stone-800/80 text-xs text-stone-400 space-y-2">
                <p className="font-semibold text-amber-300">ተደጋግመው የሚፈለጉ ጥቅሶች፡</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>መዝሙረ ዳዊት 51 (የዳዊት የንስሐ ጸሎት)</li>
                  <li>1 ዮሐንስ 1:9 (የኃጢአት ስርየት)</li>
                  <li>ሉቃስ 15 (የጠፋው ልጅ ምሳሌ)</li>
                  <li>ምሳሌ 28:13 (ኃጢአትን መናዘዝ)</li>
                </ul>
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
};
