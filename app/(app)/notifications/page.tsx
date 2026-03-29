import { NotificationItem } from '@/components/notifications/NotificationItem';
import { Button } from '@/components/ui/button';
import { mockNotifications } from '@/lib/mock-data';

export default function NotificationsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Notifications</h1>
          <p className="mt-2 text-sm text-text-secondary">
            Real-time updates when your work gains traction or someone responds.
          </p>
        </div>
        <Button variant="secondary">Mark all read</Button>
      </div>

      <section className="space-y-3">
        {mockNotifications.map((notification) => (
          <NotificationItem key={notification.id} notification={notification} />
        ))}
      </section>
    </div>
  );
}
