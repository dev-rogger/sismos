import { redirect } from "next/navigation";
import { auth } from "../../lib/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // NODE_ENV solo es "production" en builds/deploys reales (Vercel incluido);
  // en `next dev` local queda "development", así que esto nunca se salta el
  // check de rol en prod, pero evita necesitar sesión de admin para trabajar
  // en el panel localmente.
  if (process.env.NODE_ENV !== "production") {
    return <>{children}</>;
  }

  const session = await auth();
  if (!session || session.user.role !== "admin") {
    redirect("/");
  }
  return <>{children}</>;
}
