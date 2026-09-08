import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Lock, Laptop, Smartphone } from 'lucide-react';
import { SiteRenderer } from '../site/SiteRenderer';
import { Segmented } from '../ui/Segmented';
import { cx } from '../../lib/format';

/**
 * A scaled, live render of a real spec inside a browser frame.
 * The user can scroll through the preview with their mouse wheel or touch.
 */
export function SitePreview({
  spec,
  slug = 'nova',
  device: deviceProp = 'desktop',
  onDeviceChange,
  tilt = true,
  className,
  frame = true,
  height = 'auto',
}) {
  const boxRef = useRef(null);
  const viewportRef = useRef(null);
  const innerRef = useRef(null);
  const [scale, setScale] = useState(0.3);
  const [frameWidth, setFrameWidth] = useState(0);
  const [device, setDevice] = useState(deviceProp);
  const pickedRef = useRef(false);
  const active = onDeviceChange ? deviceProp : device;

  // Auto-switch to mobile on small viewports until the user picks manually
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

  // Tilt parallax on mouse move
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 180, damping: 22, mass: 0.6 });
  const sy = useSpring(py, { stiffness: 180, damping: 22, mass: 0.6 });
  const rotateY = useTransform(sx, [-0.5, 0.5], [2.4, -2.4]);
  const rotateX = useTransform(sy, [-0.5, 0.5], [-1.8, 1.8]);

  const basis = active === 'mobile' ? 430 : 1180;

  // Measure scale from container width
  useEffect(() => {
    const element = boxRef.current;
    if (!element) return undefined;
    const measure = () => {
      const width = element.clientWidth;
      if (!width) return;
      setScale(Math.max(0.1, Math.min(1, width / basis)));
      setFrameWidth(width);
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

  // Forward mouse-wheel events from the viewport div into its scroll position.
  // Because the inner content is `position:absolute` and scaled with a CSS
  // transform (not real layout height), the viewport must track scroll itself.
  useEffect(() => {
    const viewport = viewportRef.current;
    const inner = innerRef.current;
    if (!viewport || !inner) return undefined;

    let scrollY = 0;

    const onWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();

      const scaledH = inner.offsetHeight * scale;
      const maxScroll = Math.max(0, scaledH - viewport.clientHeight);

      scrollY = Math.max(0, Math.min(maxScroll, scrollY + e.deltaY));
      // Translate the inner content up by scrollY / scale so 1 scrolled pixel
      // equals 1 visual pixel regardless of how zoomed-in the preview is.
      inner.style.transform = `scale(${scale}) translateY(${-scrollY / scale}px)`;
    };

    // Touch scroll
    let touchStartY = 0;
    const onTouchStart = (e) => { touchStartY = e.touches[0].clientY; };
    const onTouchMove = (e) => {
      e.preventDefault();
      const delta = touchStartY - e.touches[0].clientY;
      touchStartY = e.touches[0].clientY;

      const scaledH = inner.offsetHeight * scale;
      const maxScroll = Math.max(0, scaledH - viewport.clientHeight);
      scrollY = Math.max(0, Math.min(maxScroll, scrollY + delta));
      inner.style.transform = `scale(${scale}) translateY(${-scrollY / scale}px)`;
    };

    viewport.addEventListener('wheel', onWheel, { passive: false });
    viewport.addEventListener('touchstart', onTouchStart, { passive: true });
    viewport.addEventListener('touchmove', onTouchMove, { passive: false });

    return () => {
      viewport.removeEventListener('wheel', onWheel);
      viewport.removeEventListener('touchstart', onTouchStart);
      viewport.removeEventListener('touchmove', onTouchMove);
    };
  }, [scale]);

  // When scale changes (device switch, resize) keep the transform in sync
  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    // Reset scroll to top on device change so you don't land mid-page
    inner.style.transform = `scale(${scale}) translateY(0px)`;
  }, [scale, active]);

  const natural = 760 * scale * (active === 'mobile' ? 1.65 : 1.55);
  const cap = active === 'mobile' ? 640 : 960;
  const boxHeight = height === 'auto' ? Math.round(Math.min(cap, Math.max(420, natural))) : height;
  const cramped = frameWidth > 0 && frameWidth < 360;

  const content = (
    <div
      ref={viewportRef}
      className="relative w-full overflow-hidden cursor-ns-resize"
      style={{
        height: boxHeight,
        background: spec?.theme?.colors?.background || '#0a0a0c',
        // Tell the browser touch events here belong to us
        touchAction: 'none',
      }}
    >
      <div
        ref={innerRef}
        data-preview="1"
        className="absolute left-0 top-0"
        style={{
          width: basis,
          transformOrigin: 'top left',
          transform: `scale(${scale}) translateY(0px)`,
          // Smooth the scroll feel slightly
          transition: 'transform 0.08s linear',
          willChange: 'transform',
        }}
      >
        <SiteRenderer spec={spec} device={active} compact={!frame} />
      </div>
    </div>
  );

  if (!frame) {
    return (
      <div
        ref={boxRef}
        className={cx('relative w-full min-w-0', active === 'mobile' ? 'mx-auto max-w-[420px]' : '', className)}
      >
        {content}
      </div>
    );
  }

  return (
    <motion.div
      ref={boxRef}
      onMouseMove={(e) => {
        if (!tilt) return;
        const rect = e.currentTarget.getBoundingClientRect();
        px.set((e.clientX - rect.left) / rect.width - 0.5);
        py.set((e.clientY - rect.top) / rect.height - 0.5);
      }}
      onMouseLeave={() => {
        px.set(0);
        py.set(0);
      }}
      style={tilt ? { rotateX, rotateY, transformPerspective: 1400 } : undefined}
      className={cx(
        'relative min-w-0 max-w-full overflow-hidden rounded-card border border-line bg-ink-850 shadow-lift',
        active === 'mobile' ? 'mx-auto w-full max-w-[420px]' : 'w-full',
        className,
      )}
    >
      {/* Mock browser chrome */}
      <div
        className={cx(
          'flex items-center gap-2 border-b border-line bg-ink-850/90 py-2.5 sm:gap-3',
          cramped ? 'px-2.5' : 'px-3.5',
        )}
      >
        {cramped ? null : (
          <span className="flex shrink-0 gap-1.5">
            {['#ffffff33', '#ffffff22', '#ffffff18'].map((color) => (
              <span key={color} className="h-2 w-2 rounded-full" style={{ background: color }} />
            ))}
          </span>
        )}
        <span
          className={cx(
            'mx-auto flex min-w-0 items-center gap-1.5 truncate rounded-pill border border-line bg-white/[0.04] py-1 font-mono text-ink-200',
            cramped ? 'max-w-[70%] px-2 text-[11px]' : 'max-w-[60%] px-3 text-[13.5px]',
          )}
        >
          <Lock className="h-2.5 w-2.5 shrink-0 opacity-60" strokeWidth={2.4} />
          <span className="truncate">
            launchpad.app<span className="text-white">/{slug}</span>
          </span>
        </span>
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
          className="!border-transparent !bg-transparent !p-0 shrink-0"
        />
      </div>

      {content}

      {/* Fade out the bottom edge */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-ink-850 to-transparent" />

      {/* Subtle scroll hint shown on first render */}
      <div className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2">
        <motion.p
          initial={{ opacity: 0.5 }}
          animate={{ opacity: 0 }}
          transition={{ delay: 2.5, duration: 1.2 }}
          className="rounded-pill bg-black/50 px-3 py-1 text-[11px] text-white/60 backdrop-blur-sm"
        >
          Scroll to explore
        </motion.p>
      </div>
    </motion.div>
  );
}

export default SitePreview;