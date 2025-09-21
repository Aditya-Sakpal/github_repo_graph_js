import { SidebarTrigger } from "@/components/ui/sidebar";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Bell, Moon, Sun, UserCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Badge } from "@/components/ui/badge";

export function Header({ title }: { title: string }) {
  const { theme, setTheme } = useTheme();
  const [notifications, setNotifications] = useState(2);

  useEffect(() => {
    const id = setInterval(() => {
      setNotifications((n) => (n < 9 ? n + 1 : n));
    }, 15000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="sticky top-0 z-20 bg-background/80 backdrop-blur border-b">
      <div className="flex items-center h-14 px-4 gap-3">
        <SidebarTrigger />
        <div className="flex-1">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Overview</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            <Sun className="h-4 w-4 dark:hidden" />
            <Moon className="h-4 w-4 hidden dark:block" />
          </Button>
          <div className="relative">
            <Button variant="ghost" size="icon" aria-label="Notifications">
              <Bell className="h-4 w-4" />
            </Button>
            {notifications > 0 && (
              <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] leading-4 text-center">
                {notifications}
              </span>
            )}
          </div>
          <Button variant="outline" size="sm" className="gap-2">
            <UserCircle2 className="h-4 w-4" />
            Admin
          </Button>
        </div>
      </div>
      <div className="h-px w-full bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      <div className="px-4 py-3">
        <h1 className="text-2xl md:text-3xl font-heading font-semibold">{title}</h1>
      </div>
    </header>
  );
}
