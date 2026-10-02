import Link from "next/link";
import { contactEmail } from "@/lib/server/config";

export function Footer() {
  const email = contactEmail();
  return (
    <footer className="footer">
      <p>
        Letters to the editor: <a href={`mailto:${email}`}>{email}</a>
      </p>
      <nav aria-label="Legal">
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
      </nav>
    </footer>
  );
}
