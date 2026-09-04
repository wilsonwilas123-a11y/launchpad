import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { RocketMark } from '../brand/RocketMark';

/**
 * Auto-playing splash: a rocket, one line, ~1.6s, then it hands the screen to
 * the landing page. Seen once per tab session — an intro you have to skip twice
 * is an intro people resent.
 */
export default function Splash({ onDone, duration = 1650 }) {
  const [phase, setPhase] = useState('lift');

  useEffect(() => {
    const timers = [setTimeout(() => setPhase('fade'), duration), setTimeout(() => onDone?.(), duration + 520)];
    return () => timers.forEach(clearTimeout);
  }, [duration, onDone]);

  return (
    <AnimatePresence>
      {phase !== 'done' ? (
        <motion.div
          className="fixed inset-0 z-[100] grid place-items-center bg-ink-900"
          initial={{ opacity: 1 }}
          animate={{ opacity: phase === 'fade' ? 0 : 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        >
          <div className="relative flex flex-col items-center gap-6">
            <div className="absolute -inset-24 rounded-full" style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.10), transparent 62%)' }} />
            <motion.div
              initial={{ y: 26, opacity: 0, scale: 0.92 }}
              animate={{ y: [26, -6, -3], opacity: 1, scale: [0.92, 1.03, 1] }}
              transition={{ duration: 1.5, ease: [0.22, 0.9, 0.24, 1], times: [0, 0.62, 1] }}
              className="relative"
            >
              <RocketMark size={66} glow={phase === 'lift'} />
            </motion.div>
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.6 }}
              className="relative text-center font-display text-[19px] tracking-[-0.02em] text-ink-100"
            >
              Building something launch-worthy…
            </motion.p>
            <motion.span
              className="relative h-[2px] w-36 overflow-hidden rounded-full bg-white/10"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              <motion.span
                className="block h-full bg-white"
                initial={{ width: '6%' }}
                animate={{ width: '100%' }}
                transition={{ duration: (duration - 260) / 1000, ease: [0.3, 0.8, 0.2, 1] }}
              />
            </motion.span>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
