'use client';

import { useState } from 'react';
import type { PhemossaSystem } from '@/lib/system';
import { BUILTIN_TOPICS } from '@/lib/events';

interface PostComposerProps {
  system: PhemossaSystem | null;
  defaultTopic?: string;
  onPostCreated?: () => void;
}

export default function PostComposer({ system, defaultTopic = 'general', onPostCreated }: PostComposerProps) {
  const [text, setText] = useState('');
  const [topic, setTopic] = useState(defaultTopic);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!system || !text.trim()) return;

    setPosting(true);
    setError(null);
    try {
      await system.createPost(text.trim(), { topic: topic || 'general' });
      setText('');
      setExpanded(false);
      onPostCreated?.();
    } catch (err: any) {
      setError(err.message || 'Failed to create post');
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="phemossa-card p-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex gap-3">
          <div className="w-10 h-10 shrink-0 bg-[rgb(var(--color-bg-muted))] border border-[rgb(var(--color-border))] flex items-center justify-center text-[rgb(var(--color-text-subtle))] text-sm">
            +
          </div>
          <div className="flex-1 min-w-0">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onFocus={() => setExpanded(true)}
              placeholder="What's happening?"
              rows={expanded || text ? 4 : 2}
              className="phemossa-input resize-none bg-transparent border-0 border-b border-[rgb(var(--color-border))] focus:border-[rgb(var(--color-accent))] py-2 px-0"
              disabled={!system || posting}
              maxLength={500}
            />
            {(expanded || text) && (
              <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-3 border-t border-[rgb(var(--color-border))]">
                <select
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="phemossa-input py-1.5 px-2 text-sm w-auto max-w-[120px]"
                  disabled={!system || posting}
                >
                  {BUILTIN_TOPICS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[rgb(var(--color-text-subtle))]">
                    {text.length}/500
                  </span>
                  <button
                    type="submit"
                    disabled={!system || posting || !text.trim()}
                    className="phemossa-btn-primary py-1.5 px-4 text-sm"
                  >
                    {posting ? 'Posting…' : 'Post'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        {error && (
          <p className="text-xs text-[rgb(var(--color-error))]">{error}</p>
        )}
      </form>
    </div>
  );
}
