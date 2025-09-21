import { AppLayout } from "@/components/layout/AppSidebar";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export default function SettingsPage() {
  return (
    <AppLayout>
      <Header title="Settings" />
      <main className="p-4 space-y-4">
        <h1 className="sr-only">Settings</h1>
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="dark-mode">Enable dark mode</Label>
            <Switch id="dark-mode" />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="notify">Email notifications</Label>
            <Switch id="notify" />
          </div>
        </Card>
      </main>
    </AppLayout>
  );
}
