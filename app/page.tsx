import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { redirect } from "next/navigation";
import Dashboard from "@/components/Dashboard";
import AccountSelector from "@/components/AccountSelector";

// Force dynamic rendering - disable caching
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  const resolvedSearchParams = await searchParams;
  const customerId = resolvedSearchParams?.customerId as string | undefined;

  // If user has 'all' access or specific ID selected, show Dashboard
  // Or if they have restricted access but selected one
  const allowedIds = session.user.allowedCustomerIds || [];
  const isAdmin = session.user.role === 'admin';

  // If a specific customer is selected, OR if admin is viewing "all" (no customerId param implies aggregate or selector? 
  // Let's assume if no customerId, we force selection unless there is only 1 allowed account)

  if (customerId) {
    // Validate access again (already done in API, but good for UI to not show partial dashboard)
    if (!isAdmin && !allowedIds.includes('*') && !allowedIds.includes(customerId)) {
      return <div className="p-10 text-center text-red-500">Access Denied to this Account</div>;
    }
    return <Dashboard customerId={customerId} />;
  }

  // If no customerId, check if we need to show selector or auto-redirect
  if (!isAdmin && allowedIds.length === 1) {
    // If only 1 account, auto-redirect while preserving other params
    const params = new URLSearchParams();
    Object.entries(resolvedSearchParams || {}).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach(v => params.append(key, v));
      } else if (value) {
        params.append(key, value);
      }
    });
    params.set('customerId', allowedIds[0]);
    redirect(`/?${params.toString()}`);
  }

  // Show Selector
  return <AccountSelector allowedIds={allowedIds} role={session.user.role} />;
}
