'use client';

import { useMemo, useState } from 'react';

type Status = 'done' | 'active' | 'next' | 'blocked';
type Lane = 'Now' | 'Next' | 'Later' | 'Blocked / Decisions';
type Priority = 'High' | 'Medium' | 'Low';

type Milestone = {
  title: string;
  description: string;
  status: Status;
  progress: number;
  checklist: { label: string; done: boolean }[];
};

type BoardTask = {
  title: string;
  description: string;
  owner: string;
  lane: Lane;
  priority: Priority;
};

type Decision = {
  title: string;
  chosen: string;
  why: string;
  alternatives: string[];
};

const milestones: Milestone[] = [
  {
    title: 'Visual mission control',
    description: 'Replace the cave-wall markdown dashboard with a lightweight visual dashboard inside this Vercel app.',
    status: 'active',
    progress: 70,
    checklist: [
      { label: 'Create /configurator dashboard route', done: true },
      { label: 'Ground the board in real GLB/project facts', done: true },
      { label: 'Review locally before deploy or push', done: false },
    ],
  },
  {
    title: '3D asset pipeline',
    description: 'Turn Dylan’s product models into small, clean, web-ready GLBs we can inspect and reuse.',
    status: 'active',
    progress: 45,
    checklist: [
      { label: 'Totara Crossroads GLB validates and renders', done: true },
      { label: 'Optimisation test completed', done: true },
      { label: 'Reverse Angled Steel model/export prepared', done: false },
      { label: 'Repeatable export naming/settings documented', done: false },
    ],
  },
  {
    title: 'Configurator prototype',
    description: 'Build one working dining table configurator: one product, length slider, price estimate, quote CTA.',
    status: 'next',
    progress: 15,
    checklist: [
      { label: 'Confirm first hero product', done: false },
      { label: 'Confirm length/pricing increments', done: false },
      { label: 'Prototype procedural tabletop + GLB frame', done: false },
    ],
  },
  {
    title: 'Lead-gen dining table page',
    description: 'Move from passive Shopify browsing toward guided quote generation for custom dining tables.',
    status: 'next',
    progress: 10,
    checklist: [
      { label: 'Draft lead-form-first CTA copy', done: false },
      { label: 'Add proof/reviews/provenance content', done: false },
      { label: 'Decide how this plugs into Shopify later', done: false },
    ],
  },
];

const boardTasks: BoardTask[] = [
  {
    title: 'Review this dashboard draft',
    description: 'Check the page visually, tighten data, then decide whether it is useful enough to keep improving.',
    owner: 'Hermes',
    lane: 'Now',
    priority: 'High',
  },
  {
    title: 'Reverse Angled Steel asset',
    description: 'Dylan creates/cleans a second frame style with sensible object names, real dimensions, screenshots, and GLB export notes.',
    owner: 'Dylan',
    lane: 'Now',
    priority: 'High',
  },
  {
    title: 'Length + pricing truth',
    description: 'Confirm min/max/default lengths, increments, and rough price logic so the prototype can feel commercially real.',
    owner: 'Guido',
    lane: 'Now',
    priority: 'High',
  },
  {
    title: 'Prototype 3D configurator',
    description: 'Use a procedural tabletop plus imported GLB frame/base. Start with one timber/finish and one quote CTA.',
    owner: 'Hermes / Qwen / Codex',
    lane: 'Next',
    priority: 'High',
  },
  {
    title: 'Gather page proof',
    description: 'Pull the best table photo, close-up, customer home shot, review, and timber/provenance image for the first landing page.',
    owner: 'Guido',
    lane: 'Next',
    priority: 'Medium',
  },
  {
    title: 'Model timber variants',
    description: 'Do this after better timber photography/textures exist. No point manufacturing fake choices too early.',
    owner: 'Dylan',
    lane: 'Later',
    priority: 'Low',
  },
  {
    title: 'Shopify/cart integration',
    description: 'Defer until lead-form-first flow proves useful. The MVP should collect serious enquiries, not pretend every table is off-the-shelf.',
    owner: 'Later',
    lane: 'Later',
    priority: 'Low',
  },
  {
    title: 'Parametric browser behaviour',
    description: 'A GLB alone is not parametric. Need to choose controlled mesh scaling or procedural geometry before promising configurable length.',
    owner: 'Decision',
    lane: 'Blocked / Decisions',
    priority: 'High',
  },
  {
    title: 'Timber texture library',
    description: 'Other timber variants are blocked until usable photos/PBR-ish texture references exist.',
    owner: 'Blocked',
    lane: 'Blocked / Decisions',
    priority: 'Medium',
  },
];

