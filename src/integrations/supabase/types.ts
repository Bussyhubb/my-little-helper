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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      bottling_inputs: {
        Row: {
          id: string
          material_id: string
          qty: number
          run_id: string
          unit_cost: number
        }
        Insert: {
          id?: string
          material_id: string
          qty: number
          run_id: string
          unit_cost?: number
        }
        Update: {
          id?: string
          material_id?: string
          qty?: number
          run_id?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "bottling_inputs_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bottling_inputs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "bottling_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      bottling_runs: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          product_id: string
          qty_produced: number
          run_date: string
          total_cost: number
          unit_cost: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          product_id: string
          qty_produced: number
          run_date?: string
          total_cost?: number
          unit_cost?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          product_id?: string
          qty_produced?: number
          run_date?: string
          total_cost?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "bottling_runs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      business_settings: {
        Row: {
          address: string | null
          brand_name: string
          business_name: string
          currency: string
          email: string | null
          honey_kg_to_litre: number
          id: boolean
          invoice_prefix: string
          phone: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          brand_name?: string
          business_name?: string
          currency?: string
          email?: string | null
          honey_kg_to_litre?: number
          id?: boolean
          invoice_prefix?: string
          phone?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          brand_name?: string
          business_name?: string
          currency?: string
          email?: string | null
          honey_kg_to_litre?: number
          id?: boolean
          invoice_prefix?: string
          phone?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          assigned_agent: string | null
          category: Database["public"]["Enums"]["customer_category"]
          created_at: string
          created_by: string | null
          credit_limit: number
          id: string
          is_active: boolean
          name: string
          notes: string | null
          payment_terms: string | null
          phone: string | null
        }
        Insert: {
          address?: string | null
          assigned_agent?: string | null
          category?: Database["public"]["Enums"]["customer_category"]
          created_at?: string
          created_by?: string | null
          credit_limit?: number
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
        }
        Update: {
          address?: string | null
          assigned_agent?: string | null
          category?: Database["public"]["Enums"]["customer_category"]
          created_at?: string
          created_by?: string | null
          credit_limit?: number
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
        }
        Relationships: []
      }
      material_ledger: {
        Row: {
          at: string
          created_by: string | null
          id: string
          material_id: string
          note: string | null
          qty_change: number
          ref_id: string | null
          ref_type: string
          unit_cost: number
        }
        Insert: {
          at?: string
          created_by?: string | null
          id?: string
          material_id: string
          note?: string | null
          qty_change: number
          ref_id?: string | null
          ref_type: string
          unit_cost?: number
        }
        Update: {
          at?: string
          created_by?: string | null
          id?: string
          material_id?: string
          note?: string | null
          qty_change?: number
          ref_id?: string | null
          ref_type?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "material_ledger_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          avg_cost: number
          created_at: string
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["material_kind"]
          min_stock: number
          name: string
          unit: string
        }
        Insert: {
          avg_cost?: number
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["material_kind"]
          min_stock?: number
          name: string
          unit?: string
        }
        Update: {
          avg_cost?: number
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["material_kind"]
          min_stock?: number
          name?: string
          unit?: string
        }
        Relationships: []
      }
      product_costs: {
        Row: {
          product_id: string
          production_cost: number
          updated_at: string
        }
        Insert: {
          product_id: string
          production_cost?: number
          updated_at?: string
        }
        Update: {
          product_id?: string
          production_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_costs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_ledger: {
        Row: {
          at: string
          created_by: string | null
          id: string
          note: string | null
          product_id: string
          qty_change: number
          ref_id: string | null
          ref_type: string
          unit_cost: number
        }
        Insert: {
          at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          product_id: string
          qty_change: number
          ref_id?: string | null
          ref_type: string
          unit_cost?: number
        }
        Update: {
          at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          product_id?: string
          qty_change?: number
          ref_id?: string | null
          ref_type?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_ledger_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_price_history: {
        Row: {
          agent_price: number
          changed_by: string | null
          effective_from: string
          id: string
          product_id: string
          retail_price: number
          wholesale_price: number
        }
        Insert: {
          agent_price: number
          changed_by?: string | null
          effective_from?: string
          id?: string
          product_id: string
          retail_price: number
          wholesale_price: number
        }
        Update: {
          agent_price?: number
          changed_by?: string | null
          effective_from?: string
          id?: string
          product_id?: string
          retail_price?: number
          wholesale_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_price_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          agent_price: number
          barcode: string | null
          created_at: string
          id: string
          is_active: boolean
          min_stock: number
          name: string
          packaging_notes: string | null
          reorder_qty: number
          retail_price: number
          size_label: string
          sku: string
          unit: string
          wholesale_price: number
        }
        Insert: {
          agent_price?: number
          barcode?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          min_stock?: number
          name: string
          packaging_notes?: string | null
          reorder_qty?: number
          retail_price?: number
          size_label: string
          sku: string
          unit?: string
          wholesale_price?: number
        }
        Update: {
          agent_price?: number
          barcode?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          min_stock?: number
          name?: string
          packaging_notes?: string | null
          reorder_qty?: number
          retail_price?: number
          size_label?: string
          sku?: string
          unit?: string
          wholesale_price?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          is_active?: boolean
          phone?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
        }
        Relationships: []
      }
      purchase_lines: {
        Row: {
          id: string
          material_id: string
          purchase_id: string
          qty: number
          unit_cost: number
        }
        Insert: {
          id?: string
          material_id: string
          purchase_id: string
          qty: number
          unit_cost: number
        }
        Update: {
          id?: string
          material_id?: string
          purchase_id?: string
          qty?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_lines_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_lines_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          purchase_date: string
          received_at: string | null
          received_by: string | null
          reference: string | null
          status: Database["public"]["Enums"]["purchase_status"]
          supplier_id: string
          total: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          purchase_date?: string
          received_at?: string | null
          received_by?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["purchase_status"]
          supplier_id: string
          total?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          purchase_date?: string
          received_at?: string | null
          received_by?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["purchase_status"]
          supplier_id?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          contact_person: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
        }
        Insert: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
        }
        Update: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      material_stock: {
        Row: {
          material_id: string | null
          on_hand: number | null
        }
        Relationships: [
          {
            foreignKeyName: "material_ledger_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
        ]
      }
      product_stock: {
        Row: {
          on_hand: number | null
          product_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_ledger_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      adjust_material_stock: {
        Args: { _material_id: string; _note: string; _qty_change: number }
        Returns: undefined
      }
      cancel_purchase: { Args: { _purchase_id: string }; Returns: undefined }
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active_user: { Args: { _user_id: string }; Returns: boolean }
      is_manager: { Args: { _user_id: string }; Returns: boolean }
      post_bottling: {
        Args: {
          _inputs: Json
          _notes: string
          _product_id: string
          _qty: number
          _run_date: string
        }
        Returns: string
      }
      receive_purchase: { Args: { _purchase_id: string }; Returns: undefined }
    }
    Enums: {
      app_role:
        | "owner"
        | "admin"
        | "agent"
        | "storekeeper"
        | "accountant"
        | "distributor"
      customer_category:
        | "retail"
        | "wholesale"
        | "supermarket"
        | "distributor"
        | "corporate"
      material_kind: "raw_honey" | "packaging"
      purchase_status: "draft" | "received" | "cancelled"
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
        "owner",
        "admin",
        "agent",
        "storekeeper",
        "accountant",
        "distributor",
      ],
      customer_category: [
        "retail",
        "wholesale",
        "supermarket",
        "distributor",
        "corporate",
      ],
      material_kind: ["raw_honey", "packaging"],
      purchase_status: ["draft", "received", "cancelled"],
    },
  },
} as const
