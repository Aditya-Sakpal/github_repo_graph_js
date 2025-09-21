import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowUpRight, CheckCircle2, Users, Trophy, TrendingUp, ShoppingBag, Scan, Award } from "lucide-react";
import { useData } from "@/contexts/DataContext";

interface StatsCardsProps {
  refreshTrigger?: number;
  isAuthenticated: boolean;
}

export function StatsCards({ refreshTrigger, isAuthenticated }: StatsCardsProps) {
  const { statsData, loading, error } = useData();
  const items = [
    { title: "Total Registrations", value: statsData.registrations.toLocaleString(), icon: Users },
    { title: "Code Scans Today", value: statsData.codeScansToday.toLocaleString(), icon: Scan },
    { 
      title: "Winners Selected", 
      value: statsData.winnersSelected.length.toString(), 
      icon: Award,
      isWinners: true,
      winners: statsData.winnersSelected
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="hover:shadow-md" style={{ boxShadow: "var(--shadow-elevated)" }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="h-4 w-32 bg-muted animate-pulse rounded"></div>
              <div className="h-4 w-4 bg-muted animate-pulse rounded"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 w-20 bg-muted animate-pulse rounded mb-2"></div>
              <div className="h-3 w-24 bg-muted animate-pulse rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <Card className="col-span-full">
          <CardContent className="pt-6">
            <div className="text-center text-red-500">
              <p>Error loading statistics: {error}</p>
              <Button 
                variant="outline" 
                onClick={() => window.location.reload()} 
                className="mt-2"
              >
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {items.map((i) => (
        <Card key={i.title} className="hover:shadow-md" style={{ boxShadow: "var(--shadow-elevated)" }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{i.title}</CardTitle>
            <i.icon className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-semibold">{i.value}</div>
              {i.isWinners && i.winners && i.winners.length > 0 && (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="ml-2">
                      View Winners
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Selected Winners</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {i.winners.map((winner, idx) => (
                        <div key={idx} className="p-3 rounded-lg border bg-muted/30">
                          <div className="font-medium">{winner.name}</div>
                          <div className="text-sm text-muted-foreground">{winner.phone}</div>
                          <div className="text-sm text-muted-foreground">{winner.city}</div>
                        </div>
                      ))}
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <TrendingUp className="h-3 w-3" />
              Live data from database
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
