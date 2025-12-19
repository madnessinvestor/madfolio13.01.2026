import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Save, Calendar, History, TrendingUp } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Asset {
  id: string;
  symbol: string;
  name: string;
  category: string;
  market: string;
  quantity: number;
  acquisitionPrice: number;
  acquisitionDate: string;
  currentPrice: number;
  currency: string;
}

interface Snapshot {
  id: string;
  assetId: string;
  date: string;
  value: number;
  amount?: number;
  unitPrice?: number;
  notes?: string;
  createdAt?: string;
}

interface EditInvestmentDialogProps {
  assetId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditInvestmentDialog({ assetId, open, onOpenChange }: EditInvestmentDialogProps) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [quantity, setQuantity] = useState("");
  const [acquisitionPrice, setAcquisitionPrice] = useState("");
  const [acquisitionDate, setAcquisitionDate] = useState("");
  const [currentValue, setCurrentValue] = useState("");

  // Update snapshot states
  const [updateDate, setUpdateDate] = useState(new Date().toISOString().split("T")[0]);
  const [updateQuantity, setUpdateQuantity] = useState("");
  const [updatePrice, setUpdatePrice] = useState("");
  const [updateNotes, setUpdateNotes] = useState("");

  const { data: asset, isLoading: assetLoading } = useQuery<Asset>({
    queryKey: ["/api/assets", assetId],
    enabled: open && !!assetId,
  });

  const { data: snapshots = [], isLoading: snapshotsLoading } = useQuery<Snapshot[]>({
    queryKey: ["/api/snapshots", assetId],
    enabled: open && !!assetId,
  });

  useEffect(() => {
    if (asset) {
      setName(asset.name || "");
      setSymbol(asset.symbol || "");
      setQuantity(asset.quantity?.toString() || "1");
      setAcquisitionPrice(formatCurrencyInput(asset.acquisitionPrice || 0));
      setAcquisitionDate(asset.acquisitionDate || new Date().toISOString().split("T")[0]);
      setCurrentValue(formatCurrencyInput(asset.currentPrice || asset.acquisitionPrice || 0));
      setUpdateQuantity(asset.quantity?.toString() || "1");
      setUpdatePrice(formatCurrencyInput(asset.currentPrice || 0));
    }
  }, [asset]);

