import { useState, useEffect } from 'react';

export function useDebouncedValue<T>(value: T, delayMs: number = 150): {
  debouncedValue: T;
  isPending: boolean;
} {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  const [isPending, setIsPending] = useState<boolean>(false);

  useEffect(() => {
    if (value === debouncedValue) {
      setIsPending(false);
      return;
    }

    setIsPending(true);
    const timer = window.setTimeout(() => {
      setDebouncedValue(value);
      setIsPending(false);
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [value, delayMs, debouncedValue]);

  return { debouncedValue, isPending };
}
