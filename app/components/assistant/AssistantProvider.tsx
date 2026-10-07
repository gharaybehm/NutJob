"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { AssistantPins } from "@/utils/assistant/types";

// Mounted by the farm layout for supervisors and admins only. Without it,
// useAssistant() returns null and every assistant button renders nothing, so
// workers never see the control (the route refuses them as well).

const AssistantDrawer = dynamic(() => import("./AssistantDrawer"), { ssr: false });

interface AssistantContextValue {
  open: (pins?: AssistantPins) => void;
  close: () => void;
  isOpen: boolean;
}

const AssistantContext = createContext<AssistantContextValue | null>(null);

export function useAssistant(): AssistantContextValue | null {
  return useContext(AssistantContext);
}

export default function AssistantProvider({
  farmId,
  isAdmin,
  children,
}: {
  farmId: string;
  isAdmin: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  // Opening with pins (from a block or a card) starts a new conversation on
  // them: the key change remounts the drawer. Opening without pins keeps the
  // conversation that was open.
  const [session, setSession] = useState<{ pins: AssistantPins; key: number } | null>(null);

  const open = useCallback((pins?: AssistantPins) => {
    setSession((s) => {
      const pinned = pins && Object.keys(pins).length > 0;
      if (s && !pinned) return s;
      return { pins: pins ?? {}, key: (s?.key ?? 0) + 1 };
    });
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);
  const value = useMemo(() => ({ open, close, isOpen }), [open, close, isOpen]);

  return (
    <AssistantContext.Provider value={value}>
      {children}
      {session && (
        <AssistantDrawer
          key={session.key}
          farmId={farmId}
          isAdmin={isAdmin}
          open={isOpen}
          onClose={close}
          initialPins={session.pins}
        />
      )}
    </AssistantContext.Provider>
  );
}
