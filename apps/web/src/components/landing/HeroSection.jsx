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
export default function HeroSection({ spec, slug = 'nova' }) {
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
    <section className="relative overflow-hidden pb-16 pt-28 sm:pb-24 sm:pt-36">
      <div className="shell">
        <div className="grid items-center gap-12 lg:grid-cols-[1.02fr_1fr] lg:gap-16">
          <div className="max-w-[640px]">
            <Reveal>
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="mb-6 inline-flex items-center gap-2 rounded-pill border border-line bg-white/[0.03] px-3 py-1.5 text-[12px] text-ink-200"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse-soft" />
                The AI website studio for launches
              </motion.p>
            </Reveal>

            <h1 className="font-display text-[clamp(2.6rem,7.4vw,4.75rem)] font-medium leading-[0.98] tracking-[-0.04em] text-white">
              <span className="block">Launch anything.</span>
              <span className="block" style={{ fontStyle: 'italic', letterSpacing: '-0.035em' }}>
                Launch it beautifully.
              </span>
            </h1>

            <p className="mt-6 max-w-[52ch] text-[17px] leading-relaxed text-ink-200 sm:text-[18.5px]">
              Describe your idea, add your assets, and Launchpad creates a website built around your vision.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={start} className="group">
                Start Building
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" strokeWidth={2.2} />
              </Button>
              <Button size="lg" variant="secondary" onClick={how}>
                <Play className="h-3.5 w-3.5 fill-current" strokeWidth={0} />
                See how it works
              </Button>
            </div>

            <p className="mt-5 text-[13px] text-ink-400">Describe it once. Get a real URL. Change it in plain English.</p>
          </div>

          <Parallax distance={26} className="relative">
            <div className="absolute -inset-6 -z-10 rounded-[28px] opacity-70 blur-2xl" style={{ background: 'radial-gradient(60% 60% at 60% 20%, rgba(255,255,255,0.14), transparent 70%)' }} />
            <SitePreview spec={spec} slug={slug} className="w-full" />
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.35, duration: 0.6 }}
              className="mx-auto -mt-6 w-[92%] rounded-b-card border border-t-0 border-line bg-ink-850/70 px-4 py-3 backdrop-blur"
            >
              <p className="text-[12.5px] leading-relaxed text-ink-300">
                <span className="text-white">NOVA</span> — a streetwear drop generated from four sentences, a design direction and four
                photographs. This is the live site, not a mockup.
              </p>
            </motion.div>
          </Parallax>
        </div>
      </div>
    </section>
  );
}
