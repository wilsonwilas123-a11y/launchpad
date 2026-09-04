import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';
import { cx } from '../../lib/format';

/** Scroll-triggered rise-in. The landing page is built from these. */
export function Reveal({ children, delay = 0, y = 18, className, as = 'div', once = true }) {
  const Tag = motion[as] || motion.div;
  const reduce = useReducedMotion();
  return (
    <Tag
      className={className}
      initial={reduce ? { opacity: 1 } : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: '-12% 0px -8% 0px' }}
      transition={{ duration: 0.7, delay, ease: [0.22, 0.8, 0.24, 1] }}
    >
      {children}
    </Tag>
  );
}

/** Staggered list reveal — used for the 9 capabilities and the 7 steps. */
export function RevealGroup({ children, step = 0.07, className }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, margin: '-10% 0px' }}
      variants={{ hidden: {}, shown: { transition: { staggerChildren: step } } }}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({ children, className, y = 16 }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={reduce ? { hidden: { opacity: 1 }, shown: { opacity: 1 } } : { hidden: { opacity: 0, y }, shown: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 0.8, 0.24, 1] } } }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Scroll parallax. `distance` is in pixels of travel across the element's own
 * scroll range; keeps the preview panel floating as you pass it.
 */
export function Parallax({ children, distance = 40, className }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [reduce ? 0 : distance, reduce ? 0 : -distance]);
  return (
    <motion.div ref={ref} style={{ y }} className={cx(className)}>
      {children}
    </motion.div>
  );
}

/** Fades content in on mount, for route-level transitions. */
export function FadeIn({ children, className, delay = 0, y = 10 }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 0.8, 0.24, 1] }}
    >
      {children}
    </motion.div>
  );
}
