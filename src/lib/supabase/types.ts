/**
 * 資料庫型別，對應 supabase/migrations/ 下的 schema。
 *
 * 目前是手寫的。schema 改動後可以用 supabase CLI 重新產生覆蓋掉：
 *   npx supabase gen types typescript --project-id <id> > src/lib/supabase/types.ts
 */

type Timestamp = string;

export type Database = {
  public: {
    Tables: {
      notes: {
        Row: {
          id: string;
          user_id: string;
          content: string;
          /** 由資料庫從內文第一行推導，寫入時不能指定。空標題為 null。 */
          title: string | null;
          pinned: boolean;
          created_at: Timestamp;
          updated_at: Timestamp;
          deleted_at: Timestamp | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          content?: string;
          pinned?: boolean;
          created_at?: Timestamp;
          updated_at?: Timestamp;
          deleted_at?: Timestamp | null;
        };
        Update: {
          content?: string;
          pinned?: boolean;
          deleted_at?: Timestamp | null;
        };
        Relationships: [];
      };
      tags: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          created_at: Timestamp;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          created_at?: Timestamp;
        };
        Update: {
          name?: string;
        };
        Relationships: [];
      };
      note_tags: {
        Row: {
          note_id: string;
          tag_id: string;
        };
        Insert: {
          note_id: string;
          tag_id: string;
        };
        Update: never;
        Relationships: [];
      };
      versions: {
        Row: {
          id: string;
          note_id: string;
          content: string;
          created_at: Timestamp;
        };
        Insert: {
          id?: string;
          note_id: string;
          content: string;
          created_at?: Timestamp;
        };
        Update: never;
        Relationships: [];
      };
      attachments: {
        Row: {
          id: string;
          note_id: string;
          storage_path: string;
          filename: string;
          size: number;
          mime_type: string | null;
          created_at: Timestamp;
        };
        Insert: {
          id?: string;
          note_id: string;
          storage_path: string;
          filename: string;
          size: number;
          mime_type?: string | null;
          created_at?: Timestamp;
        };
        Update: {
          filename?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      purge_deleted_notes: {
        Args: Record<never, never>;
        Returns: number;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

export type Note = Database["public"]["Tables"]["notes"]["Row"];
export type Tag = Database["public"]["Tables"]["tags"]["Row"];
export type Version = Database["public"]["Tables"]["versions"]["Row"];
export type Attachment = Database["public"]["Tables"]["attachments"]["Row"];
