import { revalidatePath } from "next/cache";
import { MissionControlShell } from "@/components/mission-control-shell";
import { listCategoryPricingPolicies, setCategoryPricingPolicyStatus } from "@/lib/quoting/policyStore";
import type { QuoteCategoryPolicy, QuotePolicyApprovalStatus } from "@/lib/quoting/categoryPolicies";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function updatePolicyStatus(formData: FormData) {
  "use server";
  const categoryKey = String(formData.get("categoryKey") || "");
  const status = String(formData.get("status") || "needs_review") as QuotePolicyApprovalStatus;
  await setCategoryPricingPolicyStatus(categoryKey, status, "Guido");
  revalidatePath("/quoting");
}

function statusClass(status: QuotePolicyApprovalStatus) {
  if (status === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "needs_review") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "archived") return "border-stone-200 bg-stone-100 text-stone-600";
  return "border-stone-200 bg-white text-stone-700";
}

function confidenceClass(confidence: QuoteCategoryPolicy["confidence"]) {
  if (confidence === "high") return "text-emerald-700";
  if (confidence === "medium") return "text-amber-700";
  return "text-red-700";
}

function formatStatus(status: QuotePolicyApprovalStatus) {
  return status.replace("_", " ");
}

function PolicyList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-[11px] font-black uppercase tracking-[0.14em] text-stone-500">{title}</h3>
      <ul className="space-y-1 text-sm leading-5 text-stone-700">
        {items.map((item) => <li key={item}>• {item}</li>)}
      </ul>
    </div>
  );
}

function PolicyCard({ policy, defaultOpen = false }: { policy: QuoteCategoryPolicy; defaultOpen?: boolean }) {
  const isApproved = policy.approvalStatus === "approved";
  return (
    <article className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-black tracking-[-0.02em] text-stone-900 sm:text-xl">{policy.categoryName}</h2>
            <span className={`rounded-full border px-2.5 py-1 text-xs font-bold capitalize ${statusClass(policy.approvalStatus)}`}>{formatStatus(policy.approvalStatus)}</span>
            <span className={`text-xs font-bold ${confidenceClass(policy.confidence)}`}>{policy.confidence} confidence</span>
          </div>
          <p className="max-w-4xl text-xs leading-5 text-stone-700 sm:text-sm sm:leading-6">{policy.pricingFormula}</p>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-2 lg:flex lg:flex-col xl:grid xl:grid-cols-2">
          <form action={updatePolicyStatus}>
            <input type="hidden" name="categoryKey" value={policy.categoryKey} />
            <input type="hidden" name="status" value="approved" />
            <button className="min-h-10 w-full rounded-md bg-[#24201c] px-3 py-2 text-sm font-bold text-white transition hover:bg-[#3a332d] disabled:cursor-not-allowed disabled:bg-stone-300" disabled={isApproved}>
              Approve
            </button>
          </form>
          <form action={updatePolicyStatus}>
            <input type="hidden" name="categoryKey" value={policy.categoryKey} />
            <input type="hidden" name="status" value="needs_review" />
            <button className="min-h-10 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-bold text-stone-800 transition hover:bg-stone-50">
              Needs review
            </button>
          </form>
        </div>
      </div>

      <details open={defaultOpen} className="mt-4 rounded-md border border-stone-100 bg-stone-50/70 p-3">
        <summary className="min-h-10 cursor-pointer py-3 text-xs font-black uppercase tracking-[0.12em] text-stone-600">Policy detail</summary>
        <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_1fr_1fr]">
          <PolicyList title="Cost stack" items={policy.costStack} />
          <PolicyList title="Required inputs" items={policy.requiredInputs} />
          <PolicyList title="Fresh-source rules" items={policy.freshSourceRequirements} />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <PolicyList title="Blockers" items={policy.blockerRules} />
          <PolicyList title="Customer-safe rules" items={policy.customerRules} />
        </div>

        <div className="mt-4 border-t border-stone-200 pt-4">
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr]">
            <div>
              <h3 className="text-[11px] font-black uppercase tracking-[0.14em] text-stone-500">Approval questions</h3>
              <p className="mt-1 text-sm leading-5 text-stone-700">{policy.approvalQuestions.join(" ")}</p>
            </div>
            <div>
              <h3 className="text-[11px] font-black uppercase tracking-[0.14em] text-stone-500">Website</h3>
              <p className="mt-1 text-sm leading-5 text-stone-700">{policy.websiteMigrationStatus}</p>
            </div>
            <div>
              <h3 className="text-[11px] font-black uppercase tracking-[0.14em] text-stone-500">Xero</h3>
              <p className="mt-1 text-sm leading-5 text-stone-700">{policy.xeroPolicy}</p>
            </div>
          </div>
          {policy.approvedAt && (
            <p className="mt-4 text-xs font-semibold text-emerald-700">Approved by {policy.approvedBy || "Guido"} on {new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", dateStyle: "medium", timeStyle: "short" }).format(new Date(policy.approvedAt))}</p>
          )}
        </div>
      </details>
    </article>
  );
}

