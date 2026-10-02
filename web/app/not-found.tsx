import Link from "next/link";
import { PageShell } from "@/components/page-shell";

export default function NotFound() {
  return (
    <PageShell>
      <h1>No such page</h1>
      <p className="lede">The address may be mistyped, or the page has moved.</p>
      <p>
        <Link href="/">Back to the front page</Link>
      </p>
    </PageShell>
  );
}
