import { PortfolioChart } from "../dashboard/PortfolioChart";

export default function PortfolioChartExample() {
  const data = [
    { name: "Bitcoin", value: 45000, color: "hsl(var(--chart-1))" },
    { name: "Ethereum", value: 25000, color: "hsl(var(--chart-2))" },
    { name: "Solana", value: 15000, color: "hsl(var(--chart-3))" },
    { name: "Others", value: 10000, color: "hsl(var(--chart-4))" },
  ];

  return <PortfolioChart title="Crypto Allocation" data={data} />;
}
