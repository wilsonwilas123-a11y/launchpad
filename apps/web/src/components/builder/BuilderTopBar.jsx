import { useState } from 'react';
import { Eye, Globe2, Rocket, Share2 } from 'lucide-react';
import { Logo, RocketMark } from '../brand/RocketMark';
import { Button, IconButton } from '../ui/Button';
import { SaveState, StatusPill } from '../ui/StatusPill';
import { Modal } from '../ui/Primitives';
import { Input } from '../ui/Field';
import { shareLink } from '../../lib/format';

/**
 * The builder's top bar: identity, live status, and the three verbs that matter
 * (preview, share, publish). The status text is tappable and copies the link.
 */
export default function BuilderTopBar({ project, saveState, onRename, onPublish, onUnpublish, onShare, onCopyLink, onPreview, busy }) {
  const host = window.location.host;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name || '');
  const [showShare, setShowShare] = useState(false);
  const live = project.status === 'live';

  const saveName = (event) => {
    event.preventDefault();
    if (name.trim() && name !== project.name) onRename(name.trim());
    setEditing(false);
  };

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-ink-900/85 px-4 backdrop-blur-xl">
        <Logo size="sm" href="/dashboard" />
        <span aria-hidden className="h-5 w-px bg-white/10" />

        <div className="flex min-w-0 items-center gap-2">
          {editing ? (
            <form onSubmit={saveName} className="flex items-center gap-1.5">
              <Input autoFocus value={name} onChange={(event) => setName(event.target.value)} onBlur={saveName} className="h-8 w-[200px] text-[14px]" aria-label="Project name" />
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              title="Rename"
              className="group inline-flex min-w-0 items-center gap-2 rounded-pill px-2 py-1 text-left transition hover:bg-white/[0.06]"
            >
              <span className="truncate font-display text-[16px] tracking-[-0.02em] text-white">{project.name || 'Untitled launch'}</span>
              <span className="shrink-0 text-[11px] text-ink-500 opacity-0 transition group-hover:opacity-100">rename</span>
            </button>
          )}
          <span className="hidden shrink-0 sm:inline-flex">
            <StatusPill status={project.status} size="sm" slug={live ? project.slug : undefined} host={host} onClick={live ? onCopyLink : undefined} title={live ? 'Copy the live link' : undefined} />
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <SaveState state={saveState} url={live ? project.liveUrl : undefined} onCopy={onCopyLink} className="hidden md:inline-flex" />
          <IconButton label="Full-screen preview" onClick={onPreview}>
            <Eye className="h-4 w-4" />
          </IconButton>
          <Button variant="secondary" size="sm" onClick={() => setShowShare(true)} disabled={!live}>
            <Share2 className="h-3.5 w-3.5" />
            Share
          </Button>
          <Button size="sm" onClick={onPublish} loading={busy === 'publish'} disabled={project.status === 'generating'}>
            <Rocket className="h-3.5 w-3.5" strokeWidth={2.2} />
            {live ? 'Re-publish' : 'Publish'}
          </Button>
        </div>
      </header>

      <Modal
        open={showShare}
        onClose={() => setShowShare(false)}
        title="Share this launch"
        subtitle={`Live at ${project.displayUrl || `${host}/${project.slug}`}`}
        width="max-w-md"
        footer={
          <>
            {live ? (
              <Button variant="ghost" onClick={onUnpublish} loading={busy === 'unpublish'}>
                Take offline
              </Button>
            ) : null}
            <Button
              onClick={async () => {
                const result = await shareLink({ url: project.liveUrl, title: project.name, text: project.previewText });
                onShare(result.method);
              }}
            >
              <Share2 className="h-4 w-4" />
              Share link
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 rounded-tile border border-line bg-white/[0.03] px-3 py-2.5">
            <Globe2 className="h-4 w-4 shrink-0 text-ink-300" />
            <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink-100">{project.liveUrl || `${host}/${project.slug || '…'}`}</span>
            <button type="button" onClick={onCopyLink} className="shrink-0 text-[11px] uppercase tracking-[0.14em] text-ink-300 transition hover:text-white">
              copy
            </button>
          </div>
          <p className="text-[12.5px] leading-relaxed text-ink-400">
            One address per launch. Re-publishing updates it; the link you already shared keeps working.
          </p>
          {live && project.hasUnpublishedChanges ? (
            <p className="rounded-tile border border-amber-300/25 bg-amber-200/[0.07] px-3 py-2 text-[12.5px] text-amber-100">You have edits that are not live yet. Re-publish to push them.</p>
          ) : null}
        </div>
      </Modal>

    </>
  );
}
