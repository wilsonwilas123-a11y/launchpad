import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Globe, Lock } from 'lucide-react';
import { SiteRenderer } from '../site/SiteRenderer';
import { Segmented } from '../ui/Segmented';
import { Laptop, Smartphone } from 'lucide-react';
import { cx } from '../../lib/format';

/**
 * A scaled, live render of a real spec inside a browser frame. Used on the
 * landing hero, the dashboard cards and the examples grid — the preview is the
 * product, so it is never an image of one.
 *
 * `tilt` adds pointer parallax; it is switched off inside the builder where the
 * preview is interactive.
 */
export function SitePreview({ spec, slug = 'nova', device: deviceProp = 'desktop', onDeviceChange, tilt = true, className, frame = true, height = 'auto' }) {
  const boxRef = useRef(null);
  const [scale, setScale] = useState(0.3);
  const [device, setDevice] = useState(deviceProp);
  const pickedRef = useRef(false);
  const active = onDeviceChange ? deviceProp : device;

  // A 1180px desktop mock scaled into a 340px phone column is unreadable, so an
  // uncontrolled preview follows the viewport until someone picks a device by
  // hand. (A phone showing the phone version is also the better sales pitch.)
  useEffect(() => {
    if (onDeviceChange || typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(max-width: 639px)');
    const apply = () => {
      if (!pickedRef.current) setDevice(mq.matches ? 'mobile' : deviceProp);
    };
    apply();
    if (mq.addEventListener) mq.addEventListener('change', apply);
    else mq.addListener(apply);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', apply);
      else mq.removeListener(apply);
    };
  }, [deviceProp, onDeviceChange]);

  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 180, damping: 22, mass: 0.6 });
  const sy = useSpring(py, { stiffness: 180, damping: 22, mass: 0.6 });
  const rotateY = useTransform(sx, [-0.5, 0.5], [2.4, -2.4]);
  const rotateX = useTransform(sy, [-0.5, 0.5], [-1.8, 1.8]);

  const basis = active === 'mobile' ? 430 : 1180;

  useEffect(() => {
    const element = boxRef.current;
    if (!element) return undefined;
    // The rendered page inside is a fixed 1180 (or 430) CSS px wide and only
    // *looks* smaller: a transform never changes layout size. So the scale has
    // to come from the frame's own width, and the frame must never be widened by
    // what it contains — hence min-w-0 on the frame and the absolute child below.
    const measure = () => {
      const width = element.clientWidth;
      if (!width) return;
      setScale(Math.max(0.1, Math.min(1, width / basis)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [basis]);

  const onMove = (event) => {
    if (!tilt) return;
    const rect = event.currentTarget.getBoundingClientRect();
    px.set((event.clientX - rect.left) / rect.width - 0.5);
    py.set((event.clientY - rect.top) / rect.height - 0.5);
  };

  const content = (() => {
    // How much of the rendered page is shown. The window is 760 CSS px tall at
    // full size, so the scaled frame wants `760 * scale`; at the hero's ~0.45 that
    // is only ~340px of mock next to a 400px headline, so it is stretched a
    // little and kept within one screen at every width.
    const natural = 760 * scale * (active === 'mobile' ? 1.5 : 1.25);
    const cap = active === 'mobile' ? 560 : 660;
    const boxHeight = height === 'auto' ? Math.round(Math.min(cap, Math.max(400, natural))) : height;
    return (
      <div
        className="relative w-full overflow-hidden"
        style={{ height: boxHeight, background: spec?.theme?.colors?.background || '#0a0a0c' }}
      >
        {/* Out of flow on purpose: an in-flow 1180px child would set the page's
            min-content width and push the whole hero past the viewport. */}
        <div
          data-preview="1"
          className="absolute left-0 top-0"
          style={{ width: basis, transformOrigin: 'top left', transform: `scale(${scale})` }}
        >
          <SiteRenderer spec={spec} device={active} compact={!frame} />
        </div>
      </div>
    );
  })();

  if (!frame) {
    return (
      <div ref={boxRef} className={cx('relative w-full min-w-0', className)}>
        {content}
      </div>
    );
  }

  return (
    <motion.div
      ref={boxRef}
      onMouseMove={onMove}
      onMouseLeave={() => {
        px.set(0);
        py.set(0);
      }}
      style={tilt ? { rotateX, rotateY, transformPerspective: 1400 } : undefined}
      className={cx('relative w-full min-w-0 max-w-full overflow-hidden rounded-card border border-line bg-ink-850 shadow-lift', className)}
    >
      <div className="flex items-center gap-3 border-b border-line bg-ink-850/90 px-3.5 py-2.5">
        <span className="flex gap-1.5">
          {['#ffffff33', '#ffffff22', '#ffffff18'].map((color) => (
            <span key={color} className="h-2 w-2 rounded-full" style={{ background: color }} />
          ))}
        </span>
        <span className="mx-auto flex max-w-[60%] items-center gap-1.5 rounded-pill border border-line bg-white/[0.04] px-3 py-1 font-mono text-[13.5px] text-ink-200">
          <Lock className="h-2.5 w-2.5 opacity-60" strokeWidth={2.4} />
          launchpad.app<span className="text-white">/{slug}</span>
        </span>
        {onDeviceChange || true ? (
          <Segmented
            size="sm"
            value={active}
            onChange={(value) => {
              pickedRef.current = true;
              (onDeviceChange || setDevice)(value);
            }}
            options={[
              { value: 'mobile', label: '', icon: Smartphone },
              { value: 'desktop', label: '', icon: Laptop },
            ]}
            className="!border-transparent !bg-transparent !p-0"
          />
        ) : (
          <Globe className="h-3.5 w-3.5 text-ink-400" />
        )}
      </div>
      {content}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-ink-850 to-transparent" />
    </motion.div>
  );
}

export default SitePreview;
