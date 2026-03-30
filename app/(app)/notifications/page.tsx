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
      <div className="surface-panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Signals</div>
          <h1 className="mt-2 text-3xl font-semibold">Notifications</h1>
          <p className="mt-2 text-sm text-text-secondary">
            Replies, votes, and reputation movement tied to your actual contribution.
          </p>
        </div>
        <MarkAllReadButton />
      </div>

      <section className="space-y-3">
        {notifications.length === 0 ? (
          <div className="surface-panel space-y-3 p-5 text-sm text-text-secondary">
            <p>No notifications yet.</p>
            <p>Votes, replies, and reputation movement will show up here once you start asking or answering.</p>
            <p>Try responding to a question in your strongest community to start the loop.</p>
          </div>
        ) : null}
        {notifications.map((notification) => (
          <NotificationItem key={notification.id} notification={notification} />
        ))}
      </section>
    </div>
  );
}
