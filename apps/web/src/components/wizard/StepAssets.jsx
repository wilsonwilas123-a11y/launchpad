import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpRight, Image as ImageIcon, Info, Plus, RefreshCw, Trash2, Upload } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal, Tag } from '../ui/Primitives';
import { Field, Input } from '../ui/Field';
import { bytes, cx } from '../../lib/format';

/**
 * Step 5 — assets. The list adapts to the website type, but it is a
 * recommendation, never a gate: nothing is rejected, every image the user adds
 * is accepted, and any slot can be skipped with a single click.
 *
 * Placement is Launchpad's job first (filename + description + type are read to
 * infer a category and a section) and the user's job to overrule.
 */
export default function StepAssets({ plan, assets = [], sections = [], upload, patchAsset, removeAsset, onNext, onBack, busy }) {
  const [custom, setCustom] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [editing, setEditing] = useState(null);
  const inputRef = useRef(null);
  const customRef = useRef(null);
  const [skipped, setSkipped] = useState([]);

  const byCategory = (category) => assets.filter((asset) => asset.assetCategory === category);
  const unmatched = plan?.required?.filter((key) => !byCategory(key).length && !skipped.includes(key)) || [];

  const pickFiles = (files, meta = {}) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    upload(list, meta);
  };

  const dropOnSection = (section) => {
    if (!dragging) return;
    patchAsset(dragging, { selectedSection: section });
    setDragging(null);
  };

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-start gap-3 rounded-card border border-line bg-white/[0.025] px-4 py-3 text-[13px] leading-relaxed text-ink-300">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-200" strokeWidth={2} />
        <p>
          These are the images that usually make a {plan?.websiteType || 'launch'} page work. Skip any of them, or add ones we did not think to
          ask for — we will read each file and put it where it belongs.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        {/* ── the recommendation list ─────────────────────────────────────── */}
        <div>
          <p className="micro mb-3">What we would use</p>
          <ul className="flex flex-col gap-2">
            {(plan?.slots || []).map((slot) => {
              const filled = byCategory(slot.key)[0];
              return (
                <li
                  key={slot.key}
                  onDragOver={(event) => dragging && event.preventDefault()}
                  onDrop={() => filled && dropOnSection(filled.suggestedSection || filled.selectedSection)}
                  className={cx(
                    'flex items-start gap-3 rounded-tile border px-3.5 py-3 transition',
                    filled ? 'border-line bg-ink-850/50' : 'border-dashed border-line-strong bg-transparent',
                  )}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-[10px] border border-line bg-white/[0.04]">
                    {filled?.url ? <img src={filled.url} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="h-4 w-4 text-ink-400" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] text-white">{slot.label}</span>
                    <span className="mt-0.5 block text-[12px] leading-snug text-ink-400">
                      {filled ? `${filled.filename}${slot.recommendedSections?.length ? ` → ${slot.recommendedSections[0]}` : ''}` : slot.hint}
                    </span>
                  </span>
                  {filled ? (
                    <button
                      type="button"
                      onClick={() => customRef.current?.click()}
                      className="shrink-0 text-[11px] uppercase tracking-[0.12em] text-ink-400 transition hover:text-white"
                      title="Replace this image"
                    >
                      replace
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSkipped((list) => [...list, slot.key])}
                      className="shrink-0 text-[11px] uppercase tracking-[0.12em] text-ink-400 transition hover:text-white"
                    >
                      don’t need it →
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          {sections.length ? (
            <>
              <p className="micro mb-2 mt-7">Drop an image on a section to move it</p>
              <div className="flex flex-wrap gap-1.5">
                {sections.map((section) => (
                  <span
                    key={section}
                    onDragOver={(event) => dragging && event.preventDefault()}
                    onDrop={() => dropOnSection(section)}
                    className={cx(
                      'rounded-pill border px-3 py-1.5 text-[12px] transition',
                      dragging ? 'cursor-copy border-dashed border-white/40 text-ink-100' : 'border-line text-ink-300',
                      dragging === 'over' && 'bg-white/10',
                    )}
                  >
                    {section}
                  </span>
                ))}
              </div>
            </>
          ) : null}
        </div>

        {/* ── the actual uploads ──────────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              pickFiles(event.dataTransfer.files);
            }}
            className="relative flex min-h-[168px] flex-col items-center justify-center gap-3 rounded-card border border-dashed border-line-strong bg-white/[0.02] px-6 py-8 text-center transition hover:border-white/30"
          >
            <motion.span animate={{ y: [0, -5, 0] }} transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }} className="grid h-10 w-10 place-items-center rounded-full border border-line bg-ink-850">
              <Upload className="h-4 w-4 text-ink-100" strokeWidth={1.9} />
            </motion.span>
            <p className="text-[14.5px] text-white">Drop images and clips here, or</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button size="sm" onClick={() => inputRef.current?.click()} loading={busy === 'upload'}>
                <Plus className="h-3.5 w-3.5" strokeWidth={2.6} />
                Add Custom Image
              </Button>
              <span className="text-[12px] text-ink-400">PNG, JPG, WEBP, GIF, MP4 · up to 25 MB each</span>
            </div>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/*,video/*"
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files || []);
                if (files.length === 1) setCustom({ file: files[0] });
                else pickFiles(files);
                event.target.value = '';
              }}
            />
            <input ref={customRef} type="file" accept="image/*,video/*" className="hidden" onChange={(event) => pickFiles(event.target.files)} />
          </div>

          {assets.length ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              <AnimatePresence initial={false}>
                {assets.map((asset) => (
                  <motion.li
                    key={asset.id}
                    layout
                    draggable
                    onDragStart={() => setDragging(asset.id)}
                    onDragEnd={() => setDragging(null)}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: dragging === asset.id ? 0.45 : 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.28 }}
                    className={cx('group overflow-hidden rounded-card border border-line bg-ink-850/60', dragging === asset.id && 'border-white/40')}
                  >
                    <span className="relative block aspect-[4/3] bg-black/40">
                      {asset.url && !/\.mp4$|\.mov$|\.webm$/i.test(asset.filename || '') ? (
                        <img src={asset.url} alt={asset.alt || asset.filename} className="h-full w-full object-cover" />
                      ) : (
                        <span className="grid h-full place-items-center text-[12px] text-ink-300">video</span>
                      )}
                      <span className="absolute left-2 top-2 flex gap-1.5">
                        <span className="rounded-pill bg-black/60 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-white backdrop-blur">
                          {asset.assetCategory || 'unsorted'}
                        </span>
                      </span>
                    </span>
                    <div className="flex flex-col gap-2 p-3">
                      <p className="truncate text-[13px] text-white" title={asset.filename}>
                        {asset.filename}
                      </p>
                      <p className="line-clamp-2 text-[12px] leading-snug text-ink-300">{asset.description || 'No description — tap “describe” and tell us what it is.'}</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Tag>{bytes(asset.size)}</Tag>
                        <Tag mono>{asset.selectedSection ? `in ${asset.selectedSection}` : asset.suggestedSection ? `→ ${asset.suggestedSection}` : 'unplaced'}</Tag>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <select
                          value={asset.selectedSection || asset.suggestedSection || ''}
                          onChange={(event) => patchAsset(asset.id, { selectedSection: event.target.value || null })}
                          className="h-7 rounded-pill border border-line bg-ink-800 px-2 text-[11.5px] text-ink-100 outline-none transition hover:border-white/25"
                          title="Change section"
                        >
                          <option value="">Auto place</option>
                          {sections.map((section) => (
                            <option key={section} value={section}>
                              {section}
                            </option>
                          ))}
                        </select>
                        <button type="button" onClick={() => setEditing(asset)} className="rounded-pill border border-line px-2.5 py-1 text-[11.5px] text-ink-200 transition hover:text-white">
                          describe
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = 'image/*,video/*';
                            input.onchange = () => {
                              const file = input.files?.[0];
                              if (file) upload([file], { replaceId: asset.id, description: asset.description, slot: asset.assetCategory });
                            };
                            input.click();
                          }}
                          className="grid h-7 w-7 place-items-center rounded-full border border-line text-ink-300 transition hover:text-white"
                          title="Replace this image"
                        >
                          <RefreshCw className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeAsset(asset.id)}
                          className="ml-auto grid h-7 w-7 place-items-center rounded-full border border-line text-ink-300 transition hover:border-red-400/40 hover:text-red-100"
                          title="Remove"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          ) : (
            <p className="rounded-card border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-400">
              Nothing uploaded yet — that is fine. Generate now and add images in the builder afterwards.
            </p>
          )}

          {unmatched.length ? (
            <p className="text-[12.5px] leading-relaxed text-ink-400">
              Still empty: {unmatched.join(', ')}. {plan?.optionalNote || 'None of it is required.'}{' '}
              <button type="button" onClick={onNext} className="link-quiet">
                Continue without this →
              </button>
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button size="lg" onClick={onNext} loading={busy === 'generate'}>
          Generate my website
          <ArrowUpRight className="h-4 w-4" />
        </Button>
      </div>

      {/* "What is this image for?" — one question, then it is in. */}
      <Modal
        open={Boolean(custom)}
        onClose={() => setCustom(null)}
        title="What is this image for?"
        subtitle="A sentence is enough. Launchpad reads it alongside your description to decide where the image belongs."
        width="max-w-md"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                pickFiles([custom.file]);
                setCustom(null);
              }}
            >
              Add without a description
            </Button>
            <Button
              onClick={() => {
                pickFiles([custom.file], custom.meta || {});
                setCustom(null);
              }}
            >
              Add image
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {custom ? (
            <div className="flex items-center gap-3 rounded-tile border border-line p-2.5">
              <span className="h-12 w-16 shrink-0 overflow-hidden rounded-[8px] bg-white/5">
                {custom.file.type.startsWith('image/') ? (
                  <img src={URL.createObjectURL(custom.file)} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="grid h-full place-items-center text-[10px] text-ink-300">video</span>
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] text-white">{custom.file.name}</span>
                <span className="block text-[12px] text-ink-400">{bytes(custom.file.size)}</span>
              </span>
            </div>
          ) : null}
          <Field label="What is it?" htmlFor="what">
            <Input id="what" multiline rows={3} placeholder="Campaign shot for the first drop, photographed in the studio in Yaba" onChange={(event) => setCustom({ ...custom, meta: { ...(custom.meta || {}), description: event.target.value } })} />
          </Field>
        </div>
      </Modal>

      {/* Edit an existing description without re-uploading. */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Describe this asset"
        subtitle={editing?.filename}
        width="max-w-md"
        footer={
          <Button
            onClick={() => {
              patchAsset(editing.id, { description: editing.nextDescription ?? editing.description, selectedSection: editing.nextSection ?? editing.selectedSection });
              setEditing(null);
            }}
          >
            Save
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="What is it?" htmlFor="edit-desc">
            <Input
              id="edit-desc"
              multiline
              rows={3}
              defaultValue={editing?.description || ''}
              onChange={(event) => setEditing({ ...editing, nextDescription: event.target.value })}
              placeholder="The team in front of the first shop, opening day"
            />
          </Field>
          <Field label="Section" htmlFor="edit-section" hint="Leave on auto place and Launchpad decides.">
            <select id="edit-section" defaultValue={editing?.selectedSection || ''} onChange={(event) => setEditing({ ...editing, nextSection: event.target.value || null })} className="field h-10">
              <option value="">Auto place</option>
              {sections.map((section) => (
                <option key={section} value={section}>
                  {section}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Modal>
    </div>
  );
}
