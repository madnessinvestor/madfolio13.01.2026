import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Loader2 } from "lucide-react";

export interface RealEstateAsset {
  id: string;
  name: string;
  symbol: string;
  acquisitionPrice: number;
  acquisitionDate: string;
  quantity: number;
  address?: string;
  notes?: string;
}

interface AddRealEstateDialogProps {
  onAdd: (asset: Omit<RealEstateAsset, "id">) => void;
  isLoading?: boolean;
}

export function AddRealEstateDialog({ onAdd, isLoading }: AddRealEstateDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [acquisitionPrice, setAcquisitionPrice] = useState("");
  const [acquisitionDate, setAcquisitionDate] = useState(new Date().toISOString().split("T")[0]);
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !acquisitionPrice || !acquisitionDate) return;

    const priceString = acquisitionPrice.replace(/[^\d.,]/g, "");
    const parsedPrice = parseFloat(priceString.replace(/\./g, "").replace(",", "."));

    if (isNaN(parsedPrice)) return;

    onAdd({
      name,
      symbol: symbol || name.substring(0, 6).toUpperCase().replace(/\s/g, ""),
      acquisitionPrice: parsedPrice,
      acquisitionDate,
      quantity: 1,
      address,
      notes,
    });

    resetForm();
    setOpen(false);
  };

  const resetForm = () => {
    setName("");
    setSymbol("");
    setAcquisitionPrice("");
    setAcquisitionDate(new Date().toISOString().split("T")[0]);
    setAddress("");
    setNotes("");
  };

  const formatCurrency = (val: string) => {
    const num = val.replace(/[^\d]/g, "");
    if (!num) return "";
    const formatted = (parseInt(num) / 100).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `R$ ${formatted}`;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-add-real-estate">
          <Plus className="h-4 w-4 mr-2" />
          Adicionar Imóvel
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Adicionar Imóvel</DialogTitle>
            <DialogDescription>
              Cadastre um novo imóvel no seu portfólio.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Nome do Imóvel *</Label>
              <Input
                id="name"
                placeholder="Ex: Apartamento Centro SP"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="symbol">Código (opcional)</Label>
              <Input
                id="symbol"
                placeholder="Ex: APT01"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Um código curto para identificar o imóvel. Se não informado, será gerado automaticamente.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="acquisitionPrice">Valor de Aquisição *</Label>
              <Input
                id="acquisitionPrice"
                placeholder="R$ 0,00"
                value={acquisitionPrice}
                onChange={(e) => setAcquisitionPrice(formatCurrency(e.target.value))}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="acquisitionDate">Data da Aquisição *</Label>
              <Input
                id="acquisitionDate"
                type="date"
                value={acquisitionDate}
                onChange={(e) => setAcquisitionDate(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="address">Endereço (opcional)</Label>
              <Input
                id="address"
                placeholder="Rua, número, bairro, cidade"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="notes">Observações (opcional)</Label>
              <Textarea
                id="notes"
                placeholder="Informações adicionais sobre o imóvel"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Adicionar"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
