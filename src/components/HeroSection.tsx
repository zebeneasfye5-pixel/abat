import React from 'react';
import {
  Shield,
  Users,
  Sparkles,
  BookOpen,
  HeartHandshake,
  CheckCircle2,
  Heart,
  Share2,
  UserPlus,
} from 'lucide-react';
import priestHeroImg from '../assets/images/priest_blessing_hero_1794468346711.jpg';
import { CommunityEngagement } from '../types';

interface HeroSectionProps {
  onNavigate: (tab: string) => void;
  engagement?: CommunityEngagement;
  hasLiked?: boolean;
  onToggleLike?: () => void;
  onShareSite?: () => void;
  onOpenContactsInvite?: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  onNavigate,
  engagement = { likesCount: 0, sharesCount: 0, contactsCount: 0 },
  hasLiked = false,
  onToggleLike,
  onShareSite,
  onOpenContactsInvite,
}) => {
  return (
    <section className="relative overflow-hidden pt-6 pb-10 border-b border-amber-900/20 bg-gradient-to-b from-stone-950 via-stone-900/40 to-stone-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Split Grid: Priest Portrait & Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Column 1: Headings & Direct CTAs (Zero long description paragraphs) */}
          <div className="lg:col-span-7 space-y-5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-950/60 border border-amber-700/40 text-amber-300 text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>ቀሲስ ሄኖክ — ይፋዊ የመንፈሳዊ አገልግሎት መድረክ</span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-heading font-extrabold text-amber-100 leading-tight tracking-wide">
              የንስሐ አባትና ልጅ <br className="hidden sm:inline" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-200 to-amber-500">
                የመንፈስ አንድነትና የሕይወት ጉባኤ
              </span>
            </h1>

            {/* Direct CTA Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                onClick={() => onNavigate('secret-room')}
                className="flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-red-900 to-amber-900 border border-amber-500/40 text-white font-bold text-sm hover:from-red-800 hover:to-amber-800 shadow-lg shadow-red-950/40 transition-all hover:scale-[1.01]"
              >
                <Shield className="w-4 h-4 text-amber-300" />
                <span>የንስሐ ሚስጥር ቤት ግባ</span>
              </button>

              <button
                onClick={() => onNavigate('assembly')}
                className="flex items-center gap-2 px-5 py-3 rounded-xl bg-stone-900 border border-stone-700/80 text-amber-200 font-bold text-sm hover:bg-stone-800 hover:border-amber-600/50 transition-all"
              >
                <Users className="w-4 h-4 text-amber-400" />
                <span>የቀጥታ ዙም ጉባኤ ግባ (Live Zoom)</span>
              </button>

              <button
                onClick={() => onNavigate('ai-advisor')}
                className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-950/30 border border-amber-800/40 text-amber-300 font-bold text-sm hover:bg-amber-950/60 transition-all"
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>የኤአይ እውቀት ማህደር</span>
              </button>
            </div>

            {/* Real Like ❤️, Share 📤 & Add Phone Contacts 📱 Action Bar */}
            <div className="flex flex-wrap items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={onToggleLike}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-extrabold transition ${
                  hasLiked
                    ? 'bg-rose-950/80 border-rose-500 text-rose-200 shadow-md shadow-rose-950/50'
                    : 'bg-stone-900/90 border-stone-700 text-stone-200 hover:border-rose-500/60'
                }`}
              >
                <Heart className={`w-4 h-4 ${hasLiked ? 'fill-rose-500 text-rose-400 scale-110' : 'text-rose-400'} transition-transform`} />
                <span>ላይክ ({engagement.likesCount})</span>
              </button>

              <button
                type="button"
                onClick={onShareSite}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-stone-900/90 hover:bg-stone-800 border border-amber-700/50 text-amber-200 text-xs font-extrabold transition"
              >
                <Share2 className="w-4 h-4 text-amber-400" />
                <span>ድህረገፁን ሼር አድርግ ({engagement.sharesCount})</span>
              </button>

              <button
                type="button"
                onClick={onOpenContactsInvite}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-800/80 to-amber-700/80 hover:from-amber-700 hover:to-amber-600 border border-amber-400/70 text-stone-950 text-xs font-extrabold transition shadow-md"
              >
                <UserPlus className="w-4 h-4" />
                <span>ከስልክዎ ሰው አድ ያድርጉ ({engagement.contactsCount})</span>
              </button>
            </div>

            {/* Clean Verification Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 text-xs text-stone-200 font-bold">
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
                <span>ቀጥታ የHD ድምፅና ቪዲዮ</span>
              </div>
            </div>
          </div>

          {/* Column 2: Priest Blessing Portrait */}
          <div className="lg:col-span-5 relative">
            <div className="relative rounded-2xl overflow-hidden border-2 border-amber-600/40 shadow-2xl bg-stone-900 group">
              <img
                src={priestHeroImg}
                alt="ቀሲስ ሄኖክ በመስቀል ሲባርኩ"
                decoding="async"
                className="w-full h-[380px] sm:h-[460px] object-cover object-top filter brightness-95 group-hover:scale-102 transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/20 to-transparent" />

              {/* Bottom Portrait Bar */}
              <div className="absolute bottom-4 left-4 right-4 p-3.5 rounded-xl bg-stone-950/85 backdrop-blur-md border border-amber-700/40">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-amber-200 font-heading font-bold text-base">ቀሲስ ሄኖክ (የንስሐ አባት)</h4>
                  </div>
                  <div className="px-2.5 py-1 rounded-md bg-red-950/80 border border-red-700/60 text-red-200 text-xs font-bold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span>አገልግሎት ላይ</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 4 Status & Metric Strips below hero */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8 pt-6 border-t border-amber-900/20">
          <div className="p-4 rounded-xl bg-stone-900/50 border border-stone-800 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-amber-950/60 border border-amber-700/40 text-amber-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-lg font-extrabold font-heading text-amber-200 tabular-nums">1,000+ ዝግጁ</p>
              <p className="text-xs text-stone-200 font-bold">በቀጥታ ጉባኤ ተሳታፊዎች</p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-stone-900/50 border border-stone-800 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-red-950/60 border border-red-700/40 text-red-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <p className="text-lg font-extrabold font-heading text-amber-200 tabular-nums">100% የተጠበቀ</p>
              <p className="text-xs text-stone-200 font-bold">የንስሐ ሚስጥር ቤት</p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-stone-900/50 border border-stone-800 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-amber-950/60 border border-amber-700/40 text-amber-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <p className="text-lg font-extrabold font-heading text-amber-200 tabular-nums">ኦፍላይን ሙሉ</p>
              <p className="text-xs text-stone-200 font-bold">የጸሎትና የቀኖና መጻሕፍት</p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-stone-900/50 border border-stone-800 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-700/40 text-emerald-400">
              <HeartHandshake className="w-5 h-5" />
            </div>
            <div>
              <p className="text-lg font-extrabold font-heading text-amber-200 tabular-nums">ዘመናዊ ዋሌት</p>
              <p className="text-xs text-stone-200 font-bold">አስራት፣ በኩራትና ምጽዋት</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
