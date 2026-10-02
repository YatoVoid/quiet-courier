import { currentUser } from "@/lib/server/session";
import { CompactMasthead } from "./masthead";
import { Footer } from "./footer";

export async function PageShell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  const user = await currentUser();
  return (
    <div className="sheet">
      <CompactMasthead signedIn={user != null} />
      <main id="main" className={wide ? "page-wide" : "page"}>
        {children}
      </main>
      <Footer />
    </div>
  );
}
