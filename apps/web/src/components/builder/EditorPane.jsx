import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown, ArrowUp, Image as ImageIcon, Minus, Plus, Shuffle, X } from 'lucide-react';
import { Segmented, Slider, Stepper } from '../ui/Segmented';
import { Chip } from '../ui/Primitives';
import { Field, Input, Select, Switch } from '../ui/Field';
import { Row } from '../ui/Field';
import { Button } from '../ui/Button';
import { cx, isVideo } from '../../lib/format';

const FONT_OPTIONS = [
  { value: 'display', label: 'Instrument Serif' },
  { value: 'grotesk', label: 'Helvetica Grotesk' },
  { value: 'sans', label: 'Inter Sans' },
  { value: 'serif', label: 'Georgia Serif' },
  { value: 'condensed', label: 'Condensed' },
  { value: 'mono', label: 'JetBrains Mono' },
];

const COLOUR_KEYS = [
  { key: 'background', label: 'Background' },
  { key: 'surface', label: 'Surface' },
  { key: 'text', label: 'Text' },
  { key: 'textMuted', label: 'Muted text' },
  { key: 'accent', label: 'Accent' },
  { key: 'accentText', label: 'Text on accent' },
  { key: 'border', label: 'Hairlines' },
];

const EFFECTS = ['grain', 'rules', 'glow', 'slow-fade', 'grid', 'mono-labels', 'index-numbers', 'marquee', 'outline-type', 'vignette', 'soft-shadow'];

const PLATFORM_TARGETS = [
  { value: ['mobile'], label: 'Mobile first' },
  { value: ['desktop'], label: 'Desktop' },
  { value: ['mobile', 'desktop'], label: 'Both' },
];

const MONOCHROME = [
  { name: 'Ink', colors: { background: '#0a0a0c', surface: '#131318', surfaceAlt: '#1b1b21', text: '#f6f6f7', textMuted: '#9a9aa4', accent: '#ffffff', accentText: '#0a0a0c', border: 'rgba(255,255,255,0.1)' } },
  { name: 'Paper', colors: { background: '#f4f2ee', surface: '#ffffff', surfaceAlt: '#eae7e0', text: '#16151a', textMuted: '#5d5b63', accent: '#16151a', accentText: '#f4f2ee', border: 'rgba(0,0,0,0.12)' } },
  { name: 'Slate', colors: { background: '#101418', surface: '#171d23', surfaceAlt: '#1e252d', text: '#eef2f5', textMuted: '#93a0ac', accent: '#8fd6c8', accentText: '#0b0f12', border: 'rgba(255,255,255,0.09)' } },
  { name: 'Ember', colors: { background: '#12100e', surface: '#1b1714', surfaceAlt: '#241e19', text: '#f7f2ea', textMuted: '#a89b8a', accent: '#e2703a', accentText: '#12100e', border: 'rgba(255,255,255,0.08)' } },
];

/**
 * The inspector. Three tabs: what the page says, what it looks like, and how it
 * is arranged. Every control writes to the same spec the live site reads, so
 * there is no "apply" step and no second source of truth.
 */
