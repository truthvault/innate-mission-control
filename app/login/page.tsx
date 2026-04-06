import { cookies } from "next/headers";
import { redirect } from "next/navigation";

async function login(formData: FormData) {
  "use server";
  const password = formData.get("password") as string;
  if (password === process.env.SITE_PASSWORD) {
    (await cookies()).set("innate-auth", "authenticated", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
    redirect("/");
  } else {
    redirect("/login?error=1");
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5]">
      <form
        action={login}
        className="bg-white rounded-xl shadow-sm border border-black/5 p-8 w-full max-w-sm space-y-4"
      >
        <h1 className="font-semibold text-lg text-center">Mission Control</h1>
        {error && (
          <p className="text-red-500 text-sm text-center">Wrong password.</p>
        )}
        <input
          type="password"
          name="password"
          placeholder="Password"
          autoFocus
          required
          className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
        />
        <button
          type="submit"
          className="w-full py-2 rounded-lg bg-[#1a1a1a] text-white text-sm font-medium hover:bg-black transition-colors"
        >
          Enter
        </button>
      </form>
    </div>
  );
}
