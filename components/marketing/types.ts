export interface LandingCommunitySummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  member_count: number;
}

export interface PublicPostSummary {
  id: string;
  title: string;
  body: string;
  community: {
    name: string;
  };
}
