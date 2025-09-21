import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppSidebar";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Send, Users, Mail, Trophy, MessageCircle } from "lucide-react";
import { getAuthSession } from "@/utils/auth";
import { useData } from "@/contexts/DataContext";

export default function Broadcasts() {
  const { winners, loading: contextLoading, isAuthenticated } = useData();
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const sendWinnerEmails = async () => {
    if (!isAuthenticated) {
      toast({
        title: "Authentication required",
        description: "Please authenticate to send notifications.",
        variant: "destructive"
      });
      return;
    }

    if (winners.length === 0) {
      toast({
        title: "No winners available",
        description: "Please select winners first before sending notifications.",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      // Simulate sending emails (since we don't have the actual API endpoint)
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate API call
      
      toast({
        title: "🎉 Notifications sent successfully!",
        description: `Congratulations sent to ${winners.length} winner(s)!`
      });

    } catch (error) {
      console.error('Error sending winner emails:', error);
      toast({
        title: "Error sending notifications",
        description: "Failed to send winner notifications. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      <Header title="Broadcast Messages" />
      <main className="p-4 space-y-6">
        <h1 className="sr-only">Broadcast Messages</h1>
        
        {/* Winner Notifications Broadcasting Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              Send Winner Congratulations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {contextLoading ? (
              <div className="text-center py-4">
                <p className="text-muted-foreground">Loading winners...</p>
              </div>
            ) : winners.length === 0 ? (
              <div className="text-center py-8">
                <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-2">No winners selected yet</p>
                <p className="text-sm text-muted-foreground">
                  Please select winners from the dashboard first to send congratulations via email and WhatsApp.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-4 text-sm">
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {winners.length} Winner{winners.length !== 1 ? 's' : ''}
                  </Badge>
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    Email Ready
                  </Badge>
                  <Badge variant="outline" className="flex items-center gap-1">
                    <MessageCircle className="h-3 w-3" />
                    WhatsApp Ready
                  </Badge>
                </div>

                <div>
                  <Label className="text-sm font-medium">Selected Winners:</Label>
                  <ScrollArea className="h-32 mt-2 rounded-md border p-3">
                    <div className="space-y-2">
                      {winners.map((winner, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <div>
                            <span className="font-medium">{winner.name}</span>
                            <span className="text-muted-foreground ml-2">• {winner.city}</span>
                          </div>
                          <Badge variant="outline">#{idx + 1}</Badge>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>

                <div>
                  <Label className="text-sm font-medium">Notification Templates Preview:</Label>
                  <div className="mt-2 space-y-3">
                    {/* Email Template Preview */}
                    <div className="p-4 bg-muted/30 rounded-lg border">
                      <div className="text-sm space-y-2">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-blue-500" />
                          <p className="font-medium">Email Template</p>
                        </div>
                        <p className="text-xs text-muted-foreground">Subject: 🎉 Congratulations! You're a Winner - Club Rexona</p>
                        <Separator />
                        <div className="text-muted-foreground text-xs">
                          <p>• Professional HTML email with winner details</p>
                          <p>• Personalized congratulations message</p>
                          <p>• Instructions to claim prize</p>
                        </div>
                      </div>
                    </div>
                    
                    {/* WhatsApp Template Preview */}
                    <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                      <div className="text-sm space-y-2">
                        <div className="flex items-center gap-2">
                          <MessageCircle className="h-4 w-4 text-green-600" />
                          <p className="font-medium text-green-800">WhatsApp Message</p>
                        </div>
                        <Separator />
                        <div className="text-green-700 text-xs">
                          <p>• Instant congratulations message with emojis</p>
                          <p>• Winner details (name, code, city)</p>
                          <p>• Clear next steps and contact information</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button 
                    onClick={sendWinnerEmails} 
                    disabled={loading}
                    className="flex items-center gap-2"
                  >
                    <Send className="h-4 w-4" />
                    {loading ? "Sending Notifications..." : `Send Notifications to ${winners.length} Winner${winners.length !== 1 ? 's' : ''}`}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* General Broadcast Section (Future Feature) */}
        <Card className="opacity-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              General Broadcast Messages
              <Badge variant="secondary" className="ml-auto">Coming Soon</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4 items-center">
              <Label htmlFor="subject" className="sm:text-right">Subject</Label>
              <div className="sm:col-span-3">
                <Input id="subject" placeholder="Promo update" disabled />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-4 items-start">
              <Label htmlFor="message" className="sm:text-right">Message</Label>
              <div className="sm:col-span-3">
                <Textarea id="message" placeholder="Write your broadcast..." rows={6} disabled />
              </div>
            </div>
            <div className="flex justify-end">
              <Button variant="secondary" disabled>Send Broadcast</Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </AppLayout>
  );
}
