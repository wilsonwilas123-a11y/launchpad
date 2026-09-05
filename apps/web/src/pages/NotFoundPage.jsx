import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { RocketMark } from '../components/brand/RocketMark';
import { Button } from '../components/ui/Button';
import { AmbientBackdrop } from '../components/motion/AmbientBackdrop';
import { useSession } from '../context/Session';

/** On-brand 404 — the rocket still leaves, there is just nothing to launch here. */
export default function NotFoundPage({ slug }) {
  const { isAuthed } = useSession();
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden px-6">
      <AmbientBackdrop variant="quiet" />
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 0.8, 0.24, 1] }}
        className="relative flex flex-col items-center text-center"
      >
        <motion.div animate={{ y: [0, -8, 0], rotate: [0, -3, 0] }} transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}>
          <RocketMark size={54} />
        </motion.div>
        <p className="micro mt-8">404</p>
        <h1 className="mt-3 max-w-[16ch] font-display text-[clamp(2rem,6vw,3.2rem)] font-medium leading-[1.03] tracking-[-0.04em]">
          This page doesn’t exist (yet).
        </h1>
        <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-ink-300">
          {slug ? (
            <>
              Nothing is published at <span className="font-mono text-ink-100">launchpad.app/{slug}</span>. It may have been taken offline, or the
              address was never claimed.
            </>
          ) : (
            'The address you followed is not one Launchpad knows about.'
          )}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" to={isAuthed ? '/dashboard' : '/'}>
            {isAuthed ? 'Back to dashboard' : 'Back to Launchpad'}
          </Button>
          <Button size="lg" variant="secondary" to="/start">
            Start a launch
          </Button>
        </div>
        <Link to="/pricing" className="link-quiet mt-6 text-[14px]">
          Or look at pricing
        </Link>
      </motion.div>
    </div>
  );
}
