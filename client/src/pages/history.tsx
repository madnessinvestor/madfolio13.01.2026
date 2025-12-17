import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { History, Search, Filter, Calendar } from "lucide-react";
import { PerformanceChart } from "@/components/dashboard/PerformanceChart";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import type { Asset } from "@/components/dashboard/AddAssetDialog";

interface Snapshot {
  id: string;
  assetId: string;
  value: number;
  amount: number | null;
  unitPrice: number | null;
  date: string;
  notes: string | null;
}

interface HistoryPoint {
  month: string;
  year: number;
  value: number;
  variation: number;
}

export default function HistoryPage() {
  const [filter, setFilter] = useState<"all" | "crypto" | "traditional">("all");
  const [search, setSearch] = useState("");

  const { data: snapshots = [], isLoading: snapshotsLoading } = useQuery<Snapshot[]>({
    queryKey: ["/api/snapshots"],
  });

  const { data: assets = [], isLoading: assetsLoading } = useQuery<Asset[]>({
    queryKey: ["/api/assets"],
  });

  const { data: history = [], isLoading: historyLoading } = useQuery<HistoryPoint[]>({
    queryKey: ["/api/portfolio/history"],
  });

  const enrichedSnapshots = snapshots.map((snapshot) => {
    const asset = assets.find((a) => a.id === snapshot.assetId);
    return {
      ...snapshot,
      assetSymbol: asset?.symbol || "Unknown",
      assetName: asset?.name || "Unknown",
      market: asset?.market || "unknown",
    };
  });

  const filteredHistory = enrichedSnapshots.filter((entry) => {
    const matchesFilter = filter === "all" || entry.market === filter;
    const matchesSearch =
      search === "" ||
      entry.assetSymbol.toLowerCase().includes(search.toLowerCase()) ||
      entry.assetName.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const formatCurrency = (value: number) =>
    `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  const performanceData = history.map((h) => ({
    month: h.month,
    value: h.value,
  }));

  const isLoading = snapshotsLoading || assetsLoading || historyLoading;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Histórico</h1>
          <p className="text-muted-foreground">Todos os lançamentos e snapshots</p>
        </div>
      </div>

      {historyLoading ? (
        <Skeleton className="h-80 rounded-lg" />
      ) : performanceData.length > 0 ? (
        <PerformanceChart data={performanceData} title="Evolução do Patrimônio Total" />
      ) : (
        <div className="h-64 rounded-lg border flex items-center justify-center text-muted-foreground">
          Adicione lançamentos para ver o gráfico de evolução
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <History className="h-5 w-5" />
            Lançamentos
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-initial">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar ativo..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 w-full sm:w-48"
                data-testid="input-search-history"
              />
            </div>
            <Select value={filter} onValueChange={(v: "all" | "crypto" | "traditional") => setFilter(v)}>
              <SelectTrigger className="w-full sm:w-40" data-testid="select-filter-market">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filtrar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="crypto">Cripto</SelectItem>
                <SelectItem value="traditional">Tradicional</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6">
              <Skeleton className="h-64 rounded-lg" />
            </div>
          ) : filteredHistory.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Ativo</TableHead>
                    <TableHead>Mercado</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Observação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredHistory.map((entry) => (
                    <TableRow key={entry.id} data-testid={`row-history-${entry.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">
                            {new Date(entry.date).toLocaleDateString("pt-BR")}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{entry.assetSymbol}</p>
                          <p className="text-xs text-muted-foreground">{entry.assetName}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={entry.market === "crypto" ? "default" : "secondary"}>
                          {entry.market === "crypto" ? "Cripto" : "Tradicional"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatCurrency(entry.value)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {entry.notes || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="p-12 text-center text-muted-foreground">
              Nenhum lançamento encontrado. Adicione ativos e registre valores para ver o histórico.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
