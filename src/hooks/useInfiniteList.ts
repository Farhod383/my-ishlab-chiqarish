import { useEffect, useMemo, useRef, useState } from "react";

/**
 * useInfiniteList — replaces pagination with progressive disclosure.
 * Renders `pageSize` items at a time and increases the visible count
 * whenever a sentinel element scrolls into view. Resets automatically
 * when the upstream array reference changes (e.g. on filter change).
 */
export function useInfiniteList<T>(items: T[], pageSize = 50) {
  const [count, setCount] = useState(pageSize);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Reset visible count when filter or list reference changes.
  useEffect(() => {
    setCount(pageSize);
  }, [items, pageSize]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setCount((c) => Math.min(c + pageSize, items.length));
        }
      },
      { rootMargin: "200px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [items.length, pageSize, count]);

  const visible = useMemo(() => items.slice(0, count), [items, count]);
  const hasMore = count < items.length;
  return { visible, sentinelRef, hasMore, total: items.length };
}

export default useInfiniteList;
