export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          auth_provider: string;
          account_type: string;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          auth_provider?: string;
          account_type?: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['users']['Insert']>;
      };
      profiles: {
        Row: {
          user_id: string;
          username: string;
          full_name: string | null;
          headline: string | null;
          bio: string | null;
          avatar_url: string | null;
          location: string | null;
          current_company: string | null;
          education: string | null;
          profile_visibility: Json;
          onboarding_complete: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          username: string;
          full_name?: string | null;
          headline?: string | null;
          bio?: string | null;
          avatar_url?: string | null;
          location?: string | null;
          current_company?: string | null;
          education?: string | null;
          profile_visibility?: Json;
          onboarding_complete?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
      };
      communities: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          status: string;
          member_count: number;
          post_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          status?: string;
          member_count?: number;
          post_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['communities']['Insert']>;
      };
      community_memberships: {
        Row: {
          user_id: string;
          community_id: string;
          role: string;
          joined_at: string;
        };
        Insert: {
          user_id: string;
          community_id: string;
          role?: string;
          joined_at?: string;
        };
        Update: Partial<Database['public']['Tables']['community_memberships']['Insert']>;
      };
      skills: {
        Row: {
          id: string;
          name: string;
          slug: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['skills']['Insert']>;
      };
      user_skills: {
        Row: {
          user_id: string;
          skill_id: string;
          proficiency_level: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          skill_id: string;
          proficiency_level?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['user_skills']['Insert']>;
      };
      posts: {
        Row: {
          id: string;
          title: string;
          body_md: string | null;
          body_html: string | null;
          post_type: string;
          status: string;
          author_id: string;
          community_id: string;
          external_url: string | null;
          media_url: string | null;
          vote_score: number;
          comment_count: number;
          save_count: number;
          view_count: number;
          best_answer_comment_id: string | null;
          is_answered: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          body_md?: string | null;
          body_html?: string | null;
          post_type: string;
          status?: string;
          author_id: string;
          community_id: string;
          external_url?: string | null;
          media_url?: string | null;
          vote_score?: number;
          comment_count?: number;
          save_count?: number;
          view_count?: number;
          best_answer_comment_id?: string | null;
          is_answered?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['posts']['Insert']>;
      };
      comments: {
        Row: {
          id: string;
          post_id: string;
          author_id: string;
          parent_comment_id: string | null;
          body_md: string;
          body_html: string;
          status: string;
          vote_score: number;
          is_best_answer: boolean;
          depth: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          post_id: string;
          author_id: string;
          parent_comment_id?: string | null;
          body_md: string;
          body_html: string;
          status?: string;
          vote_score?: number;
          is_best_answer?: boolean;
          depth?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['comments']['Insert']>;
      };
      votes: {
        Row: {
          id: string;
          user_id: string;
          entity_type: string;
          entity_id: string;
          value: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          entity_type: string;
          entity_id: string;
          value: number;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['votes']['Insert']>;
      };
      saved_items: {
        Row: {
          user_id: string;
          entity_type: string;
          entity_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          entity_type?: string;
          entity_id: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['saved_items']['Insert']>;
      };
      follows: {
        Row: {
          follower_id: string;
          followed_id: string;
          created_at: string;
        };
        Insert: {
          follower_id: string;
          followed_id: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['follows']['Insert']>;
      };
      community_reputation: {
        Row: {
          user_id: string;
          community_id: string;
          score: number;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          community_id: string;
          score?: number;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['community_reputation']['Insert']>;
      };
      reports: {
        Row: {
          id: string;
          reporter_user_id: string;
          target_type: string;
          target_id: string;
          reason_code: string;
          details: string | null;
          status: string;
          created_at: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
        };
        Insert: {
          id?: string;
          reporter_user_id: string;
          target_type: string;
          target_id: string;
          reason_code: string;
          details?: string | null;
          status?: string;
          created_at?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['reports']['Insert']>;
      };
      startup_ideas: {
        Row: {
          post_id: string;
          founder_user_id: string;
          problem: string;
          target_audience: string;
          solution: string;
          market_category: string;
          stage: string;
          monetization_model: string | null;
          validation_score: number;
          unique_contributor_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          post_id: string;
          founder_user_id: string;
          problem: string;
          target_audience: string;
          solution: string;
          market_category: string;
          stage: string;
          monetization_model?: string | null;
          validation_score?: number;
          unique_contributor_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['startup_ideas']['Insert']>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
