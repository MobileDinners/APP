import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { DEMO_PHONE } from "@/lib/seed";
import { SignInForm } from "@/components/SignInForm";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const session = await getSession();
  if (session?.kind === "person") redirect(next || "/");

  return (
    <SignInForm
      next={next || "/"}
      demoPhone={process.env.NODE_ENV === "production" ? null : DEMO_PHONE}
    />
  );
}
