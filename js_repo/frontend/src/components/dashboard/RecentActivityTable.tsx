import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit, Eye, Trash2, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useData } from "@/contexts/DataContext";
import { Entry } from "@/utils/dataTransforms";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const statuses = ["All", "Registered", "Verified", "Pending", "Rejected"] as const;

interface RecentActivityTableProps {
  isAuthenticated: boolean;
}

export function RecentActivityTable({ isAuthenticated }: RecentActivityTableProps) {
  const { entries, loading, error, deleteEntry } = useData();
  const [deleting, setDeleting] = useState<string | null>(null);
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<typeof statuses[number]>("All");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return entries.filter((e) =>
      (status === "All" || e.status === status) &&
      (e.name.toLowerCase().includes(q) || e.phone.includes(q) || e.city.toLowerCase().includes(q))
    );
  }, [entries, query, status]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = filtered.slice((page - 1) * pageSize, page * pageSize);

  const handleDelete = async (phone: string, name: string) => {
    if (!isAuthenticated) {
      toast({
        title: "Authentication required",
        description: "Please authenticate to delete records.",
        variant: "destructive"
      });
      return;
    }

    setDeleting(phone);
    try {
      // Find the entry by phone to get the ID
      const entryToDelete = entries.find(entry => entry.phone === phone);
      if (!entryToDelete) {
        throw new Error('Entry not found');
      }

      // Use the context's delete function
      deleteEntry(entryToDelete.id);
      
      toast({
        title: "Registration deleted",
        description: `Successfully deleted registration for ${name} (${phone})`,
      });

    } catch (error) {
      console.error('Error deleting registration:', error);
      toast({
        title: "Error deleting registration",
        description: error.message || "Failed to delete registration. Please try again.",
        variant: "destructive"
      });
    } finally {
      setDeleting(null);
    }
  };

  const onAction = (type: "view" | "edit" | "delete", id: string) => {
    toast({ title: `Action: ${type}`, description: `Entry ${id}` });
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center space-x-4">
                <div className="h-4 w-32 bg-muted animate-pulse rounded"></div>
                <div className="h-4 w-28 bg-muted animate-pulse rounded"></div>
                <div className="h-4 w-20 bg-muted animate-pulse rounded"></div>
                <div className="h-4 w-16 bg-muted animate-pulse rounded"></div>
                <div className="h-4 w-20 bg-muted animate-pulse rounded"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Registered Users</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-red-500 py-10">
            <p>Error loading recent activity: {error}</p>
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
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <CardTitle>Recent Activity</CardTitle>
        <div className="flex gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search name, phone, or city" className="pl-8" />
          </div>
          <Select value={status} onValueChange={(v) => { setStatus(v as any); setPage(1); }}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Filter status" />
            </SelectTrigger>
            <SelectContent>
              {statuses.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {current.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">No results found.</TableCell>
                </TableRow>
              ) : (
                current.map((e) => (
                  <TableRow key={e.id} className="animate-fade-in">
                    <TableCell className="font-medium">{e.name}</TableCell>
                    <TableCell>{e.phone}</TableCell>
                    <TableCell>{e.city}</TableCell>
                    <TableCell>
                      <Badge variant={
                        e.status === "Registered" ? "default" : 
                        e.status === "Verified" ? "default" : 
                        e.status === "Pending" ? "secondary" : 
                        "destructive"
                      }>
                        {e.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{e.date}</TableCell>
                    <TableCell className="text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            aria-label="Delete" 
                            disabled={deleting === e.phone || !isAuthenticated}
                            className="hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Registration</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete the registration for <strong>{e.name}</strong> ({e.phone})?
                              <br /><br />
                              This action cannot be undone and will permanently remove all registration data including:
                              <ul className="list-disc list-inside mt-2 space-y-1">
                                <li>Personal information (name, email, city)</li>
                                <li>Scratch code usage</li>
                                <li>Registration timestamp</li>
                                <li>Winner status (if applicable)</li>
                              </ul>
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(e.phone, e.name)}
                              className="bg-red-600 hover:bg-red-700"
                              disabled={deleting === e.phone}
                            >
                              {deleting === e.phone ? "Deleting..." : "Delete Registration"}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filtered.length)} of {filtered.length}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
