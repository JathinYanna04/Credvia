export default function TagPage({ params }: { params: { slug: string } }) {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-3xl font-semibold">Tag: {params.slug}</h1>
    </div>
  );
}
