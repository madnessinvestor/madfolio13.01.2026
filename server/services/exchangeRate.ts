const EXCHANGE_API = "https://api.exchangerate-api.com/v4/latest";

interface ExchangeRates {
  USD: number;
  EUR: number;
  BRL: number;
}

let cachedRates: ExchangeRates | null = null;
let lastFetchTime: number = 0;
const CACHE_DURATION = 30 * 60 * 1000;

export async function fetchExchangeRates(): Promise<ExchangeRates> {
  const now = Date.now();
  
  if (cachedRates && (now - lastFetchTime) < CACHE_DURATION) {
    return cachedRates;
  }

  try {
    const res = await fetch(`${EXCHANGE_API}/USD`);
    if (!res.ok) throw new Error("Failed to fetch exchange rates");
    
    const data = await res.json();
    
    const usdToBrl = data.rates.BRL;
    const eurToUsd = 1 / data.rates.EUR;
    const eurToBrl = eurToUsd * usdToBrl;
    
    cachedRates = {
      USD: usdToBrl,
      EUR: eurToBrl,
      BRL: 1,
    };
    lastFetchTime = now;
    
    console.log("Exchange rates updated:", cachedRates);
    
    return cachedRates;
  } catch (error) {
    console.error("Error fetching exchange rates:", error);
    return cachedRates || { USD: 5.5, EUR: 6.0, BRL: 1 };
  }
}

export async function convertToBRL(amount: number, fromCurrency: string): Promise<number> {
  if (fromCurrency === "BRL") return amount;
  
  const rates = await fetchExchangeRates();
  const rate = rates[fromCurrency as keyof ExchangeRates] || 1;
  return amount * rate;
}

export async function getExchangeRate(currency: string): Promise<number> {
  if (currency === "BRL") return 1;
  
  const rates = await fetchExchangeRates();
  return rates[currency as keyof ExchangeRates] || 1;
}
