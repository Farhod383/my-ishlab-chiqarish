import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/i18n/context";
import { AuthProvider } from "@/auth/AuthContext";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { Layout } from "@/components/Layout";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Orders from "./pages/Orders";
import NewOrder from "./pages/NewOrder";
import EditOrder from "./pages/EditOrder";
import OrderDetail from "./pages/OrderDetail";
import OrderReport from "./pages/OrderReport";
import ProductionBoard from "./pages/ProductionBoard";
import WarehousePage from "./pages/WarehousePage";
import OtkPage from "./pages/OtkPage";
import ChatPage from "./pages/ChatPage";
import NachalnikPage from "./pages/NachalnikPage";
import HRPage from "./pages/HRPage";
import KassaPage from "./pages/KassaPage";
import ReturnsPage from "./pages/ReturnsPage";
import DefectsPage from "./pages/DefectsPage";
import AuditLog from "./pages/AuditLog";
import ReportsPage from "./pages/ReportsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <I18nProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/*" element={
                <ProtectedRoute>
                  <Layout>
                    <Routes>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/orders" element={<Orders />} />
                      <Route path="/orders/new" element={<ProtectedRoute roles={["marketing","admin"]}><NewOrder /></ProtectedRoute>} />
                      <Route path="/orders/:id/edit" element={<ProtectedRoute roles={["marketing","admin"]}><EditOrder /></ProtectedRoute>} />
                      <Route path="/orders/:id" element={<OrderDetail />} />
                      <Route path="/orders/:id/report" element={<OrderReport />} />
                      <Route path="/production" element={<ProductionBoard />} />
                      <Route path="/otk" element={<ProtectedRoute roles={["otk","admin","manager","marketing"]}><OtkPage /></ProtectedRoute>} />
                      <Route path="/warehouse" element={<WarehousePage />} />
                      <Route path="/chat" element={<ChatPage />} />
                      <Route path="/nachalnik" element={<ProtectedRoute roles={["manager","admin"]}><NachalnikPage /></ProtectedRoute>} />
                      <Route path="/hr" element={<ProtectedRoute roles={["hr","admin","cashier"]}><HRPage /></ProtectedRoute>} />
                      <Route path="/kassa" element={<ProtectedRoute roles={["cashier","admin"]}><KassaPage /></ProtectedRoute>} />
                      <Route path="/returns" element={<ProtectedRoute roles={["warehouse","admin"]}><ReturnsPage /></ProtectedRoute>} />
                      <Route path="/defects" element={<DefectsPage />} />
                      <Route path="/audit" element={<ProtectedRoute roles={["admin","manager"]}><AuditLog /></ProtectedRoute>} />
                      <Route path="/reports" element={<ProtectedRoute roles={["admin"]}><ReportsPage /></ProtectedRoute>} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </Layout>
                </ProtectedRoute>
              } />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </I18nProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
