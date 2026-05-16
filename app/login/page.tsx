import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE_MAX_AGE_SECONDS, AUTH_COOKIE_NAME, createAuthCookieValue } from "@/lib/tuesday/auth";

async function login(formData: FormData) {
  "use server";
  const password = formData.get("password") as string;
  if (password === process.env.SITE_PASSWORD) {
    (await cookies()).set(AUTH_COOKIE_NAME, await createAuthCookieValue(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
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
    <div className="min-h-screen flex items-center justify-center bg-[#f8f5ee]">
      <form
        action={login}
        className="bg-[#fffdf9] rounded-2xl shadow-sm border border-[#2c2520]/10 p-8 w-full max-w-sm space-y-4"
      >
        <div className="text-center space-y-1">
          <h1 className="font-bold text-2xl tracking-[-0.04em] text-[#2c2520]">Tuesday</h1>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#81766c]">by Innate</p>
        </div>
        {error && (
          <p className="text-red-500 text-sm text-center">Wrong password.</p>
        )}
        <input
          type="password"
          name="password"
          placeholder="Password"
          autoFocus
          required
          className="w-full px-3 py-2 rounded-xl border border-[#2c2520]/10 text-sm focus:outline-none focus:ring-2 focus:ring-[#4f5fa8]/25"
        />
        <button
          type="submit"
          className="w-full py-2 rounded-xl bg-[#4f5fa8] text-white text-sm font-semibold hover:bg-[#465493] transition-colors"
        >
          Enter
        </button>
      </form>
    </div>
  );
}
