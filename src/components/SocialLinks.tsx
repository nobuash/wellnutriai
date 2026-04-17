import Link from 'next/link';
import { Instagram } from 'lucide-react';

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.86a8.16 8.16 0 004.77 1.52V6.94a4.85 4.85 0 01-1-.25z" />
    </svg>
  );
}

export function SocialLinks({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <Link
        href="https://instagram.com/wellnutriai"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Instagram WellNutriAI"
        className="text-slate-400 hover:text-pink-500 transition-colors"
      >
        <Instagram className="h-5 w-5" />
      </Link>
      <Link
        href="https://tiktok.com/@wellnutriai"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="TikTok WellNutriAI"
        className="text-slate-400 hover:text-slate-700 transition-colors"
      >
        <TikTokIcon className="h-5 w-5" />
      </Link>
    </div>
  );
}
