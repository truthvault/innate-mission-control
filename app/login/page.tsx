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
    <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(210,174,109,0.18),transparent_34%),#f8f5ee] px-4">
      <form
        action={login}
        className="bg-[#fffdf9] rounded-2xl shadow-[0_18px_60px_rgba(44,37,32,0.10)] border border-[#d2ae6d]/30 p-8 w-full max-w-sm space-y-5"
      >
        <div className="text-center space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#d2ae6d]/35 bg-[#24201c] shadow-sm" aria-hidden="true">
            <div className="relative h-9 w-9 overflow-hidden rounded-xl border border-[#d2ae6d]/25 bg-white/10">
              <span className="absolute left-1 top-2 h-2 w-6 -rotate-12 rounded-full bg-[#b46b46] shadow-sm" />
              <span className="absolute left-2 top-4 h-2 w-6 -rotate-12 rounded-full bg-[#d2ae6d] shadow-sm" />
              <span className="absolute left-3 top-6 h-2 w-6 -rotate-12 rounded-full bg-[#6e8a6a] shadow-sm" />
              <span className="absolute right-1 top-1.5 h-1.5 w-1.5 rounded-full bg-[#4f7f59]" />
            </div>
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#81766c]">Innate</p>
            <h1 className="mt-1 font-bold text-3xl tracking-[-0.04em] text-[#2c2520]">Tuesday</h1>
          </div>
        </div>
        {error && (
          <p className="text-red-500 text-sm text-center">Wrong password. Try again.</p>
        )}
        <input
          type="password"
          name="password"
          placeholder="Password"
          autoFocus
          required
          autoComplete="current-password"
          className="w-full px-3 py-3 rounded-xl border border-[#2c2520]/10 bg-white text-sm text-[#2c2520] focus:outline-none focus:ring-2 focus:ring-[#d2ae6d]/35"
        />
        <button
          type="submit"
          className="w-full py-3 rounded-xl bg-[#d2ae6d] text-[#24201c] text-sm font-black hover:bg-[#c49e57] transition-colors shadow-sm"
        >
          Enter
        </button>
      </form>
    </div>
  );
}
