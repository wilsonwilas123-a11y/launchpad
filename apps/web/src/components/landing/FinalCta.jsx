import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '../ui/Button';
import { Reveal } from '../motion/Motion';
import { RocketMark } from '../brand/RocketMark';
import { useSession } from '../../context/Session';

export default function FinalCta() {
  const navigate = useNavigate();
  const { isAuthed } = useSession();
  return (
    <section className="relative overflow-hidden py-28 sm:py-40 lg:py-44">
      <div className="shell">
        <Reveal className="relative mx-auto max-w-[800px] text-center">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[130%] w-[130%] -translate-x-1/2 -translate-y-1/2 opacity-70 blur-3xl"
            style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.13), transparent 60%)' }}
          />
          <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }} className="mx-auto mb-7 w-fit text-white">
            <RocketMark size={44} />
          </motion.div>
          <h2 className="font-display text-[clamp(2.25rem,6vw,3.75rem)] font-medium leading-[1.02] tracking-[-0.04em] text-white text-shadow-soft">
            Your idea deserves
            <br />a launch.
          </h2>
          <p className="mx-auto mt-5 max-w-[46ch] text-[17.5px] leading-relaxed text-ink-200">
            Four sentences, your own images, one design direction. You will have a live address before the coffee is cold.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3.5">
            <Button size="lg" onClick={() => navigate(isAuthed ? '/build' : '/start')} className="group">
              Start Building
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" strokeWidth={2.2} />
            </Button>
            <Button size="lg" variant="secondary" onClick={() => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' })}>
              Read the steps again
            </Button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
