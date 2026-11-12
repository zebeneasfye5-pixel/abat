import React, { useState, useEffect } from 'react';
import { BookOpen, WifiOff, Bookmark, Save, Trash2, Calendar, Check, Volume2 } from 'lucide-react';
import { OfflinePrayer } from '../types';

export const OfflineLibrary: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<'ጸሎት' | 'ውዳሴ' | 'ቀኖና' | 'ጾም'>('ጸሎት');
  const [selectedPrayerId, setSelectedPrayerId] = useState('pr-1');
  
  // Local offline journal stored in localStorage
  const [offlineNotes, setOfflineNotes] = useState<string>(() => {
    return localStorage.getItem('qh_offline_confession_notes') || '';
  });
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    localStorage.setItem('qh_offline_confession_notes', offlineNotes);
  }, [offlineNotes]);

  const prayers: OfflinePrayer[] = [
    {
      id: 'pr-1',
      title: 'መዝሙር 51 (የዳዊት የንስሐ ጸሎት)',
      category: 'ጸሎት',
      geezText: 'ተሠሃለኒ እግዚኦ በከመ ዕበየ ሣህልከ፤ ወበከመ ብዝኀ ምሕረትከ ደምስስ አበሳየ።',
      amharicText: `አቤቱ፥ እንደ ቸርነትህ መጠን ማረኝ፤ እንደ ምሕረትህም ብዛት መተላለፌን ደምስስ።
ከበደሌ ፈጽሞ እጠበኝ፥ ከኃጢአቴም አንጻኝ፤
እኔ መተላለፌን አውቃለሁና፥ ኃጢአቴም ሁልጊዜ በፊቴ ነውና።
አንተን ብቻ በደልሁ፥ በፊትህም ክፉ አደረግሁ...
አቤቱ፥ ንጹሕ ልብን ፍጠርልኝ፥ የቀናውንም መንፈስ በውስጤ አድስ።
ከፊትህ አትጣለኝ፥ ቅዱስ መንፈስህንም ከእኔ ላይ አትውሰድ።
የማዳንህን ደስታ ስጠኝ፥ በእሺተኛ መንፈስም ደግፈኝ።`,
      description: 'ለኃጢአት ሥርየት እና ለልብ ንጽሕና የሚጸለይ የነቢዩ ዳዊት የንስሐ ጸሎት።',
    },
    {
      id: 'pr-2',
      title: 'ጸሎተ ንስሐ እና የኃጢአት መናዘዣ',
      category: 'ጸሎት',
      geezText: 'እትአመን ኀበ እግዚአብሔር አምላክየ ዘፈጠረኒ ወአውፅአኒ እምከርሠ እምየ።',
      amharicText: `ቅዱስ እግዚአብሔር ሆይ፥ በአንተ ፊትና በካህኑ በንስሐ አባቴ ፊት ኃጢአቴን እናዘዛለሁ።
በሐሳብ፣ በቃል፣ በሥራ የሠራሁትን ኃጢአት ሁሉ ይቅር እንድትለኝ እማጸናለሁ።
በስንፍና፣ በቁጣ፣ በስስት፣ በዝሙት፣ በክፋት ያሳዘንኩህን በደል ደምስስልኝ።
ከአሁን ጀምሮ ወደ ክፉ መንገድ እንዳልመለስ ጽናቱን ስጠኝ። አሜን።`,
      description: 'ወደ ንስሐ አባት ከመቅረብ በፊት በቤት ውስጥ የሚጸለይ መናዘዣ።',
    },
    {
      id: 'pr-3',
      title: 'ውዳሴ ማርያም (ዘሰኑይ - የሰኞ)',
      category: 'ውዳሴ',
      geezText: 'ፈቀደ እግዚእ ያግዕዞ ለአዳም ኅዙነ ወትኩዘ ልብ፤ ወያግብኦ ኀበ ዘቀዳሚ መንበሩ።',
      amharicText: `እግዚአብሔር ልቡ ያዘነውንና የተከዘውን አዳምን ነጻ ሊያወጣው ወደ ቀደመው ክብሩም ሊመልሰው ወደደ።
የእውነት ብርሃን የሚሆን ጌታን የወለድሽልን እመቤታችን ሆይ፥ ደስ ይበልሽ።
በኪሩቤልና በሱራፌል ላይ የሚያድረውን በክንድሽ የታቀፍሽ ሆይ፥ የተመሰገንሽ ነሽ።
ለእኛ ለኃጢአተኞች ወደ ልጅሽ ጸልይልን።`,
      description: 'ለእመቤታችን የሚቀርብ የሰኞ ምስጋና።',
    },
    {
      id: 'pr-4',
      title: 'የንስሐ 40ቱ ቀኖናዎችና መመሪያዎች',
      category: 'ቀኖና',
      geezText: 'ቀኖና ንስሐ ዘአዘዙ አበው ሐዋርያት ወሊቃውንት።',
      amharicText: `፩. ኃጢአትን ሳያፍሩና ሳይደብቁ ለንስሐ አባት በዕንባ መናዘዝ።
፪. በካህኑ የተሰጠውን የስግደት፣ የጾም እና የጸሎት ቀኖና በታማኝነት መፈጸም።
፫. ከቀድሞው ክፉ ጓደኛና ለኃጢአት ከሚያጋልጥ ቦታ መራቅ።
፬. በደል ያደረስንበትን ሰው ይቅርታ መጠየቅና ማካካስ።
፭. ዘወትር በመንፈሳዊ ንባብና በቅዱስ ቁርባን መዘጋጀት።`,
      description: 'የቤተክርስቲያን ቀኖና ለተነሳሂያን ያስቀመጣቸው መመሪያዎች።',
    },
    {
      id: 'pr-5',
      title: 'የአጽዋማት የቀን መቁጠሪያ (የጾም ሰሌዳ)',
      category: 'ጾም',
      geezText: 'አጽዋማት ሰብዐቱ እለ ተሠርዓ በኦሪት ወበወንጌል ለእስራኤል ዘመንፈስ።',
      amharicText: `በኢትዮጵያ ኦርቶዶክስ ተዋሕዶ ቤተክርስቲያን 7ቱ አጽዋማት፡
፩. ዐቢይ ጾም (ሁዳዴ - 55 ቀናት)
፪. ጾመ ሐዋርያት (የሰኔ ጾም)
፫. ጾመ ፍልሰታ (16 ቀናት - የነሐሴ)
፬. ጾመ ነቢያት (የገና ጾም - 43 ቀናት)
፭. ጾመ ነነዌ (3 ቀናት)
፮. ጾመ ጋድ (የብርሃነ ጥምቀት ዋዜማ)
፯. ጾመ ድኅነት (ረቡዕና ዓርብ በዓመቱ ሙሉ)`,
      description: 'በዓመት ውስጥ የሚጾሙት አጽዋማት ሙሉ ዝርዝር።',
    },
  ];

  const currentPrayer = prayers.find((p) => p.id === selectedPrayerId) || prayers[0];

  const handleSaveNotes = () => {
    localStorage.setItem('qh_offline_confession_notes', offlineNotes);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const handleClearNotes = () => {
    if (confirm('የተጻፈው የግል ማስታወሻ ይሰረዝ?')) {
      setOfflineNotes('');
      localStorage.removeItem('qh_offline_confession_notes');
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      
      {/* Offline Ready Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-stone-900 via-amber-950/40 to-stone-900 border border-amber-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-700/50 text-emerald-300 text-xs font-medium">
            <WifiOff className="w-3.5 h-3.5 text-emerald-400" />
            <span>100% ያለ ኢንተርኔት የሚሰራ (Offline Ready)</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-heading font-bold text-amber-100 mt-2">
            የኦፍላይን መንፈሳዊ መጻሕፍትና ማስታወሻ
          </h2>
        </div>

        {/* Category Selector */}
        <div className="flex flex-wrap gap-1.5 p-1 bg-stone-950 rounded-xl border border-stone-800 text-xs">
          {(['ጸሎት', 'ውዳሴ', 'ቀኖና', 'ጾም'] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-lg transition font-medium ${
                activeCategory === cat
                  ? 'bg-amber-900/80 text-amber-200 border border-amber-600/50 font-bold'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid: Prayers Book vs Offline Confession Journal */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column (8 cols): Book Reader */}
        <div className="lg:col-span-8 space-y-4">
          
          {/* Prayer Titles Selector Chips */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {prayers
              .filter((p) => p.category === activeCategory)
              .map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPrayerId(p.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs whitespace-nowrap border transition-all ${
                    selectedPrayerId === p.id
                      ? 'bg-amber-950 border-amber-500 text-amber-200 font-bold'
                      : 'bg-stone-900 border-stone-800 text-stone-300 hover:border-stone-700'
                  }`}
                >
                  {p.title}
                </button>
              ))}
          </div>

          {/* Active Prayer Card */}
          <div className="p-6 rounded-2xl bg-stone-900/70 border border-amber-900/40 shadow-xl space-y-5">
            <div className="border-b border-stone-800 pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-heading font-bold text-amber-200">{currentPrayer.title}</h3>
                <p className="text-xs text-stone-400 mt-0.5">{currentPrayer.description}</p>
              </div>
              <Bookmark className="w-5 h-5 text-amber-400 shrink-0" />
            </div>

            {/* Ge'ez Original Lead Verse */}
            {currentPrayer.geezText && (
              <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-900/50 text-xs font-serif text-amber-300 leading-relaxed">
                <span className="font-bold block text-[11px] uppercase tracking-wider text-amber-400 mb-1">ግዕዝ (Ge'ez)</span>
                {currentPrayer.geezText}
              </div>
            )}

            {/* Amharic Text Body */}
            <div className="text-sm sm:text-base leading-relaxed text-stone-200 font-serif whitespace-pre-wrap">
              {currentPrayer.amharicText}
            </div>

            <div className="pt-3 border-t border-stone-800 text-[11px] text-stone-500 italic">
              * ይህ ጽሑፍ በስልክዎ ማህደረ-ትውስታ ውስጥ ተቀምጧል፤ በማንኛውም ጊዜ ያለ ኢንተርኔት ይነበባል።
            </div>
          </div>

        </div>

        {/* Right Column (4 cols): Personal Offline Confession Journal */}
        <div className="lg:col-span-4 space-y-4">
          
          <div className="p-5 rounded-2xl bg-stone-900/70 border border-amber-900/40 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold font-heading text-amber-200">
                የግል የንስሐ ማስታወሻ (Offline Diary)
              </h3>
              <span className="text-[10px] text-emerald-400 font-mono">በስልክ ብቻ የሚቀመጥ</span>
            </div>

            <p className="text-xs text-stone-400">
              ለቀሲስ ሄኖክ ለመናገር ያሰቡትን ወይም የፈጸሙትን ቀኖና እዚህ ይመዝግቡ። ይህ ጽሑፍ ወደ የትኛውም ሰርቨር አይላክም።
            </p>

            <textarea
              value={offlineNotes}
              onChange={(e) => setOfflineNotes(e.target.value)}
              placeholder="የዕለት የንስሐ ሀሳብ፣ የስግደት ቁጥር፣ የጾም ማስታወሻ እዚህ ይጻፉ..."
              rows={8}
              className="w-full bg-stone-950 border border-stone-700 rounded-xl p-3 text-xs text-stone-100 placeholder-stone-600 focus:outline-none focus:border-amber-500"
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSaveNotes}
                className="flex-1 py-2 rounded-xl bg-amber-900/80 hover:bg-amber-900 border border-amber-600/50 text-amber-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savedSuccess ? 'ተቀምጧል!' : 'በስልክህ አስቀምጥ'}</span>
              </button>

              <button
                type="button"
                onClick={handleClearNotes}
                className="p-2 rounded-xl bg-stone-900 hover:bg-red-950/60 border border-stone-800 text-stone-400 hover:text-red-300 transition"
                title="አጥፋ"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {savedSuccess && (
              <p className="text-xs text-emerald-400 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                <span>ማስታወሻዎ በስልክዎ ላይ በሰላም ተቀምጧል።</span>
              </p>
            )}
          </div>

        </div>

      </div>

    </div>
  );
};