export default async function QuotingPage() {
  const { policies, source, error } = await listCategoryPricingPolicies();
  const approved = policies.filter((policy) => policy.approvalStatus === "approved").length;
  const review = policies.filter((policy) => policy.approvalStatus === "needs_review").length;
  const draft = policies.filter((policy) => policy.approvalStatus === "draft").length;
  const firstOpenPolicyKey = policies.find((policy) => policy.approvalStatus !== "approved")?.categoryKey ?? policies[0]?.categoryKey;

  return (
    <MissionControlShell
      section="quoting"
      pageTitle="Quoting"
      pageSubtitle="Pricing policy approval board"
      syncedAt={new Date().toISOString()}
      source={source}
      mondayError={error}
      maxWidth={1280}
    >
      <div className="space-y-4 text-stone-900 sm:space-y-6">
        <header className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#9a7a3d]">Innate Quote Spine</p>
              <h1 className="mt-1 text-2xl font-black tracking-[-0.04em] text-stone-950 sm:text-3xl">Pricing logic approval board</h1>
              <p className="mt-2 max-w-3xl text-xs leading-5 text-stone-700 sm:text-sm sm:leading-6">
                This is the internal source Hermes should check before quoting. Approve a category only when the cost stack, freshness rules, blockers, and customer wording feel right.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center sm:min-w-[360px]">
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3"><div className="text-2xl font-black text-emerald-800">{approved}</div><div className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-700">Approved</div></div>
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3"><div className="text-2xl font-black text-amber-800">{review}</div><div className="text-xs font-bold uppercase tracking-[0.12em] text-amber-700">Review</div></div>
              <div className="rounded-md border border-stone-200 bg-stone-50 p-3"><div className="text-2xl font-black text-stone-800">{draft}</div><div className="text-xs font-bold uppercase tracking-[0.12em] text-stone-600">Draft</div></div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-stone-600">
            <span className="rounded-full bg-stone-100 px-3 py-1">Source: {source}</span>
            <span className="rounded-full bg-stone-100 px-3 py-1">Standard default: 50% gross margin</span>
            <span className="rounded-full bg-stone-100 px-3 py-1">Website pricing unchanged in V1</span>
            <span className="rounded-full bg-stone-100 px-3 py-1">Xero dry-run only</span>
          </div>
          {error && <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{error}</p>}
        </header>

        <details className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <summary className="min-h-10 cursor-pointer py-2 text-sm font-black text-stone-900">Approval rules and next pass</summary>
          <section className="mt-4 grid gap-4 lg:grid-cols-4">
            <div>
              <h2 className="text-sm font-black text-stone-900">How you use this</h2>
              <p className="mt-2 text-sm leading-6 text-stone-700">Read each category, mark it approved or needs review, then Hermes can treat approved policies as the operating rule.</p>
            </div>
            <div>
              <h2 className="text-sm font-black text-stone-900">What approval means</h2>
              <p className="mt-2 text-sm leading-6 text-stone-700">Approved means the logic is allowed for internal drafts. It still does not send quotes or write Xero without your approval.</p>
            </div>
            <div>
              <h2 className="text-sm font-black text-stone-900">What needs review means</h2>
              <p className="mt-2 text-sm leading-6 text-stone-700">Hermes can draft workings but must flag the category as unsettled and ask before relying on it.</p>
            </div>
            <div>
              <h2 className="text-sm font-black text-stone-900">Next useful pass</h2>
              <p className="mt-2 text-sm leading-6 text-stone-700">Replace draft assumptions with real supplier prices, calculator reconciliations, labour bands, and category-specific minimum profit.</p>
            </div>
          </section>
        </details>

        <section className="space-y-4">
          {policies.map((policy) => <PolicyCard key={policy.categoryKey} policy={policy} defaultOpen={policy.categoryKey === firstOpenPolicyKey} />)}
        </section>
      </div>
    </MissionControlShell>
  );
}
