import { useQuery, UseQueryOptions } from "@tanstack/react-query";
import { useRef, useCallback } from "react";

/**
 * Hook otimizado para queries com debounce e cache inteligente
 * Evita múltiplas requisições simultâneas e reutiliza dados em cache
 */
export function useOptimizedQuery<T>(
  queryKey: string[],
  queryFn: () => Promise<T>,
  options?: Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'>
) {
  const lastFetchTime = useRef<number>(0);
  const MIN_FETCH_INTERVAL = 30000; // 30 segundos mínimo entre fetches

  const optimizedQueryFn = useCallback(async () => {
    const now = Date.now();
    const timeSinceLastFetch = now - lastFetchTime.current;

    // Se fez fetch recentemente, retornar dados em cache
    if (timeSinceLastFetch < MIN_FETCH_INTERVAL) {
      // Aguardar o tempo restante para não fazer fetch muito rápido
      const waitTime = MIN_FETCH_INTERVAL - timeSinceLastFetch;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    lastFetchTime.current = Date.now();
    return queryFn();
  }, [queryFn]);

  return useQuery<T>({
    queryKey,
    queryFn: optimizedQueryFn,
    staleTime: 10 * 60 * 1000, // 10 minutos
    gcTime: 15 * 60 * 1000, // 15 minutos
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 1,
    ...options,
  });
}
