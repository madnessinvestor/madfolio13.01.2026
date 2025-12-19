import { createContext, useContext, useState, ReactNode } from "react";
import { type DisplayCurrency } from "@/components/CurrencySwitcher";

interface CurrencyContextType {
  displayCurrency: DisplayCurrency;
  setDisplayCurrency: (currency: DisplayCurrency) => void;
  isBalanceHidden: boolean;
  setIsBalanceHidden: (hidden: boolean) => void;
}

const CurrencyContext = createContext<CurrencyContextType | null>(null);

export function useDisplayCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error("useDisplayCurrency must be used within a CurrencyProvider");
  }
  return context;
}

export const CurrencyProvider = ({ children }: { children: ReactNode }) => {
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>("BRL");
  const [isBalanceHidden, setIsBalanceHidden] = useState(false);

  return (
    <CurrencyContext.Provider value={{ displayCurrency, setDisplayCurrency, isBalanceHidden, setIsBalanceHidden }}>
      {children}
    </CurrencyContext.Provider>
  );
};
