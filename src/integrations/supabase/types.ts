export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          created_at: string
          details: string | null
          entity: string | null
          id: string
          order_id: string | null
          stage_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          details?: string | null
          entity?: string | null
          id?: string
          order_id?: string | null
          stage_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          details?: string | null
          entity?: string | null
          id?: string
          order_id?: string | null
          stage_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "order_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_expenses: {
        Row: {
          amount: number
          comment: string | null
          created_at: string
          created_by: string | null
          expense_date: string
          id: string
          reason: string
          recipient_id: string | null
          recipient_name: string | null
        }
        Insert: {
          amount?: number
          comment?: string | null
          created_at?: string
          created_by?: string | null
          expense_date?: string
          id?: string
          reason?: string
          recipient_id?: string | null
          recipient_name?: string | null
        }
        Update: {
          amount?: number
          comment?: string | null
          created_at?: string
          created_by?: string | null
          expense_date?: string
          id?: string
          reason?: string
          recipient_id?: string | null
          recipient_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_expenses_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_incomes: {
        Row: {
          amount: number
          comment: string | null
          created_at: string
          created_by: string | null
          id: string
          income_date: string
          payment_type: string | null
          receipt_url: string | null
          source: string
        }
        Insert: {
          amount?: number
          comment?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          income_date?: string
          payment_type?: string | null
          receipt_url?: string | null
          source?: string
        }
        Update: {
          amount?: number
          comment?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          income_date?: string
          payment_type?: string | null
          receipt_url?: string | null
          source?: string
        }
        Relationships: []
      }
      chat_conversations: {
        Row: {
          created_at: string
          id: string
          is_global: boolean
          title: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_global?: boolean
          title?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_global?: boolean
          title?: string | null
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          body: string | null
          conversation_id: string
          created_at: string
          id: string
          media_type: string | null
          media_url: string | null
          sender_id: string
          sender_name: string | null
        }
        Insert: {
          body?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          media_type?: string | null
          media_url?: string | null
          sender_id: string
          sender_name?: string | null
        }
        Update: {
          body?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          media_type?: string | null
          media_url?: string | null
          sender_id?: string
          sender_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_participants: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          created_at: string
          id: string
          name: string
          phone: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          name: string
          phone?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
        }
        Relationships: []
      }
      defects: {
        Row: {
          comment: string | null
          created_at: string
          created_by: string | null
          detected_by_id: string | null
          detected_by_name: string | null
          id: string
          image_url: string | null
          order_id: string | null
          product_id: string | null
          quantity: number
          reason: string | null
          resolution: Database["public"]["Enums"]["defect_resolution"]
          stage_id: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          created_by?: string | null
          detected_by_id?: string | null
          detected_by_name?: string | null
          id?: string
          image_url?: string | null
          order_id?: string | null
          product_id?: string | null
          quantity?: number
          reason?: string | null
          resolution?: Database["public"]["Enums"]["defect_resolution"]
          stage_id?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          created_by?: string | null
          detected_by_id?: string | null
          detected_by_name?: string | null
          id?: string
          image_url?: string | null
          order_id?: string | null
          product_id?: string | null
          quantity?: number
          reason?: string | null
          resolution?: Database["public"]["Enums"]["defect_resolution"]
          stage_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "defects_detected_by_id_fkey"
            columns: ["detected_by_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defects_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          created_at: string
          department: string
          full_name: string
          hire_date: string
          id: string
          leave_date: string | null
          phone: string | null
          position: string
          salary: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          department?: string
          full_name: string
          hire_date?: string
          id?: string
          leave_date?: string | null
          phone?: string | null
          position?: string
          salary?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          department?: string
          full_name?: string
          hire_date?: string
          id?: string
          leave_date?: string | null
          phone?: string | null
          position?: string
          salary?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      order_files: {
        Row: {
          created_at: string
          file_name: string
          file_url: string
          id: string
          order_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_name?: string
          file_url: string
          id?: string
          order_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          file_url?: string
          id?: string
          order_id?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      order_parts: {
        Row: {
          actual_qty: number
          created_at: string
          id: string
          norm_qty: number
          order_id: string
          part_name: string
          product_id: string | null
          unit: string
        }
        Insert: {
          actual_qty?: number
          created_at?: string
          id?: string
          norm_qty?: number
          order_id: string
          part_name: string
          product_id?: string | null
          unit?: string
        }
        Update: {
          actual_qty?: number
          created_at?: string
          id?: string
          norm_qty?: number
          order_id?: string
          part_name?: string
          product_id?: string | null
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_parts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_parts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_stages: {
        Row: {
          created_at: string
          finished_at: string | null
          handover_comment: string | null
          id: string
          name: string
          norm_days: number
          order_id: string
          otk_checked_at: string | null
          otk_comment: string | null
          planned_end: string | null
          planned_start: string | null
          qc_passed: boolean | null
          qc_required: boolean
          stage_order: number
          started_at: string | null
          status: Database["public"]["Enums"]["stage_status"]
          worker_changed_comment: string | null
          worker_id: string | null
          worker_name: string | null
        }
        Insert: {
          created_at?: string
          finished_at?: string | null
          handover_comment?: string | null
          id?: string
          name: string
          norm_days?: number
          order_id: string
          otk_checked_at?: string | null
          otk_comment?: string | null
          planned_end?: string | null
          planned_start?: string | null
          qc_passed?: boolean | null
          qc_required?: boolean
          stage_order: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["stage_status"]
          worker_changed_comment?: string | null
          worker_id?: string | null
          worker_name?: string | null
        }
        Update: {
          created_at?: string
          finished_at?: string | null
          handover_comment?: string | null
          id?: string
          name?: string
          norm_days?: number
          order_id?: string
          otk_checked_at?: string | null
          otk_comment?: string | null
          planned_end?: string | null
          planned_start?: string | null
          qc_passed?: boolean | null
          qc_required?: boolean
          stage_order?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["stage_status"]
          worker_changed_comment?: string | null
          worker_id?: string | null
          worker_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_stages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          client_id: string | null
          comment: string | null
          created_at: string
          created_by: string | null
          deadline: string
          exception_approved_by: string | null
          id: string
          order_date: string
          order_number: string
          priority: Database["public"]["Enums"]["order_priority"]
          product_image_url: string | null
          product_name: string
          quantity: number
          queue_position: number
          status: Database["public"]["Enums"]["order_status"]
          tz_file_url: string | null
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          comment?: string | null
          created_at?: string
          created_by?: string | null
          deadline: string
          exception_approved_by?: string | null
          id?: string
          order_date?: string
          order_number: string
          priority?: Database["public"]["Enums"]["order_priority"]
          product_image_url?: string | null
          product_name: string
          quantity?: number
          queue_position?: number
          status?: Database["public"]["Enums"]["order_status"]
          tz_file_url?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          comment?: string | null
          created_at?: string
          created_by?: string | null
          deadline?: string
          exception_approved_by?: string | null
          id?: string
          order_date?: string
          order_number?: string
          priority?: Database["public"]["Enums"]["order_priority"]
          product_image_url?: string | null
          product_name?: string
          quantity?: number
          queue_position?: number
          status?: Database["public"]["Enums"]["order_status"]
          tz_file_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          last_price: number
          min_limit: number
          name: string
          phone: string | null
          source: string | null
          stock_qty: number
          unit: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          last_price?: number
          min_limit?: number
          name: string
          phone?: string | null
          source?: string | null
          stock_qty?: number
          unit?: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          last_price?: number
          min_limit?: number
          name?: string
          phone?: string | null
          source?: string | null
          stock_qty?: number
          unit?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          department: string
          email: string | null
          full_name: string
          id: string
        }
        Insert: {
          created_at?: string
          department?: string
          email?: string | null
          full_name?: string
          id: string
        }
        Update: {
          created_at?: string
          department?: string
          email?: string | null
          full_name?: string
          id?: string
        }
        Relationships: []
      }
      returns: {
        Row: {
          comment: string | null
          created_at: string
          created_by: string | null
          id: string
          image_url: string | null
          product_id: string | null
          quantity: number
          reason: string | null
          return_type: Database["public"]["Enums"]["return_type"]
          returned_by_id: string | null
          returned_by_name: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string | null
          product_id?: string | null
          quantity?: number
          reason?: string | null
          return_type: Database["public"]["Enums"]["return_type"]
          returned_by_id?: string | null
          returned_by_name?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string | null
          product_id?: string | null
          quantity?: number
          reason?: string | null
          return_type?: Database["public"]["Enums"]["return_type"]
          returned_by_id?: string | null
          returned_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "returns_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_returned_by_id_fkey"
            columns: ["returned_by_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          comment: string | null
          created_at: string
          created_by: string | null
          direction: Database["public"]["Enums"]["movement_direction"]
          id: string
          image_url: string | null
          order_id: string | null
          phone: string | null
          product_id: string | null
          quantity: number
          reason: string | null
          recipient_name: string | null
          source: string | null
          taken_by: string | null
          unit_price: number
        }
        Insert: {
          comment?: string | null
          created_at?: string
          created_by?: string | null
          direction: Database["public"]["Enums"]["movement_direction"]
          id?: string
          image_url?: string | null
          order_id?: string | null
          phone?: string | null
          product_id?: string | null
          quantity: number
          reason?: string | null
          recipient_name?: string | null
          source?: string | null
          taken_by?: string | null
          unit_price?: number
        }
        Update: {
          comment?: string | null
          created_at?: string
          created_by?: string | null
          direction?: Database["public"]["Enums"]["movement_direction"]
          id?: string
          image_url?: string | null
          order_id?: string | null
          phone?: string | null
          product_id?: string | null
          quantity?: number
          reason?: string | null
          recipient_name?: string | null
          source?: string | null
          taken_by?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_any_role: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_chat_participant: {
        Args: { _conv: string; _user: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "marketing"
        | "manager"
        | "worker"
        | "warehouse"
        | "supply"
        | "otk"
        | "hr"
        | "cashier"
        | "engineer"
      defect_resolution: "rework" | "write_off" | "pending"
      movement_direction: "in" | "out"
      order_priority: "normal" | "exception"
      order_status:
        | "pending"
        | "in_progress"
        | "completed"
        | "delayed"
        | "cancelled"
      return_type: "worker_to_warehouse" | "warehouse_to_shop"
      stage_status: "pending" | "in_progress" | "completed" | "delayed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "marketing",
        "manager",
        "worker",
        "warehouse",
        "supply",
        "otk",
        "hr",
        "cashier",
        "engineer",
      ],
      defect_resolution: ["rework", "write_off", "pending"],
      movement_direction: ["in", "out"],
      order_priority: ["normal", "exception"],
      order_status: [
        "pending",
        "in_progress",
        "completed",
        "delayed",
        "cancelled",
      ],
      return_type: ["worker_to_warehouse", "warehouse_to_shop"],
      stage_status: ["pending", "in_progress", "completed", "delayed"],
    },
  },
} as const
