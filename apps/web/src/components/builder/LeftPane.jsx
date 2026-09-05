import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Eye, EyeOff, FileText, GripVertical, Image as ImageIcon, LayoutList, Plus, RefreshCw, Trash2, Upload } from 'lucide-react';
import { Segmented } from '../ui/Segmented';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Primitives';
import { bytes, cx, isVideo } from '../../lib/format';

/**
 * The builder's navigator. Sections are the source of truth for the page, so
 * this is where structure is decided — order, visibility, additions — and where
 * images are picked up and dropped.
 */
export default function LeftPane({
  spec,
  assets = [],
  vocabulary = [],
  selected,
  onSelect,
  onReorder,
  onToggleHidden,
  onDeleteSection,
  onAddSection,
  onPickUpAsset,
  onDropOnSection,
  onRemoveAsset,
  onUpload,
  onRemap,
  busy,
  liveUrl,
  displayUrl,
  tab: controlledTab,
  setTab: controlledSetTab,
}) {
  const tab = controlledTab || 'sections';
  const setTab = controlledSetTab || (() => {});
  const [adding, setAdding] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [assetDrag, setAssetDrag] = useState(null);

  const sections = spec?.sections || [];
  const used = new Set(sections.map((section) => section.type));
  const available = vocabulary.filter((section) => !used.has(section.type));

  return (
    <aside className="flex min-h-0 w-full flex-col border-r border-line bg-ink-900/60">
      <div className="border-b border-line px-3 py-3">
        <Segmented
          size="sm"
          className="w-full justify-between"
          layoutId="builder-left"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'pages', label: 'Pages', icon: FileText },
            { value: 'sections', label: 'Sections', icon: LayoutList },
            { value: 'assets', label: 'Assets', icon: ImageIcon },
          ]}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === 'pages' ? (
          <div className="flex flex-col gap-4">
            <div className="rounded-card border border-white/25 bg-white/[0.05] p-3">
              <p className="text-[14.5px] text-white">{spec?.name || 'Your launch'}</p>
              <p className="mt-0.5 text-[12.5px] text-ink-400">{liveUrl ? 'live' : 'draft'} · one page · {sections.filter((section) => !section.hidden).length} sections</p>
            </div>
            {spec?.nav?.links?.length ? (
              <div>
                <p className="micro mb-2">Anchors on this page</p>
                <ul className="flex flex-col">
                  {spec.nav.links.map((link, index) => (
                    <li key={`${link.label}-${index}`}>
                      <button
                        type="button"
                        onClick={() => {
                          const target = sections.find((section) => `#${section.type}` === link.action || section.type === link.label?.toLowerCase());
                          if (target) onSelect(target.id);
                        }}
                        className="flex w-full items-center gap-2 rounded-tile px-2.5 py-2 text-left text-[14px] text-ink-200 transition hover:bg-white/[0.05] hover:text-white"
                      >
                        <span className="h-1 w-1 rounded-full bg-ink-500" />
                        {link.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="rounded-card border border-line p-3">
              <p className="micro mb-1.5">Address</p>
              <p className="break-all font-mono text-[12.5px] text-ink-200">{displayUrl || '— set when you publish'}</p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink-400">Launchpad gives every launch one address and keeps it, however much you change.</p>
            </div>
          </div>
        ) : null}

        {tab === 'sections' ? (
          <div className="flex flex-col gap-1.5">
            {!sections.length ? <p className="px-1 py-6 text-center text-[13.5px] leading-relaxed text-ink-400">Generate the site and its sections will appear here.</p> : null}
            <AnimatePresence initial={false}>
              {sections.map((section, index) => {
                const isSelected = selected === section.id;
                return (
                  <motion.div
                    key={section.id || `${section.type}-${index}`}
                    layout
                    draggable
                    onDragStart={() => {
                      setDragIndex(index);
                      setAssetDrag(null);
                    }}
                    onDragEnd={() => {
                      setDragIndex(null);
                      setOverIndex(null);
                    }}
                    onDragOver={(event) => {
                      if (dragIndex === null || dragIndex === index) return;
                      event.preventDefault();
                      setOverIndex(index);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (dragIndex !== null && dragIndex !== index) onReorder(dragIndex, index);
                      if (assetDrag) onDropOnSection(assetDrag, section.id);
                      setDragIndex(null);
                      setOverIndex(null);
                      setAssetDrag(null);
                    }}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: section.hidden ? 0.5 : 1, y: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={{ duration: 0.22 }}
                    onClick={() => onSelect(isSelected ? null : section.id)}
                    className={cx(
                      'group relative flex cursor-pointer items-center gap-2 rounded-tile border px-2 py-2 transition',
                      isSelected ? 'border-white/35 bg-white/[0.07]' : 'border-line bg-white/[0.02] hover:border-white/20',
                      overIndex === index && 'border-dashed border-white/50',
                    )}
                  >
                    <GripVertical
                      className="h-3.5 w-3.5 shrink-0 cursor-grab text-ink-500 opacity-0 transition group-hover:opacity-100"
                      onClick={(event) => event.stopPropagation()}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] text-white">{section.label || cx1(section.type)}</span>
                      <span className="block font-mono text-[12px] text-ink-500">{section.type}{section.assets?.length ? ` · ${section.assets.length} image${section.assets.length === 1 ? '' : 's'}` : ''}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggleHidden(section.id);
                        }}
                        className="grid h-6 w-6 place-items-center rounded-full text-ink-400 transition hover:text-white"
                        title={section.hidden ? 'Show this section' : 'Hide this section'}
                      >
                        {section.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setPendingDelete(section);
                        }}
                        className="grid h-6 w-6 place-items-center rounded-full text-ink-400 opacity-0 transition hover:text-red-100 group-hover:opacity-100"
                        title="Delete section"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {sections.length ? (
              <button type="button" onClick={() => setAdding(true)} className="mt-1 flex items-center gap-2 rounded-tile border border-dashed border-line-strong px-2.5 py-2 text-left text-[13.5px] text-ink-300 transition hover:border-white/35 hover:text-white">
                <Plus className="h-3.5 w-3.5" />
                Add section
              </button>
            ) : null}
          </div>
        ) : null}

        {tab === 'assets' ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={onUpload} loading={busy === 'upload'} className="flex-1">
                <Upload className="h-3.5 w-3.5" />
                Upload
              </Button>
              <Button size="sm" variant="ghost" onClick={onRemap} title="Ask Launchpad to place every image again">
                <RefreshCw className="h-3.5 w-3.5" />
                Re-place
              </Button>
            </div>
            {assets.length ? (
              <ul className="grid grid-cols-2 gap-2">
                {assets.map((asset) => (
                  <li
                    key={asset.id}
                    draggable
                    onDragStart={() => {
                      setAssetDrag(asset.id);
                      onPickUpAsset?.(asset.id);
                      setDragIndex(null);
                    }}
                    onDragEnd={() => {
                      setAssetDrag(null);
                      onPickUpAsset?.(null);
                    }}
                    className={cx('group cursor-grab overflow-hidden rounded-tile border border-line bg-ink-850 transition hover:border-white/30', assetDrag === asset.id && 'opacity-40')}
                  >
                    <span className="relative block aspect-[4/3] bg-black/50">
                      {isVideo(asset.filename) ? (
                        <span className="grid h-full place-items-center text-[11.5px] uppercase tracking-[0.14em] text-ink-300">video</span>
                      ) : (
                        <img src={asset.url} alt={asset.alt || asset.filename} className="h-full w-full object-cover" />
                      )}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onRemoveAsset(asset.id);
                        }}
                        className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur transition group-hover:opacity-100"
                        title="Remove asset"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </span>
                    <span className="block px-2 py-1.5">
                      <span className="block truncate text-[12.5px] text-ink-100" title={asset.filename}>{asset.filename}</span>
                      <span className="block truncate text-[12px] text-ink-500">
                        {asset.selectedSection ? `in ${asset.selectedSection}` : asset.suggestedSection ? `→ ${asset.suggestedSection}` : 'unplaced'} · {bytes(asset.size)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-tile border border-dashed border-line px-3 py-5 text-center text-[13px] leading-relaxed text-ink-400">
                No assets on this launch yet. Anything you upload here is matched to a section automatically.
              </p>
            )}
            <p className="text-[12px] leading-relaxed text-ink-500">Drag an image onto a section in the Sections tab to place it there.</p>
          </div>
        ) : null}
      </div>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add a section" subtitle="Only what the renderer knows how to build — everything else is a copy change." width="max-w-md">
        {available.length ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {available.map((section) => (
              <li key={section.type}>
                <button
                  type="button"
                  onClick={() => {
                    onAddSection(section);
                    setAdding(false);
                  }}
                  className="h-full w-full rounded-tile border border-line p-3 text-left transition hover:border-white/35 hover:bg-white/[0.04]"
                >
                  <span className="block text-[14.5px] text-white">{section.label}</span>
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-400">{section.blurb}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[14px] leading-relaxed text-ink-300">Every section Launchpad knows for this type is already on the page.</p>
        )}
      </Modal>

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title={`Delete “${pendingDelete?.label || pendingDelete?.type}”?`}
        subtitle="The section is removed from the page. Its images stay in your assets."
        width="max-w-sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                onDeleteSection(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              Delete section
            </Button>
          </>
        }
      />
    </aside>
  );
}

function cx1(text = '') {
  return String(text)
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}
