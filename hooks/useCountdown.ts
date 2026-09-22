import { useEffect, useState } from "react";

/**
 * Ticks down to a server-provided end time. The end time is the source of
 * truth (remaining = endTime - now); this hook only re-renders smoothly, it
 * never invents or extends time on its own.
 */
export function useCountdown(endTimeIso: string | null): number {
  // A tick counter just forces a re-render; the actual value is always
  // computed fresh from props during render, so there's no stored countdown
  // state to fall out of sync with `endTimeIso`.
  const [, tick] = useState(0);

  useEffect(() => {
    if (!endTimeIso) return;
    const interval = setInterval(() => tick((n) => n + 1), 150);
    return () => clearInterval(interval);
  }, [endTimeIso]);

  return computeRemaining(endTimeIso);
}

function computeRemaining(endTimeIso: string | null): number {
  if (!endTimeIso) return 0;
  return Math.max(0, new Date(endTimeIso).getTime() - Date.now());
}
