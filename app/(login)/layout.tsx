import { AuthSplitShell } from "@/components/auth/auth-split-shell";

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthSplitShell
      headline="Your warehouse never stopped moving"
      subcopy="Log in to see live stock, pending approvals, and proofs confirmed while you were away."
      skipLabel="Skip to log-in form"
    >
      {children}
    </AuthSplitShell>
  );
}
