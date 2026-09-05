import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Logo } from '../brand/RocketMark';
import { Button } from '../ui/Button';
import { useSession } from '../../context/Session';
import { cx } from '../../lib/format';

const LINKS = [
  { label: 'How it works', href: '#how' },
  { label: 'What you can launch', href: '#launch' },
  { label: 'Examples', href: '#examples' },
  { label: 'Pricing', to: '/pricing' },
];

export default function LandingNav() {
  const [solid, setSolid] = useState(false);
  const { isAuthed } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -18, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 0.8, 0.24, 1] }}
      className={cx(
        'fixed inset-x-0 top-0 z-50 transition-colors duration-300',
        solid ? 'border-b border-line bg-ink-900/80 backdrop-blur-xl' : 'border-b border-transparent',
      )}
    >
      <div className="shell flex h-16 items-center gap-2.5 sm:h-[68px] sm:gap-7">
        <span className="shrink-0 whitespace-nowrap">
          <Logo size="md" href={isAuthed ? '/dashboard' : '/'} />
        </span>
        <nav className="ml-4 hidden items-center gap-6 lg:flex xl:gap-7">
          {LINKS.map((link) =>
            link.to ? (
              <Link key={link.label} to={link.to} className="text-[15px] text-ink-200 transition hover:text-white">
                {link.label}
              </Link>
            ) : (
              <a key={link.label} href={link.href} className="text-[15px] text-ink-200 transition hover:text-white">
                {link.label}
              </a>
            ),
          )}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {isAuthed ? (
            <>
              <Button variant="ghost" size="md" to="/dashboard" className="hidden sm:inline-flex">
                Dashboard
              </Button>
              <Button size="md" onClick={() => navigate('/build')}>
                <span className="hidden sm:inline">New launch</span>
                <span className="sm:hidden">New</span> <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <>
              {/* The row is tight at 360px: the quieter action yields first, then
                  the label shortens. Nothing overflows the fixed bar. */}
              <Button variant="ghost" size="md" to="/sign-in" className="hidden min-[430px]:inline-flex">
                Sign in
              </Button>
              <Button size="md" onClick={() => navigate('/start')}>
                <span className="hidden sm:inline">Start Building</span>
                <span className="sm:hidden">Start</span>
              </Button>
            </>
          )}
        </div>
      </div>
    </motion.header>
  );
}
