export default function ResetPasswordPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <div className="surface-panel w-full p-6">
        <h1 className="text-3xl font-semibold">Reset password</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Complete your reset token exchange through the Supabase email link.
        </p>
      </div>
    </div>
  );
}