const decisions: Decision[] = [
  {
    title: 'Sales flow',
    chosen: 'Lead-form-first, not Shopify cart-first',
    why: 'Custom dining tables need conversation, sizing, finish guidance, and trust. Quote capture is the first commercial win.',
    alternatives: ['Direct checkout', 'Traditional product grid only'],
  },
  {
    title: '3D approach',
    chosen: 'Procedural tabletop + GLB frame/base',
    why: 'Length can change cleanly in code without pretending a static GLB magically became parametric.',
    alternatives: ['Scale entire GLB', 'Fully procedural everything'],
  },
  {
    title: 'Next model focus',
    chosen: 'Reverse Angled Steel frame',
    why: 'More useful today than timber variants because the other timber photos/textures are not ready yet.',
    alternatives: ['More timber variants now', 'Wait for perfect asset library'],
  },
];

const responsibilities = [
  {
    name: 'Dylan',
    initial: 'D',
    role: '3D asset pipeline',
    items: ['Reverse Angled Steel model/export', 'Clean object naming', 'Real dimensions + screenshots', 'Export notes for repeatability'],
  },
  {
    name: 'Guido',
    initial: 'G',
    role: 'Product + sales truth',
    items: ['First product decision', 'Length/pricing rules', 'Best images/reviews/proof', 'CTA and lead-form judgement'],
  },
  {
    name: 'Hermes / Qwen / Codex',
    initial: 'H',
    role: 'Code + verification goblins',
    items: ['Dashboard implementation', 'GLB inspection/optimisation', 'Configurator prototype', 'Review before deploy/push'],
  },
];

const assetFacts = [
  ['Original GLB', '4.93 MB'],
  ['Validation', 'Clean — no errors/warnings'],
  ['Browser render', 'Renders in model-viewer'],
  ['Optimised test', '54 KB GLB'],
  ['Geometry', 'Very lightweight'],
  ['Main issue', 'Texture pipeline and repeatable exports'],
];

const laneStyles: Record<Lane, string> = {
  Now: 'border-amber-500 bg-amber-50',
  Next: 'border-stone-500 bg-stone-50',
  Later: 'border-zinc-300 bg-zinc-50',
  'Blocked / Decisions': 'border-red-500 bg-red-50',
};

const statusCopy: Record<Status, string> = {
  done: 'Done',
  active: 'Active',
  next: 'Next',
  blocked: 'Blocked',
};

function Pill({ children, tone = 'stone' }: { children: React.ReactNode; tone?: 'stone' | 'amber' | 'green' | 'red' }) {
  const tones = {
    stone: 'bg-stone-200 text-stone-800',
    amber: 'bg-amber-200 text-amber-950',
    green: 'bg-emerald-200 text-emerald-950',
    red: 'bg-red-200 text-red-950',
  };

  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="mt-4 h-2 overflow-hidden rounded-full bg-stone-200">
      <div className="h-full rounded-full bg-amber-700" style={{ width: `${value}%` }} />
    </div>
  );
}

