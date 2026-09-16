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
      attendance: {
        Row: {
          check_in: string | null
          check_out: string | null
          created_at: string
          created_by: string | null
          date: string
          employee_id: string
          id: string
          note: string | null
          shift_end: string
          shift_start: string
          status: string
          updated_at: string
        }
        Insert: {
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          created_by?: string | null
          date: string
          employee_id: string
          id?: string
          note?: string | null
          shift_end?: string
          shift_start?: string
          status?: string
          updated_at?: string
        }
        Update: {
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          employee_id?: string
          id?: string
          note?: string | null
          shift_end?: string
          shift_start?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
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
      business_trip_expenses: {
        Row: {
          amount: number
          comment: string | null
          created_at: string
          created_by: string | null
          currency: string
          id: string
          item_name: string
          receipt_url: string | null
          spent_at: string
          trip_id: string
        }
        Insert: {
          amount?: number
          comment?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          item_name: string
          receipt_url?: string | null
          spent_at?: string
          trip_id: string
        }
        Update: {
          amount?: number
          comment?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          item_name?: string
          receipt_url?: string | null
          spent_at?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_trip_expenses_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "business_trips"
            referencedColumns: ["id"]
          },
        ]
      }
      business_trips: {
        Row: {
          assignee_user_id: string | null
          cash_expense_id: string | null
          comment: string | null
          created_at: string
          created_by: string | null
          currency: string
          destination: string
          distance_km: number
          employee_id: string | null
          employee_name: string
          end_date: string | null
          given_amount: number
          id: string
          purpose: string | null
          returned_amount: number
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          assignee_user_id?: string | null
          cash_expense_id?: string | null
          comment?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          destination: string
          distance_km?: number
          employee_id?: string | null
          employee_name: string
          end_date?: string | null
          given_amount?: number
          id?: string
          purpose?: string | null
          returned_amount?: number
          start_date?: string
          status?: string
          updated_at?: string
        }
        Update: {
          assignee_user_id?: string | null
          cash_expense_id?: string | null
          comment?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          destination?: string
          distance_km?: number
          employee_id?: string | null
          employee_name?: string
          end_date?: string | null
          given_amount?: number
          id?: string
          purpose?: string | null
          returned_amount?: number
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_trips_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
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
          currency: string
          exchange_rate: number
          expense_date: string
          id: string
          payment_type: string
          purpose: string | null
          reason: string
          recipient_id: string | null
          recipient_name: string | null
          salary_kind: string | null
          total_uzs: number
        }
        Insert: {
          amount?: number
          comment?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          exchange_rate?: number
          expense_date?: string
          id?: string
          payment_type?: string
          purpose?: string | null
          reason?: string
          recipient_id?: string | null
          recipient_name?: string | null
          salary_kind?: string | null
          total_uzs?: number
        }
        Update: {
          amount?: number
          comment?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          exchange_rate?: number
          expense_date?: string
          id?: string
          payment_type?: string
          purpose?: string | null
          reason?: string
          recipient_id?: string | null
          recipient_name?: string | null
          salary_kind?: string | null
          total_uzs?: number
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
          currency: string
          exchange_rate: number
          id: string
          income_date: string
          payment_type: string | null
          receipt_url: string | null
          source: string
          total_uzs: number
        }
        Insert: {
          amount?: number
          comment?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          exchange_rate?: number
          id?: string
          income_date?: string
          payment_type?: string | null
          receipt_url?: string | null
          source?: string
          total_uzs?: number
        }
        Update: {
          amount?: number
          comment?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          exchange_rate?: number
          id?: string
          income_date?: string
          payment_type?: string | null
          receipt_url?: string | null
          source?: string
          total_uzs?: number
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
      client_documents: {
        Row: {
          client_id: string
          comment: string | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          doc_type: string | null
          file_url: string | null
          id: string
          issued_at: string | null
          name: string
          order_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          client_id: string
          comment?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          doc_type?: string | null
          file_url?: string | null
          id?: string
          issued_at?: string | null
          name: string
          order_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          comment?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          doc_type?: string | null
          file_url?: string | null
          id?: string
          issued_at?: string | null
          name?: string
          order_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_documents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      client_interactions: {
        Row: {
          actor_id: string | null
          actor_name: string | null
          client_id: string
          comment: string | null
          content: string
          created_at: string
          id: string
          kind: string
          next_contact_date: string | null
          occurred_at: string
        }
        Insert: {
          actor_id?: string | null
          actor_name?: string | null
          client_id: string
          comment?: string | null
          content: string
          created_at?: string
          id?: string
          kind?: string
          next_contact_date?: string | null
          occurred_at?: string
        }
        Update: {
          actor_id?: string | null
          actor_name?: string | null
          client_id?: string
          comment?: string | null
          content?: string
          created_at?: string
          id?: string
          kind?: string
          next_contact_date?: string | null
          occurred_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_interactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          client_type: string | null
          contact_person: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          name: string
          note: string | null
          partnership_start: string | null
          phone: string | null
          phone2: string | null
          responsible_employee_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          client_type?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name: string
          note?: string | null
          partnership_start?: string | null
          phone?: string | null
          phone2?: string | null
          responsible_employee_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          client_type?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name?: string
          note?: string | null
          partnership_start?: string | null
          phone?: string | null
          phone2?: string | null
          responsible_employee_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_responsible_employee_id_fkey"
            columns: ["responsible_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
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
          instrument_id: string | null
          item_type: string
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
          instrument_id?: string | null
          item_type?: string
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
          instrument_id?: string | null
          item_type?: string
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
          address: string | null
          birth_date: string | null
          created_at: string
          department: string
          full_name: string
          hikvision_person_id: string | null
          hire_date: string
          id: string
          leave_date: string | null
          login: string | null
          neighborhood: string | null
          note: string | null
          passport: string | null
          password: string | null
          phone: string | null
          photo_url: string | null
          position: string
          salary: number
          shift_id: string | null
          status: string
          updated_at: string
          work_site: string | null
        }
        Insert: {
          address?: string | null
          birth_date?: string | null
          created_at?: string
          department?: string
          full_name: string
          hikvision_person_id?: string | null
          hire_date?: string
          id?: string
          leave_date?: string | null
          login?: string | null
          neighborhood?: string | null
          note?: string | null
          passport?: string | null
          password?: string | null
          phone?: string | null
          photo_url?: string | null
          position?: string
          salary?: number
          shift_id?: string | null
          status?: string
          updated_at?: string
          work_site?: string | null
        }
        Update: {
          address?: string | null
          birth_date?: string | null
          created_at?: string
          department?: string
          full_name?: string
          hikvision_person_id?: string | null
          hire_date?: string
          id?: string
          leave_date?: string | null
          login?: string | null
          neighborhood?: string | null
          note?: string | null
          passport?: string | null
          password?: string | null
          phone?: string | null
          photo_url?: string | null
          position?: string
          salary?: number
          shift_id?: string | null
          status?: string
          updated_at?: string
          work_site?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "face_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_audit: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          new_value: Json | null
          old_value: Json | null
          role: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          role?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          role?: string | null
        }
        Relationships: []
      }
      face_devices: {
        Row: {
          created_at: string
          id: string
          ip_address: string | null
          last_error: string | null
          last_event_at: string | null
          last_sync_at: string | null
          name: string
          site: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          ip_address?: string | null
          last_error?: string | null
          last_event_at?: string | null
          last_sync_at?: string | null
          name: string
          site: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          ip_address?: string | null
          last_error?: string | null
          last_event_at?: string | null
          last_sync_at?: string | null
          name?: string
          site?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      face_events: {
        Row: {
          created_at: string
          device_id: string | null
          direction: string
          employee_id: string | null
          event_time: string
          id: string
          person_code: string
          person_name: string | null
          raw: Json | null
          site: string
          work_date: string
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          direction: string
          employee_id?: string | null
          event_time: string
          id?: string
          person_code: string
          person_name?: string | null
          raw?: Json | null
          site: string
          work_date: string
        }
        Update: {
          created_at?: string
          device_id?: string | null
          direction?: string
          employee_id?: string | null
          event_time?: string
          id?: string
          person_code?: string
          person_name?: string | null
          raw?: Json | null
          site?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "face_events_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "face_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "face_events_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      face_shifts: {
        Row: {
          created_at: string
          crosses_midnight: boolean
          end_time: string
          grace_minutes: number
          id: string
          name: string
          start_time: string
        }
        Insert: {
          created_at?: string
          crosses_midnight?: boolean
          end_time: string
          grace_minutes?: number
          id?: string
          name: string
          start_time: string
        }
        Update: {
          created_at?: string
          crosses_midnight?: boolean
          end_time?: string
          grace_minutes?: number
          id?: string
          name?: string
          start_time?: string
        }
        Relationships: []
      }
      form_history: {
        Row: {
          created_at: string
          field_key: string
          id: string
          user_id: string | null
          value: string
        }
        Insert: {
          created_at?: string
          field_key: string
          id?: string
          user_id?: string | null
          value: string
        }
        Update: {
          created_at?: string
          field_key?: string
          id?: string
          user_id?: string | null
          value?: string
        }
        Relationships: []
      }
      instrument_assignments: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          instrument_id: string
          issue_comment: string | null
          issued_at: string
          issued_by: string | null
          quantity: number
          return_comment: string | null
          returned_at: string | null
          returned_by: string | null
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          instrument_id: string
          issue_comment?: string | null
          issued_at?: string
          issued_by?: string | null
          quantity?: number
          return_comment?: string | null
          returned_at?: string | null
          returned_by?: string | null
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          instrument_id?: string
          issue_comment?: string | null
          issued_at?: string
          issued_by?: string | null
          quantity?: number
          return_comment?: string | null
          returned_at?: string | null
          returned_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instrument_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instrument_assignments_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
        ]
      }
      instruments: {
        Row: {
          category: string
          comment: string | null
          created_at: string
          created_by: string | null
          currency: string
          id: string
          inventory_number: string | null
          name: string
          price: number
          quantity: number
          status: string
          updated_at: string
        }
        Insert: {
          category?: string
          comment?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          inventory_number?: string | null
          name: string
          price?: number
          quantity?: number
          status?: string
          updated_at?: string
        }
        Update: {
          category?: string
          comment?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          inventory_number?: string | null
          name?: string
          price?: number
          quantity?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      intake_items: {
        Row: {
          comment: string | null
          created_at: string
          created_by: string | null
          currency: string
          id: string
          image_url: string | null
          location: string | null
          order_id: string | null
          phone: string | null
          product_id: string | null
          product_name: string
          quantity: number
          session_id: string
          source: string | null
          unit: string
          unit_price: number
        }
        Insert: {
          comment?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          image_url?: string | null
          location?: string | null
          order_id?: string | null
          phone?: string | null
          product_id?: string | null
          product_name: string
          quantity?: number
          session_id: string
          source?: string | null
          unit?: string
          unit_price?: number
        }
        Update: {
          comment?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          image_url?: string | null
          location?: string | null
          order_id?: string | null
          phone?: string | null
          product_id?: string | null
          product_name?: string
          quantity?: number
          session_id?: string
          source?: string | null
          unit?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "intake_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_items_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "intake_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_sessions: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_name: string | null
          finalized_at: string | null
          finished_at: string | null
          id: string
          image_url: string | null
          started_at: string
          status: string
          supplier: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          finalized_at?: string | null
          finished_at?: string | null
          id?: string
          image_url?: string | null
          started_at?: string
          status?: string
          supplier?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          finalized_at?: string | null
          finished_at?: string | null
          id?: string
          image_url?: string | null
          started_at?: string
          status?: string
          supplier?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      locations: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      metal_movements: {
        Row: {
          comment: string | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          direction: string
          id: string
          order_id: string | null
          quantity: number
          stock_id: string
          weight_kg: number
        }
        Insert: {
          comment?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          direction: string
          id?: string
          order_id?: string | null
          quantity: number
          stock_id: string
          weight_kg: number
        }
        Update: {
          comment?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          direction?: string
          id?: string
          order_id?: string | null
          quantity?: number
          stock_id?: string
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "metal_movements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metal_movements_stock_id_fkey"
            columns: ["stock_id"]
            isOneToOne: false
            referencedRelation: "metal_stock"
            referencedColumns: ["id"]
          },
        ]
      }
      metal_norms: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          length_mm: number
          metal_type: string
          thickness_mm: number
          updated_at: string
          weight_kg: number
          width_mm: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          length_mm: number
          metal_type: string
          thickness_mm: number
          updated_at?: string
          weight_kg: number
          width_mm: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          length_mm?: number
          metal_type?: string
          thickness_mm?: number
          updated_at?: string
          weight_kg?: number
          width_mm?: number
        }
        Relationships: []
      }
      metal_stock: {
        Row: {
          created_at: string
          id: string
          length_mm: number
          metal_type: string
          quantity: number
          thickness_mm: number
          updated_at: string
          weight_kg: number
          width_mm: number
        }
        Insert: {
          created_at?: string
          id?: string
          length_mm: number
          metal_type: string
          quantity?: number
          thickness_mm: number
          updated_at?: string
          weight_kg: number
          width_mm: number
        }
        Update: {
          created_at?: string
          id?: string
          length_mm?: number
          metal_type?: string
          quantity?: number
          thickness_mm?: number
          updated_at?: string
          weight_kg?: number
          width_mm?: number
        }
        Relationships: []
      }
      notification_user_states: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          notification_id: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          notification_id: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          notification_id?: string
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_user_states_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          entity: string | null
          entity_id: string | null
          id: string
          link: string | null
          read_at: string | null
          recipient_id: string | null
          recipient_role: string | null
          sender_id: string | null
          sender_name: string | null
          title: string
          type: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          link?: string | null
          read_at?: string | null
          recipient_id?: string | null
          recipient_role?: string | null
          sender_id?: string | null
          sender_name?: string | null
          title: string
          type: string
        }
        Update: {
          body?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          link?: string | null
          read_at?: string | null
          recipient_id?: string | null
          recipient_role?: string | null
          sender_id?: string | null
          sender_name?: string | null
          title?: string
          type?: string
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
          group_id: string | null
          group_order: number | null
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
          group_id?: string | null
          group_order?: number | null
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
          group_id?: string | null
          group_order?: number | null
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
            foreignKeyName: "order_stages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "stage_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_stages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_supply_requests: {
        Row: {
          comment: string | null
          created_at: string
          created_by: string | null
          department: string | null
          fulfilled_at: string | null
          id: string
          late_reason: string | null
          order_id: string | null
          product_id: string | null
          product_name: string
          quantity: number
          required_date: string | null
          source: string | null
          status: string
          supply_comment: string | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          fulfilled_at?: string | null
          id?: string
          late_reason?: string | null
          order_id?: string | null
          product_id?: string | null
          product_name: string
          quantity?: number
          required_date?: string | null
          source?: string | null
          status?: string
          supply_comment?: string | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          fulfilled_at?: string | null
          id?: string
          late_reason?: string | null
          order_id?: string | null
          product_id?: string | null
          product_name?: string
          quantity?: number
          required_date?: string | null
          source?: string | null
          status?: string
          supply_comment?: string | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_supply_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_supply_requests_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_template_parts: {
        Row: {
          created_at: string
          id: string
          part_name: string
          product_id: string | null
          qty_per_unit: number
          template_id: string
          unit: string
        }
        Insert: {
          created_at?: string
          id?: string
          part_name: string
          product_id?: string | null
          qty_per_unit?: number
          template_id: string
          unit?: string
        }
        Update: {
          created_at?: string
          id?: string
          part_name?: string
          product_id?: string | null
          qty_per_unit?: number
          template_id?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_template_parts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_template_parts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "order_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      order_template_stages: {
        Row: {
          created_at: string
          id: string
          name: string
          norm_days: number
          qc_required: boolean
          stage_order: number
          template_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          norm_days?: number
          qc_required?: boolean
          stage_order: number
          template_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          norm_days?: number
          qc_required?: boolean
          stage_order?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_template_stages_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "order_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      order_templates: {
        Row: {
          created_at: string
          created_by: string | null
          default_quantity: number
          id: string
          name: string
          notes: string | null
          product_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_quantity?: number
          id?: string
          name: string
          notes?: string | null
          product_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_quantity?: number
          id?: string
          name?: string
          notes?: string | null
          product_name?: string
          updated_at?: string
        }
        Relationships: []
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
          currency: string
          id: string
          image_url: string | null
          last_price: number
          min_limit: number
          name: string
          phone: string | null
          priority: string
          source: string | null
          stock_qty: number
          unit: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          image_url?: string | null
          last_price?: number
          min_limit?: number
          name: string
          phone?: string | null
          priority?: string
          source?: string | null
          stock_qty?: number
          unit?: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          image_url?: string | null
          last_price?: number
          min_limit?: number
          name?: string
          phone?: string | null
          priority?: string
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
          location: string
          order_id: string | null
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
          location?: string
          order_id?: string | null
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
          location?: string
          order_id?: string | null
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
      service_request_items: {
        Row: {
          created_at: string
          id: string
          product_id: string | null
          product_name: string
          quantity: number
          service_request_id: string
          total_price: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          product_id?: string | null
          product_name: string
          quantity?: number
          service_request_id: string
          total_price?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          service_request_id?: string
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_request_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_items_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      service_requests: {
        Row: {
          client_name: string
          client_phone: string | null
          created_at: string
          created_by: string | null
          deadline: string | null
          device_name: string
          finished_at: string | null
          id: string
          materials_cost: number
          notes: string | null
          problem_description: string
          received_at: string
          status: string
          updated_at: string
        }
        Insert: {
          client_name: string
          client_phone?: string | null
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          device_name: string
          finished_at?: string | null
          id?: string
          materials_cost?: number
          notes?: string | null
          problem_description: string
          received_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          client_name?: string
          client_phone?: string | null
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          device_name?: string
          finished_at?: string | null
          id?: string
          materials_cost?: number
          notes?: string | null
          problem_description?: string
          received_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      stage_group_items: {
        Row: {
          created_at: string
          group_id: string
          id: string
          item_order: number
          name: string
          norm_days: number
          qc_required: boolean
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          item_order?: number
          name: string
          norm_days?: number
          qc_required?: boolean
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          item_order?: number
          name?: string
          norm_days?: number
          qc_required?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "stage_group_items_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "stage_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_groups: {
        Row: {
          created_at: string
          group_order: number
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          group_order?: number
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          group_order?: number
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          comment: string | null
          created_at: string
          created_by: string | null
          cross_order_reason: string | null
          currency: string
          direction: Database["public"]["Enums"]["movement_direction"]
          id: string
          image_url: string | null
          intake_item_id: string | null
          intake_session_id: string | null
          location: string
          order_id: string | null
          phone: string | null
          product_id: string | null
          quantity: number
          reason: string | null
          recipient_name: string | null
          source: string | null
          source_order_id: string | null
          supply_request_id: string | null
          taken_by: string | null
          unit_price: number
        }
        Insert: {
          comment?: string | null
          created_at?: string
          created_by?: string | null
          cross_order_reason?: string | null
          currency?: string
          direction: Database["public"]["Enums"]["movement_direction"]
          id?: string
          image_url?: string | null
          intake_item_id?: string | null
          intake_session_id?: string | null
          location?: string
          order_id?: string | null
          phone?: string | null
          product_id?: string | null
          quantity: number
          reason?: string | null
          recipient_name?: string | null
          source?: string | null
          source_order_id?: string | null
          supply_request_id?: string | null
          taken_by?: string | null
          unit_price?: number
        }
        Update: {
          comment?: string | null
          created_at?: string
          created_by?: string | null
          cross_order_reason?: string | null
          currency?: string
          direction?: Database["public"]["Enums"]["movement_direction"]
          id?: string
          image_url?: string | null
          intake_item_id?: string | null
          intake_session_id?: string | null
          location?: string
          order_id?: string | null
          phone?: string | null
          product_id?: string | null
          quantity?: number
          reason?: string | null
          recipient_name?: string | null
          source?: string | null
          source_order_id?: string | null
          supply_request_id?: string | null
          taken_by?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_intake_item_id_fkey"
            columns: ["intake_item_id"]
            isOneToOne: false
            referencedRelation: "intake_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_intake_session_id_fkey"
            columns: ["intake_session_id"]
            isOneToOne: false
            referencedRelation: "intake_sessions"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "stock_movements_source_order_id_fkey"
            columns: ["source_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_supply_request_id_fkey"
            columns: ["supply_request_id"]
            isOneToOne: false
            referencedRelation: "order_supply_requests"
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
      vacancies: {
        Row: {
          address: string | null
          birth_date: string | null
          created_at: string
          created_by: string | null
          department: string | null
          expected_salary: number | null
          experience: string | null
          first_name: string
          hired_employee_id: string | null
          id: string
          last_name: string
          neighborhood: string | null
          note: string | null
          passport: string | null
          phone: string
          position: string | null
          resume_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          birth_date?: string | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          expected_salary?: number | null
          experience?: string | null
          first_name: string
          hired_employee_id?: string | null
          id?: string
          last_name: string
          neighborhood?: string | null
          note?: string | null
          passport?: string | null
          phone: string
          position?: string | null
          resume_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          birth_date?: string | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          expected_salary?: number | null
          experience?: string | null
          first_name?: string
          hired_employee_id?: string | null
          id?: string
          last_name?: string
          neighborhood?: string | null
          note?: string | null
          passport?: string | null
          phone?: string
          position?: string | null
          resume_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vacancies_hired_employee_id_fkey"
            columns: ["hired_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_edit_intake: { Args: { _user_id: string }; Returns: boolean }
      can_manage_trips: { Args: { _user_id: string }; Returns: boolean }
      delete_intake_invoice: {
        Args: { _session_id: string }
        Returns: undefined
      }
      delete_intake_invoice_item: {
        Args: { _item_id: string }
        Returns: undefined
      }
      finalize_intake_session: {
        Args: { _session_id: string }
        Returns: undefined
      }
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
      is_my_trip: { Args: { _trip: string; _user: string }; Returns: boolean }
      metal_consume: {
        Args: {
          _actor_name?: string
          _comment?: string
          _order_id: string
          _quantity: number
          _stock_id: string
        }
        Returns: number
      }
      metal_intake: {
        Args: {
          _actor_name?: string
          _comment?: string
          _length: number
          _metal_type: string
          _quantity: number
          _thickness: number
          _weight_kg: number
          _width: number
        }
        Returns: string
      }
      update_intake_invoice: {
        Args: { _image_url?: string; _session_id: string; _supplier?: string }
        Returns: undefined
      }
      update_intake_invoice_item: {
        Args: {
          _currency?: string
          _item_id: string
          _quantity: number
          _unit_price: number
        }
        Returns: undefined
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
        | "chief_accountant"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
        "chief_accountant",
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
