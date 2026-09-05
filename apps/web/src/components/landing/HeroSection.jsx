import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Play } from 'lucide-react';
import { Button } from '../ui/Button';
import { SitePreview } from './SitePreview';
import { Parallax, Reveal } from '../motion/Motion';
import { useSession } from '../../context/Session';
import { useToast } from '../../context/Toast';

/**
 * The opening screen. One idea in words, one visual proof, one action.
 * Everything else on the page supports this.
 */
export default function HeroSection({ spec, slug = 'nova', live = false }) {
  const siteName = spec?.name || 'A launch';
  const sectionCount = Array.isArray(spec?.sections) ? spec.sections.length : 0;
  const navigate = useNavigate();
  const { isAuthed } = useSession();
  const toast = useToast();

  const start = () => navigate(isAuthed ? '/build' : '/start');
  const how = () => {
    const node = document.getElementById('how');
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else toast.push('The walkthrough is right below.');
  };

  return (
    <section className="relative overflow-hidden pb-16 pt-28 sm:pb-24 sm:pt-32 lg:pb-28 lg:pt-36">
      <div className="shell">
        {/* minmax(0,…) on both tracks: a plain 1fr track refuses to shrink below
            the width of what it holds, which is how the preview used to shove the
            whole hero off the right edge of the screen. */}
        <div className="grid grid-cols-1 items-center gap-10 min-w-0 sm:gap-12 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-14 xl:gap-20">
          <div className="min-w-0 max-w-[600px]">
            <Reveal>
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="mb-6 inline-flex min-h-[34px] items-center gap-2 rounded-pill border border-line bg-white/[0.03] px-3.5 py-2 text-[14px] text-ink-200"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse-soft" />
                The AI website studio for launches
              </motion.p>
            </Reveal>

            <h1 className="font-display text-[clamp(2.5rem,5.8vw,4.6rem)] font-medium leading-[1.02] tracking-[-0.04em] text-white">
              <span className="block">Launch anything.</span>
              <span className="block" style={{ fontStyle: 'italic', letterSpacing: '-0.035em' }}>
                Launch it beautifully.
              </span>
            </h1>

            <p className="mt-5 max-w-[46ch] text-[17.5px] leading-relaxed text-ink-200 sm:mt-6 sm:text-[19px]">
              Describe your idea, add your assets, and Launchpad creates a website built around your vision.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3.5">
              <Button size="lg" onClick={start} className="group">
                Start Building
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" strokeWidth={2.2} />
              </Button>
              <Button size="lg" variant="secondary" onClick={how}>
                <Play className="h-3.5 w-3.5 fill-current" strokeWidth={0} />
                See how it works
              </Button>
            </div>

            <p className="mt-5 text-[14px] text-ink-400 sm:text-[14.5px]">Describe it once. Get a real URL. Change it in plain English.</p>
          </div>

          <Parallax distance={26} className="relative min-w-0">
            <div className="absolute -inset-4 -z-10 rounded-[28px] opacity-70 blur-2xl sm:-inset-6" style={{ background: 'radial-gradient(60% 60% at 60% 20%, rgba(255,255,255,0.14), transparent 70%)' }} />
            <SitePreview spec={spec} slug={slug} className="w-full" />
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.35, duration: 0.6 }}
              className="mx-auto mt-3 w-[97%] rounded-card border border-line bg-ink-850/60 px-3.5 py-2.5 backdrop-blur sm:px-4 sm:py-3"
            >
              <p className="text-[13.5px] leading-relaxed text-ink-300 sm:text-[14px]">
                <span className="text-white">{siteName}</span> — {sectionCount} sections built from a short brief, one design direction and
                the owner's own photographs. {live ? 'This is the live site, not a mockup.' : 'A real generated spec — not a mockup.'}
              </p>
            </motion.div>
          </Parallax>
        </div>
      </div>
    </section>
  );
}
