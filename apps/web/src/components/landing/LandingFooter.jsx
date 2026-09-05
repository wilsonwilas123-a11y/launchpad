import { Link } from 'react-router-dom';
import { Logo } from '../brand/RocketMark';

const COLUMNS = [
  { title: 'Product', links: [{ label: 'Start a launch', to: '/start' }, { label: 'Pricing', to: '/pricing' }, { label: 'How it works', href: '#how' }] },
  { title: 'Live examples', links: [{ label: 'NOVA', to: '/nova' }, { label: 'Afterglow', to: '/afterglow' }] },
  { title: 'Account', links: [{ label: 'Sign in', to: '/sign-in' }, { label: 'Create account', to: '/sign-up' }, { label: 'Dashboard', to: '/dashboard' }] },
];

export default function LandingFooter() {
  return (
    <footer className="relative border-t border-line py-16">
      <div className="shell">
        <div className="grid gap-10 sm:grid-cols-2 sm:gap-12 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Logo />
            <p className="mt-4 max-w-[34ch] text-[15px] leading-relaxed text-ink-400">
              Launchpad turns a description into a published website. Design directions, generation and the renderer are all built in-house.
            </p>
          </div>
          {COLUMNS.map((column) => (
            <div key={column.title}>
              <p className="micro mb-3.5">{column.title}</p>
              <ul className="flex flex-col gap-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {link.to ? (
                      <Link to={link.to} className="text-[15px] text-ink-300 transition hover:text-white">
                        {link.label}
                      </Link>
                    ) : (
                      <a href={link.href} className="text-[15px] text-ink-300 transition hover:text-white">
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line pt-6 text-[14px] text-ink-400">
          <span>© {new Date().getFullYear()} Launchpad</span>
          <Link to="/terms" className="transition hover:text-ink-100">
            Terms
          </Link>
          <Link to="/privacy" className="transition hover:text-ink-100">
            Privacy
          </Link>
          <span className="ml-auto font-mono text-[13.5px]">Built with Launchpad</span>
        </div>
      </div>
    </footer>
  );
}
