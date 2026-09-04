import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { DEMO_PASSWORD } from "@/lib/seed";
import { StaffLoginForm } from "@/components/StaffLoginForm";

export const dynamic = "force-dynamic";

export default async function StaffLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const session = await getSession();
  if (session?.kind === "staff") redirect(next || "/ops");

  return (
    <StaffLoginForm
      next={next || "/ops"}
      demoPassword={process.env.NODE_ENV === "production" ? null : DEMO_PASSWORD}
    />
  );
}
