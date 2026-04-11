import type { Order, Worker } from "@/types/erp";

export const demoWorkers: Worker[] = [
  { id: "w1", name: "Aziz Karimov", role: "Operator", completedStages: 45, avgTimeHours: 3.2, partsUsed: 320, efficiency: 94 },
  { id: "w2", name: "Bobur Toshmatov", role: "Usta", completedStages: 38, avgTimeHours: 4.1, partsUsed: 280, efficiency: 87 },
  { id: "w3", name: "Sardor Aliyev", role: "Operator", completedStages: 52, avgTimeHours: 2.8, partsUsed: 410, efficiency: 96 },
  { id: "w4", name: "Dilshod Raxmatullayev", role: "Usta", completedStages: 29, avgTimeHours: 5.0, partsUsed: 190, efficiency: 78 },
  { id: "w5", name: "Jasur Nazarov", role: "Operator", completedStages: 41, avgTimeHours: 3.5, partsUsed: 350, efficiency: 91 },
];

const stageNames = ["Kesish", "Egish", "Payvandlash", "Tozalash", "Bo'yash", "Yig'ish", "Tekshirish"];

function makeStages(status: Order["status"], exceptionShift = false) {
  let completedCount = 0;
  if (status === "completed") completedCount = 7;
  else if (status === "in_progress") completedCount = Math.floor(Math.random() * 5) + 1;
  else if (status === "delayed") completedCount = Math.floor(Math.random() * 3) + 1;

  return stageNames.map((name, i) => {
    const isCompleted = i < completedCount;
    const isActive = i === completedCount && status !== "completed" && status !== "pending";
    const isDelayed = isActive && status === "delayed";
    return {
      id: `s${i + 1}`,
      name,
      order: i + 1,
      normTimeHours: [2, 3, 4, 1.5, 3, 5, 2][i],
      actualTimeHours: isCompleted ? [2, 3, 4, 1.5, 3, 5, 2][i] + (Math.random() - 0.4) * 1.5 : null,
      status: isCompleted ? "completed" as const : isDelayed ? "delayed" as const : isActive ? "in_progress" as const : "pending" as const,
      workerId: isCompleted || isActive ? demoWorkers[i % demoWorkers.length].id : null,
      startedAt: isCompleted || isActive ? "2025-04-0" + (i + 1) + "T08:00:00" : null,
      completedAt: isCompleted ? "2025-04-0" + (i + 1) + "T" + (10 + i) + ":00:00" : null,
      comment: i === 3 && isCompleted ? "Ishchi almashtirildi: Bobur -> Sardor" : null,
    };
  });
}

function makeParts(orderQty: number, status: Order["status"]) {
  const parts = [
    { name: "Metall plita 5mm", unit: "dona", normPer: 4 },
    { name: "Bolt M10", unit: "dona", normPer: 16 },
    { name: "Gayka M10", unit: "dona", normPer: 16 },
    { name: "Bo'yoq (qora)", unit: "litr", normPer: 0.5 },
    { name: "Elektrod 3mm", unit: "dona", normPer: 8 },
  ];
  return parts.map((p, i) => {
    const norm = Math.round(p.normPer * orderQty);
    const overuse = i === 4 && status !== "pending" ? Math.round(norm * 0.15) : 0;
    const actual = status === "pending" ? 0 : status === "completed" ? norm + overuse : Math.round((norm + overuse) * 0.6);
    return {
      id: `p${i + 1}`,
      partName: p.name,
      unit: p.unit,
      normQuantity: norm,
      actualQuantity: actual,
      takenBy: actual > 0 ? [
        { workerId: demoWorkers[i % 3].id, workerName: demoWorkers[i % 3].name, amount: Math.round(actual * 0.6) },
        { workerId: demoWorkers[(i + 1) % 3].id, workerName: demoWorkers[(i + 1) % 3].name, amount: actual - Math.round(actual * 0.6) },
      ] : [],
    };
  });
}

export const demoOrders: Order[] = [
  {
    id: "ord1", orderNumber: "Z-2025-001", client: "Navoiy Kon-Metallurgiya", product: "Konveyer ramasi",
    quantity: 10, priority: "exception", status: "in_progress", deadline: "2025-04-15", createdAt: "2025-03-28",
    stages: makeStages("in_progress", true),
    parts: makeParts(10, "in_progress"),
    logs: [
      { id: "l1", timestamp: "2025-03-28T09:00:00", action: "Zakaz yaratildi", details: "Istisno zakaz sifatida belgilandi", userId: "admin" },
      { id: "l2", timestamp: "2025-03-29T08:00:00", action: "Ishlab chiqarish boshlandi", details: "1-bosqich: Kesish", userId: "w1" },
      { id: "l3", timestamp: "2025-04-01T14:00:00", action: "Ishchi almashtirildi", details: "Bobur -> Sardor (4-bosqich)", userId: "admin" },
    ],
  },
  {
    id: "ord2", orderNumber: "Z-2025-002", client: "Toshkent Mashinasozlik", product: "Metall shkaf",
    quantity: 25, priority: "normal", status: "delayed", deadline: "2025-04-10", createdAt: "2025-03-20",
    stages: makeStages("delayed"),
    parts: makeParts(25, "delayed"),
    logs: [
      { id: "l4", timestamp: "2025-03-20T10:00:00", action: "Zakaz yaratildi", details: "", userId: "admin" },
      { id: "l5", timestamp: "2025-04-08T16:00:00", action: "Kechikish qayd etildi", details: "Payvandlash bosqichida material yetishmasligi", userId: "w2" },
    ],
  },
  {
    id: "ord3", orderNumber: "Z-2025-003", client: "Farg'ona Neftni qayta ishlash", product: "Quvur tutqich",
    quantity: 50, priority: "normal", status: "completed", deadline: "2025-04-05", createdAt: "2025-03-10",
    stages: makeStages("completed"),
    parts: makeParts(50, "completed"),
    logs: [
      { id: "l6", timestamp: "2025-03-10T08:30:00", action: "Zakaz yaratildi", details: "", userId: "admin" },
      { id: "l7", timestamp: "2025-04-04T17:00:00", action: "Zakaz tugallandi", details: "Barcha bosqichlar yakunlandi", userId: "w3" },
    ],
  },
  {
    id: "ord4", orderNumber: "Z-2025-004", client: "Olmaliq KMK", product: "Elevatorli konveyer",
    quantity: 5, priority: "normal", status: "pending", deadline: "2025-04-25", createdAt: "2025-04-01",
    stages: makeStages("pending"),
    parts: makeParts(5, "pending"),
    logs: [
      { id: "l8", timestamp: "2025-04-01T11:00:00", action: "Zakaz yaratildi", details: "Navbatga qo'shildi", userId: "admin" },
    ],
  },
  {
    id: "ord5", orderNumber: "Z-2025-005", client: "Buxoro Neftni qayta ishlash", product: "Filtr korpusi",
    quantity: 15, priority: "normal", status: "in_progress", deadline: "2025-04-20", createdAt: "2025-03-25",
    stages: makeStages("in_progress"),
    parts: makeParts(15, "in_progress"),
    logs: [
      { id: "l9", timestamp: "2025-03-25T09:00:00", action: "Zakaz yaratildi", details: "", userId: "admin" },
    ],
  },
];
