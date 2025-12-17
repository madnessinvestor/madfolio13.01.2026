import { MetricCard } from "../dashboard/MetricCard";
import { Wallet } from "lucide-react";

export default function MetricCardExample() {
  return (
    <MetricCard
      title="Total Portfolio"
      value="R$ 125,430.00"
      change={12.5}
      changeLabel="vs last month"
      icon={Wallet}
    />
  );
}
