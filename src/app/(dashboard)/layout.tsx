import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <TooltipProvider delay={200}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="relative">
          <SidebarTrigger className="md:hidden absolute left-3 top-3 z-40 rounded-none size-9 text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground" />
          {children}
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
