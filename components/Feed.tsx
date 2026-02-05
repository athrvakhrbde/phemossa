'use client';

import { useEffect, useState } from 'react';
import type { FeedEngine, FeedItem } from '@/lib/feed';
import type { PhemossaSystem } from '@/lib/system';
import type { Event } from '@/lib/events';

interface FeedProps {
  feedEngine: FeedEngine | null;
  system?: PhemossaSystem | null;
}

type PostDisplay = { text: string; status: 'plain' | 'decrypted' | 'encrypted' | 'failed' };
type AuthorDisplay = string;

export default function Feed({ feedEngine, system }: FeedProps) {
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayResult, setDisplayResult] = useState<Record<string, PostDisplay>>({});
  const [authorNames, setAuthorNames] = useState<Record<string, AuthorDisplay>>({});

  useEffect(() => {
    if (!feedEngine) {
      setLoading(false);
      return;
    }
    setFeedItems(feedEngine.getFeedItems());
    setLoading(false);
    const unsubscribe = feedEngine.subscribe((items) => setFeedItems(items));
    return () => unsubscribe();
  }, [feedEngine]);

  useEffect(() => {
    if (!system || feedItems.length === 0) {
      setDisplayResult({});
      setAuthorNames({});
      return;
    }
    let cancelled = false;
    (async () => {
      const resultMap: Record<string, PostDisplay> = {};
      const nameMap: Record<string, AuthorDisplay> = {};
      for (const item of feedItems) {
        if (cancelled) return;
        resultMap[item.event.id] = await system.getDecryptedPostResult(item.event as Event);
        if (!nameMap[item.author]) {
          const displayName = await system.getDisplayName(item.author);
          const username = await system.getUsername(item.author);
          nameMap[item.author] =
            username.startsWith('@') ? `${displayName} ${username}`.trim() : displayName;
        }
      }
      if (!cancelled) {
        setDisplayResult(resultMap);
        setAuthorNames(nameMap);
      }
    })();
    return () => { cancelled = true; };
  }, [system, feedItems]);

  if (!feedEngine) {
    return (
      <div className="phemossa-card p-6">
        <p className="text-[rgb(var(--color-text-muted))] text-sm">Feed not available</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="phemossa-card p-4 animate-pulse">
            <div className="flex gap-3">
              <div className="w-10 h-10 shrink-0 bg-[rgb(var(--color-bg-muted))]" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 bg-[rgb(var(--color-bg-muted))]" />
                <div className="h-3 w-full max-w-md bg-[rgb(var(--color-bg-muted))]" />
                <div className="h-3 w-2/3 bg-[rgb(var(--color-bg-muted))]" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  const topicFilter = feedEngine.getTopicFilter();
  const feedTitle = topicFilter ? topicFilter : 'Home';

  return (
    <section className="space-y-0" aria-label="Feed">
      <div className="flex items-center justify-between py-3 border-b border-[rgb(var(--color-border))] mb-4">
        <h2 className="text-lg font-semibold text-[rgb(var(--color-text))] tracking-tight">
          {feedTitle}
        </h2>
      </div>

      {feedItems.length === 0 ? (
        <div className="phemossa-card p-12 text-center">
          <p className="text-[rgb(var(--color-text-muted))] text-sm mb-1">
            {topicFilter
              ? `No posts in ${topicFilter} yet.`
              : 'No posts yet.'}
          </p>
          <p className="text-xs text-[rgb(var(--color-text-subtle))]">
            {topicFilter ? 'Be the first to post.' : 'Create a post or follow someone to see their posts here.'}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-[rgb(var(--color-border))]">
          {feedItems.map((item) => {
            const result = displayResult[item.event.id];
            const authorName = authorNames[item.author] ?? item.author.slice(0, 8) + '…';
            const showAsHandle = authorName.includes('@');
            const displayPart = showAsHandle ? authorName.replace(/ @\S+$/, '') : authorName;
            const handlePart = authorName.match(/@\S+$/)?.[0] ?? '';
            const topic = (item.event.content as { topic?: string }).topic;
            const text = result?.text ?? '…';

            return (
              <article
                key={item.event.id}
                className="py-4 px-2 -mx-1 hover:bg-[rgb(var(--color-bg-muted)/0.5)] transition-colors rounded-sm"
              >
                <div className="flex gap-3">
                  {/* Avatar */}
                  <div className="w-10 h-10 shrink-0 bg-[rgb(var(--color-bg-muted))] border border-[rgb(var(--color-border))] flex items-center justify-center text-[rgb(var(--color-text))] text-sm font-medium">
                    {displayPart.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <header className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mb-1">
                      <span className="font-semibold text-[rgb(var(--color-text))] text-sm">
                        {displayPart}
                      </span>
                      {showAsHandle && handlePart && (
                        <span className="text-xs text-[rgb(var(--color-text-subtle))] font-mono">
                          {handlePart}
                        </span>
                      )}
                      <span className="text-xs text-[rgb(var(--color-text-subtle))]">
                        ·
                      </span>
                      <time
                        dateTime={new Date(item.timestamp).toISOString()}
                        className="text-xs text-[rgb(var(--color-text-subtle))]"
                      >
                        {new Date(item.timestamp).toLocaleString(undefined, {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </time>
                    </header>
                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                      {topic && (
                        <span className="phemossa-badge phemossa-badge-topic">
                          #{topic}
                        </span>
                      )}
                      {result && result.status !== 'plain' && (
                        <span
                          className={`phemossa-badge phemossa-badge-encrypted`}
                          title={
                            result.status === 'decrypted'
                              ? 'Decrypted (E2EE)'
                              : result.status === 'encrypted'
                                ? 'Encrypted — only recipients can read'
                                : 'Could not decrypt'
                          }
                        >
                          {result.status === 'decrypted' ? 'E2EE' : 'Encrypted'}
                        </span>
                      )}
                    </div>
                    <p className="text-[rgb(var(--color-text))] text-[15px] leading-relaxed whitespace-pre-wrap break-words">
                      {text}
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
