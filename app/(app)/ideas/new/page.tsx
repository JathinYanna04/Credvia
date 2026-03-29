import { PostEditor } from '@/components/post/PostEditor';

export default function NewIdeaPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-3xl font-semibold">Submit a startup idea</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Share the problem, who it is for, and the solution you want pressure-tested.
        </p>
      </header>

      <section className="rounded-3xl border border-border-subtle bg-bg-base p-5 text-sm text-text-secondary">
        Startup ideas are immutable during the MVP. Treat this as your current thesis snapshot, then
        use comments to publish pivots, assumptions you invalidated, and next questions.
      </section>

      <section className="surface-panel p-6">
        <PostEditor type="startup_idea" />
      </section>
    </div>
  );
}