export default function ConfiguratorDashboard() {
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

  const lanes = useMemo<Lane[]>(() => ['Now', 'Next', 'Later', 'Blocked / Decisions'], []);
  const averageProgress = Math.round(milestones.reduce((total, milestone) => total + milestone.progress, 0) / milestones.length);

  function toggleChecklist(milestoneTitle: string, itemLabel: string, defaultValue: boolean) {
    const key = `${milestoneTitle}:${itemLabel}`;
    setCheckedItems((current) => ({ ...current, [key]: !(current[key] ?? defaultValue) }));
  }

  return (
    <main className="min-h-screen bg-[#f5f1e8] text-stone-950">
      <section className="border-b border-stone-300 bg-stone-950 text-stone-50">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-10 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-4 flex flex-wrap gap-2">
              <Pill tone="amber">Innate Mission Control</Pill>
              <Pill tone="green">Dashboard v1</Pill>
              <Pill>Local draft — not deployed</Pill>
            </div>
            <h1 className="max-w-4xl text-4xl font-black tracking-tight md:text-6xl">Dining table configurator</h1>
            <p className="mt-4 max-w-3xl text-lg text-stone-300">
              One hero table, one real configurator, one lead-gen page. No monday.com shrine. No fake ten-product sprawl.
            </p>
          </div>
          <div className="rounded-2xl border border-stone-700 bg-stone-900 p-5 shadow-2xl">
            <p className="text-sm uppercase tracking-[0.25em] text-stone-400">Overall progress</p>
            <p className="mt-2 text-5xl font-black text-amber-400">{averageProgress}%</p>
            <ProgressBar value={averageProgress} />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-10 px-6 py-10">
        <section className="grid gap-4 md:grid-cols-4">
          {[
            ['Core strategy', 'Lead-gen first'],
            ['Hero asset', 'Totara Crossroads'],
            ['Next asset', 'Reverse Angled Steel'],
            ['Tech bet', 'Procedural top + GLB frame'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-stone-500">{label}</p>
              <p className="mt-2 text-xl font-black text-stone-950">{value}</p>
            </div>
          ))}
        </section>

        <section>
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-2xl font-black">Milestones</h2>
            <Pill tone="amber">Current bottleneck: asset pipeline + pricing truth</Pill>
          </div>
          <div className="grid gap-5 lg:grid-cols-4">
            {milestones.map((milestone) => (
              <article key={milestone.title} className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg font-black">{milestone.title}</h3>
                  <Pill tone={milestone.status === 'active' ? 'amber' : milestone.status === 'done' ? 'green' : 'stone'}>{statusCopy[milestone.status]}</Pill>
                </div>
                <p className="mt-3 text-sm leading-6 text-stone-600">{milestone.description}</p>
                <ProgressBar value={milestone.progress} />
                <p className="mt-2 text-xs font-semibold text-stone-500">{milestone.progress}% complete</p>
                <div className="mt-5 space-y-3">
                  {milestone.checklist.map((item) => {
                    const key = `${milestone.title}:${item.label}`;
                    const checked = checkedItems[key] ?? item.done;
                    return (
                      <label key={item.label} className="flex gap-3 text-sm text-stone-700">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleChecklist(milestone.title, item.label, item.done)}
                          className="mt-1 h-4 w-4 rounded border-stone-400 text-amber-700"
                        />
                        <span className={checked ? 'text-stone-400 line-through' : ''}>{item.label}</span>
                      </label>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-5 text-2xl font-black">Kanban board</h2>
          <div className="grid gap-5 xl:grid-cols-4">
            {lanes.map((lane) => (
              <div key={lane} className={`rounded-3xl border-t-4 p-4 shadow-sm ${laneStyles[lane]}`}>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-black">{lane}</h3>
                  <Pill>{boardTasks.filter((task) => task.lane === lane).length}</Pill>
                </div>
                <div className="space-y-4">
                  {boardTasks
                    .filter((task) => task.lane === lane)
                    .map((task) => (
                      <article key={task.title} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <h4 className="font-black">{task.title}</h4>
                          <Pill tone={task.priority === 'High' ? 'red' : task.priority === 'Medium' ? 'amber' : 'stone'}>{task.priority}</Pill>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-stone-600">{task.description}</p>
                        <p className="mt-4 text-xs font-bold uppercase tracking-wide text-stone-500">Owner: {task.owner}</p>
                      </article>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          {responsibilities.map((person) => (
            <article key={person.name} className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-950 text-xl font-black text-amber-300">{person.initial}</div>
                <div>
                  <h3 className="text-xl font-black">{person.name}</h3>
                  <p className="text-sm font-semibold text-stone-500">{person.role}</p>
                </div>
              </div>
              <ul className="mt-6 space-y-3 text-sm text-stone-700">
                {person.items.map((item) => (
                  <li key={item} className="flex gap-3">
                    <span className="font-black text-amber-700">→</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_1.25fr]">
          <article className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-black">Totara Crossroads GLB status</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              The first model is healthy enough to prototype with. The main production risk is getting a repeatable texture/export pipeline, not polygon count.
            </p>
            <dl className="mt-6 grid gap-3 sm:grid-cols-2">
              {assetFacts.map(([label, value]) => (
                <div key={label} className="rounded-2xl bg-stone-100 p-4">
                  <dt className="text-xs font-bold uppercase tracking-wide text-stone-500">{label}</dt>
                  <dd className="mt-1 font-black text-stone-950">{value}</dd>
                </div>
              ))}
            </dl>
          </article>

          <article className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-black">Key decisions</h2>
            <div className="mt-5 space-y-5">
              {decisions.map((decision) => (
                <div key={decision.title} className="rounded-2xl border border-stone-200 bg-[#fbfaf7] p-5">
                  <h3 className="font-black">{decision.title}</h3>
                  <p className="mt-2 text-sm font-bold text-emerald-800">Chosen: {decision.chosen}</p>
                  <p className="mt-2 text-sm leading-6 text-stone-600">{decision.why}</p>
                  <p className="mt-3 text-xs font-semibold text-stone-500">Alternatives parked: {decision.alternatives.join(' / ')}</p>
                </div>
              ))}
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
