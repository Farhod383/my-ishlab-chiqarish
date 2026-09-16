import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ensureOnline } from "@/components/OnlineGuard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { AlertTriangle, Package, ArrowDownToLine, ArrowUpFromLine, ArrowDownCircle, ArrowUpCircle, History, Plus, PackageMinus, Pencil, Check, ChevronsUpDown, Trash2, Search, ChevronDown, Factory, ClipboardList, ShoppingCart } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/AuthContext";
import { useI18n, useLocalize } from "@/i18n/context";
import { logAudit } from "@/types/erp";
import { fmtNum } from "@/lib/format";
import { matchesAcrossScripts } from "@/lib/translit";
import { toast } from "sonner";
import InstrumentsTab from "@/components/InstrumentsTab";
import WarehouseHistory from "@/components/WarehouseHistory";
import EmployeesView from "@/components/EmployeesView";
import NumberInput from "@/components/NumberInput";
import SearchableSelect from "@/components/SearchableSelect";
import { PriorityDot, PRIORITY_OPTIONS } from "@/components/PriorityDot";
import { getStockStatus, stockStatusMeta, StockDot, type StockStatus } from "@/lib/stockStatus";
import { useEmployees } from "@/hooks/useEmployees";
import { Link } from "react-router-dom";
import { fmtDateTime24 } from "@/lib/format";
import { getOpenSession, getOrStartSession, finishSession, finalizeSession, discardDraftSessions, addOrMergeItem, intakeCode, itemsTotal, type IntakeSession, type IntakeItem } from "@/lib/intake";

const UNITS = ["dona", "kg", "metr", "litr", "rulon", "komplekt"] as const;
const CURRENCIES = ["UZS", "USD"] as const;

