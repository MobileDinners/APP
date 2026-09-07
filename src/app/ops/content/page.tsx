import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  checkContentClaims,
  getSiteContent,
  isPlatformAdmin,
  siteContentMeta,
  storageIsDurable,
} from "@/lib/site-content";
import { ContentEditor } from "@/components/ContentEditor";

export const dynamic = "force-dynamic";

export default async function ContentPage() {
  const session = await getSession();
  if (session?.kind !== "staff") redirect("/staff/login?next=/ops/content");

  // notFound, not a 403: to anyone without the grant this page simply does not
  // exist, which is the same answer the API gives.
  if (!isPlatformAdmin(session.email)) notFound();

  const content = getSiteContent();

  return (
    <ContentEditor
      initial={content}
      meta={siteContentMeta()}
      claims={checkContentClaims(content)}
      staff={{ name: session.name, email: session.email }}
      durable={storageIsDurable()}
    />
  );
}