export default function EditorPane({ spec, section, vocabulary = [], onTheme, onSection, onNav, onPlatform, onPlatformTarget, onMove, onRemap, onRevealAssets, onPickAsset, busy }) {
  const [tab, setTab] = useState('content');
  const theme = spec?.theme || {};
  const colours = theme.colors || {};
  const typography = theme.typography || {};
  const settings = section?.settings || {};
  const targets = spec?.platform?.targets?.length ? spec.platform.targets.map((t) => t.mode || t) : spec?.platform?.mode ? [spec.platform.mode] : ['both'];
  const labelFor = (type) => vocabulary.find((entry) => entry.type === type)?.label || type;

  const patchContent = (key, value) => {
    if (!section) return;
    onSection(section.id, { content: { ...(section.content || {}), [key]: value } });
  };

  const patchSetting = (key, value) => {
    if (!section) return;
    const next = { ...settings, [key]: value };
    if (value === null || value === false || value === undefined) delete next[key];
    onSection(section.id, { settings: next });
  };

  const entries = useMemo(() => describeContent(section?.content || {}, section?.type, labelFor), [section, vocabulary]);

  return (
    <aside className="flex min-h-0 w-full flex-col border-l border-line bg-ink-900/60">
      <div className="border-b border-line px-3 py-3">
        <Segmented
          size="sm"
          className="w-full justify-between"
          layoutId="builder-right"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'content', label: 'Content' },
            { value: 'style', label: 'Style' },
            { value: 'layout', label: 'Layout' },
          ]}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-4">
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
            {tab === 'content' ? (
              section ? (
                <div className="flex flex-col gap-4">
                  <header className="flex items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <p className="micro">Editing</p>
                      <h3 className="truncate font-display text-[19px] tracking-[-0.02em] text-white">{section.label || labelFor(section.type)}</h3>
                    </div>
                    <span className="shrink-0 rounded-pill border border-line px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-400">{section.type}</span>
                  </header>

                  <Field label="Section label" htmlFor="sec-label" hint="Used in the navigation and in this panel.">
                    <Input id="sec-label" defaultValue={section.label || ''} onBlur={(event) => onSection(section.id, { label: event.target.value })} />
                  </Field>

                  {entries.map((entry) => (
                    <ContentControl key={entry.key} entry={entry} onChange={(value) => patchContent(entry.key, value)} />
                  ))}

                  <div className="border-t border-line pt-4">
                    <p className="micro mb-2">Images in this section</p>
                    {(section.assets || []).length ? (
                      <ul className="flex flex-col gap-2">
                        {section.assets.map((placed, index) => (
                          <li key={placed.assetId || index} className="flex items-center gap-2.5 rounded-tile border border-line p-2">
                            <span className="grid h-10 w-12 shrink-0 place-items-center overflow-hidden rounded-[8px] bg-black/40">
                              {isVideo(placed.filename || placed.url) ? (
                                <span className="text-[9px] uppercase text-ink-300">video</span>
                              ) : (
                                <img src={placed.url} alt="" className="h-full w-full object-cover" />
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[12.5px] text-ink-100">{placed.alt || placed.filename || labelFor(placed.assetId)}</span>
                              <span className="block text-[10.5px] text-ink-500">{placed.focal ? `focal ${Math.round(placed.focal.x * 100)}% ${Math.round(placed.focal.y * 100)}%` : 'auto crop'}</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => onSection(section.id, { assets: (section.assets || []).filter((_, position) => position !== index) })}
                              className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line text-ink-400 transition hover:text-white"
                              title="Take out of this section"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[12px] leading-relaxed text-ink-400">Nothing placed here yet.</p>
                    )}
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="secondary" className="flex-1" onClick={() => onPickAsset(section.id)}>
                        <ImageIcon className="h-3.5 w-3.5" />
                        Choose from assets
                      </Button>
                      <Button size="sm" variant="ghost" onClick={onRevealAssets} title="Open the assets list">
                        <Shuffle className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <Empty text="Click any section in the page — or in the Sections list — and its text, images and layout appear here." />
              )
            ) : null}

            {tab === 'style' ? (
              <div className="flex flex-col gap-5">
                <div>
                  <p className="micro mb-2">Palette</p>
                  <div className="mb-2.5 flex flex-wrap gap-1.5">
                    {MONOCHROME.map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => onTheme({ colors: preset.colors })}
                        className="inline-flex items-center gap-1.5 rounded-pill border border-line py-1 pl-1 pr-2.5 text-[11.5px] text-ink-200 transition hover:border-white/35 hover:text-white"
                      >
                        <span className="flex overflow-hidden rounded-full border border-white/15">
                          {[preset.colors.background, preset.colors.text, preset.colors.accent].map((colour, position) => (
                            <span key={`${preset.name}-${position}`} className="h-3.5 w-3.5" style={{ background: colour }} />
                          ))}
                        </span>
                        {preset.name}
                      </button>
                    ))}
                  </div>
                  <ul className="flex flex-col divide-y divide-[rgba(255,255,255,0.07)]">
                    {COLOUR_KEYS.map(({ key, label }) => (
                      <li key={key} className="flex items-center gap-2 py-1.5">
                        <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-100">{label}</span>
                        <input
                          type="color"
                          aria-label={`${label} colour picker`}
                          value={toHex(colours[key])}
                          onChange={(event) => onTheme({ colors: { [key]: event.target.value } })}
                          className="h-6 w-6 shrink-0 cursor-pointer rounded border border-line bg-transparent p-0"
                        />
                        <input
                          value={colours[key] || ''}
                          onChange={(event) => onTheme({ colors: { [key]: event.target.value } })}
                          aria-label={`${label} value`}
                          className="w-[104px] shrink-0 rounded-pill border border-line bg-ink-800 px-2 py-1 font-mono text-[11px] text-ink-100 outline-none transition focus:border-white/35"
                        />
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-[11px] leading-relaxed text-ink-500">
                    Hex or any CSS colour. “Text on accent” is what sits inside buttons — pick it for contrast and the preview follows immediately.
                  </p>
                </div>

                <div className="border-t border-line pt-4">
                  <p className="micro mb-2">Typography</p>
                  <div className="flex flex-col gap-3">
                    <Field label="Headings" htmlFor="ff-heading">
                      <Select id="ff-heading" value={typography.headingFont || 'display'} onChange={(event) => onTheme({ typography: { headingFont: event.target.value } })}>
                        {FONT_OPTIONS.map((font) => (
                          <option key={font.value} value={font.value}>
                            {font.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Body" htmlFor="ff-body">
                      <Select id="ff-body" value={typography.bodyFont || 'sans'} onChange={(event) => onTheme({ typography: { bodyFont: event.target.value } })}>
                        {FONT_OPTIONS.map((font) => (
                          <option key={font.value} value={font.value}>
                            {font.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Slider label="Heading scale" min={1.02} max={1.34} step={0.01} value={Number(typography.scale) || 1.14} onChange={(value) => onTheme({ typography: { scale: value } })} />
                    <Slider label="Body size" min={14} max={19} step={0.5} value={Number(typography.bodySize) || 16} onChange={(value) => onTheme({ typography: { bodySize: value } })} format={(value) => `${value}px`} />
                    <Row label="Heading weight">
                      <Stepper value={Number(typography.headingWeight) || 600} min={300} max={800} step={100} onChange={(value) => onTheme({ typography: { headingWeight: value } })} />
                    </Row>
                    <Row label="Heading tracking">
                      <Stepper value={Number.parseFloat(typography.headingTracking || '-0.03')} min={-0.06} max={0.02} step={0.005} format={(value) => Number(value).toFixed(3)} onChange={(value) => onTheme({ typography: { headingTracking: `${value}em` } })} />
                    </Row>
                  </div>
                </div>

                <div className="border-t border-line pt-4">
                  <p className="micro mb-2">Treatment</p>
                  <Row label="Corners">
                    <Stepper value={Number(theme.radius ?? 12)} min={0} max={28} step={2} format={(value) => `${value}px`} onChange={(value) => onTheme({ radius: value })} />
                  </Row>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {EFFECTS.map((effect) => {
                      const active = (theme.effects || []).includes(effect);
                      return (
                        <Chip
                          key={effect}
                          active={active}
                          title={active ? 'Remove this effect' : 'Add this effect'}
                          onClick={() => onTheme({ effects: active ? (theme.effects || []).filter((item) => item !== effect) : [...(theme.effects || []), effect] })}
                        >
                          {effect}
                        </Chip>
                      );
                    })}
                  </div>
                  <Row label="Image crop" hint="How your photographs sit in their frames.">
                    <Select className="h-8 w-[124px] text-[12.5px]" value={theme.imagery?.fill || 'cover'} onChange={(event) => onTheme({ imagery: { fill: event.target.value } })}>
                      {['cover', 'contain', 'full-bleed'].map((fill) => (
                        <option key={fill} value={fill}>
                          {fill}
                        </option>
                      ))}
                    </Select>
                  </Row>
                  <Row label="Overlay" hint="Darkening behind text on images.">
                    <Stepper value={Number(theme.imagery?.overlay ?? 0.4)} min={0} max={0.85} step={0.05} format={(value) => Number(value).toFixed(2)} onChange={(value) => onTheme({ imagery: { overlay: value } })} />
                  </Row>
                </div>
              </div>
            ) : null}

            {tab === 'layout' ? (
              <div className="flex flex-col gap-5">
                <div>
                  <p className="micro mb-2">{section ? `${section.label || labelFor(section.type)} — layout` : 'Page layout'}</p>
                  {section ? (
                    <div className="flex flex-col gap-1">
                      <Row label="Alignment">
                        {['left', 'center'].map((align) => (
                          <button
                            key={align}
                            type="button"
                            onClick={() => patchSetting('align', settings.align === align ? null : align)}
                            className={cx('rounded-pill border px-2.5 py-1 text-[11.5px] transition', settings.align === align ? 'border-white bg-white text-ink-900' : 'border-line text-ink-300 hover:text-white')}
                          >
                            {align}
                          </button>
                        ))}
                      </Row>
                      <Row label="Section padding">
                        <Select className="h-8 w-[104px] text-[12.5px]" value={settings.padding || 'md'} onChange={(event) => patchSetting('padding', event.target.value)}>
                          {['none', 'sm', 'md', 'lg', 'xl'].map((padding) => (
                            <option key={padding} value={padding}>
                              {padding}
                            </option>
                          ))}
                        </Select>
                      </Row>
                      <Row label="Columns" hint="For grids and galleries.">
                        <Stepper value={Number(settings.columns) || 3} min={1} max={5} onChange={(value) => patchSetting('columns', value)} />
                      </Row>
                      <Row label="Invert colours">
                        <Switch checked={Boolean(settings.invert)} onChange={(value) => patchSetting('invert', value)} label={settings.invert ? 'Inverted' : 'Normal'} />
                      </Row>
                      <Row label="Full bleed">
                        <Switch checked={Boolean(settings.bleed)} onChange={(value) => patchSetting('bleed', value)} label={settings.bleed ? 'Edge to edge' : 'Framed'} />
                      </Row>
                      <Row label="Numbered">
                        <Switch checked={Boolean(settings.positionCounter)} onChange={(value) => patchSetting('positionCounter', value)} label={settings.positionCounter ? '01 · 02 · 03' : 'Off'} />
                      </Row>
                      <Row label="Rules">
                        {['top', 'bottom'].map((rule) => (
                          <button
                            key={rule}
                            type="button"
                            onClick={() => patchSetting('rule', settings.rule === rule ? null : rule)}
                            className={cx('rounded-pill border px-2.5 py-1 text-[11.5px] transition', settings.rule === rule ? 'border-white bg-white text-ink-900' : 'border-line text-ink-300 hover:text-white')}
                          >
                            {rule}
                          </button>
                        ))}
                      </Row>
                      <div className="mt-2 flex gap-1.5">
                        <button type="button" onClick={() => onMove(section, -1)} className="flex-1 rounded-pill border border-line py-1.5 text-[11.5px] text-ink-200 transition hover:border-white/30 hover:text-white">
                          Move up
                        </button>
                        <button type="button" onClick={() => onMove(section, 1)} className="flex-1 rounded-pill border border-line py-1.5 text-[11.5px] text-ink-200 transition hover:border-white/30 hover:text-white">
                          Move down
                        </button>
                      </div>
                    </div>
                  ) : (
                    <Empty text="Select a section to change how it is arranged." />
                  )}
                </div>

                <div className="border-t border-line pt-4">
                  <p className="micro mb-2">Whole page</p>
                  <Slider label="Section rhythm" min={64} max={148} step={4} value={Number(spec?.platform?.sectionPadding) || 104} onChange={(value) => onPlatform({ sectionPadding: value })} format={(value) => `${value}px`} />
                  <Slider label="Content width" min={900} max={1440} step={20} value={Number(spec?.platform?.maxWidth) || 1240} onChange={(value) => onPlatform({ maxWidth: value })} format={(value) => `${value}px`} />
                  <Row label="Density" hint="Affects card padding and grid gaps.">
                    <Select className="h-8 w-[110px] text-[12.5px]" value={spec?.platform?.density || 'comfortable'} onChange={(event) => onPlatform({ density: event.target.value })}>
                      {['airy', 'comfortable', 'dense'].map((density) => (
                        <option key={density} value={density}>
                          {density}
                        </option>
                      ))}
                    </Select>
                  </Row>
                </div>

                <div className="border-t border-line pt-4">
                  <p className="micro mb-2">Navigation</p>
                  <Row label="Bar">
                    <Select className="h-8 w-[110px] text-[12.5px]" value={spec?.nav?.style || 'blur'} onChange={(event) => onNav({ style: event.target.value })}>
                      {['blur', 'solid', 'minimal'].map((style) => (
                        <option key={style} value={style}>
                          {style}
                        </option>
                      ))}
                    </Select>
                  </Row>
                  <Field label="Button label" htmlFor="nav-cta" className="mt-2">
                    <Input id="nav-cta" defaultValue={spec?.nav?.cta?.label || ''} onBlur={(event) => onNav({ cta: { ...(spec?.nav?.cta || {}), label: event.target.value } })} placeholder="Join the list" />
                  </Field>
                </div>

                <div className="border-t border-line pt-4">
                  <p className="micro mb-2">Built for</p>
                  <p className="text-[12px] leading-relaxed text-ink-400">
                    {(spec?.platform?.targets || ['desktop']).map((target) => (target === 'both' ? 'mobile + desktop' : target)).join(' + ')}
                    {spec?.platform?.behavior ? ` · ${spec.platform.behavior}` : ''}
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {PLATFORM_TARGETS.map((option) => {
                      const active = sameTargets(targets, option.value);
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => onPlatformTarget?.(option.value)}
                          className={cx(
                            'rounded-pill border px-3 py-1.5 text-left text-[12px] transition',
                            active ? 'border-white bg-white text-ink-900' : 'border-line text-ink-200 hover:border-white/30 hover:text-white',
                          )}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[11.5px] leading-relaxed text-ink-500">
                    Changing the target re-composes the page from your description and assets — manual edits are rebuilt, so publish first if the page is where you want it.
                  </p>
                </div>
              </div>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>

      {onRemap ? (
        <div className="border-t border-line p-3">
          <Button size="sm" variant="ghost" className="w-full" onClick={onRemap} loading={busy === 'remap'}>
            <Shuffle className="h-3.5 w-3.5" />
            Re-place all images
          </Button>
        </div>
      ) : null}
    </aside>
  );
}

function Empty({ text }) {
  return (
    <p className="rounded-tile border border-dashed border-line px-3.5 py-6 text-center text-[12.5px] leading-relaxed text-ink-400">{text}</p>
  );
}

/**
 * Turns a section's content object into editable controls. We only surface
 * strings, numbers, lists and small objects — the renderer's own vocabulary, so
 * nothing here can produce a page that will not paint.
 */
function describeContent(content, type, labelFor) {
  const skip = new Set(['id', 'type', 'label', 'hidden', 'assets', 'settings']);
  return Object.entries(content)
    .filter(([key]) => !skip.has(key))
    .map(([key, value]) => ({ key, value, ...shapeOf(value) }))
    .filter((entry) => entry.kind !== 'skip');
}

function shapeOf(value) {
  if (typeof value === 'string') return { kind: 'string', long: value.length > 88 || value.includes('\n') };
  if (typeof value === 'number') return { kind: 'number' };
  if (typeof value === 'boolean') return { kind: 'boolean' };
  if (Array.isArray(value)) {
    if (!value.length) return { kind: 'skip' };
    if (value.every((item) => item === null || ['string', 'number'].includes(typeof item))) return { kind: 'lines' };
    if (value.every((item) => item && typeof item === 'object')) return { kind: 'items', items: value };
    return { kind: 'skip' };
  }
  if (value && typeof value === 'object') {
    const scalar = Object.entries(value).filter(([, item]) => ['string', 'number'].includes(typeof item));
    if (!scalar.length) return { kind: 'skip' };
    return { kind: 'object', fields: scalar };
  }
  return { kind: 'skip' };
}

function ContentControl({ entry, onChange }) {
  const label = human(entry.key);
  if (entry.kind === 'string') {
    return (
      <Field label={label} htmlFor={`c-${entry.key}`} hint={entry.long ? undefined : 'Leave empty to remove this line from the page.'}>
        <Input
          id={`c-${entry.key}`}
          multiline={entry.long}
          rows={3}
          defaultValue={entry.value}
          onBlur={(event) => {
            if (event.target.value !== entry.value) onChange(event.target.value);
          }}
        />
      </Field>
    );
  }
  if (entry.kind === 'number') {
    return (
      <Field label={label} htmlFor={`n-${entry.key}`}>
        <Input id={`n-${entry.key}`} type="number" defaultValue={entry.value} onBlur={(event) => onChange(Number(event.target.value))} />
      </Field>
    );
  }
  if (entry.kind === 'boolean') {
    return <Switch label={label} checked={entry.value} onChange={onChange} />;
  }
  if (entry.kind === 'object') {
    return (
      <div className="rounded-tile border border-line p-3">
        <p className="micro mb-2">{label}</p>
        <div className="flex flex-col gap-2.5">
          {entry.fields.map(([key, value]) => (
            <Field key={key} label={human(key)} htmlFor={`o-${entry.key}-${key}`}>
              <Input
                id={`o-${entry.key}-${key}`}
                defaultValue={value}
                onBlur={(event) => onChange({ ...(entry.value || {}), [key]: event.target.value })}
              />
            </Field>
          ))}
        </div>
      </div>
    );
  }
  if (entry.kind === 'lines') {
    return (
      <Field label={label} htmlFor={`l-${entry.key}`} hint="One per line.">
        <Input
          id={`l-${entry.key}`}
          multiline
          rows={Math.min(8, Math.max(3, entry.value.length))}
          defaultValue={entry.value.join('\n')}
          onBlur={(event) => onChange(event.target.value.split('\n').map((line) => line.trim()).filter(Boolean))}
        />
      </Field>
    );
  }
  // A list of objects: features, products, testimonials, faq, plans…
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="micro">{label}</p>
        <span className="text-[11px] text-ink-500">{entry.items.length}</span>
      </div>
      <ul className="flex flex-col gap-2">
        {entry.items.map((item, index) => (
          <li key={index} className="rounded-tile border border-line p-2.5">
            <div className="mb-1.5 flex items-center gap-1">
              <span className="mr-auto font-mono text-[10.5px] text-ink-500">{String(index + 1).padStart(2, '0')}</span>
              <button
                type="button"
                onClick={() => onChange(swap(entry.items, index, index - 1))}
                disabled={index === 0}
                className="grid h-6 w-6 place-items-center rounded-full border border-line text-ink-400 transition hover:text-white disabled:opacity-30"
                title="Move up"
              >
                <ArrowUp className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => onChange(swap(entry.items, index, index + 1))}
                disabled={index === entry.items.length - 1}
                className="grid h-6 w-6 place-items-center rounded-full border border-line text-ink-400 transition hover:text-white disabled:opacity-30"
                title="Move down"
              >
                <ArrowDown className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => onChange(entry.items.filter((_, position) => position !== index))}
                className="grid h-6 w-6 place-items-center rounded-full border border-line text-ink-400 transition hover:text-red-100"
                title="Remove"
              >
                <Minus className="h-3 w-3" />
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {Object.entries(item)
                .filter(([, value]) => ['string', 'number'].includes(typeof value))
                .map(([key, value]) => (
                  <input
                    key={key}
                    defaultValue={value}
                    aria-label={`${human(key)} for item ${index + 1}`}
                    placeholder={human(key)}
                    onBlur={(event) => {
                      const next = [...entry.items];
                      next[index] = { ...item, [key]: event.target.value };
                      onChange(next);
                    }}
                    className="w-full rounded-[8px] border border-line bg-ink-800 px-2.5 py-1.5 text-[13px] text-ink-50 outline-none transition placeholder:text-ink-500 focus:border-white/35"
                  />
                ))}
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => onChange([...entry.items, blankLike(entry.items[entry.items.length - 1])])}
        className="inline-flex items-center justify-center gap-1.5 rounded-tile border border-dashed border-line-strong py-2 text-[12px] text-ink-300 transition hover:border-white/35 hover:text-white"
      >
        <Plus className="h-3 w-3" />
        Add one
      </button>
    </div>
  );
}

function blankLike(sample = {}) {
  const next = {};
  for (const [key, value] of Object.entries(sample)) {
    if (typeof value === 'string') next[key] = '';
    else if (typeof value === 'number') next[key] = value;
  }
  return next;
}

function swap(list, from, to) {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

function sameTargets(current = [], wanted = []) {
  const a = [...new Set(current)].sort().join('+');
  const b = [...new Set(wanted)].sort().join('+');
  return a === b || (a === 'both' && b === 'desktop+mobile');
}

function human(key = '') {
  return String(key)
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function toHex(value) {
  if (typeof value !== 'string') return '#ffffff';
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  if (/^#[0-9a-f]{3}$/i.test(value)) return `#${value.slice(1).split('').map((c) => c + c).join('')}`;
  return '#ffffff';
}
