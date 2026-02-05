'use client';

import { useEffect, useState } from 'react';
import type { PhemossaSystem } from '@/lib/system';

interface ProfileSectionProps {
  system: PhemossaSystem | null;
  onProfileChange?: () => void;
}

export default function ProfileSection({ system, onProfileChange }: ProfileSectionProps) {
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!system) return;
    const me = system.getMyPublicKeyBase64();
    system.getProfile(me).then((p) => {
      setDisplayName(p.displayName ?? '');
      setUsername(p.username ?? '');
      setBio(p.bio ?? '');
    }).catch(() => {});
  }, [system]);

  const handleSave = async () => {
    if (!system) return;
    setSaving(true);
    setError(null);
    try {
      await system.setProfile({
        displayName: displayName.trim() || undefined,
        username: username.trim() || undefined,
        bio: bio.trim() || undefined,
      });
      const me = system.getMyPublicKeyBase64();
      const p = await system.getProfile(me);
      setDisplayName(p.displayName ?? '');
      setUsername(p.username ?? '');
      setBio(p.bio ?? '');
      setEditing(false);
      onProfileChange?.();
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!system) return null;

  return (
    <div className="phemossa-card p-5 space-y-4">
      <h3 className="text-sm font-semibold text-[rgb(var(--color-text-muted))] uppercase tracking-wider">
        Profile
      </h3>

      {/* Avatar placeholder */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 bg-[rgb(var(--color-bg-muted))] border border-[rgb(var(--color-border))] flex items-center justify-center text-[rgb(var(--color-text-subtle))] text-xl font-medium shrink-0">
          {(displayName.trim() || username.trim() || '?').charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          {!editing ? (
            <>
              <p className="text-sm font-medium text-[rgb(var(--color-text))] truncate">
                {displayName.trim() || 'Display name'}
              </p>
              <p className="text-xs text-[rgb(var(--color-accent))] truncate">
                {username.trim() ? `@${username.trim()}` : '@username'}
              </p>
            </>
          ) : null}
        </div>
      </div>

      {bio.trim() && !editing && (
        <p className="text-sm text-[rgb(var(--color-text-muted))] leading-relaxed">
          {bio.trim()}
        </p>
      )}

      {!editing ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="phemossa-btn-secondary py-1.5 px-3 text-xs w-full"
        >
          Edit profile
        </button>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-[rgb(var(--color-text-subtle))] mb-1">Display name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value.slice(0, 32))}
              placeholder="Alice"
              className="phemossa-input py-2 text-sm"
              maxLength={32}
            />
          </div>
          <div>
            <label className="block text-xs text-[rgb(var(--color-text-subtle))] mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30))}
              placeholder="alice"
              className="phemossa-input py-2 text-sm font-mono"
              maxLength={30}
            />
            <p className="text-xs text-[rgb(var(--color-text-subtle))] mt-0.5">
              3–30 chars, letters, numbers, underscore. Shown as @username
            </p>
          </div>
          <div>
            <label className="block text-xs text-[rgb(var(--color-text-subtle))] mb-1">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, 160))}
              placeholder="A short bio..."
              rows={2}
              className="phemossa-input py-2 text-sm resize-none"
              maxLength={160}
            />
            <p className="text-xs text-[rgb(var(--color-text-subtle))] mt-0.5">{bio.length}/160</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || (username.trim().length > 0 && username.trim().length < 3)}
              className="phemossa-btn-primary py-1.5 px-3 text-xs flex-1"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setError(null); }}
              disabled={saving}
              className="phemossa-btn-secondary py-1.5 px-3 text-xs"
            >
              Cancel
            </button>
          </div>
          {error && (
            <p className="text-xs text-[rgb(var(--color-error))]">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
