import { ThemeProvider } from "@/components/theme-provider";
import { ModeToggle } from "@/components/theme-provider";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { ChartsPanel } from "@/components/dashboard/ChartsPanel";
import { RecentActivityTable } from "@/components/dashboard/RecentActivityTable";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuthSession, setAuthSession } from "@/utils/auth";
import { useData } from "@/contexts/DataContext";
import { Winner } from "@/utils/dataTransforms";


const Index = () => {
  const { winners, refreshData, isAuthenticated, setAuthenticated } = useData();
  const [loading, setLoading] = useState(true);
  const [localWinners, setLocalWinners] = useState<Winner[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const triggerRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
    refreshData(); // Refresh data from the context
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === "pass@123") {
      setAuthSession(); // Store in session storage
      setAuthenticated(true); // This will trigger data fetch in context
      setPasswordError("");
    } else {
      setPasswordError("Invalid password. Please try again.");
      setPassword("");
    }
  };

  useEffect(() => {
    const id = setTimeout(() => setLoading(false), 700);
    return () => clearTimeout(id);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Password Protection Overlay */}
      {!isAuthenticated && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Blurred Background */}
          <div className="absolute inset-0 bg-background/80 backdrop-blur-md" />
          
          {/* Password Card */}
          <Card className="relative z-10 w-full max-w-md mx-4">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-bold">Admin Access Required</CardTitle>
              <p className="text-muted-foreground">Please enter the password to access the dashboard</p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Input
                    type="password"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full"
                    autoFocus
                  />
                  {passwordError && (
                    <p className="text-sm text-red-500">{passwordError}</p>
                  )}
                </div>
                <Button type="submit" className="w-full">
                  Access Dashboard
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Dashboard Content */}
      <div className={!isAuthenticated ? "blur-sm pointer-events-none" : ""}>
        <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container flex h-16 items-center justify-between px-6">
            <div className="space-y-1">
              <h1 className="text-2xl font-heading font-semibold text-foreground">Admin Dashboard</h1>
              <p className="text-base text-muted-foreground">Club Rexona</p>
            </div>
            <ModeToggle />
          </div>
        </header>
        
        <main className="container px-6 py-6 space-y-6">
          <StatsCards refreshTrigger={refreshTrigger} isAuthenticated={isAuthenticated} />
          <QuickActions 
            winners={localWinners} 
            setWinners={setLocalWinners} 
            onWinnersUpdated={triggerRefresh} 
            isAuthenticated={isAuthenticated} 
          />
          <ChartsPanel isAuthenticated={isAuthenticated} />
          <RecentActivityTable isAuthenticated={isAuthenticated} />
        </main>
      </div>
    </div>
  );
};

export default Index;
