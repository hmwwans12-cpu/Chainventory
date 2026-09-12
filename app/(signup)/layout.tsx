import { AuthSplitShell } from "@/components/auth/auth-split-shell";

export default function SignupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthSplitShell
      headline="Inventory your whole team can trust"
      subcopy="Real-time stock, role-based access, and a verifiable proof on every movement that matters."
      skipLabel="Skip to sign-up form"
    >
      {children}
    </AuthSplitShell>
  );
}
