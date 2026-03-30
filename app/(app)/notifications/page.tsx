import { NotificationItem } from '@/components/notifications/NotificationItem';
import { MarkAllReadButton } from '@/components/notifications/MarkAllReadButton';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getRequiredUser } from '@/lib/supabase/helpers';
import { toNotificationSummaries } from '@/lib/supabase/query-helpers';

export default async function NotificationsPage() {
  const supabase = await createServerSupabaseClient();
  const user = await getRequiredUser(supabase);
  const notificationsResult = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  const notifications = notificationsResult.error
    ? []
    : await toNotificationSummaries(supabase, notificationsResult.data ?? []);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Notifications</h1>
          <p className="mt-2 text-sm text-text-secondary">
            Useful updates when your work gets a response or traction.
          </p>
        </div>
        <MarkAllReadButton />
      </div>

      <section className="space-y-3">
        {notifications.length === 0 ? (
          <div className="surface-panel p-5 text-sm text-text-secondary">
            No notifications yet. Votes and replies to your posts and startup ideas will show up here.
          </div>
        ) : null}
        {notifications.map((notification) => (
          <NotificationItem key={notification.id} notification={notification} />
        ))}
      </section>
    </div>
  );
}
