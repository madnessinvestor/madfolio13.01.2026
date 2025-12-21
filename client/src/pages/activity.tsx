import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import {
  Plus,
  Edit2,
  Trash2,
  BarChart3,
  Calendar,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ActivityLog {
  id: string;
  type: string;
  category: string;
  assetName?: string;
  assetSymbol?: string;
  action: string;
  details?: string;
  createdAt: string;
}

const activityIcons = {
  create: Plus,
  update: Edit2,
  delete: Trash2,
  snapshot: BarChart3,
};

const activityColors = {
  create: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900",
  update: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900",
  delete: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900",
  snapshot: "bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-900",
};

const activityBadgeVariants = {
  create: "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200",
  update: "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200",
  delete: "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200",
  snapshot: "bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200",
};

const typeLabels = {
  create: "Adicionado",
  update: "Editado",
  delete: "Deletado",
  snapshot: "Valor Atualizado",
};

export default function ActivityPage() {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: activities = [], isLoading } = useQuery<ActivityLog[]>({
    queryKey: ["/api/activities"],
  });

  const filteredActivities = activities.filter((activity) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      activity.assetName?.toLowerCase().includes(searchLower) ||
      activity.assetSymbol?.toLowerCase().includes(searchLower) ||
      activity.action.toLowerCase().includes(searchLower)
    );
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return "Agora há pouco";
    if (diffInSeconds < 3600) return `Há ${Math.floor(diffInSeconds / 60)}m`;
    if (diffInSeconds < 86400) return `Há ${Math.floor(diffInSeconds / 3600)}h`;
    if (diffInSeconds < 604800) return `Há ${Math.floor(diffInSeconds / 86400)}d`;

    return date.toLocaleDateString("pt-BR", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Lançamentos</h1>
        <p className="text-muted-foreground mt-2">Histórico de todas as atividades realizadas na sua carteira</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Atividades Recentes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-6">
            <Input
              placeholder="Pesquisar por ativo, símbolo ou ação..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              data-testid="input-search-activities"
            />
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-lg" />
              ))}
            </div>
          ) : filteredActivities.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <Loader2 className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-20" />
                <p className="text-muted-foreground">
                  {searchTerm ? "Nenhuma atividade encontrada" : "Nenhuma atividade registrada ainda"}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredActivities.map((activity) => {
                const Icon = activityIcons[activity.type as keyof typeof activityIcons] || Calendar;
                const colorClass = activityColors[activity.type as keyof typeof activityColors] || "";
                const badgeClass = activityBadgeVariants[activity.type as keyof typeof activityBadgeVariants] || "";
                const typeLabel = typeLabels[activity.type as keyof typeof typeLabels] || activity.type;

                return (
                  <div
                    key={activity.id}
                    className={`border rounded-lg p-4 ${colorClass}`}
                    data-testid={`activity-${activity.id}`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`p-2 rounded-lg flex-shrink-0 ${badgeClass}`}>
                        <Icon className="w-5 h-5" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className="font-semibold">
                            {activity.assetName || activity.assetSymbol || "Atividade"}
                          </h3>
                          <Badge variant="outline" className={`text-xs font-medium ${badgeClass}`}>
                            {typeLabel}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">{activity.action}</p>
                        {activity.details && (
                          <p className="text-xs text-muted-foreground italic">
                            Detalhes: {activity.details}
                          </p>
                        )}
                      </div>

                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(activity.createdAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
