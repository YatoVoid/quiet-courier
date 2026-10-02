import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { ProfileForm } from "@/components/profile-form";
import { onboardAction } from "@/app/actions/account";
import { cities } from "@/lib/server/cities";
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
        cities={cities().map((c) => ({ id: c.id, label: `${c.name}, ${c.region}` }))}
        initial={{ name: user.name ?? "", cityId: user.cityId ?? "", format: user.format ?? "", deliveryEmail: user.deliveryEmail ?? "" }}
      />
    </PageShell>
  );
}