  const updateAssetMutation = useMutation({
    mutationFn: async (data: Partial<Asset>) => {
      return apiRequest("PATCH", `/api/assets/${assetId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assets", assetId] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/snapshots"] });
      queryClient.invalidateQueries({ queryKey: ["/api/snapshots", assetId] });
      toast({
        title: "Investimento atualizado",
        description: "As alterações foram salvas com sucesso.",
      });
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível atualizar o investimento.",
        variant: "destructive",
      });
    },
  });

  const createSnapshotMutation = useMutation({
    mutationFn: async (snapshot: any) => {
      return apiRequest("POST", "/api/snapshots", snapshot);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/snapshots"] });
      queryClient.invalidateQueries({ queryKey: ["/api/snapshots", assetId] });
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assets", assetId] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/history"] });
      toast({
        title: "Valor atualizado",
        description: "O valor do investimento foi registrado com sucesso.",
      });
      setUpdateQuantity(asset?.quantity?.toString() || "1");
      setUpdatePrice(formatCurrencyInput(asset?.currentPrice || 0));
      setUpdateNotes("");
      setUpdateDate(new Date().toISOString().split("T")[0]);
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível atualizar o valor.",
        variant: "destructive",
      });
    },
  });

  const formatCurrencyInput = (value: number): string => {
    return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatCurrencyDisplay = (val: string) => {
    const num = val.replace(/[^\d]/g, "");
    if (!num) return "";
    const formatted = (parseInt(num) / 100).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `R$ ${formatted}`;
  };

  const parseCurrencyValue = (val: string): number => {
    const num = val.replace(/[^\d.,]/g, "");
    return parseFloat(num.replace(/\./g, "").replace(",", ".")) || 0;
  };

  const handleSaveEdit = () => {
    const parsedQuantity = parseFloat(quantity.replace(",", ".")) || 1;
    const parsedAcquisitionPrice = parseCurrencyValue(acquisitionPrice);
    const parsedCurrentValue = parseCurrencyValue(currentValue);

    updateAssetMutation.mutate({
      name,
      symbol: symbol.toUpperCase(),
      quantity: parsedQuantity,
      acquisitionPrice: parsedAcquisitionPrice,
      acquisitionDate,
      currentPrice: parsedCurrentValue,
    });
  };

  const handleCreateSnapshot = () => {
    const parsedQuantity = parseFloat(updateQuantity.replace(",", ".")) || 1;
    const parsedPrice = parseCurrencyValue(updatePrice);
    const totalValue = parsedQuantity * parsedPrice;

    createSnapshotMutation.mutate({
      assetId,
      date: updateDate,
      value: totalValue,
      amount: parsedQuantity,
      unitPrice: parsedPrice,
      notes: updateNotes || "Atualização manual",
    });
  };

  const isSimplified = asset?.quantity === 1;

  if (assetLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>Editar Investimento</DialogTitle>
          <DialogDescription>
            {asset?.name} ({asset?.symbol})
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="edit" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="edit">Editar</TabsTrigger>
            <TabsTrigger value="update">Atualizar Valor</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
          </TabsList>

          {/* Aba de Edição */}
          <TabsContent value="edit" className="space-y-4">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-name">Nome *</Label>
                <Input
                  id="edit-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  data-testid="input-edit-name"
                />
              </div>

              {!isSimplified && (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="edit-symbol">Símbolo *</Label>
                    <Input
                      id="edit-symbol"
                      value={symbol}
                      onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                      data-testid="input-edit-symbol"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="edit-quantity">Quantidade *</Label>
                      <Input
                        id="edit-quantity"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        data-testid="input-edit-quantity"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="edit-acquisition-price">Preço de Aquisição *</Label>
                      <Input
                        id="edit-acquisition-price"
                        value={acquisitionPrice}
                        onChange={(e) => setAcquisitionPrice(formatCurrencyDisplay(e.target.value))}
                        data-testid="input-edit-acquisition-price"
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-current-value">
                    {isSimplified ? "Valor Atual *" : "Preço Atual *"}
                  </Label>
                  <Input
                    id="edit-current-value"
                    value={currentValue}
                    onChange={(e) => setCurrentValue(formatCurrencyDisplay(e.target.value))}
                    data-testid="input-edit-current-value"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-date">Data</Label>
                  <Input
                    id="edit-date"
                    type="date"
                    value={acquisitionDate}
                    onChange={(e) => setAcquisitionDate(e.target.value)}
                    data-testid="input-edit-date"
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-edit"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSaveEdit}
                disabled={updateAssetMutation.isPending}
                data-testid="button-save-edit"
              >
                {updateAssetMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Salvar
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* Aba de Atualizar Valor */}
          <TabsContent value="update" className="space-y-4">
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="update-date">Data da Atualização *</Label>
                <Input
                  id="update-date"
                  type="date"
                  value={updateDate}
                  onChange={(e) => setUpdateDate(e.target.value)}
                  data-testid="input-update-date"
                />
              </div>

              {!isSimplified && (
                <div className="grid gap-2">
                  <Label htmlFor="update-quantity">Quantidade *</Label>
                  <Input
                    id="update-quantity"
                    type="number"
                    step="0.00000001"
                    value={updateQuantity}
                    onChange={(e) => setUpdateQuantity(e.target.value)}
                    data-testid="input-update-quantity"
                  />
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="update-price">
                  {isSimplified ? "Valor *" : "Preço Unitário *"}
                </Label>
                <Input
                  id="update-price"
                  value={updatePrice}
                  onChange={(e) => setUpdatePrice(formatCurrencyDisplay(e.target.value))}
                  data-testid="input-update-price"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="update-notes">Notas (opcional)</Label>
                <Input
                  id="update-notes"
                  placeholder="Ex: Compra adicional, Rebalanceamento..."
                  value={updateNotes}
                  onChange={(e) => setUpdateNotes(e.target.value)}
                  data-testid="input-update-notes"
                />
              </div>

              {!isSimplified && (
                <div className="p-3 bg-secondary rounded-md">
                  <p className="text-sm text-secondary-foreground">
                    <span className="font-semibold">Valor Total: </span>
                    R${" "}
                    {(parseFloat(updateQuantity.replace(",", ".")) * parseCurrencyValue(updatePrice)).toLocaleString(
                      "pt-BR",
                      { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                    )}
                  </p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-update"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleCreateSnapshot}
                disabled={createSnapshotMutation.isPending}
                data-testid="button-save-update"
              >
                {createSnapshotMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <TrendingUp className="h-4 w-4 mr-2" />
                )}
                Atualizar
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* Aba de Histórico */}
          <TabsContent value="history" className="space-y-4">
            {snapshotsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : snapshots.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-secondary-foreground">Nenhum histórico disponível</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {snapshots.map((snapshot) => (
                  <div
                    key={snapshot.id}
                    className="p-3 border rounded-md space-y-2"
                    data-testid={`snapshot-history-${snapshot.id}`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-sm">
                          {format(parseISO(snapshot.date), "dd/MM/yyyy", { locale: ptBR })}
                        </p>
                        {snapshot.notes && <p className="text-xs text-secondary-foreground">{snapshot.notes}</p>}
                      </div>
                      <p className="font-semibold text-sm">
                        R$ {snapshot.value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    {snapshot.amount !== undefined && snapshot.unitPrice !== undefined && (
                      <div className="text-xs text-secondary-foreground">
                        <span>{snapshot.amount.toLocaleString("pt-BR", { minimumFractionDigits: 8, maximumFractionDigits: 8 })} × </span>
                        <span>
                          R$ {snapshot.unitPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
