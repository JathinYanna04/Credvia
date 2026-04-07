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
          account_type: string | null;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          auth_provider?: string;
          account_type?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['users']['Insert']>;
        Relationships: [];
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
          website: string | null;
          current_company: string | null;
          education: string | null;
          primary_persona: string | null;
          secondary_personas: string[];
          profile_intent: string[];
          open_to: string[];
          expertise_tags: string[];
          interest_tags: string[];
          contribution_score: number;
          credibility_score: number;
          helpfulness_score: number;
          expertise_score: number;
          community_score: number;
          persona_completion_score: number;
          open_for_opportunities: boolean;
          open_for_mentorship: boolean;
          open_for_hiring: boolean;
          onboarding_version: number;
          contribution_profile: Json;
          trust_profile: Json;
          behavioral_signals: Json;
          growth_trajectory: Json;
          identity_confidence_score: number;
          consistency_score: number;
          depth_score: number;
          impact_score: number;
          signal_to_noise_ratio: number;
          domain_authority_score: number;
          metadata: Json;
          profile_visibility: Json;
          onboarding_complete: boolean;
          onboarding_completed_at: string | null;
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
          website?: string | null;
          current_company?: string | null;
          education?: string | null;
          primary_persona?: string | null;
          secondary_personas?: string[];
          profile_intent?: string[];
          open_to?: string[];
          expertise_tags?: string[];
          interest_tags?: string[];
          contribution_score?: number;
          credibility_score?: number;
          helpfulness_score?: number;
          expertise_score?: number;
          community_score?: number;
          persona_completion_score?: number;
          open_for_opportunities?: boolean;
          open_for_mentorship?: boolean;
          open_for_hiring?: boolean;
          onboarding_version?: number;
          contribution_profile?: Json;
          trust_profile?: Json;
          behavioral_signals?: Json;
          growth_trajectory?: Json;
          identity_confidence_score?: number;
          consistency_score?: number;
          depth_score?: number;
          impact_score?: number;
          signal_to_noise_ratio?: number;
          domain_authority_score?: number;
          metadata?: Json;
          profile_visibility?: Json;
          onboarding_complete?: boolean;
          onboarding_completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: [];
      };
      profile_persona_details: {
        Row: {
          user_id: string;
          current_title: string | null;
          company: string | null;
          industry: string | null;
          years_experience: number | null;
          college: string | null;
          degree: string | null;
          graduation_year: number | null;
          target_roles: string[];
          preferred_locations: string[];
          work_mode: string | null;
          startup_name: string | null;
          startup_stage: string | null;
          startup_domains: string[];
          startup_team_size: number | null;
          mentor_topics: string[];
          mentoring_format: string | null;
          hiring_roles: string[];
          hiring_regions: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          current_title?: string | null;
          company?: string | null;
          industry?: string | null;
          years_experience?: number | null;
          college?: string | null;
          degree?: string | null;
          graduation_year?: number | null;
          target_roles?: string[];
          preferred_locations?: string[];
          work_mode?: string | null;
          startup_name?: string | null;
          startup_stage?: string | null;
          startup_domains?: string[];
          startup_team_size?: number | null;
          mentor_topics?: string[];
          mentoring_format?: string | null;
          hiring_roles?: string[];
          hiring_regions?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['profile_persona_details']['Insert']>;
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
      };
      reputation_events: {
        Row: {
          id: string;
          user_id: string;
          community_id: string;
          source_type: string;
          source_id: string;
          delta: number;
          actor_user_id: string | null;
          event_type: string | null;
          entity_type: string | null;
          entity_id: string | null;
          points: number | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          community_id: string;
          source_type: string;
          source_id: string;
          delta: number;
          actor_user_id?: string | null;
          event_type?: string | null;
          entity_type?: string | null;
          entity_id?: string | null;
          points?: number | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['reputation_events']['Insert']>;
        Relationships: [];
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
        Relationships: [];
      };
      user_contribution_stats: {
        Row: {
          user_id: string;
          posts_count: number;
          comments_count: number;
          votes_received: number;
          votes_cast: number;
          helpful_marks_received: number;
          mentor_answers_count: number;
          startup_ideas_count: number;
          recruiter_actions_count: number;
          score_last_recomputed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          posts_count?: number;
          comments_count?: number;
          votes_received?: number;
          votes_cast?: number;
          helpful_marks_received?: number;
          mentor_answers_count?: number;
          startup_ideas_count?: number;
          recruiter_actions_count?: number;
          score_last_recomputed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['user_contribution_stats']['Insert']>;
        Relationships: [];
      };
      topics: {
        Row: {
          id: string;
          slug: string;
          label: string;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          label: string;
          description?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['topics']['Insert']>;
        Relationships: [];
      };
      trust_edges: {
        Row: {
          source_user_id: string;
          target_user_id: string;
          domain_tag: string;
          edge_type: string;
          weight: number;
          evidence_entity_type: string | null;
          evidence_entity_id: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          source_user_id: string;
          target_user_id: string;
          domain_tag?: string;
          edge_type?: string;
          weight?: number;
          evidence_entity_type?: string | null;
          evidence_entity_id?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['trust_edges']['Insert']>;
        Relationships: [];
      };
      endorsement_graph: {
        Row: {
          endorser_user_id: string;
          endorsed_user_id: string;
          domain_tag: string;
          note: string | null;
          weight: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          endorser_user_id: string;
          endorsed_user_id: string;
          domain_tag: string;
          note?: string | null;
          weight?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['endorsement_graph']['Insert']>;
        Relationships: [];
      };
      feed_signal_events: {
        Row: {
          id: string;
          user_id: string;
          post_id: string | null;
          signal_type: string;
          duration_ms: number | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          post_id?: string | null;
          signal_type: string;
          duration_ms?: number | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['feed_signal_events']['Insert']>;
        Relationships: [];
      };
      interaction_events: {
        Row: {
          id: string;
          actor_user_id: string;
          target_user_id: string | null;
          entity_type: string;
          entity_id: string;
          interaction_type: string;
          value: number;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_user_id: string;
          target_user_id?: string | null;
          entity_type: string;
          entity_id: string;
          interaction_type: string;
          value?: number;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['interaction_events']['Insert']>;
        Relationships: [];
      };
      user_topic_follows: {
        Row: {
          user_id: string;
          topic_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          topic_id: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['user_topic_follows']['Insert']>;
        Relationships: [];
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
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          notif_type: string;
          actor_user_id: string | null;
          entity_type: string | null;
          entity_id: string | null;
          payload: Json | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          notif_type: string;
          actor_user_id?: string | null;
          entity_type?: string | null;
          entity_id?: string | null;
          payload?: Json | null;
          read_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['notifications']['Insert']>;
        Relationships: [];
      };
      resumes: {
        Row: {
          id: string;
          user_id: string;
          file_name: string;
          file_path: string;
          mime_type: string;
          file_size_bytes: number | null;
          is_active: boolean;
          parse_status: string;
          source: string;
          uploaded_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          file_name: string;
          file_path: string;
          mime_type: string;
          file_size_bytes?: number | null;
          is_active?: boolean;
          parse_status?: string;
          source?: string;
          uploaded_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['resumes']['Insert']>;
        Relationships: [];
      };
      resume_profiles: {
        Row: {
          id: string;
          resume_id: string;
          user_id: string;
          full_name: string | null;
          email: string | null;
          phone: string | null;
          location: string | null;
          summary: string | null;
          current_title: string | null;
          years_experience: number | null;
          education: Json;
          experience: Json;
          projects: Json;
          raw_sections: Json;
          parsed_text: string | null;
          parsed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          resume_id: string;
          user_id: string;
          full_name?: string | null;
          email?: string | null;
          phone?: string | null;
          location?: string | null;
          summary?: string | null;
          current_title?: string | null;
          years_experience?: number | null;
          education?: Json;
          experience?: Json;
          projects?: Json;
          raw_sections?: Json;
          parsed_text?: string | null;
          parsed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['resume_profiles']['Insert']>;
        Relationships: [];
      };
      resume_skills: {
        Row: {
          id: string;
          resume_id: string;
          user_id: string;
          skill_slug: string;
          skill_name: string;
          source_type: string;
          evidence: string | null;
          confidence: number;
          created_at: string;
        };
        Insert: {
          resume_id: string;
          user_id: string;
          skill_slug: string;
          skill_name: string;
          source_type?: string;
          evidence?: string | null;
          confidence?: number;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['resume_skills']['Insert']>;
        Relationships: [];
      };
      resume_analysis_runs: {
        Row: {
          id: string;
          resume_id: string;
          user_id: string;
          status: string;
          parser_version: string | null;
          error_message: string | null;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          resume_id: string;
          user_id: string;
          status?: string;
          parser_version?: string | null;
          error_message?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['resume_analysis_runs']['Insert']>;
        Relationships: [];
      };
      job_sources: {
        Row: {
          id: string;
          source_key: string;
          display_name: string;
          is_active: boolean;
          last_synced_at: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          source_key: string;
          display_name: string;
          is_active?: boolean;
          last_synced_at?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['job_sources']['Insert']>;
        Relationships: [];
      };
      startup_companies: {
        Row: {
          id: string;
          source_key: string;
          source_company_id: string;
          company_name: string;
          company_slug: string | null;
          website_url: string | null;
          careers_url: string | null;
          location: string | null;
          remote_policy: string | null;
          company_stage: string | null;
          is_hiring: boolean;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          source_key: string;
          source_company_id: string;
          company_name: string;
          company_slug?: string | null;
          website_url?: string | null;
          careers_url?: string | null;
          location?: string | null;
          remote_policy?: string | null;
          company_stage?: string | null;
          is_hiring?: boolean;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['startup_companies']['Insert']>;
        Relationships: [];
      };
      startup_jobs: {
        Row: {
          id: string;
          startup_company_id: string;
          source_key: string;
          source_job_id: string;
          title: string;
          role_family: string | null;
          seniority: string | null;
          location: string | null;
          remote_policy: string | null;
          description_raw: string | null;
          description_clean: string | null;
          apply_url: string;
          salary_min: number | null;
          salary_max: number | null;
          currency: string | null;
          is_active: boolean;
          posted_at: string | null;
          ingested_at: string;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          startup_company_id: string;
          source_key: string;
          source_job_id: string;
          title: string;
          role_family?: string | null;
          seniority?: string | null;
          location?: string | null;
          remote_policy?: string | null;
          description_raw?: string | null;
          description_clean?: string | null;
          apply_url: string;
          salary_min?: number | null;
          salary_max?: number | null;
          currency?: string | null;
          is_active?: boolean;
          posted_at?: string | null;
          ingested_at?: string;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['startup_jobs']['Insert']>;
        Relationships: [];
      };
      job_skills: {
        Row: {
          id: string;
          job_id: string;
          skill_slug: string;
          skill_name: string;
          requirement_level: string;
          confidence: number;
          created_at: string;
        };
        Insert: {
          job_id: string;
          skill_slug: string;
          skill_name: string;
          requirement_level?: string;
          confidence?: number;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['job_skills']['Insert']>;
        Relationships: [];
      };
      job_matches: {
        Row: {
          id: string;
          user_id: string;
          resume_id: string;
          job_id: string;
          overall_score: number;
          skill_match_score: number;
          title_fit_score: number;
          experience_score: number;
          location_fit_score: number;
          matched_skills: Json;
          missing_skills: Json;
          strengths: Json;
          warnings: Json;
          explanation: Json;
          computed_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          resume_id: string;
          job_id: string;
          overall_score: number;
          skill_match_score: number;
          title_fit_score: number;
          experience_score: number;
          location_fit_score: number;
          matched_skills?: Json;
          missing_skills?: Json;
          strengths?: Json;
          warnings?: Json;
          explanation?: Json;
          computed_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['job_matches']['Insert']>;
        Relationships: [];
      };
      saved_job_matches: {
        Row: {
          user_id: string;
          match_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          match_id: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['saved_job_matches']['Insert']>;
        Relationships: [];
      };
      job_follows: {
        Row: {
          user_id: string;
          job_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          job_id: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['job_follows']['Insert']>;
        Relationships: [];
      };
      company_follows: {
        Row: {
          user_id: string;
          company_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          company_id: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['company_follows']['Insert']>;
        Relationships: [];
      };
      skill_aliases: {
        Row: {
          id: string;
          skill_slug: string;
          canonical_name: string;
          alias: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          skill_slug: string;
          canonical_name: string;
          alias: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['skill_aliases']['Insert']>;
        Relationships: [];
      };
      job_match_alerts: {
        Row: {
          id: string;
          user_id: string;
          resume_id: string;
          job_id: string;
          alert_type: string;
          payload: Json;
          delivered_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          resume_id: string;
          job_id: string;
          alert_type: string;
          payload?: Json;
          delivered_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['job_match_alerts']['Insert']>;
        Relationships: [];
      };
      startup_idea_revisions: {
        Row: {
          id: string;
          post_id: string;
          revision_number: number;
          title: string;
          body_md: string | null;
          body_html: string | null;
          problem: string;
          target_audience: string;
          solution: string;
          market_category: string;
          stage: string;
          monetization_model: string | null;
          change_summary: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          post_id: string;
          revision_number: number;
          title: string;
          body_md?: string | null;
          body_html?: string | null;
          problem: string;
          target_audience: string;
          solution: string;
          market_category: string;
          stage: string;
          monetization_model?: string | null;
          change_summary?: string | null;
          created_by: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['startup_idea_revisions']['Insert']>;
        Relationships: [];
      };
      idea_followers: {
        Row: {
          post_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          post_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['idea_followers']['Insert']>;
        Relationships: [];
      };
      moderation_actions: {
        Row: {
          id: string;
          moderator_user_id: string;
          target_type: string;
          target_id: string;
          action_type: string;
          reason: string | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          moderator_user_id: string;
          target_type: string;
          target_id: string;
          action_type: string;
          reason?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['moderation_actions']['Insert']>;
        Relationships: [];
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
          current_revision_id: string | null;
          revision_count: number;
          follower_count: number;
          last_revision_at: string;
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
          current_revision_id?: string | null;
          revision_count?: number;
          follower_count?: number;
          last_revision_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['startup_ideas']['Insert']>;
        Relationships: [];
      };
      chat_conversations: {
        Row: {
          id: string;
          type: string;
          source_type: string | null;
          source_id: string | null;
          created_by: string;
          title: string | null;
          description: string | null;
          is_archived: boolean;
          dm_user_low: string | null;
          dm_user_high: string | null;
          last_message_at: string | null;
          last_message_id: string | null;
          message_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          type: string;
          source_type?: string | null;
          source_id?: string | null;
          created_by: string;
          title?: string | null;
          description?: string | null;
          is_archived?: boolean;
          dm_user_low?: string | null;
          dm_user_high?: string | null;
          last_message_at?: string | null;
          last_message_id?: string | null;
          message_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['chat_conversations']['Insert']>;
        Relationships: [];
      };
      chat_participants: {
        Row: {
          id: string;
          conversation_id: string;
          user_id: string;
          role: string;
          status: string;
          joined_at: string;
          left_at: string | null;
          last_read_message_id: string | null;
          last_read_at: string | null;
          notifications_muted: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          user_id: string;
          role?: string;
          status?: string;
          joined_at?: string;
          left_at?: string | null;
          last_read_message_id?: string | null;
          last_read_at?: string | null;
          notifications_muted?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['chat_participants']['Insert']>;
        Relationships: [];
      };
      chat_messages: {
        Row: {
          id: string;
          conversation_id: string;
          sender_id: string | null;
          message_type: string;
          ciphertext: string | null;
          iv: string | null;
          algorithm: string | null;
          key_version: number | null;
          payload_meta: Json | null;
          client_generated_id: string | null;
          reply_to_message_id: string | null;
          is_deleted: boolean;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          sender_id?: string | null;
          message_type: string;
          ciphertext?: string | null;
          iv?: string | null;
          algorithm?: string | null;
          key_version?: number | null;
          payload_meta?: Json | null;
          client_generated_id?: string | null;
          reply_to_message_id?: string | null;
          is_deleted?: boolean;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['chat_messages']['Insert']>;
        Relationships: [];
      };
      chat_conversation_keys: {
        Row: {
          id: string;
          conversation_id: string;
          user_id: string;
          encrypted_conversation_key: string;
          key_encryption_algorithm: string;
          key_version: number;
          created_at: string;
          rotated_at: string | null;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          user_id: string;
          encrypted_conversation_key: string;
          key_encryption_algorithm: string;
          key_version?: number;
          created_at?: string;
          rotated_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['chat_conversation_keys']['Insert']>;
        Relationships: [];
      };
      chat_user_keypairs: {
        Row: {
          user_id: string;
          public_key: string;
          algorithm: string;
          key_version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          public_key: string;
          algorithm?: string;
          key_version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['chat_user_keypairs']['Insert']>;
        Relationships: [];
      };
      chat_blocks: {
        Row: {
          id: string;
          blocker_id: string;
          blocked_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          blocker_id: string;
          blocked_id: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['chat_blocks']['Insert']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      mutate_post_vote_atomic: {
        Args: {
          p_entity_id: string;
          p_direction?: number | null;
          p_value?: number | null;
        };
        Returns: {
          entity_id: string;
          previous_vote: number;
          current_user_vote: number;
          score: number;
          upvote_count: number;
          downvote_count: number;
          updated_at: string;
          contribution_delta: number;
        }[];
      };
      mutate_comment_vote_atomic: {
        Args: {
          p_entity_id: string;
          p_direction?: number | null;
          p_value?: number | null;
        };
        Returns: {
          entity_id: string;
          previous_vote: number;
          current_user_vote: number;
          score: number;
          upvote_count: number;
          downvote_count: number;
          updated_at: string;
          contribution_delta: number;
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

