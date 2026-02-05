'use client';

import { useState, useEffect } from 'react';
import type { PhemossaSystem } from '@/lib/system';
import { BUILTIN_TOPICS } from '@/lib/events';

interface NavbarProps {
  system: PhemossaSystem | null;
  view: 'home' | string;
  onViewChange: (view: 'home' | string) => void;
  onOpenComposer?: () => void;
}

export default function Navbar({ system, view, onViewChange, onOpenComposer }: NavbarProps) {
  const [profile, setProfile] = useState<{ displayName?: string; username?: string }>({});
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    if (!system) return;
    const me = system.getMyPublicKeyBase64();
    system.getProfile(me).then((p) => setProfile({ displayName: p.displayName, username: p.username })).catch(() => {});
  }, [system]);

  const displayName = profile.displayName?.trim() || 'Profile';
  const handle = profile.username?.trim() ? `@${profile.username.trim()}` : '';

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg-elevated))]">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        {/* Logo */}
        <a href="/" className="flex items-center gap-2 shrink-0">
          <span className="text-lg font-bold tracking-tight text-[rgb(var(--color-text))]">
            Phemossa
          </span>
        </a>

        {/* Center nav */}
        <nav className="hidden md:flex items-center gap-1">
          <button
            type="button"
            onClick={() => onViewChange('home')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              view === 'home'
                ? 'text-[rgb(var(--color-accent))] border-b-2 border-[rgb(var(--color-accent))]'
                : 'text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text))]'
            }`}
          >
            Home
          </button>
          {BUILTIN_TOPICS.map((topic) => (
            <button
              key={topic}
              type="button"
              onClick={() => onViewChange(topic)}
              className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
                view === topic
                  ? 'text-[rgb(var(--color-accent))] border-b-2 border-[rgb(var(--color-accent))]'
                  : 'text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text))]'
              }`}
            >
              {topic}
            </button>
          ))}
        </nav>

        {/* Right: Create + Profile */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onOpenComposer}
            className="phemossa-btn-primary py-2 px-4 text-sm font-medium"
          >
            Post
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setProfileOpen((o) => !o)}
              className="flex items-center gap-2 p-1.5 border border-transparent hover:border-[rgb(var(--color-border))] hover:bg-[rgb(var(--color-bg-muted))] transition-colors"
              aria-expanded={profileOpen}
              aria-haspopup="true"
            >
              <div className="w-8 h-8 bg-[rgb(var(--color-bg-muted))] border border-[rgb(var(--color-border))] flex items-center justify-center text-[rgb(var(--color-text))] text-sm font-medium">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <span className="hidden sm:block text-sm text-[rgb(var(--color-text-muted))] max-w-[100px] truncate">
                {handle || 'Profile'}
              </span>
            </button>
            {profileOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  aria-hidden="true"
                  onClick={() => setProfileOpen(false)}
                />
                <div className="absolute right-0 top-full mt-1 w-56 phemossa-card p-2 z-20 shadow-ds-lg">
                  <div className="px-2 py-2 border-b border-[rgb(var(--color-border))] mb-2">
                    <p className="text-sm font-medium text-[rgb(var(--color-text))] truncate">
                      {displayName}
                    </p>
                    <p className="text-xs text-[rgb(var(--color-accent))] truncate">
                      {handle || 'Set username in profile'}
                    </p>
                  </div>
                  <a
                    href="#profile"
                    onClick={(e) => { e.preventDefault(); setProfileOpen(false); }}
                    className="block px-2 py-2 text-sm text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-bg-muted))] transition-colors"
                  >
                    Edit profile
                  </a>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile: topic pills below main bar */}
      <div className="md:hidden border-t border-[rgb(var(--color-border))] px-4 py-2 overflow-x-auto">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onViewChange('home')}
            className={`phemossa-pill shrink-0 ${view === 'home' ? 'phemossa-pill-active' : 'phemossa-pill-inactive'}`}
          >
            Home
          </button>
          {BUILTIN_TOPICS.map((topic) => (
            <button
              key={topic}
              type="button"
              onClick={() => onViewChange(topic)}
              className={`phemossa-pill shrink-0 ${view === topic ? 'phemossa-pill-active' : 'phemossa-pill-inactive'}`}
            >
              {topic}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
