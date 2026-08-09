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
      note_links: {
        Row: {
          id: string;
          user_id: string;
          source_note_id: string;
          target_note_id: string | null;
          target_title: string;
          occurrence_index: number;
          source_from: number;
          source_to: number;
          source_updated_at: Timestamp;
          content_hash: string;
          created_at: Timestamp;
          updated_at: Timestamp;
        };
        Insert: {
          id?: string;
          user_id: string;
          source_note_id: string;
          target_note_id?: string | null;
          target_title: string;
          occurrence_index: number;
          source_from: number;
          source_to: number;
          source_updated_at: Timestamp;
          content_hash: string;
          created_at?: Timestamp;
          updated_at?: Timestamp;
        };
        Update: {
          target_note_id?: string | null;
          target_title?: string;
          source_from?: number;
          source_to?: number;
          source_updated_at?: Timestamp;
          content_hash?: string;
          updated_at?: Timestamp;
        };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      create_linked_note: {
        Args: { p_title: string };
        Returns: { status: string; note_id: string | null }[];
      };
      purge_deleted_notes: {
        Args: Record<never, never>;
        Returns: number;
      };
      rename_note_with_links: {
        Args: {
          p_note_id: string;
          p_expected_updated_at: Timestamp;
          p_content: string;
          p_source_updates: unknown;
        };
        Returns: Timestamp;
      };
      replace_note_links: {
        Args: {
          p_source_note_id: string;
          p_expected_updated_at: Timestamp;
          p_content_hash: string;
          p_links: unknown;
        };
        Returns: boolean;
      };
      resolve_note_titles: {
        Args: { p_titles: unknown };
        Returns: { id: string; title: string; updated_at: Timestamp }[];
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
