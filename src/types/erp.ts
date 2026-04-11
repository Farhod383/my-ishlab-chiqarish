export interface Order {
  id: string;
  orderNumber: string;
  client: string;
  product: string;
  quantity: number;
  priority: "normal" | "exception";
  status: "pending" | "in_progress" | "completed" | "delayed";
  deadline: string;
  createdAt: string;
  stages: ProductionStage[];
  parts: OrderPart[];
  logs: LogEntry[];
}

export interface ProductionStage {
  id: string;
  name: string;
  order: number;
  normTimeHours: number;
  actualTimeHours: number | null;
  status: "pending" | "in_progress" | "completed" | "delayed";
  workerId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  comment: string | null;
}

export interface OrderPart {
  id: string;
  partName: string;
  unit: string;
  normQuantity: number;
  actualQuantity: number;
  takenBy: { workerId: string; workerName: string; amount: number }[];
}

export interface LogEntry {
  id: string;
  timestamp: string;
  action: string;
  details: string;
  userId: string;
}

export interface Worker {
  id: string;
  name: string;
  role: string;
  completedStages: number;
  avgTimeHours: number;
  partsUsed: number;
  efficiency: number; // percentage
}

export type StageStatus = "pending" | "in_progress" | "completed" | "delayed";
