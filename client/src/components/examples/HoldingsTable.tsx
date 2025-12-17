import { HoldingsTable, type Holding } from "../dashboard/HoldingsTable";

export default function HoldingsTableExample() {
  const holdings: Holding[] = [
    {
      id: "1",
      symbol: "BTC",
      name: "Bitcoin",
      amount: 0.5,
      avgPrice: 180000,
      currentPrice: 210000,
      change24h: 2.5,
      type: "crypto",
    },
    {
      id: "2",
      symbol: "ETH",
      name: "Ethereum",
      amount: 2.5,
      avgPrice: 9500,
      currentPrice: 11200,
      change24h: -1.2,
      type: "crypto",
    },
  ];

  return (
    <HoldingsTable
      title="Crypto Holdings"
      holdings={holdings}
      onAdd={() => console.log("Add clicked")}
      onEdit={(h) => console.log("Edit", h)}
      onDelete={(h) => console.log("Delete", h)}
    />
  );
}
