import { useDatabaseStatus } from "@/hooks/use-database-status";
import { Badge } from "@/components/ui/badge";

export function DatabaseIndicator() {
  const { isConnected, isLoading } = useDatabaseStatus();

  if (isLoading || isConnected === null) {
    return (
      <Badge variant="outline" className="text-xs font-medium">
        Database
      </Badge>
    );
  }

  return (
    <Badge
      className={`text-xs font-medium gap-2 ${
        isConnected
          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
          : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
      }`}
      data-testid="badge-database-status"
    >
      <span
        className={`inline-block w-2 h-2 rounded-full ${
          isConnected ? "bg-green-600 dark:bg-green-400" : "bg-red-600 dark:bg-red-400"
        }`}
      />
      Database
    </Badge>
  );
}
