"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type InboxChromeValue = {
  threadOpen: boolean;
  setThreadOpen: (open: boolean) => void;
};

const InboxChromeContext = createContext<InboxChromeValue>({
  threadOpen: false,
  setThreadOpen: () => {},
});

export function InboxChromeProvider({ children }: { children: ReactNode }) {
  const [threadOpen, setThreadOpen] = useState(false);
  const value = useMemo(
    () => ({ threadOpen, setThreadOpen }),
    [threadOpen],
  );
  return (
    <InboxChromeContext.Provider value={value}>
      {children}
    </InboxChromeContext.Provider>
  );
}

export function useInboxChrome() {
  return useContext(InboxChromeContext);
}
