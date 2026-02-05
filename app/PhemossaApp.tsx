'use client';

import { useEffect, useRef, useState } from 'react';
import { PhemossaSystem } from '@/lib/system';
import Navbar from '@/components/Navbar';
import PeerStatus from '@/components/PeerStatus';
import PeerConnect from '@/components/PeerConnect';
import Feed from '@/components/Feed';
import PostComposer from '@/components/PostComposer';
import ProfileSection from '@/components/ProfileSection';

/**
 * Inner app that uses PhemossaSystem.
 * Loaded only on the client (dynamic import with ssr: false).
 */
export default function PhemossaApp() {
  const [system, setSystem] = useState<PhemossaSystem | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'home' | string>('home');
  const systemRef = useRef<PhemossaSystem | null>(null);
  const composerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    const initSystem = async () => {
      try {
        const phemossa = new PhemossaSystem();
        systemRef.current = phemossa;
        await phemossa.initialize({
          onPeerConnect: (peerId) => console.log('Peer connected:', peerId.toString()),
          onPeerDisconnect: (peerId) => console.log('Peer disconnected:', peerId.toString()),
        });
        if (mounted) {
          setSystem(phemossa);
          setInitializing(false);
        }
      } catch (err: any) {
        console.error('Failed to initialize system:', err);
        if (mounted) {
          setError(err.message || 'Failed to initialize system');
          setInitializing(false);
        }
      }
    };
    initSystem();
    return () => {
      mounted = false;
      const instance = systemRef.current;
      systemRef.current = null;
      if (instance) instance.stop().catch(console.error);
    };
  }, []);

  useEffect(() => {
    if (!system) return;
    const feedEngine = system.getFeedEngine();
    if (view === 'home') {
      feedEngine.setTopicFilter(null);
    } else {
      feedEngine.refreshTopicFeed(view).then(() => {
        feedEngine.setTopicFilter(view);
      }).catch(console.error);
    }
  }, [system, view]);

  const scrollToComposer = () => {
    composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[rgb(var(--color-bg))]">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-[rgb(var(--color-border-strong))] border-t-[rgb(var(--color-accent))] animate-spin mx-auto mb-4" style={{ borderRadius: 0 }} />
          <p className="text-sm text-[rgb(var(--color-text-muted))]">Initializing P2P…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[rgb(var(--color-bg))] p-4">
        <div className="phemossa-card p-8 max-w-md text-center">
          <h1 className="text-lg font-semibold text-[rgb(var(--color-error))] mb-2">
            Initialization error
          </h1>
          <p className="text-sm text-[rgb(var(--color-text-muted))]">{error}</p>
        </div>
      </div>
    );
  }

  if (!system) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[rgb(var(--color-bg))]">
        <p className="text-sm text-[rgb(var(--color-text-muted))]">System not available</p>
      </div>
    );
  }

  const feedEngine = system.getFeedEngine();

  return (
    <div className="min-h-screen bg-[rgb(var(--color-bg))] flex flex-col">
      <Navbar
        system={system}
        view={view}
        onViewChange={setView}
        onOpenComposer={scrollToComposer}
      />

      <div className="flex-1 flex max-w-6xl w-full mx-auto">
        {/* Left sidebar: secondary nav (desktop) */}
        <aside className="hidden lg:flex w-56 shrink-0 flex-col border-r border-[rgb(var(--color-border))] py-4">
          <nav className="px-3 space-y-0.5">
            <button
              type="button"
              onClick={() => setView('home')}
              className={`w-full text-left px-3 py-2.5 text-sm font-medium transition-colors ${
                view === 'home'
                  ? 'text-[rgb(var(--color-accent))] bg-[rgb(var(--color-accent)/0.08)]'
                  : 'text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-bg-muted))]'
              }`}
            >
              Home
            </button>
            <div className="pt-2 pb-1 px-3 text-xs font-medium uppercase tracking-wider text-[rgb(var(--color-text-subtle))]">
              Topics
            </div>
            {['general', 'tech', 'memes', 'news'].map((topic) => (
              <button
                key={topic}
                type="button"
                onClick={() => setView(topic)}
                className={`w-full text-left px-3 py-2.5 text-sm font-medium capitalize transition-colors ${
                  view === topic
                    ? 'text-[rgb(var(--color-accent))] bg-[rgb(var(--color-accent)/0.08)]'
                    : 'text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-bg-muted))]'
                }`}
              >
                {topic}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main: composer + feed */}
        <main className="flex-1 min-w-0 border-r border-[rgb(var(--color-border))]">
          <div className="max-w-[42rem] mx-auto py-4 px-4">
            <div ref={composerRef} className="mb-6">
              <PostComposer
                system={system}
                defaultTopic={view === 'home' ? 'general' : view}
              />
            </div>
            <Feed feedEngine={feedEngine} system={system} />
          </div>
        </main>

        {/* Right sidebar: profile, network */}
        <aside className="hidden md:flex w-72 shrink-0 flex-col gap-6 p-4 overflow-y-auto">
          <div id="profile">
            <ProfileSection system={system} />
          </div>
          <PeerStatus network={system.getNetwork()} />
          <PeerConnect network={system.getNetwork()} />
        </aside>
      </div>

      {/* Mobile: right sidebar content in a collapsible or bottom sheet could be added later */}
    </div>
  );
}
