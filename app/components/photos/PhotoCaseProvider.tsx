"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { submitPhotoCase } from "@/app/actions/photo-cases";
import { PHOTO_BUCKET } from "@/utils/photo/case";
import { flush, listCases, type FlushResult, type OutboxEntry, type Transport } from "@/utils/photo/outbox";
import { submitStep, uploadStep } from "@/utils/photo/transport";
// Imported directly, not lazily: the drawer has to open with no connection,
// so its code must already be on the device with the page.
import PhotoCaseDrawer from "./PhotoCaseDrawer";

// Mounted by the farm layout for every role: workers do the scouting. It owns
// the device queue for the open farm and sends what is waiting when the app
// is opened, brought to the front, or the connection comes back. There is no
// background sending (iPhone Safari has none).

export interface PhotoBlock {
  id: string;
  name: string;
}

interface PhotoCaseContextValue {
  open: (blockId?: string) => void;
  /** Cases still on this device for the farm. */
  entries: OutboxEntry[];
  sending: boolean;
  /** Reads the queue again after a change made in the drawer. */
  refresh: () => Promise<void>;
  /** Tries to send what is waiting; resolves to what happened. */
  send: () => Promise<FlushResult | null>;
  /** Goes up each time a case reaches the server, so lists can reload. */
  sentCount: number;
}

// One transport for the tab: photos go from the browser straight to storage,
// then the case is recorded through the server action.
let transport: Transport | null = null;
function getTransport(): Transport {
  if (!transport) {
    const supabase = createClient();
    transport = {
      async upload(path, bytes) {
        const { error } = await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(path, new Blob([bytes], { type: "image/jpeg" }), { contentType: "image/jpeg", upsert: false });
        return uploadStep(error);
      },
      async submit(c) {
        return submitStep(await submitPhotoCase(c));
      },
    };
  }
  return transport;
}

const PhotoCaseContext = createContext<PhotoCaseContextValue | null>(null);

export function usePhotoCases(): PhotoCaseContextValue | null {
  return useContext(PhotoCaseContext);
}

export default function PhotoCaseProvider({
  farmId,
  userId,
  blocks,
  children,
}: {
  farmId: string;
  /** The signed-in user: the queue shows and sends only their cases. */
  userId: string;
  blocks: PhotoBlock[];
  children: React.ReactNode;
}) {
  const [session, setSession] = useState<{ blockId?: string; key: number } | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      setEntries(await listCases(farmId, userId));
    } catch {
      // No IndexedDB (some private windows): nothing can be queued either.
      setEntries([]);
    }
  }, [farmId, userId]);

  const send = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return null;
    setSending(true);
    try {
      const result = await flush(farmId, userId, getTransport());
      if (result.sent > 0) setSentCount((n) => n + result.sent);
      return result;
    } catch {
      return null;
    } finally {
      await refresh();
      setSending(false);
    }
  }, [farmId, userId, refresh]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sends what an earlier visit left on the device
    void send();
    const onOnline = () => void send();
    const onVisible = () => {
      if (document.visibilityState === "visible") void send();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [send]);

  const open = useCallback((blockId?: string) => {
    setSession((s) => ({ blockId, key: (s?.key ?? 0) + 1 }));
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);

  const value = useMemo(() => ({ open, entries, sending, refresh, send, sentCount }), [open, entries, sending, refresh, send, sentCount]);

  return (
    <PhotoCaseContext.Provider value={value}>
      {children}
      {session && isOpen && (
        <PhotoCaseDrawer key={session.key} farmId={farmId} userId={userId} blocks={blocks} initialBlockId={session.blockId} onClose={close} />
      )}
    </PhotoCaseContext.Provider>
  );
}
