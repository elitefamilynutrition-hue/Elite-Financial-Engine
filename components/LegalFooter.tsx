import Link from 'next/link';

/** Compact public-site footer — prefers the /legal hub. */
export function LegalFooter({ className = '' }: { className?: string }) {
  return (
    <nav className={`flex flex-wrap gap-4 text-xs text-zinc-500 ${className}`}>
      <Link href="/legal" className="hover:text-zinc-300 underline-offset-2 hover:underline">
        Legal
      </Link>
      <Link href="/about" className="hover:text-zinc-300 underline-offset-2 hover:underline">
        About
      </Link>
      <Link href="/contact" className="hover:text-zinc-300 underline-offset-2 hover:underline">
        Contact
      </Link>
    </nav>
  );
}