export default function WarehousePage() {
  const { user, hasRole, roles } = useAuth() as any;
  const { t } = useI18n();
  const localize = useLocalize();
  const [products, setProducts] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const { employees } = useEmployees({ activeOnly: true });
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [groupModal, setGroupModal] = useState<{ name: string; batches: any[] } | null>(null);
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | StockStatus>("all");
  const [historySearch, setHistorySearch] = useState("");

  // Output states
  const [outProduct, setOutProduct] = useState("");
  const [outOrder, setOutOrder] = useState("");
  const [outQty, setOutQty] = useState<number>(1);
  const [outRecipient, setOutRecipient] = useState("");
  const [outComment, setOutComment] = useState("");

  // Add product
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newQty, setNewQty] = useState<string>("");
  const [newUnit, setNewUnit] = useState<string>("dona");
  const [newPrice, setNewPrice] = useState<string>("");
  const [newMin, setNewMin] = useState<string>("");
  const [newPhone, setNewPhone] = useState("");
  const [newSource, setNewSource] = useState("");
  const [newSupplier, setNewSupplier] = useState("");
  const [newImage, setNewImage] = useState<File | null>(null);
  const [newPriority, setNewPriority] = useState<string>("green");
  const [newCurrency, setNewCurrency] = useState<string>("UZS");
  // Metall o'lchamlari (majburiy emas)
  const [metalTypes, setMetalTypes] = useState<string[]>([]);
  const [newMetalType, setNewMetalType] = useState("");
  const [newThick, setNewThick] = useState<string>("");
  const [newWidth, setNewWidth] = useState<string>("");
  const [newLength, setNewLength] = useState<string>("");
  const [newWeightKg, setNewWeightKg] = useState<string>("");

  // Other output (no order)
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherProduct, setOtherProduct] = useState("");
  const [otherQty, setOtherQty] = useState<number>(1);
  const [otherRecipient, setOtherRecipient] = useState("");
  const [otherReason, setOtherReason] = useState("");

  // Import (from supply)
  const [importOpen, setImportOpen] = useState(false);
  const [impProductId, setImpProductId] = useState<string>("");
  const [impProductName, setImpProductName] = useState("");
  const [impPickerOpen, setImpPickerOpen] = useState(false);
  const [impQty, setImpQty] = useState<string>("");
  const [impUnit, setImpUnit] = useState<string>("dona");
  const [impPrice, setImpPrice] = useState<string>("");
  const [impSupplier, setImpSupplier] = useState("");
  const [impPhone, setImpPhone] = useState("");
  const [impSource, setImpSource] = useState("");
  const [impImage, setImpImage] = useState<File | null>(null);
  const [impLocation, setImpLocation] = useState<string>("Asosiy zavod");
  const [impCurrency, setImpCurrency] = useState<string>("UZS");
  const [impOrderId, setImpOrderId] = useState<string>("");
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);

  // Kirim sessiyasi (Nakladnoy)
  const [openSession, setOpenSession] = useState<IntakeSession | null>(null);
  const [sessionItems, setSessionItems] = useState<IntakeItem[]>([]);
  const [naklFile, setNaklFile] = useState<File | null>(null);
  const [naklBusy, setNaklBusy] = useState(false);

  // Mahsulotni o'chirish tasdig'i
  const [delTarget, setDelTarget] = useState<{ ids: string[]; name: string; qty: number; unit: string } | null>(null);
  const [delBusy, setDelBusy] = useState(false);


  // Cross-order release confirmation
  const [crossOpen, setCrossOpen] = useState(false);
  const [crossReason, setCrossReason] = useState("");
  const [crossInfo, setCrossInfo] = useState<{ sourceOrderId: string; sourceOrderNumber: string } | null>(null);

  // Edit product
  const [editProdOpen, setEditProdOpen] = useState(false);
  const [editProd, setEditProd] = useState<any | null>(null);
  const [epName, setEpName] = useState(""); const [epUnit, setEpUnit] = useState("dona");
  const [epPrice, setEpPrice] = useState(""); const [epMin, setEpMin] = useState("");
  const [epPhone, setEpPhone] = useState(""); const [epSource, setEpSource] = useState("");
  const [epPriority, setEpPriority] = useState("green"); const [epCurrency, setEpCurrency] = useState("UZS");
  const [epStock, setEpStock] = useState(""); const [epStockReason, setEpStockReason] = useState("");


  // Edit movement
  const [editMovOpen, setEditMovOpen] = useState(false);
  const [editMov, setEditMov] = useState<any | null>(null);
  const [emQty, setEmQty] = useState(""); const [emRecipient, setEmRecipient] = useState("");
  const [emComment, setEmComment] = useState(""); const [emSource, setEmSource] = useState("");

  const load = async () => {
    const [p, o, m] = await Promise.all([
      supabase.from("products").select("*").order("name"),
      supabase.from("orders").select("id, order_number, product_name").neq("status", "completed"),
      supabase.from("stock_movements").select("*, product:products(name, unit), order:orders(order_number, product_name), intake_session:intake_sessions(id, started_at, finished_at, supplier, created_by_name)").order("created_at", { ascending: false }).limit(200),
    ]);
    setProducts(p.data ?? []); setOrders(o.data ?? []); setMovements(m.data ?? []);
    const ids = Array.from(new Set((m.data ?? []).map((x: any) => x.created_by).filter(Boolean)));
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      const map: Record<string, string> = {};
      (profs ?? []).forEach((pr: any) => { map[pr.id] = pr.full_name || pr.email || ""; });
      setProfiles(map);
    }
  };
  useEffect(() => {
    load();
    supabase.from("locations").select("id, name").order("name").then(({ data }) => setLocations(data ?? []));
  }, []);
  // Sahifa ochilganda/refreshda eski draft Nakladnoylar to'liq tozalanadi
  useEffect(() => { loadSession(); }, [user?.id]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("metal_norms").select("metal_type");
      const uniq = Array.from(new Set((data ?? []).map((r: any) => String(r.metal_type)).filter(Boolean)));
      setMetalTypes(uniq);
    })();
  }, []);

  const METAL_KEYWORDS = ["metall", "metal", "nerj", "nerjaveyka", "list", "po'lat", "polat", "temir", "alyumin", "chyorniy", "profil", "truba", "turba", "shveller", "ugolok", "armatura"];
  const isMetalProduct = useMemo(() => {
    const n = newName.trim().toLowerCase();
    if (!n) return false;
    if (metalTypes.some(mt => n.includes(mt.toLowerCase()))) return true;
    return METAL_KEYWORDS.some(k => n.includes(k));
  }, [newName, metalTypes]);

  const canManage = hasRole(["warehouse", "admin"]);
  const canImport = hasRole(["warehouse", "admin"]);
  const canOut = hasRole(["warehouse", "admin", "engineer"]);
  // Anyone authenticated can create a purchase request
  const canRequest = !!user;
  const userRoles = (roles as string[] | undefined) ?? [];
  const primaryRole = userRoles[0] || "";

  // Purchase request (Buyurtma berish) state
  const [prOpen, setPrOpen] = useState(false);
  const [prMode, setPrMode] = useState<"order" | "factory">("factory");
  const [releaseOpen, setReleaseOpen] = useState(false);
  // Action chooser modals
  const [chooseIn, setChooseIn] = useState(false);
  const [chooseOut, setChooseOut] = useState(false);
  const [chooseBuy, setChooseBuy] = useState(false);
  const [prPid, setPrPid] = useState("");
  const [prPname, setPrPname] = useState("");
  const [prQty, setPrQty] = useState<number>(0);
  const [prUnit, setPrUnit] = useState("dona");
  const [prDate, setPrDate] = useState("");
  const [prComment, setPrComment] = useState("");
  const [prOrderId, setPrOrderId] = useState<string>("");

  const submitPurchaseRequest = async () => {
    const name = prPname.trim();
    if (!name || !prQty) { toast.error("Mahsulot va miqdorni kiriting"); return; }
    if (prMode === "order" && !prOrderId) { toast.error("Zakaz uchun buyurtmada zakazni tanlang"); return; }
    if (!(await ensureOnline())) return;
    const { error } = await supabase.from("order_supply_requests").insert({
      order_id: prMode === "order" ? (prOrderId || null) : null,
      product_id: prPid || null,
      product_name: name,
      quantity: prQty,
      unit: prUnit || null,
      required_date: prDate || null,
      comment: prComment || null,
      created_by: user?.id ?? null,
      department: primaryRole || null,
      source: "warehouse",
    } as any);
    if (error) { toast.error(error.message); return; }
    const { notify } = await import("@/lib/notify");
    await notify({
      type: "supply_request",
      title: `Yangi ta'minot so'rovi${prMode === "order" ? "" : " (zavod uchun)"}`,
      body: `${name} · ${prQty} ${prUnit ?? ""}${prDate ? ` · kerak: ${prDate}` : ""}`,
      // Zakaz bilan bog'langan so'rov — bildirishnoma o'sha zakazga tegishli bo'ladi.
      link: prMode === "order" && prOrderId ? `/orders/${prOrderId}` : `/supply`,
      entity: "supply_request",
      recipient_role: ["supply", "warehouse"],
      sender_id: user?.id,
      sender_name: user?.email,
    });
    await logAudit(supabase, {
      actor_id: user?.id, actor_name: user?.email,
      action: prMode === "order" ? "Zakaz uchun buyurtma berildi" : "Zavod uchun buyurtma berildi",
      entity: "supply_request",
      order_id: prMode === "order" ? (prOrderId || null) : null,
      details: `${name} · ${prQty} ${prUnit ?? ""}`,
    });
    toast.success("So'rov yuborildi");
    setPrPid(""); setPrPname(""); setPrQty(0); setPrUnit("dona"); setPrDate(""); setPrComment(""); setPrOrderId("");
    setPrOpen(false);
  };
  const fmt = (n: number) => fmtNum(n);

  const release = async () => {
    if (!outProduct || !outQty || !outRecipient) { toast.error(t.warehouse.fillFields); return; }
    if (!ensureOnline((m) => toast.error(m))) return;
    const prod = products.find(p => p.id === outProduct);
    const avail = Number(prod?.stock_qty ?? 0);
    if (Number(outQty) > avail) {
      await logAudit(supabase, { actor_id: user?.id, actor_name: user?.email, action: "Sklad chiqimi BLOKLANDI", entity: "stock_movement", details: `${prod?.name}: so'ralgan ${outQty}, mavjud ${avail}` });
      toast.error(`Yetarli qoldiq mavjud emas (mavjud: ${avail})`);
      return;
    }
    // Cross-order check: latest inbound with source_order_id for this product
    if (outOrder) {
      const { data: srcRows } = await supabase
        .from("stock_movements")
        .select("source_order_id")
        .eq("product_id", outProduct).eq("direction", "in")
        .not("source_order_id", "is", null)
        .order("created_at", { ascending: false }).limit(1);
      const src: any = srcRows?.[0];
      if (src?.source_order_id && src.source_order_id !== outOrder) {
        const { data: ord } = await supabase.from("orders").select("order_number").eq("id", src.source_order_id).maybeSingle();
        setCrossInfo({ sourceOrderId: src.source_order_id, sourceOrderNumber: ord?.order_number ?? "—" });
        setCrossReason("");
        setCrossOpen(true);
        return;
      }
    }
    await finalizeRelease(null, null);
  };

  const finalizeRelease = async (crossOrderReason: string | null, sourceOrderId: string | null) => {
    const { error } = await supabase.from("stock_movements").insert({
      product_id: outProduct, order_id: outOrder || null, direction: "out",
      quantity: outQty, recipient_name: outRecipient, comment: outComment, created_by: user?.id, taken_by: user?.id,
      ...(crossOrderReason ? { cross_order_reason: crossOrderReason, source_order_id: sourceOrderId } : {}),
    } as any);
    if (error) { toast.error(error.message); return; }
    await logAudit(supabase, {
      actor_id: user?.id, actor_name: user?.email,
      action: crossOrderReason ? "Sklad chiqimi (boshqa zakazga)" : "Sklad chiqimi",
      entity: "stock_movement", order_id: outOrder || null,
      details: `${products.find(p=>p.id===outProduct)?.name} — ${outQty}, ${outRecipient}${crossOrderReason ? ` · manba zakaz: ${crossInfo?.sourceOrderNumber} · sabab: ${crossOrderReason}` : ""}`,
    });
    {
      const { notify } = await import("@/lib/notify");
      await notify({
        type: "info",
        title: `Sklad chiqimi — ${products.find(p=>p.id===outProduct)?.name ?? ""}`,
        body: `${outQty} · ${outRecipient}`,
        link: "/warehouse", entity: "stock_movement",
        recipient_role: ["warehouse", "manager", "supply"],
        sender_id: user?.id, sender_name: user?.email,
      });
    }
    toast.success(t.warehouse.outRecorded);
    setOutProduct(""); setOutOrder(""); setOutQty(1); setOutRecipient(""); setOutComment("");
    setCrossOpen(false); setCrossInfo(null); setCrossReason("");
    load();
  };

  const confirmCrossRelease = async () => {
    if (crossReason.trim().length < 5) { toast.error("Izoh yozing (kamida 5 belgi)"); return; }
    await finalizeRelease(crossReason.trim(), crossInfo?.sourceOrderId ?? null);
  };


  const addProduct = async () => {
    if (!newName.trim()) { toast.error(t.warehouse.fillFields); return; }
    const qtyN = Number(newQty) || 0;
    if (qtyN < 0) { toast.error(t.warehouse.fillFields); return; }
    let image_url: string | null = null;
    if (newImage) {
      const path = `${Date.now()}_${newImage.name}`;
      const up = await supabase.storage.from("product-images").upload(path, newImage);
      if (up.error) { toast.error(up.error.message); return; }
      image_url = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
    }
    const priceN = Number(newPrice) || 0;
    const minN = newMin === "" ? 0 : Number(newMin);
    const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
    const metalFields = isMetalProduct
      ? {
          metal_type: newMetalType.trim() || null,
          thickness_mm: num(newThick),
          width_mm: num(newWidth),
          length_mm: num(newLength),
          weight_kg: num(newWeightKg),
        }
      : {};
    const { data: created, error } = await supabase.from("products").insert({
      name: newName.trim(), unit: newUnit || "dona", last_price: priceN,
      min_limit: minN, phone: newPhone || null, image_url,
      source: newSource.trim() || null,
      priority: newPriority, currency: newCurrency,
      ...metalFields,
    } as any).select("id").single();
    if (error || !created) { toast.error(error?.message || "Error"); return; }
    // Metall normativi: Konstruktor sarfida ishlatilishi uchun saqlanadi
    if (isMetalProduct && newMetalType.trim() && num(newThick) && num(newWidth) && num(newLength) && num(newWeightKg)) {
      const mt = newMetalType.trim();
      const { data: existing } = await supabase.from("metal_norms").select("id")
        .eq("metal_type", mt).eq("thickness_mm", num(newThick) as number)
        .eq("width_mm", num(newWidth) as number).eq("length_mm", num(newLength) as number)
        .maybeSingle();
      if (!existing) {
        await supabase.from("metal_norms").insert({
          metal_type: mt,
          thickness_mm: num(newThick) as number,
          width_mm: num(newWidth) as number,
          length_mm: num(newLength) as number,
          weight_kg: num(newWeightKg) as number,
          created_by: user?.id ?? null,
        } as any);
        setMetalTypes(prev => (prev.includes(mt) ? prev : [...prev, mt]));
      }
    }
    if (qtyN > 0) {
      // Qoldiq faqat Nakladnoy rasm bilan yakunlangandan keyin oshadi —
      // shuning uchun miqdor kirim sessiyasiga yoziladi
      try {
        const session = await getOrStartSession(user?.id, user?.email ?? null, newSupplier || null);
        await addOrMergeItem(session.id, {
          product_id: created.id,
          product_name: newName.trim(),
          unit: newUnit || "dona",
          quantity: qtyN,
          unit_price: priceN,
          currency: newCurrency || "UZS",
          location: "Asosiy zavod",
          source: newSource.trim() || null,
          phone: newPhone || null,
          image_url,
          created_by: user?.id,
          comment: `${t.warehouse.addProduct}${newSupplier ? ` · ${newSupplier}` : ""}`,
        } as any);
      } catch (e: any) {
        toast.error(e.message ?? "Kirim sessiyasini ochib bo'lmadi");
        return;
      }
    }
    await logAudit(supabase, {
      actor_id: user?.id, actor_name: user?.email,
      action: "Mahsulot qo'shildi", entity: "product",
      details: `${newName.trim()}${qtyN > 0 ? `: +${qtyN} ${newUnit}` : ""}`,
    });
    toast.success(qtyN > 0 ? "Mahsulot qo'shildi — miqdor Nakladnoyga yozildi" : t.warehouse.productAdded);
    setNewName(""); setNewQty(""); setNewUnit("dona"); setNewPrice(""); setNewMin(""); setNewPhone(""); setNewSource(""); setNewSupplier(""); setNewImage(null);
    setNewMetalType(""); setNewThick(""); setNewWidth(""); setNewLength(""); setNewWeightKg("");
    setAddOpen(false);
    loadSession();
    load();
  };

  const otherOut = async () => {
    if (!otherProduct || !otherQty || !otherRecipient || !otherReason.trim()) { toast.error(t.warehouse.fillFields); return; }
    if (!ensureOnline((m) => toast.error(m))) return;
    const prod = products.find(p => p.id === otherProduct);
    const avail = Number(prod?.stock_qty ?? 0);
    if (Number(otherQty) > avail) {
      await logAudit(supabase, { actor_id: user?.id, actor_name: user?.email, action: "Sklad chiqimi (boshqa) BLOKLANDI", entity: "stock_movement", details: `${prod?.name}: so'ralgan ${otherQty}, mavjud ${avail}` });
      toast.error(`Yetarli qoldiq mavjud emas (mavjud: ${avail})`);
      return;
    }
    const { error } = await supabase.from("stock_movements").insert({
      product_id: otherProduct, order_id: null, direction: "out",
      quantity: otherQty, recipient_name: otherRecipient, reason: otherReason,
      comment: otherReason, created_by: user?.id, taken_by: user?.id,
    });
    if (error) { toast.error(error.message); return; }
    await logAudit(supabase, {
      actor_id: user?.id, actor_name: user?.email, action: "Sklad chiqimi (boshqa)",
      entity: "stock_movement",
      details: `${products.find(p=>p.id===otherProduct)?.name} — ${otherQty}, sabab: ${otherReason}`,
    });
    toast.success(t.warehouse.outRecorded);
    setOtherProduct(""); setOtherQty(1); setOtherRecipient(""); setOtherReason("");
    setOtherOpen(false);
    load();
  };

  const doImport = async () => {
    const qtyN = Number(impQty);
    const priceN = Number(impPrice) || 0;
    if (!impProductName.trim() || !qtyN) { toast.error(t.warehouse.fillFields); return; }
    let imgUrl: string | null = null;
    if (impImage) {
      const ext = impImage.name.split(".").pop();
      const path = `${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from("product-images").upload(path, impImage);
      if (!up.error) imgUrl = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
    }
    const trimmedName = impProductName.trim();
    let productId: string;

    if (impProductId) {
      productId = impProductId;
      const patch: any = {};
      if (priceN > 0) patch.last_price = priceN;
      if (impPhone) patch.phone = impPhone;
      if (imgUrl) patch.image_url = imgUrl;
      if (impSource.trim()) patch.source = impSource.trim();
      if (impUnit) patch.unit = impUnit;
      if (Object.keys(patch).length > 0) {
        await supabase.from("products").update(patch).eq("id", productId);
      }
    } else {
      const { data: existingProducts } = await supabase
        .from("products").select("id, name").ilike("name", trimmedName).limit(1);
      if (existingProducts && existingProducts.length > 0) {
        productId = existingProducts[0].id;
      } else {
        const { data: newProduct, error: createError } = await supabase
          .from("products")
          .insert({
            name: trimmedName, unit: impUnit || "dona", last_price: priceN,
            min_limit: 0, stock_qty: 0, phone: impPhone || null,
            image_url: imgUrl, source: impSource.trim() || null,
          } as any)
          .select("id").single();
        if (createError || !newProduct) {
          toast.error(createError?.message || "Mahsulot yaratishda xatolik");
          return;
        }
        productId = newProduct.id;
      }
    }

    const orderLabel = impOrderId ? (orders.find(o => o.id === impOrderId)?.order_number ?? "") : "";

    // Kirim sessiyasi (Nakladnoy) — ochiq bo'lmasa avtomatik boshlanadi
    let session: any;
    try {
      session = await getOrStartSession(user?.id, user?.email ?? null, impSupplier || null);
    } catch (e: any) { toast.error(e.message ?? "Kirim sessiyasini ochib bo'lmadi"); return; }

    let merged = false;
    try {
      const res = await addOrMergeItem(session.id, {
        product_id: productId,
        product_name: trimmedName,
        unit: impUnit || "dona",
        quantity: qtyN,
        unit_price: priceN,
        currency: impCurrency || "UZS",
        location: impLocation || "Asosiy zavod",
        order_id: impOrderId || null,
        source: impSource.trim() || null,
        phone: impPhone || null,
        image_url: imgUrl,
        created_by: user?.id,
        comment: `Nakladnoy${impSupplier ? ` · ${impSupplier}` : ""} · ${impLocation}${orderLabel ? ` · zakaz: ${orderLabel}` : ""}`,
      });
      merged = res.merged;
    } catch (e: any) { toast.error(e.message ?? "Xatolik"); return; }
    await logAudit(supabase, {
      actor_id: user?.id, actor_name: user?.email,
      action: "Nakladnoyga mahsulot qo'shildi", entity: "intake_item",
      order_id: impOrderId || null,
      details: `${trimmedName}: +${qtyN} ${impUnit} × ${fmt(priceN)} = ${fmt(qtyN * priceN)} ${impCurrency}${orderLabel ? ` · zakaz: ${orderLabel}` : ""}`,
    });
    toast.success(merged
      ? "Nakladnoyda mavjud mahsulotga jamlandi"
      : "Nakladnoyga qo'shildi — kirim tugatilgach skladga tushadi");
    setImpProductId(""); setImpProductName(""); setImpQty(""); setImpUnit("dona"); setImpPrice(""); setImpPhone(""); setImpSource(""); setImpImage(null); setImpOrderId("");
    loadSession();
    load();
  };

  // ===== Kirim sessiyasi (Nakladnoy) =====
  const loadSession = async () => {
    if (!user?.id) return;
    const s = await getOpenSession(user.id);
    setOpenSession(s);
    if (s) {
      const { data } = await supabase.from("intake_items").select("*").eq("session_id", s.id).order("created_at");
      setSessionItems((data as any) ?? []);
    } else setSessionItems([]);
  };

  /** Tugatilmagan draft Nakladnoylarni o'chirib, toza holatdan boshlash */
  const purgeDrafts = async () => {
    if (!user?.id) return;
    try { await discardDraftSessions(user.id); } catch { /* ignore */ }
    setOpenSession(null); setSessionItems([]); setNaklFile(null);
  };


  const removeSessionItem = async (id: string) => {
    const { error } = await supabase.from("intake_items").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    loadSession();
  };

  /** Nakladnoy rasmini shu oynaning o'zida yuklash */
  const uploadNaklImage = async () => {
    if (!openSession || !naklFile) return;
    setNaklBusy(true);
    try {
      const ext = naklFile.name.split(".").pop();
      const path = `nakladnoy/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from("product-images").upload(path, naklFile);
      if (up.error) throw up.error;
      const url = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
      const { error } = await supabase.from("intake_sessions").update({ image_url: url } as any).eq("id", openSession.id);
      if (error) throw error;
      setNaklFile(null);
      toast.success("Nakladnoy rasmi yuklandi");
      await loadSession();
    } catch (e: any) {
      toast.error(e.message ?? "Rasm yuklashda xatolik");
    } finally { setNaklBusy(false); }
  };

  /** Tugatish — rasm majburiy; sessiya yopiladi va skladga kirim qilinadi */
  const doFinishSession = async () => {
    if (!openSession) return;
    if (sessionItems.length === 0) { toast.error("Avval mahsulot qo'shing"); return; }
    if (!openSession.image_url) { toast.error("Avval nakladnoy rasmini yuklang"); return; }
    setNaklBusy(true);
    try {
      await finishSession(openSession.id);
      await finalizeSession(openSession.id);
      await logAudit(supabase, {
        actor_id: user?.id, actor_name: user?.email,
        action: "Nakladnoy yakunlandi", entity: "intake_session",
        details: `Nakladnoy ${intakeCode(openSession)} · ${sessionItems.length} mahsulot · ${fmt(itemsTotal(sessionItems as any))}`,
      });
      toast.success("Nakladnoy yakunlandi — mahsulotlar skladga kirim qilindi");
      // vaqtinchalik ma'lumotlarni tozalash
      setOpenSession(null); setSessionItems([]); setNaklFile(null);
      setImpProductId(""); setImpProductName(""); setImpQty(""); setImpPrice("");
      setImpPhone(""); setImpSource(""); setImpImage(null); setImpOrderId(""); setImpSupplier("");
      setImportOpen(false);
      await loadSession();
      await load();
    } catch (e: any) { toast.error(e.message ?? "Xatolik"); }
    finally { setNaklBusy(false); }
  };

  const openEditProduct = (p: any) => {
    setEditProd(p);
    setEpName(p.name ?? ""); setEpUnit(p.unit ?? "dona");
    setEpPrice(String(p.last_price ?? "")); setEpMin(String(p.min_limit ?? ""));
    setEpPhone(p.phone ?? ""); setEpSource(p.source ?? "");
    setEpPriority(p.priority ?? "green"); setEpCurrency(p.currency ?? "UZS");
    setEpStock(String(p.stock_qty ?? 0)); setEpStockReason("");
    setEditProdOpen(true);
  };
  const saveEditProduct = async () => {
    if (!editProd) return;
    const newVals = {
      name: epName.trim(), unit: epUnit, last_price: Number(epPrice) || 0,
      min_limit: Number(epMin) || 0, phone: epPhone || null, source: epSource.trim() || null,
      priority: epPriority, currency: epCurrency,
    };
    const diffs: string[] = [];
    (["name","unit","last_price","min_limit","phone","source","priority","currency"] as const).forEach(k => {
      const oldV = (editProd as any)[k] ?? ""; const newV = (newVals as any)[k] ?? "";
      if (String(oldV) !== String(newV)) diffs.push(`${k}: ${oldV || "—"} → ${newV || "—"}`);
    });
    const { error } = await supabase.from("products").update(newVals).eq("id", editProd.id);
    if (error) { toast.error(error.message); return; }

    // Stock adjustment
    const oldStock = Number(editProd.stock_qty ?? 0);
    const newStock = Number(epStock);
    if (!Number.isNaN(newStock) && newStock !== oldStock) {
      const delta = newStock - oldStock;
      await supabase.from("products").update({ stock_qty: newStock }).eq("id", editProd.id);
      await supabase.from("stock_movements").insert({
        product_id: editProd.id,
        direction: delta > 0 ? "in" : "out",
        quantity: Math.abs(delta),
        recipient_name: "Qoldiq tuzatish",
        source: "Qo'lda tuzatish",
        comment: `Qoldiq tuzatish: ${oldStock} → ${newStock} (${delta > 0 ? "+" : ""}${delta} ${editProd.unit ?? ""})${epStockReason ? ` · ${epStockReason}` : ""}`,
        created_by: user?.id,
      } as any);
      await logAudit(supabase, {
        actor_id: user?.id, actor_name: user?.email,
        action: "Qoldiq tuzatildi", entity: "product",
        details: `${editProd.name}: ${oldStock} → ${newStock} (${delta > 0 ? "+" : ""}${delta} ${editProd.unit ?? ""})${epStockReason ? ` · ${epStockReason}` : ""}`,
      });
      diffs.push(`qoldiq: ${oldStock} → ${newStock}`);
    }

    await logAudit(supabase, {
      actor_id: user?.id, actor_name: user?.email,
      action: "Mahsulot tahrirlandi", entity: "product",
      details: diffs.length ? `${editProd.name}: ${diffs.join("; ")}` : `${editProd.name}: o'zgarish yo'q`,
    });
    toast.success(t.common.save);
    setEditProdOpen(false); setEditProd(null); load();
  };


  const openEditMovement = (m: any) => {
    setEditMov(m);
    setEmQty(String(m.quantity ?? "")); setEmRecipient(m.recipient_name ?? "");
    setEmComment(m.comment ?? ""); setEmSource(m.source ?? "");
    setEditMovOpen(true);
  };
  const saveEditMovement = async () => {
    if (!editMov) return;
    const newQty = Number(emQty);
    if (!newQty || newQty <= 0) { toast.error(t.warehouse.fillFields); return; }
    const oldQty = Number(editMov.quantity);
    const delta = newQty - oldQty;
    const diffs: string[] = [];
    if (oldQty !== newQty) diffs.push(`miqdor: ${oldQty} → ${newQty}`);
    if ((editMov.recipient_name ?? "") !== emRecipient) diffs.push(`qabul: ${editMov.recipient_name ?? "—"} → ${emRecipient || "—"}`);
    if ((editMov.comment ?? "") !== emComment) diffs.push(`izoh o'zgardi`);
    if ((editMov.source ?? "") !== emSource) diffs.push(`manba: ${editMov.source ?? "—"} → ${emSource || "—"}`);

    const { error } = await supabase.from("stock_movements").update({
      quantity: newQty, recipient_name: emRecipient || null,
      comment: emComment || null, source: emSource.trim() || null,
    }).eq("id", editMov.id);
    if (error) { toast.error(error.message); return; }

    // Adjust product stock + order_parts for quantity delta (trigger only fires on insert)
    if (delta !== 0 && editMov.product_id) {
      const signed = editMov.direction === "in" ? delta : -delta;
      const prod = products.find(p => p.id === editMov.product_id);
      const newStock = Number(prod?.stock_qty ?? 0) + signed;
      await supabase.from("products").update({ stock_qty: newStock }).eq("id", editMov.product_id);
      if (editMov.direction === "out" && editMov.order_id) {
        const { data: parts } = await supabase.from("order_parts").select("id, actual_qty")
          .eq("order_id", editMov.order_id).eq("product_id", editMov.product_id).limit(1);
        if (parts && parts[0]) {
          await supabase.from("order_parts").update({ actual_qty: Number(parts[0].actual_qty) + delta }).eq("id", parts[0].id);
        }
      }
    }

    await logAudit(supabase, {
      actor_id: user?.id, actor_name: user?.email,
      action: editMov.direction === "in" ? "Kirim tahrirlandi" : "Chiqim tahrirlandi",
      entity: "stock_movement", order_id: editMov.order_id ?? null,
      details: diffs.length ? diffs.join("; ") : "o'zgarish yo'q",
    });
    toast.success(t.common.save);
    setEditMovOpen(false); setEditMov(null); load();
  };

  const confirmDeleteProduct = async () => {
    if (!delTarget) return;
    if (!ensureOnline((m) => toast.error(m))) return;
    setDelBusy(true);
    const { error } = await supabase.from("products").delete().in("id", delTarget.ids);
    setDelBusy(false);
    if (error) { toast.error(error.message); return; }
    await logAudit(supabase, {
      actor_id: user?.id, actor_name: user?.email,
      action: "Mahsulot o'chirildi", entity: "product",
      details: `${delTarget.name} (${delTarget.ids.length} partiya, qoldiq: ${delTarget.qty} ${delTarget.unit})`,
    });
    toast.success("Mahsulot o'chirildi");
    if (delTarget.ids.includes(selectedProduct?.id)) setSelectedProduct(null);
    setProducts((prev) => prev.filter((p: any) => !delTarget.ids.includes(p.id)));
    setDelTarget(null);
    await load();
  };


  const deleteMovement = async (m: any) => {
    if (!window.confirm(`${t.common.delete ?? "O'chirish"}: ${m.product?.name ?? ""} ${m.direction === "in" ? "+" : "-"}${m.quantity}?`)) return;
    // revert stock
    if (m.product_id) {
      const signed = m.direction === "in" ? -Number(m.quantity) : Number(m.quantity);
      const prod = products.find(p => p.id === m.product_id);
      const newStock = Number(prod?.stock_qty ?? 0) + signed;
      await supabase.from("products").update({ stock_qty: newStock }).eq("id", m.product_id);
      if (m.direction === "out" && m.order_id) {
        const { data: parts } = await supabase.from("order_parts").select("id, actual_qty")
          .eq("order_id", m.order_id).eq("product_id", m.product_id).limit(1);
        if (parts && parts[0]) {
          await supabase.from("order_parts").update({ actual_qty: Math.max(0, Number(parts[0].actual_qty) - Number(m.quantity)) }).eq("id", parts[0].id);
        }
      }
    }
    const { error } = await supabase.from("stock_movements").delete().eq("id", m.id);
    if (error) { toast.error(error.message); return; }
    await logAudit(supabase, {
      actor_id: user?.id, actor_name: user?.email,
      action: m.direction === "in" ? "Kirim o'chirildi" : "Chiqim o'chirildi",
      entity: "stock_movement", order_id: m.order_id ?? null,
      details: `${m.product?.name ?? "—"}: ${m.direction === "in" ? "+" : "-"}${m.quantity}${m.recipient_name ? `, ${m.recipient_name}` : ""}`,
    });
    toast.success(t.common.delete ?? "O'chirildi");
    load();
  };

  const productMovements = useMemo(
    () => selectedProduct ? movements.filter(m => m.product_id === selectedProduct.id) : [],
    [movements, selectedProduct]
  );

  const productStats = useMemo(() => {
    const ins = productMovements.filter(m => m.direction === "in");
    const outs = productMovements.filter(m => m.direction === "out");
    const sum = (arr: any[]) => arr.reduce((a, b) => a + Number(b.quantity || 0), 0);
    return {
      totalIn: sum(ins),
      totalOut: sum(outs),
      lastIn: ins[0]?.created_at ?? null,
      lastOut: outs[0]?.created_at ?? null,
    };
  }, [productMovements]);


  const uniq = (arr: any[]) => Array.from(new Set(arr.map(x => (x ?? "").toString().trim()).filter(Boolean)));
  const productNameOptions = useMemo(() => uniq(products.map(p => p.name)), [products]);
  const supplierOptions = useMemo(
    () => uniq([...movements.filter(m => m.direction === "in").map(m => m.recipient_name)]),
    [movements]
  );
  const phoneOptions = useMemo(
    () => uniq([...movements.map(m => m.phone), ...products.map(p => p.phone)]),
    [movements, products]
  );
  const sourceOptions = useMemo(
    () => uniq([...movements.map(m => m.source), ...products.map(p => p.source)]),
    [movements, products]
  );
  const recipientOptions = useMemo(
    () => uniq(movements.filter(m => m.direction === "out").map(m => m.recipient_name)),
    [movements]
  );

  const fmtDateTime = (s: string) => new Date(s).toLocaleString();
  // Grouped products by name (for stat cards + reorder list)
  const productGroups = useMemo(() => {
    const map = new Map<string, any[]>();
    products.forEach(p => {
      const k = String(p.name ?? "").trim().toLowerCase();
      const arr = map.get(k) ?? [];
      arr.push(p);
      map.set(k, arr);
    });
    return Array.from(map.values()).map(batches => {
      const totalQty = batches.reduce((s, b) => s + Number(b.stock_qty || 0), 0);
      const minLim = batches.reduce((s, b) => s + Number(b.min_limit || 0), 0);
      return { batches, totalQty, minLim, status: getStockStatus(totalQty, minLim), first: batches[0] };
    });
  }, [products]);
  const stockCounts = useMemo(() => ({
    green: productGroups.filter(g => g.status === "green").length,
    yellow: productGroups.filter(g => g.status === "yellow").length,
    red: productGroups.filter(g => g.status === "red").length,
  }), [productGroups]);
  const lowStock = productGroups.filter(g => g.status !== "green");

  const filteredMovements = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return movements;
    return movements.filter((m: any) => {
      const hay = [
        m.product?.name,
        m.order?.product_name,
        m.comment,
        m.recipient_name,
        m.source,
      ].filter(Boolean).join(" ");
      return matchesAcrossScripts(hay, q);
    });
  }, [movements, historySearch]);

  return (
    <div className="space-y-6">
      {/* Autocomplete datalists */}
      <datalist id="dl-product-names">{productNameOptions.map(v => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-suppliers">{supplierOptions.map(v => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-phones">{phoneOptions.map(v => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-sources">{sourceOptions.map(v => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-recipients">{recipientOptions.map(v => <option key={v} value={v} />)}</datalist>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t.warehouse.title}</h1>
          <p className="text-sm text-muted-foreground">{t.warehouse.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage && (
            <Button className="min-h-11 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm" onClick={() => setChooseIn(true)}>
              <ArrowDownToLine className="h-4 w-4 mr-2" />Kirim qilish
            </Button>
          )}
          {canOut && (
            <Button className="min-h-11 bg-red-600 hover:bg-red-700 text-white shadow-sm" onClick={() => setChooseOut(true)}>
              <ArrowUpFromLine className="h-4 w-4 mr-2" />Chiqim qilish
            </Button>
          )}
          {canRequest && (
            <Button className="min-h-11 bg-sky-600 hover:bg-sky-700 text-white shadow-sm" onClick={() => setChooseBuy(true)}>
              <ShoppingCart className="h-4 w-4 mr-2" />Buyurtma berish
            </Button>
          )}
        </div>

        {/* KIRIM chooser modal */}
        <Dialog open={chooseIn} onOpenChange={setChooseIn}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle className="text-2xl">Kirim varianti</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <button
                onClick={() => { setChooseIn(false); setAddOpen(true); }}
                className="group text-left rounded-2xl border-2 border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 p-6 hover:border-emerald-500 hover:shadow-lg hover:-translate-y-0.5 transition-all min-h-[200px] flex flex-col gap-3"
              >
                <div className="h-14 w-14 rounded-xl bg-emerald-500/20 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Plus className="h-8 w-8" />
                </div>
                <div className="text-xl font-bold">Mahsulot qo'shish</div>
                <div className="text-sm text-muted-foreground">Yangi mahsulot yaratish va katalogga kiritish</div>
              </button>
              <button
                onClick={() => { setChooseIn(false); setImportOpen(true); }}
                className="group text-left rounded-2xl border-2 border-sky-500/30 bg-gradient-to-br from-sky-500/10 to-sky-500/5 p-6 hover:border-sky-500 hover:shadow-lg hover:-translate-y-0.5 transition-all min-h-[200px] flex flex-col gap-3"
              >
                <div className="h-14 w-14 rounded-xl bg-sky-500/20 text-sky-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <ArrowDownToLine className="h-8 w-8" />
                </div>
                <div className="text-xl font-bold">Kirim qilish</div>
                <div className="text-sm text-muted-foreground">Mavjud mahsulotga yangi partiya qo'shish</div>
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {/* CHIQIM chooser modal */}
        <Dialog open={chooseOut} onOpenChange={setChooseOut}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle className="text-2xl">Chiqim varianti</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <button
                onClick={() => { setChooseOut(false); setReleaseOpen(true); }}
                className="group text-left rounded-2xl border-2 border-red-500/30 bg-gradient-to-br from-red-500/10 to-red-500/5 p-6 hover:border-red-500 hover:shadow-lg hover:-translate-y-0.5 transition-all min-h-[200px] flex flex-col gap-3"
              >
                <div className="h-14 w-14 rounded-xl bg-red-500/20 text-red-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <ClipboardList className="h-8 w-8" />
                </div>
                <div className="text-xl font-bold">Zakaz uchun chiqim</div>
                <div className="text-sm text-muted-foreground">Aniq zakaz uchun mahsulot berish</div>
              </button>
              <button
                onClick={() => { setChooseOut(false); setOtherOpen(true); }}
                className="group text-left rounded-2xl border-2 border-orange-500/30 bg-gradient-to-br from-orange-500/10 to-orange-500/5 p-6 hover:border-orange-500 hover:shadow-lg hover:-translate-y-0.5 transition-all min-h-[200px] flex flex-col gap-3"
              >
                <div className="h-14 w-14 rounded-xl bg-orange-500/20 text-orange-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <PackageMinus className="h-8 w-8" />
                </div>
                <div className="text-xl font-bold">Boshqa chiqim</div>
                <div className="text-sm text-muted-foreground">Zavod ehtiyoji yoki boshqa maqsad uchun</div>
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {/* BUYURTMA chooser modal */}
        <Dialog open={chooseBuy} onOpenChange={setChooseBuy}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle className="text-2xl">Buyurtma turi</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <button
                onClick={() => { setChooseBuy(false); setPrMode("order"); setPrOpen(true); }}
                className="group text-left rounded-2xl border-2 border-purple-500/30 bg-gradient-to-br from-purple-500/10 to-purple-500/5 p-6 hover:border-purple-500 hover:shadow-lg hover:-translate-y-0.5 transition-all min-h-[200px] flex flex-col gap-3"
              >
                <div className="h-14 w-14 rounded-xl bg-purple-500/20 text-purple-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <ClipboardList className="h-8 w-8" />
                </div>
                <div className="text-xl font-bold">Zakaz uchun buyurtma</div>
                <div className="text-sm text-muted-foreground">Aniq zakaz uchun mahsulot buyurtma qilish (zakaz tanlash majburiy)</div>
              </button>
              <button
                onClick={() => { setChooseBuy(false); setPrMode("factory"); setPrOrderId(""); setPrOpen(true); }}
                className="group text-left rounded-2xl border-2 border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 p-6 hover:border-emerald-500 hover:shadow-lg hover:-translate-y-0.5 transition-all min-h-[200px] flex flex-col gap-3"
              >
                <div className="h-14 w-14 rounded-xl bg-emerald-500/20 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Factory className="h-8 w-8" />
                </div>
                <div className="text-xl font-bold">Zavod uchun buyurtma</div>
                <div className="text-sm text-muted-foreground">Umumiy zavod ehtiyoji uchun buyurtma</div>
              </button>
            </div>
          </DialogContent>
        </Dialog>

        <div className="hidden">
          {canManage && (
            <>
              <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogTrigger asChild><Button variant="outline"><Plus className="h-4 w-4 mr-2" />{t.warehouse.addProduct}</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>{t.warehouse.addProduct}</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div><Label>{t.warehouse.productName} *</Label><Input list="dl-product-names" value={newName} onChange={e => setNewName(e.target.value)} /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>{t.warehouse.qty} *</Label><NumberInput min={0} step="any" value={newQty} onChange={e => setNewQty(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" /></div>
                      <div><Label>{t.warehouse.unit} *</Label>
                        <Select value={newUnit} onValueChange={setNewUnit}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>{t.warehouse.minLimitField}</Label><NumberInput min={0} value={newMin} onChange={e => setNewMin(e.target.value)} placeholder={(t.warehouse as any).minLimitPh} /></div>
                      <div><Label>{t.warehouse.price}</Label><NumberInput min={0} value={newPrice} onChange={e => setNewPrice(e.target.value)} placeholder="0" /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Muhimlik</Label>
                        <Select value={newPriority} onValueChange={setNewPriority}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{PRIORITY_OPTIONS.map(p => <SelectItem key={p.value} value={p.value}><span className="inline-flex items-center gap-2"><span className={`inline-block h-2.5 w-2.5 rounded-full ${p.color}`} />{p.label}</span></SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div><Label>Valyuta</Label>
                        <Select value={newCurrency} onValueChange={setNewCurrency}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div><Label>{t.warehouse.phone}</Label><Input list="dl-phones" value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="+998..." /></div>
                    <div><Label>{(t.warehouse as any).source}</Label><Input list="dl-sources" value={newSource} onChange={e => setNewSource(e.target.value)} placeholder={(t.warehouse as any).sourcePh} /></div>
                    <div><Label>{(t.warehouse.cols as any).supplier}</Label>
                      <Select value={newSupplier} onValueChange={setNewSupplier}>
                        <SelectTrigger><SelectValue placeholder="Tanlang" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Davronxo'ja">Davronxo'ja</SelectItem>
                          <SelectItem value="Sanjar">Sanjar</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div><Label>{t.warehouse.image}</Label><Input type="file" accept="image/*" onChange={e => setNewImage(e.target.files?.[0] ?? null)} /></div>
                    <Button className="w-full" onClick={addProduct}>{t.common.save}</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </>
          )}
          {canOut && (
            <>
              <Dialog open={otherOpen} onOpenChange={setOtherOpen}>
                <DialogTrigger asChild><Button variant="outline"><PackageMinus className="h-4 w-4 mr-2" />{t.warehouse.otherOut}</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>{t.warehouse.otherOutTitle}</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div><Label>{t.warehouse.cols.product}</Label>
                      <SearchableSelect
                        value={otherProduct}
                        onChange={setOtherProduct}
                        placeholder={t.supply.select}
                        options={products.map(p => ({ value: p.id, label: p.name, hint: `${p.stock_qty} ${p.unit}` }))}
                      />
                    </div>
                    <div><Label>{t.warehouse.qty}</Label><NumberInput min={0.1} step={0.1} value={otherQty} onChange={e => setOtherQty(Number(e.target.value))} /></div>
                    <div><Label>{t.warehouse.takenBy}</Label>
                      <SearchableSelect
                        value={otherRecipient}
                        onChange={setOtherRecipient}
                        placeholder={t.warehouse.takenByPh}
                        options={employees.map(e => ({ value: e.full_name, label: localize(e.full_name), hint: e.department }))}
                      />
                    </div>
                    <div><Label>{t.warehouse.reason} *</Label><Textarea value={otherReason} onChange={e => setOtherReason(e.target.value)} placeholder={t.warehouse.reasonPh} /></div>
                    <Button className="w-full" onClick={otherOut}>{t.warehouse.saveOut}</Button>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={releaseOpen} onOpenChange={setReleaseOpen}>
                <DialogTrigger asChild><Button className="hidden">release</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>{t.warehouse.releaseTitle}</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div><Label>{t.warehouse.cols.product}</Label>
                      <SearchableSelect
                        value={outProduct}
                        onChange={setOutProduct}
                        placeholder={t.supply.select}
                        options={products.map(p => ({ value: p.id, label: p.name, hint: `${p.stock_qty} ${p.unit}` }))}
                      />
                    </div>
                    <div><Label>{t.warehouse.forOrder}</Label>
                      <SearchableSelect
                        value={outOrder}
                        onChange={setOutOrder}
                        placeholder={t.warehouse.orderPh}
                        options={orders.map(o => ({ value: o.id, label: o.product_name, hint: o.order_number }))}
                      />
                    </div>
                    <div><Label>{t.warehouse.qty}</Label><NumberInput min={0.1} step={0.1} value={outQty} onChange={e => setOutQty(Number(e.target.value))} /></div>
                    <div><Label>{t.warehouse.takenBy}</Label>
                      <SearchableSelect
                        value={outRecipient}
                        onChange={setOutRecipient}
                        placeholder={t.warehouse.takenByPh}
                        options={employees.map(e => ({ value: e.full_name, label: localize(e.full_name), hint: e.department }))}
                      />
                    </div>
                    <div><Label>{t.warehouse.commentOpt}</Label><Textarea value={outComment} onChange={e => setOutComment(e.target.value)} /></div>
                    <Button className="w-full" onClick={release}>{t.warehouse.saveOut}</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </>
          )}
          {canImport && (
            <Dialog open={importOpen} onOpenChange={(o) => {
              setImportOpen(o);
              setImpProductId(""); setImpProductName(""); setImpQty(""); setImpUnit("dona"); setImpPrice("");
              setImpPhone(""); setImpSource(""); setImpImage(null); setImpOrderId("");
              setNaklFile(null);
              // Ochiq Nakladnoy saqlanib qoladi — barcha kirimlar unga yig'iladi
              loadSession();
            }}>

              <DialogTrigger asChild><Button variant="secondary"><ArrowUpCircle className="h-4 w-4 mr-2" />{t.supply.receive}</Button></DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0 gap-0">
                <DialogHeader className="px-6 pt-6 pb-3 border-b shrink-0"><DialogTitle>{t.supply.receiveTitle}</DialogTitle></DialogHeader>
                <div className="space-y-3 overflow-y-auto px-6 py-4 flex-1">
                  <div><Label>{t.supply.productName || t.warehouse.productName} *</Label>
                    <Popover open={impPickerOpen} onOpenChange={setImpPickerOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                          <span className={cn("truncate", !impProductName && "text-muted-foreground")}>
                            {impProductName || t.warehouse.productName}
                          </span>
                          <ChevronsUpDown className="h-4 w-4 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <Command>
                          <CommandInput
                            placeholder={(t.warehouse as any).search || "Qidirish..."}
                            value={impProductName}
                            onValueChange={(v) => { setImpProductName(v); setImpProductId(""); }}
                          />
                          <CommandList>
                            <CommandEmpty>
                              <button type="button" className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent rounded" onClick={() => setImpPickerOpen(false)}>
                                + Yangi mahsulot qo'shish: <b>{impProductName || "..."}</b>
                              </button>
                            </CommandEmpty>
                            <CommandGroup>
                              {products.map((p) => (
                                <CommandItem key={p.id} value={`${p.name} ${p.unit}`} onSelect={() => {
                                  setImpProductId(p.id); setImpProductName(p.name);
                                  if (p.unit) setImpUnit(p.unit);
                                  if (p.last_price && !impPrice) setImpPrice(String(p.last_price));
                                  setImpPickerOpen(false);
                                }}>
                                  <Check className={cn("mr-2 h-4 w-4", impProductId === p.id ? "opacity-100" : "opacity-0")} />
                                  <span className="flex-1">{p.name}</span>
                                  <span className="text-xs text-muted-foreground ml-2">{p.stock_qty} {p.unit}</span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {impProductId && <p className="text-xs text-status-green mt-1">✓ Mavjud mahsulot — miqdor qo'shiladi</p>}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2"><Label>{t.supply.qty} *</Label><NumberInput min={0.1} step={0.1} value={impQty} onChange={e => setImpQty(e.target.value)} placeholder={(t.warehouse as any).qtyPh} /></div>
                    <div><Label>{t.warehouse.unit}</Label>
                      <Select value={impUnit} onValueChange={setImpUnit}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2"><Label>{t.supply.price}</Label><NumberInput min={0} step={1} value={impPrice} onChange={e => setImpPrice(e.target.value)} placeholder="0" /></div>
                    <div><Label>Valyuta</Label>
                      <Select value={impCurrency} onValueChange={setImpCurrency}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div><Label>Zavod / joylashuv</Label>
                    <Select value={impLocation} onValueChange={setImpLocation}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{locations.map(l => <SelectItem key={l.id} value={l.name}>{l.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Qaysi zakaz uchun olib kelindi <span className="text-muted-foreground text-xs">(ixtiyoriy)</span></Label>
                    <SearchableSelect
                      value={impOrderId}
                      onChange={setImpOrderId}
                      placeholder="Tanlanmasa — umumiy ombor kirimi"
                      options={[
                        { value: "", label: "— Yo'q (umumiy) —" },
                        ...orders.map((o: any) => ({ value: o.id, label: `${o.order_number} — ${o.product_name}` })),
                      ]}
                    />
                  </div>
                  {Number(impQty) > 0 && Number(impPrice) > 0 && (
                    <div className="text-sm bg-primary/5 border border-primary/20 rounded p-2 flex justify-between">
                      <span className="text-muted-foreground">{t.supply.totalValue}:</span>
                      <span className="font-mono font-bold text-primary">{fmt(Number(impQty) * Number(impPrice))} {t.common.sum}</span>
                    </div>
                  )}
                  <div><Label>{(t.warehouse as any).source}</Label><Input list="dl-sources" value={impSource} onChange={e => setImpSource(e.target.value)} placeholder={(t.warehouse as any).sourcePh} /></div>
                  <div>
                    <Label>{t.supply.bringer}</Label>
                    <Select value={impSupplier} onValueChange={setImpSupplier}>
                      <SelectTrigger>
                        <SelectValue placeholder="Tanlang" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Davronxo'ja">Davronxo'ja</SelectItem>
                        <SelectItem value="Sanjar">Sanjar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>{t.supply.phone}</Label><Input list="dl-phones" value={impPhone} onChange={e => setImpPhone(e.target.value)} placeholder={t.supply.phonePh} /></div>


                  {openSession && (
                    <div className="rounded-lg border border-status-yellow/40 bg-status-yellow/5 p-3 space-y-3">
                      <div className="text-sm font-semibold">
                        Ochiq Nakladnoy <span className="font-mono">{intakeCode(openSession)}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Boshlangan: {fmtDateTime24(openSession.started_at)} · {sessionItems.length} mahsulot · Jami: {fmt(itemsTotal(sessionItems as any))}
                        {openSession.supplier ? ` · Olib keldi: ${openSession.supplier}` : ""}
                      </div>
                      <div className="max-h-40 overflow-y-auto rounded border bg-background divide-y">
                        {sessionItems.length === 0 && <div className="p-2 text-xs text-muted-foreground text-center">Mahsulot qo'shing</div>}
                        {sessionItems.map((i, idx) => (
                          <div key={i.id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                            <span className="text-muted-foreground text-xs w-4">{idx + 1}</span>
                            <span className="flex-1 truncate">{i.product_name}</span>
                            <span className="font-mono text-xs whitespace-nowrap">{fmt(Number(i.quantity))} {i.unit} × {fmt(Number(i.unit_price))} {i.currency}</span>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeSessionItem(i.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Barcha kirimlar shu Nakladnoyga yig'iladi. Rasm yuklash va yakunlash — "Nakladnoy" bo'limida.
                      </p>
                    </div>
                  )}
                </div>
                <div className="px-6 py-4 border-t bg-background shrink-0">
                  <Button className="w-full" onClick={doImport}>Kirimni saqlash</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
          {canRequest && (
            <Dialog open={prOpen} onOpenChange={setPrOpen}>
              <DialogTrigger asChild>
                <Button variant="default"><Plus className="h-4 w-4 mr-2" />Buyurtma berish</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {prMode === "order" ? "Zakaz uchun buyurtma" : "Zavod uchun buyurtma"}
                  </DialogTitle>
                  <DialogDescription>So'rov Ta'minot bo'limiga yuboriladi</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Mahsulot (omborda bor)</Label>
                    <SearchableSelect
                      value={prPid}
                      onChange={(v) => {
                        setPrPid(v);
                        const p = products.find((x) => x.id === v);
                        if (p) { setPrPname(p.name); if (p.unit) setPrUnit(p.unit); }
                      }}
                      placeholder="Tanlang yoki pastda yozing"
                      options={products.map((p) => ({ value: p.id, label: p.name, hint: `${p.stock_qty} ${p.unit}` }))}
                    />
                  </div>
                  <div>
                    <Label>Yoki mahsulot nomini yozing *</Label>
                    <Input value={prPname} onChange={(e) => setPrPname(e.target.value)} placeholder="Masalan: Kraska 201" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Miqdor *</Label><NumberInput min={0.01} step={0.01} value={prQty || ""} onChange={(e) => setPrQty(Number(e.target.value))} /></div>
                    <div><Label>O'lchov</Label>
                      <Select value={prUnit} onValueChange={setPrUnit}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label>Kerak bo'ladigan sana</Label>
                    <Input type="date" value={prDate} onChange={(e) => setPrDate(e.target.value)} />
                  </div>
                  {prMode === "order" && (
                    <div>
                      <Label>Zakaz *</Label>
                      <SearchableSelect
                        value={prOrderId}
                        onChange={setPrOrderId}
                        placeholder="Zakaz tanlang..."
                        options={orders.map((o) => ({ value: o.id, label: o.product_name, hint: o.order_number }))}
                      />
                    </div>
                  )}
                  <div>
                    <Label>Izoh</Label>
                    <Textarea rows={2} value={prComment} onChange={(e) => setPrComment(e.target.value)} />
                  </div>
                  <Button className="w-full" onClick={submitPurchaseRequest}>
                    <Plus className="h-4 w-4 mr-2" />Yuborish
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Stock status stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {(["green", "yellow", "red"] as StockStatus[]).map(s => {
          const meta = stockStatusMeta[s];
          const count = stockCounts[s];
          const active = stockFilter === s;
          return (
            <button
              type="button"
              key={s}
              onClick={() => setStockFilter(active ? "all" : s)}
              className={`text-left rounded-lg border p-4 transition-all hover:shadow-md ${meta.border} ${meta.bg} ${active ? "ring-2 ring-offset-1 " + meta.ring : ""}`}
            >
              <div className="flex items-center gap-2">
                <span className={`inline-block h-3 w-3 rounded-full ${meta.dot}`} />
                <div className="text-sm font-medium text-foreground">
                  {s === "green" ? "Yetarli mahsulotlar" : s === "yellow" ? "Kam qolgan mahsulotlar" : "Tugagan mahsulotlar"}
                </div>
              </div>
              <div className={`text-3xl font-bold font-mono mt-2 ${meta.text}`}>{count}</div>
              <div className="text-xs text-muted-foreground mt-1">{active ? "Filtr yoqilgan — bosib olib tashlang" : "Kartani bosing — filtr"}</div>
            </button>
          );
        })}
      </div>

      {openSession && (
        <Card className="border-status-yellow/40 bg-status-yellow/5">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <ArrowDownToLine className="h-4 w-4 text-status-yellow" />
                  Ochiq kirim — Nakladnoy <span className="font-mono">{intakeCode(openSession)}</span>
                </CardTitle>
                <CardDescription>
                  Boshlangan: {fmtDateTime24(openSession.started_at)} · {sessionItems.length} mahsulot · Jami: {fmt(itemsTotal(sessionItems as any))}
                  {openSession.supplier ? ` · Olib keldi: ${openSession.supplier}` : ""}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild><Link to="/invoices">Nakladnoy bo'limi</Link></Button>
                <Button size="sm" onClick={() => setImportOpen(true)}>Nakladnoyni tugatish</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[40vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>№</TableHead>
                    <TableHead>Mahsulot</TableHead>
                    <TableHead className="text-right">Miqdor</TableHead>
                    <TableHead className="text-right">Narx</TableHead>
                    <TableHead>Valyuta</TableHead>
                    <TableHead className="text-right">Jami</TableHead>
                    <TableHead>Vaqt</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessionItems.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Mahsulot qo'shing — "Mahsulot kirimi"</TableCell></TableRow>
                  )}
                  {sessionItems.map((i, idx) => (
                    <TableRow key={i.id}>
                      <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell className="font-medium">{i.product_name}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(Number(i.quantity))} {i.unit}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(Number(i.unit_price))}</TableCell>
                      <TableCell>{i.currency}</TableCell>
                      <TableCell className="text-right font-mono font-semibold">{fmt(Number(i.quantity) * Number(i.unit_price))}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{fmtDateTime24(i.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => removeSessionItem(i.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="stock">
        <TabsList>
          <TabsTrigger value="stock">{t.warehouse.tabs.stock}</TabsTrigger>
          <TabsTrigger value="history">{t.warehouse.tabs.history}</TabsTrigger>
          <TabsTrigger value="instruments">Instrumentlar</TabsTrigger>
          <TabsTrigger value="employees">Xodimlar</TabsTrigger>
          <TabsTrigger value="reorder">Qayta zakaz berish kerak ({lowStock.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="instruments" className="mt-4">
          <InstrumentsTab />
        </TabsContent>

        <TabsContent value="employees" className="mt-4">
          <EmployeesView />
        </TabsContent>

        <TabsContent value="reorder" className="mt-4">
          {lowStock.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Qayta zakaz talab qilayotgan mahsulot yo'q</CardContent></Card>
          ) : (
            <Card className="border-status-red/30 bg-status-red/5">
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2 text-status-red">
                  <AlertTriangle className="h-4 w-4" />{t.supply.reorderTitle} ({lowStock.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {lowStock.map(g => {
                    const meta = stockStatusMeta[g.status];
                    const need = Math.max(Number(g.minLim) - Number(g.totalQty), 1);
                    return (
                      <div
                        key={g.first.id}
                        className={`text-left rounded-xl border-2 bg-background p-3 space-y-2 ${meta.border}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-sm flex items-center gap-2 min-w-0">
                            <StockDot status={g.status} />
                            <span className="truncate">{g.first.name}</span>
                          </span>
                          <span className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${meta.bg} ${meta.border} ${meta.text}`}>
                            {meta.label}
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-[11px]">
                          <div>
                            <div className="text-muted-foreground">Qoldiq</div>
                            <div className={`font-mono font-bold text-sm ${meta.text}`}>{fmt(g.totalQty)}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Min. limit</div>
                            <div className="font-mono font-semibold text-sm">{fmt(g.minLim)}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Kerak</div>
                            <div className="font-mono font-bold text-sm text-primary">{fmt(need)}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Birligi</div>
                            <div className="font-semibold text-sm">{g.first.unit || "dona"}</div>
                          </div>
                        </div>
                        {canRequest && (
                          <Button
                            size="sm"
                            className="w-full"
                            onClick={() => {
                              setPrMode("factory");
                              setPrPid(g.first.id);
                              setPrPname(g.first.name);
                              setPrQty(need);
                              setPrUnit(g.first.unit || "dona");
                              setPrOrderId("");
                              setPrOpen(true);
                            }}
                          >
                            <ShoppingCart className="h-3.5 w-3.5 mr-1" /> Buyurtma berish
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="stock" className="mt-4 space-y-3">

          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={(t.warehouse as any).search} className="max-w-md" />
          <Card><CardContent className="p-0">
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="w-12 text-right">№</TableHead>
                  <TableHead>{t.warehouse.cols.product}</TableHead>
                  <TableHead className="text-right">{t.warehouse.cols.stock}</TableHead>
                  <TableHead className="text-right">Partiyalar</TableHead>
                  <TableHead className="text-right">{t.warehouse.price}</TableHead>
                  <TableHead>{t.warehouse.cols.state}</TableHead>
                  {canManage && <TableHead className="w-24 text-right">{t.common.edit ?? "Amal"}</TableHead>}
                </TableRow></TableHeader>
                <TableBody>
                  {(() => {
                    const q = search.trim().toLowerCase();
                    let rows = productGroups
                      .filter(g => stockFilter === "all" ? true : g.status === stockFilter)
                      .filter(g => !q || g.batches.some((p: any) =>
                        [p.name, p.unit, p.source, p.phone].some((v: any) => (v ?? "").toString().toLowerCase().includes(q))
                      ))
                      .map(g => {
                        const prices = g.batches.map((b: any) => Number(b.last_price || 0)).filter((n: number) => n > 0);
                        const minP = prices.length ? Math.min(...prices) : 0;
                        const maxP = prices.length ? Math.max(...prices) : 0;
                        return { ...g, minP, maxP };
                      });
                    if (rows.length === 0) return <TableRow><TableCell colSpan={canManage ? 7 : 6} className="text-center text-muted-foreground py-8">{q || stockFilter !== "all" ? (t.warehouse as any).noResults ?? "Natija topilmadi" : t.common.noRecords}</TableCell></TableRow>;
                    return rows.map((r, i) => {
                      const meta = stockStatusMeta[r.status];
                      return (
                        <TableRow key={r.first.name + i} className={`cursor-pointer hover:bg-muted/40 ${r.status !== "green" ? meta.bg : ""}`} onClick={() => r.batches.length === 1 ? setSelectedProduct(r.first) : setGroupModal({ name: r.first.name, batches: r.batches })}>
                          <TableCell className="text-right text-xs font-mono text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <StockDot status={r.status} />
                              <Package className="h-4 w-4 text-muted-foreground" />
                              <span>{r.first.name}</span>
                              {r.batches.length > 1 && <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">{r.batches.length} partiya</span>}
                            </div>
                          </TableCell>
                          <TableCell className={`text-right font-mono font-semibold ${meta.text}`}>{r.totalQty} {r.first.unit}</TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">{r.batches.length}</TableCell>
                          <TableCell className="text-right text-sm font-mono">{r.minP === r.maxP ? fmt(r.minP) : `${fmt(r.minP)}–${fmt(r.maxP)}`}</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold ${meta.bg} ${meta.border} ${meta.text}`}>
                              <span className={`inline-block h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                              {meta.label}
                            </span>
                          </TableCell>
                          {canManage && (
                            <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex justify-end gap-1">
                                <Button size="sm" variant="ghost" title={t.common.edit ?? "Tahrirlash"} onClick={() => openEditProduct(r.first)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="sm" variant="ghost" title={t.common.delete ?? "O'chirish"} onClick={() => setDelTarget({ ids: r.batches.map((b: any) => b.id), name: r.first.name, qty: r.totalQty, unit: r.first.unit })}>
                                  <Trash2 className="h-3.5 w-3.5 text-status-red" />
                                </Button>

                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    });
                  })()}
                </TableBody>
              </Table>
            </div>
          </CardContent></Card>
          <p className="text-xs text-muted-foreground mt-2">{t.warehouse.clickRow}</p>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <WarehouseHistory canManage={canManage} onEdit={openEditMovement} onDelete={deleteMovement} reloadKey={movements.length} />
        </TabsContent>
      </Tabs>

      {/* Group (multi-batch) Modal */}
      <Dialog open={!!groupModal} onOpenChange={(open) => !open && setGroupModal(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {groupModal && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><Package className="h-5 w-5" />{groupModal.name}</DialogTitle>
                <DialogDescription>Partiyalar ro'yxati — narx va sanasi bo'yicha</DialogDescription>
              </DialogHeader>
              <div className="border rounded-md overflow-x-auto mt-3">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="w-12 text-right">№</TableHead>
                    <TableHead>Kelgan sana</TableHead>
                    <TableHead className="text-right">Qoldiq</TableHead>
                    <TableHead className="text-right">Narx</TableHead>
                    <TableHead>Manba</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {groupModal.batches.map((b: any, i: number) => (
                      <TableRow key={b.id} className="cursor-pointer hover:bg-muted/40" onClick={() => { setSelectedProduct(b); setGroupModal(null); }}>
                        <TableCell className="text-right text-xs font-mono text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{b.created_at ? new Date(b.created_at).toISOString().slice(0,10) : "—"}</TableCell>
                        <TableCell className="text-right font-mono">{b.stock_qty} {b.unit}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmt(Number(b.last_price ?? 0))} {b.currency ?? "UZS"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{b.source ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Partiya ustiga bosing — to'liq kartochka ochiladi.</p>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Product Detail Modal */}
      <Dialog open={!!selectedProduct} onOpenChange={(open) => !open && setSelectedProduct(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {selectedProduct && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><Package className="h-5 w-5" />{selectedProduct.name}</DialogTitle>
                <DialogDescription>{t.warehouse.detailDesc}</DialogDescription>
              </DialogHeader>

              <div className="grid sm:grid-cols-3 gap-4">
                <div className="sm:col-span-1">
                  {selectedProduct.image_url ? (
                    <img src={selectedProduct.image_url} alt={selectedProduct.name} className="w-full aspect-square object-cover rounded-md border" />
                  ) : (
                    <div className="w-full aspect-square rounded-md border bg-muted flex items-center justify-center">
                      <Package className="h-12 w-12 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="sm:col-span-2 grid grid-cols-2 gap-3">
                  <div className="border rounded-md p-3">
                    <div className="text-xs text-muted-foreground">{t.warehouse.totalQty}</div>
                    <div className="text-2xl font-bold font-mono mt-1">{selectedProduct.stock_qty} <span className="text-sm font-normal text-muted-foreground">{selectedProduct.unit}</span></div>
                  </div>
                  <div className="border rounded-md p-3">
                    <div className="text-xs text-muted-foreground">{t.warehouse.minLimit}</div>
                    <div className="text-2xl font-bold font-mono mt-1">{selectedProduct.min_limit} <span className="text-sm font-normal text-muted-foreground">{selectedProduct.unit}</span></div>
                  </div>
                  <div className="border rounded-md p-3">
                    <div className="text-xs text-muted-foreground">{t.warehouse.price}</div>
                    <div className="text-xl font-bold font-mono mt-1">{fmt(Number(selectedProduct.last_price ?? 0))} <span className="text-sm font-normal text-muted-foreground">{t.common.sum}</span></div>
                  </div>
                  <div className="border rounded-md p-3">
                    <div className="text-xs text-muted-foreground">{t.warehouse.phone}</div>
                    <div className="text-sm font-medium mt-1">{selectedProduct.phone ?? "—"}</div>
                  </div>
                  <div className="col-span-2">
                    {Number(selectedProduct.stock_qty) <= Number(selectedProduct.min_limit) ? (
                      <div className="flex items-center gap-2 text-status-red text-sm font-semibold border border-status-red/30 bg-status-red/5 rounded-md p-2">
                        <AlertTriangle className="h-4 w-4" />{t.warehouse.lowAlert}
                      </div>
                    ) : (
                      <div className="text-status-green text-sm font-medium">{t.warehouse.enoughOk}</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                <div className="border rounded-md p-2 bg-status-green/5">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Jami kirim</div>
                  <div className="text-base font-bold font-mono text-status-green">+{fmt(productStats.totalIn)} <span className="text-[10px] font-normal text-muted-foreground">{selectedProduct.unit}</span></div>
                </div>
                <div className="border rounded-md p-2 bg-status-red/5">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Jami chiqim</div>
                  <div className="text-base font-bold font-mono text-status-red">−{fmt(productStats.totalOut)} <span className="text-[10px] font-normal text-muted-foreground">{selectedProduct.unit}</span></div>
                </div>
                <div className="border rounded-md p-2">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Oxirgi kirim</div>
                  <div className="text-xs font-medium">{productStats.lastIn ? fmtDateTime(productStats.lastIn) : "—"}</div>
                </div>
                <div className="border rounded-md p-2">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Oxirgi chiqim</div>
                  <div className="text-xs font-medium">{productStats.lastOut ? fmtDateTime(productStats.lastOut) : "—"}</div>
                </div>
              </div>



              <Tabs defaultValue="in" className="mt-2">
                <TabsList>
                  <TabsTrigger value="in"><ArrowUpCircle className="h-3.5 w-3.5 mr-1" />{t.warehouse.inHistory}</TabsTrigger>
                  <TabsTrigger value="out"><ArrowDownCircle className="h-3.5 w-3.5 mr-1" />{t.warehouse.outHistory}</TabsTrigger>
                  <TabsTrigger value="all"><History className="h-3.5 w-3.5 mr-1" />{t.warehouse.auditLog}</TabsTrigger>
                </TabsList>

                <TabsContent value="in" className="mt-3">
                  <div className="border rounded-md overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>{t.warehouse.cols.datetime}</TableHead>
                        <TableHead>Kim kiritdi</TableHead>
                        <TableHead>Yetkazib beruvchi</TableHead>
                        <TableHead className="text-right">{t.warehouse.cols.qty}</TableHead>
                        <TableHead className="text-right">{t.warehouse.price}</TableHead>
                        <TableHead>{(t.warehouse.cols as any).source}</TableHead>
                        <TableHead>{t.warehouse.cols.comment}</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {productMovements.filter(m => m.direction === "in").map(m => (
                          <TableRow key={m.id}>
                            <TableCell className="text-xs whitespace-nowrap">{fmtDateTime(m.created_at)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{localize(profiles[m.created_by]) || "—"}</TableCell>
                            <TableCell className="text-sm">{localize(m.recipient_name) || "—"}</TableCell>
                            <TableCell className="text-right font-mono text-status-green font-semibold">+{m.quantity} {selectedProduct.unit}</TableCell>
                            <TableCell className="text-right text-xs font-mono">{Number(m.unit_price) > 0 ? `${fmt(Number(m.unit_price))} ${m.currency ?? "UZS"}` : "—"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{m.source ?? "—"}</TableCell>
                            <TableCell className="text-xs italic text-muted-foreground">{m.comment ?? "—"}</TableCell>
                          </TableRow>
                        ))}
                        {productMovements.filter(m => m.direction === "in").length === 0 && (
                          <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-4 text-sm">{t.warehouse.noIn}</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>

                  </div>
                </TabsContent>

                <TabsContent value="out" className="mt-3">
                  <div className="border rounded-md overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>{t.warehouse.cols.datetime}</TableHead>
                        <TableHead>{t.warehouse.cols.whoGot}</TableHead>
                        <TableHead>{t.warehouse.cols.whichOrder}</TableHead>
                        <TableHead className="text-right">{t.warehouse.cols.qty}</TableHead>
                        <TableHead>{t.warehouse.cols.comment}</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {productMovements.filter(m => m.direction === "out").map(m => (
                          <TableRow key={m.id}>
                            <TableCell className="text-xs whitespace-nowrap">{fmtDateTime(m.created_at)}</TableCell>
                            <TableCell className="text-sm">{localize(m.recipient_name) || "—"}</TableCell>
                            <TableCell className="text-sm font-mono">{m.order?.order_number ?? <span className="text-muted-foreground">{t.warehouse.common}</span>}</TableCell>
                            <TableCell className="text-right font-mono text-status-red font-semibold">-{m.quantity} {selectedProduct.unit}</TableCell>
                            <TableCell className="text-xs italic text-muted-foreground">{m.comment ?? "—"}</TableCell>
                          </TableRow>
                        ))}
                        {productMovements.filter(m => m.direction === "out").length === 0 && (
                          <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4 text-sm">{t.warehouse.noOut}</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="all" className="mt-3">
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {productMovements.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">{t.warehouse.noMov}</p>}
                    {productMovements.map(m => (
                      <div key={m.id} className={`text-sm border-l-2 pl-3 py-1.5 ${m.direction === "out" ? "border-status-red/60" : "border-status-green/60"}`}>
                        <div className="flex items-center justify-between">
                          <span className="font-medium flex items-center gap-1.5">
                            {m.direction === "out" ? <ArrowDownCircle className="h-3.5 w-3.5 text-status-red" /> : <ArrowUpCircle className="h-3.5 w-3.5 text-status-green" />}
                            {m.direction === "out" ? t.warehouse.out : t.warehouse.movIn}
                          </span>
                          <span className={`font-mono font-semibold ${m.direction==="out" ? "text-status-red" : "text-status-green"}`}>
                            {m.direction==="out"?"-":"+"}{m.quantity} {selectedProduct.unit}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {fmtDateTime(m.created_at)} · {m.direction==="out" ? t.warehouse.got : t.warehouse.brought}: {localize(m.recipient_name) || "—"}
                          {m.order?.order_number && <> · {t.warehouse.cols.order}: <span className="font-mono">{m.order.order_number}</span></>}
                        </div>
                        {m.comment && <div className="text-xs italic text-muted-foreground mt-0.5">"{m.comment}"</div>}
                      </div>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Product */}
      <Dialog open={editProdOpen} onOpenChange={setEditProdOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t.common.edit} — {editProd?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>{t.warehouse.productName}</Label><Input list="dl-product-names" value={epName} onChange={e => setEpName(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t.warehouse.unit}</Label>
                <Select value={epUnit} onValueChange={setEpUnit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>{t.warehouse.price}</Label><NumberInput value={epPrice} onChange={e => setEpPrice(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t.warehouse.minLimitField}</Label><NumberInput value={epMin} onChange={e => setEpMin(e.target.value)} /></div>
              <div><Label>{t.warehouse.phone}</Label><Input list="dl-phones" value={epPhone} onChange={e => setEpPhone(e.target.value)} /></div>
            </div>
            <div><Label>{(t.warehouse as any).source}</Label><Input list="dl-sources" value={epSource} onChange={e => setEpSource(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Muhimlik</Label>
                <Select value={epPriority} onValueChange={setEpPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PRIORITY_OPTIONS.map(p => <SelectItem key={p.value} value={p.value}><span className="inline-flex items-center gap-2"><span className={`inline-block h-2.5 w-2.5 rounded-full ${p.color}`} />{p.label}</span></SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Valyuta</Label>
                <Select value={epCurrency} onValueChange={setEpCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="border-t pt-3 mt-1 space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Qoldiqni tuzatish</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Joriy qoldiq</Label>
                  <Input value={`${editProd?.stock_qty ?? 0} ${editProd?.unit ?? ""}`} disabled />
                </div>
                <div>
                  <Label>Yangi qoldiq</Label>
                  <NumberInput step="any" value={epStock} onChange={e => setEpStock(e.target.value)} />
                </div>
              </div>
              {epStock !== "" && Number(epStock) !== Number(editProd?.stock_qty ?? 0) && (
                <>
                  <div className={`text-sm font-mono font-semibold ${Number(epStock) > Number(editProd?.stock_qty ?? 0) ? "text-status-green" : "text-status-red"}`}>
                    {Number(editProd?.stock_qty ?? 0)} → {Number(epStock)} ({Number(epStock) - Number(editProd?.stock_qty ?? 0) > 0 ? "+" : ""}{Number(epStock) - Number(editProd?.stock_qty ?? 0)} {editProd?.unit ?? ""})
                  </div>
                  <div>
                    <Label>Tuzatish sababi (audit log uchun)</Label>
                    <Input value={epStockReason} onChange={e => setEpStockReason(e.target.value)} placeholder="Masalan: inventarizatsiya, yo'qotish..." />
                  </div>
                </>
              )}
            </div>
            <Button className="w-full" onClick={saveEditProduct}>{t.common.save}</Button>

          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Movement */}
      <Dialog open={editMovOpen} onOpenChange={setEditMovOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t.common.edit} — {editMov?.direction === "in" ? t.warehouse.in : t.warehouse.out}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">{editMov?.product?.name} · {editMov && fmtDateTime(editMov.created_at)}</div>
            <div><Label>{t.warehouse.qty} *</Label><NumberInput step="any" value={emQty} onChange={e => setEmQty(e.target.value)} /></div>
            <div><Label>{editMov?.direction === "in" ? t.warehouse.cols.whoBrought : t.warehouse.cols.whoGot}</Label><Input list={editMov?.direction === "in" ? "dl-suppliers" : "dl-recipients"} value={emRecipient} onChange={e => setEmRecipient(e.target.value)} /></div>
            <div><Label>{(t.warehouse as any).source}</Label><Input list="dl-sources" value={emSource} onChange={e => setEmSource(e.target.value)} /></div>
            <div><Label>{t.warehouse.cols.comment}</Label><Textarea value={emComment} onChange={e => setEmComment(e.target.value)} /></div>
            <Button className="w-full" onClick={saveEditMovement}>{t.common.save}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cross-order release reason */}
      <Dialog open={crossOpen} onOpenChange={(o) => { setCrossOpen(o); if (!o) { setCrossReason(""); setCrossInfo(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Boshqa zakazga berilyapti</DialogTitle>
            <DialogDescription>
              Bu mahsulot dastlab <b>{crossInfo?.sourceOrderNumber}</b> zakazi uchun olib kelingan.
              Boshqa zakazga chiqim uchun majburiy izoh kiriting.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nega boshqa zakazga berilyapti? *</Label>
              <Textarea rows={4} value={crossReason} onChange={(e) => setCrossReason(e.target.value)} placeholder="Sabab (kamida 5 belgi)..." />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCrossOpen(false)}>{t.common.cancel ?? "Bekor qilish"}</Button>
              <Button onClick={confirmCrossRelease}>Tasdiqlash</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!delTarget} onOpenChange={(o) => { if (!o) setDelTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mahsulotni o'chirish</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold">{delTarget?.name}</span> o'chirilsinmi?
              {delTarget && delTarget.ids.length > 1 ? ` Barcha ${delTarget.ids.length} partiya o'chiriladi.` : ""}
              {" "}Joriy qoldiq: {delTarget?.qty} {delTarget?.unit}. Bu amalni ortga qaytarib bo'lmaydi, harakatlar tarixi saqlanadi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={delBusy}>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction
              disabled={delBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); confirmDeleteProduct(); }}
            >
              O'chirish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>

  );
}

function ProductSearchBox({ movements, value, onChange, placeholder }: {
  movements: any[]; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const allNames = useMemo(() => {
    const set = new Set<string>();
    movements.forEach((m: any) => {
      const n = (m.product?.name ?? "").trim();
      const o = (m.order?.product_name ?? "").trim();
      if (n) set.add(n);
      if (o) set.add(o);
    });
    return Array.from(set);
  }, [movements]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const q = value.trim().toLowerCase();
  const suggestions = q
    ? allNames.filter(n => matchesAcrossScripts(n, q)).slice(0, 8)
    : [];

  return (
    <div ref={ref} className="relative">
      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
      <Input
        className="pl-8 w-72"
        placeholder={placeholder}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-md max-h-64 overflow-auto">
          {suggestions.map(s => (
            <button
              key={s}
              type="button"
              className="block w-full text-left px-3 py-1.5 text-sm hover:bg-accent"
              onMouseDown={(e) => { e.preventDefault(); onChange(s); setOpen(false); }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

