import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { currentUser } from "@/lib/server/session";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ signedout?: string }> }) {
  if (await currentUser()) redirect("/account");
  const { signedout } = await searchParams;
  return (
    <PageShell>
      {signedout && (
        <div className="notice" role="status">
          <p>You&rsquo;ve been signed out on every device.</p>
        </div>
      )}
      <h1>Sign in or start your trial</h1>
      <p className="lede">Enter your email and we&rsquo;ll send you a link. There is no password to remember.</p>
      <SignInForm />
    </PageShell>
  );
}
