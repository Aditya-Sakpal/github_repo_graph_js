import { AppLayout } from "@/components/layout/AppSidebar";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/card";

export default function Winners() {
  return (
    <AppLayout>
      <Header title="Winner Management" />
      <main className="p-4 space-y-4">
        <h1 className="sr-only">Winner Management</h1>
        <Card className="p-6">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Recent Winners</h2>
            <p className="text-sm text-muted-foreground">This is a demo view. Use the Select Winners action on the Dashboard to simulate picking winners.</p>
          </div>
        </Card>
      </main>
    </AppLayout>
  );
}
