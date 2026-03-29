-- Migration 008: Row Level Security

-- ENABLE RLS ON ALL TABLES
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reputation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_reputation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_actions ENABLE ROW LEVEL SECURITY;

-- USERS
CREATE POLICY "users: public read" ON public.users FOR SELECT USING (status != 'deleted');
CREATE POLICY "users: self update" ON public.users FOR UPDATE USING (auth.uid() = id);

-- PROFILES
CREATE POLICY "profiles: public read" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles: self insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "profiles: self update" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- PROFILE LINKS
CREATE POLICY "profile_links: public read" ON public.profile_links FOR SELECT USING (true);
CREATE POLICY "profile_links: self write" ON public.profile_links FOR ALL USING (auth.uid() = user_id);

-- USER SKILLS
CREATE POLICY "user_skills: public read" ON public.user_skills FOR SELECT USING (true);
CREATE POLICY "user_skills: self write" ON public.user_skills FOR ALL USING (auth.uid() = user_id);

-- COMMUNITIES
CREATE POLICY "communities: public read active" ON public.communities FOR SELECT USING (status = 'active');
CREATE POLICY "communities: admin write" ON public.communities FOR ALL USING (
  EXISTS (SELECT 1 FROM public.community_memberships WHERE user_id = auth.uid() AND community_id = id AND role = 'admin')
);

-- COMMUNITY MEMBERSHIPS
CREATE POLICY "memberships: public read" ON public.community_memberships FOR SELECT USING (true);
CREATE POLICY "memberships: self write" ON public.community_memberships FOR ALL USING (auth.uid() = user_id);

-- POSTS
CREATE POLICY "posts: public read published" ON public.posts FOR SELECT USING (status = 'published');
CREATE POLICY "posts: auth insert" ON public.posts FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "posts: self update" ON public.posts FOR UPDATE USING (auth.uid() = author_id);
CREATE POLICY "posts: self delete" ON public.posts FOR DELETE USING (auth.uid() = author_id);

-- POST TAGS
CREATE POLICY "post_tags: public read" ON public.post_tags FOR SELECT USING (true);
CREATE POLICY "post_tags: auth write" ON public.post_tags FOR ALL USING (
  EXISTS (SELECT 1 FROM public.posts WHERE id = post_id AND author_id = auth.uid())
);

-- COMMENTS
CREATE POLICY "comments: public read" ON public.comments FOR SELECT USING (status = 'published');
CREATE POLICY "comments: auth insert" ON public.comments FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "comments: self update" ON public.comments FOR UPDATE USING (auth.uid() = author_id);
CREATE POLICY "comments: self delete" ON public.comments FOR DELETE USING (auth.uid() = author_id);

-- VOTES
CREATE POLICY "votes: self read" ON public.votes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "votes: self write" ON public.votes FOR ALL USING (auth.uid() = user_id);

-- SAVED ITEMS
CREATE POLICY "saved: self only" ON public.saved_items FOR ALL USING (auth.uid() = user_id);

-- FOLLOWS
CREATE POLICY "follows: public read" ON public.follows FOR SELECT USING (true);
CREATE POLICY "follows: self write" ON public.follows FOR ALL USING (auth.uid() = follower_id);

-- REPUTATION
CREATE POLICY "rep_events: self read" ON public.reputation_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "rep_events: service insert" ON public.reputation_events FOR INSERT WITH CHECK (true); -- handled by Edge Functions with service role
CREATE POLICY "community_rep: public read" ON public.community_reputation FOR SELECT USING (true);

-- NOTIFICATIONS
CREATE POLICY "notifications: self only" ON public.notifications FOR ALL USING (auth.uid() = user_id);

-- REPORTS
CREATE POLICY "reports: self insert" ON public.reports FOR INSERT WITH CHECK (auth.uid() = reporter_user_id);
CREATE POLICY "reports: mod read" ON public.reports FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.community_memberships cm
    JOIN public.posts p ON p.community_id = cm.community_id
    WHERE cm.user_id = auth.uid() AND cm.role IN ('moderator', 'admin')
  )
);

-- MODERATION ACTIONS
CREATE POLICY "mod_actions: mod read/write" ON public.moderation_actions FOR ALL USING (
  auth.uid() = moderator_user_id OR
  EXISTS (SELECT 1 FROM public.community_memberships WHERE user_id = auth.uid() AND role IN ('moderator', 'admin'))
);
