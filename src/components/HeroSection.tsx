import React from 'react';
import { Shield, Users, Sparkles, BookOpen, HeartHandshake, CheckCircle2 } from 'lucide-react';

interface HeroSectionProps {
  onNavigate: (tab: string) => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ onNavigate }) => {
  return (
    <section className="relative overflow-hidden pt-6 pb-12 border-b border-amber-900/20 bg-gradient-to-b from-stone-950 via-stone-900/40 to-stone-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Split Grid: Priest Portrait & Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          
          {/* Column 1: Headings & Direct CTAs (Zero long description paragraphs) */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-950/60 border border-amber-700/40 text-amber-300 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span>ቀሲስ ሄኖክ — ይፋዊ የመንፈሳዊ አገልግሎት መድረክ</span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-heading font-bold text-amber-100 leading-tight tracking-wide">
              የንስሐ አባትና ልጅ <br className="hidden sm:inline" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-200 to-amber-500">
                የመንፈስ አንድነትና የሕይወት ጉባኤ
              </span>
            </h1>

            {/* Direct CTA Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={() => onNavigate('secret-room')}
                className="flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-red-900 to-amber-900 border border-amber-500/40 text-white font-medium text-sm hover:from-red-800 hover:to-amber-800 shadow-lg shadow-red-950/40 transition-all hover:scale-[1.01]"
              >
                <Shield className="w-4 h-4 text-amber-300" />
                <span>የንስሐ ሚስጥር ቤት ግባ</span>
              </button>

              <button
                onClick={() => onNavigate('assembly')}
                className="flex items-center gap-2 px-5 py-3 rounded-xl bg-stone-900 border border-stone-700/80 text-amber-200 font-medium text-sm hover:bg-stone-800 hover:border-amber-600/50 transition-all"
              >
                <Users className="w-4 h-4 text-amber-400" />
                <span>የቀጥታ ዙም ጉባኤ ግባ (Live Zoom)</span>
              </button>

              <button
                onClick={() => onNavigate('ai-advisor')}
                className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-950/30 border border-amber-800/40 text-amber-300 font-medium text-sm hover:bg-amber-950/60 transition-all"
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>የኤአይ ምክር ጠይቅ</span>
              </button>
            </div>

            {/* Clean Verification Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-4 text-xs text-stone-300">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
                <span>100% ሚስጥራዊ የካህን ቃል</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
                <span>ያለ ኢንተርኔት የሚሰራ (ኦፍላይን)</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
                <span>ቀጥታ የድምፅና ማይክ መሳተፊያ</span>
              </div>
            </div>
          </div>

          {/* Column 2: Priest Blessing Portrait */}
          <div className="lg:col-span-5 relative">
            <div className="relative rounded-2xl overflow-hidden border-2 border-amber-600/40 shadow-2xl bg-stone-900 group">
              <img
                src="/src/assets/images/priest_blessing_hero_1794468346711.jpg"
                alt="ቀሲስ ሄኖክ በመስቀል ሲባርኩ"
                referrerPolicy="no-referrer"
                className="w-full h-[380px] sm:h-[460px] object-cover object-top filter brightness-95 group-hover:scale-102 transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/20 to-transparent" />
              
              {/* Bottom Portrait Bar */}
              <div className="absolute bottom-4 left-4 right-4 p-3.5 rounded-xl bg-stone-950/85 backdrop-blur-md border border-amber-700/40">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-amber-200 font-heading font-semibold text-base">ቀሲስ ሄኖክ (የንስሐ አባት)</h4>
                  </div>
                  <div className="px-2.5 py-1 rounded-md bg-red-950/80 border border-red-700/60 text-red-200 text-xs font-medium flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span>አገልግሎት ላይ</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* 4 Status & Metric Strips below hero (Crisp titles, no explanatory paragraphs) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-10 pt-6 border-t border-amber-900/20">
          <div className="p-4 rounded-xl bg-stone-900/50 border border-stone-800 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-amber-950/60 border border-amber-700/40 text-amber-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-lg font-bold font-heading text-amber-200 tabular-nums">12,480+</p>
              <p className="text-xs text-stone-300">በቀጥታ ጉባኤ ተሳታፊዎች</p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-stone-900/50 border border-stone-800 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-red-950/60 border border-red-700/40 text-red-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <p className="text-lg font-bold font-heading text-amber-200 tabular-nums">100% የተጠበቀ</p>
              <p className="text-xs text-stone-300">የንስሐ ሚስጥር ቤት</p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-stone-900/50 border border-stone-800 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-amber-950/60 border border-amber-700/40 text-amber-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <p className="text-lg font-bold font-heading text-amber-200 tabular-nums">ኦፍላይን ሙሉ</p>
              <p className="text-xs text-stone-300">የጸሎትና የቀኖና መጻሕፍት</p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-stone-900/50 border border-stone-800 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-700/40 text-emerald-400">
              <HeartHandshake className="w-5 h-5" />
            </div>
            <div>
              <p className="text-lg font-bold font-heading text-amber-200 tabular-nums">ዘመናዊ ዋሌት</p>
              <p className="text-xs text-stone-300">አስራት፣ በኩራትና ምጽዋት</p>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
};
