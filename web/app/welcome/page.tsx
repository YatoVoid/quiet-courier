import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { ProfileForm } from "@/components/profile-form";
import { onboardAction } from "@/app/actions/account";
import { profileInitial, TIME_ZONES } from "@/lib/server/profile-initial";
import { isOnboarded, requireUser } from "@/lib/server/session";

export const metadata: Metadata = { title: "Set up your paper" };

export default async function WelcomePage() {
  const user = await requireUser();
  if (isOnboarded(user)) redirect("/account");
  return (
    <PageShell>
      <h1>Set up your paper</h1>
      <p className="lede">Four answers and your first edition can go out. You can change any of them later.</p>
      <ProfileForm
        action={onboardAction}
        withTerms
        submitLabel="Save and continue"
        timeZones={TIME_ZONES}
        initial={await profileInitial(user)}
      />
    </PageShell>
  );
}
