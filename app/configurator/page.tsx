'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

type Owner = 'Guido' | 'Dylan';
type Lane = 'Now' | 'Next' | 'Later' | 'Blocked / Decisions';
type Priority = 'High' | 'Medium' | 'Low';
type Tone = 'stone' | 'amber' | 'green' | 'red' | 'charcoal';

type ChecklistItem = {
  id: string;
  label: string;
  why: string;
  done: boolean;
};

type Milestone = {
  id: string;
  title: string;
  eyebrow: string;
  description: string;
  checklist: ChecklistItem[];
};

type PersonTask = {
  id: string;
  owner: Owner;
  title: string;
  why: string;
  how: string;
  done: boolean;
  priority: Priority;
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
  next: string;
};

const milestones: Milestone[] = [
  {
    id: 'mission-control',
    title: 'Visual mission control',
    eyebrow: 'Dashboard',
    description: 'A beautiful control board Guido can actually use, not another markdown crypt full of TODO bones.',
    checklist: [
      {
        id: 'dashboard-route',
        label: 'Create the /configurator dashboard route',
        why: 'Gives the project a home everyone can open from anywhere.',
        done: true,
      },
      {
        id: 'dashboard-live',
        label: 'Deploy dashboard to Vercel',
        why: 'Lets Dylan and Guido use the same visual plan without new software.',
        done: true,
      },
      {
        id: 'dynamic-progress',
        label: 'Make progress update when tasks are ticked',
        why: 'Turns the dashboard from a poster into a living control surface.',
        done: true,
      },
    ],
  },
  {
    id: 'asset-pipeline',
    title: '3D asset pipeline',
    eyebrow: 'Current bottleneck',
    description: 'Get clean, small, web-ready table assets with sane naming, dimensions, screenshots, and export notes.',
    checklist: [
      {
        id: 'crossroads-validated',
        label: 'Totara Crossroads GLB validates and renders',
        why: 'Proves the first model is healthy enough to prototype with.',
        done: true,
      },
      {
        id: 'crossroads-optimized',
        label: 'Optimisation test completed: 4.93 MB → 54 KB',
        why: 'Shows web performance is manageable if the export/texture pipeline is controlled.',
        done: true,
      },
      {
        id: 'reverse-angled-export',
        label: 'Reverse Angled Steel model/export prepared',
        why: 'Creates the second key frame style and avoids fake timber variants before photos exist.',
        done: false,
      },
      {
        id: 'asset-export-notes',
        label: 'Repeatable asset export settings documented',
        why: 'Prevents every new model becoming a bespoke little chaos potato.',
        done: false,
      },
    ],
  },
  {
    id: 'configurator-prototype',
    title: 'Configurator prototype',
    eyebrow: 'Next build',
    description: 'One real dining table configurator: adjustable length, one finish, quote CTA, and no Shopify-cart theatre yet.',
    checklist: [
      {
        id: 'hero-product',
        label: 'Confirm first hero product',
        why: 'Keeps the prototype focused enough to ship.',
        done: false,
      },
      {
        id: 'length-pricing',
        label: 'Confirm length/pricing increments',
        why: 'Lets the configurator feel commercially real instead of like a pretty toy.',
        done: false,
      },
      {
        id: 'r3f-prototype',
        label: 'Prototype procedural tabletop + GLB frame',
        why: 'This is the cleanest route to genuine adjustable length in-browser.',
        done: false,
      },
    ],
  },
  {
    id: 'lead-gen-page',
    title: 'Lead-gen table page',
    eyebrow: 'Website direction',
    description: 'A guided custom-table page that captures serious enquiries, rather than dumping people into a product grid.',
    checklist: [
      {
        id: 'cta-copy',
        label: 'Draft lead-form-first CTA copy',
        why: 'Clarifies the customer action: start a custom quote, not buy a generic SKU.',
        done: false,
      },
      {
        id: 'proof-assets',
        label: 'Gather photos, reviews, and provenance proof',
        why: 'Trust and timber story are the moat. The configurator cannot carry the page alone.',
        done: false,
      },
      {
        id: 'shopify-later',
        label: 'Park Shopify/cart integration for later',
        why: 'Avoids overbuilding before the lead-gen flow proves itself.',
        done: true,
      },
    ],
  },
];

const personTasks: PersonTask[] = [
  {
    id: 'guido-product-choice',
    owner: 'Guido',
    title: 'Choose the first public configurator product',
    why: 'The build needs one hero path. Choice paralysis is not a business model, sadly.',
    how: 'Pick Totara Crossroads for brand impact, or Reverse Angled Steel if you want the most commercially common option first.',
    done: false,
    priority: 'High',
  },
  {
    id: 'guido-pricing',
    owner: 'Guido',
    title: 'Confirm length and pricing logic',
    why: 'The configurator needs to answer “roughly what does this cost?” or it becomes decorative furniture cosplay.',
    how: 'Write min, max, default length, increments, and either a price formula or price bands.',
    done: false,
    priority: 'High',
  },
  {
    id: 'guido-cta',
    owner: 'Guido',
    title: 'Approve the primary CTA',
    why: 'The first page should generate leads, not pretend custom dining tables are one-click commodities.',
    how: 'Use “Start custom quote” as primary unless you strongly prefer “Book a design chat”.',
    done: true,
    priority: 'Medium',
  },
  {
    id: 'guido-proof',
    owner: 'Guido',
    title: 'Pick 3–5 proof assets',
    why: 'Beautiful 3D without trust proof is just a shiny screensaver.',
    how: 'Find one hero photo, one close-up, one customer home shot, one strong review, and one timber/provenance image if available.',
    done: false,
    priority: 'Medium',
  },
  {
    id: 'dylan-model',
    owner: 'Dylan',
    title: 'Model/clean Reverse Angled Steel frame',
    why: 'This is the most useful second leg style while timber texture photos are still missing.',
    how: 'Create or clean the frame/table model using real proportions. Do not spend the afternoon inventing timber variants from vibes.',
    done: false,
    priority: 'High',
  },
  {
    id: 'dylan-naming',
    owner: 'Dylan',
    title: 'Use web-friendly object names',
    why: 'Clean names make future code/configuration easier and stop the GLB becoming haunted spaghetti.',
    how: 'Use names like table_top, table_sides, frame_reverse_angled_steel, feet.',
    done: false,
    priority: 'High',
  },
  {
    id: 'dylan-dimensions',
    owner: 'Dylan',
    title: 'Record real dimensions and frame rules',
    why: 'The configurator needs actual dimensions to scale length properly and not lie to customers.',
    how: 'Record default length, width, height, top thickness, frame dimensions, frame position from ends, and whether frame position changes with length.',
    done: false,
    priority: 'High',
  },
  {
    id: 'dylan-export',
    owner: 'Dylan',
    title: 'Export GLB and screenshots',
    why: 'Hermes can inspect, validate, optimise, and wire the asset only once there is a clean export.',
    how: 'Export Reverse_Angled_Steel_MASTER.glb and WEB.glb, plus front, side, underside/frame, and top screenshots.',
    done: false,
    priority: 'Medium',
  },
];

const boardTasks: BoardTask[] = [
  {
    title: 'This afternoon: Guido + Dylan task columns',
    description: 'Ticking tasks updates personal and overall progress. Local state for now; shared persistence can come next.',
    owner: 'Hermes',
    lane: 'Now',
    priority: 'High',
  },
  {
    title: 'Reverse Angled Steel asset',
    description: 'Dylan creates the second frame style with clean object names, dimensions, screenshots, and GLB export notes.',
    owner: 'Dylan',
    lane: 'Now',
    priority: 'High',
  },
  {
    title: 'Length + pricing truth',
    description: 'Guido confirms min/max/default lengths, increments, and rough price logic for the MVP.',
    owner: 'Guido',
    lane: 'Now',
    priority: 'High',
  },
  {
    title: 'Prototype 3D configurator',
    description: 'Build procedural tabletop + GLB frame/base with a length slider, estimate, and quote CTA.',
    owner: 'Hermes / Qwen / Codex',
    lane: 'Next',
    priority: 'High',
  },
  {
    title: 'Timber variants',
    description: 'Park until better timber photography/textures exist. Otherwise we are painting the dragon before owning a horse.',
    owner: 'Dylan',
    lane: 'Later',
    priority: 'Low',
  },
  {
    title: 'Shared task persistence',
    description: 'If Guido and Dylan need shared live checkboxes, add a tiny database/API next. Current ticks are browser-local.',
    owner: 'Decision',
    lane: 'Blocked / Decisions',
    priority: 'Medium',
  },
];

const decisions: Decision[] = [
  {
    title: 'Lead-form-first, not Shopify cart-first',
    chosen: 'Start custom quote',
    why: 'Custom tables need sizing, finish guidance, and trust. A quote flow matches the sale better than a generic cart.',
    next: 'Use CTA copy and capture enough detail for a useful sales follow-up.',
  },
  {
    title: 'Procedural tabletop + GLB frame/base',
    chosen: 'Hybrid 3D approach',
    why: 'A GLB alone is not parametric. Procedural tabletop geometry lets length change properly while reusing Dylan’s frame assets.',
    next: 'Prototype one length slider with a real frame model and repeatable timber texture behaviour.',
  },
  {
    title: 'Reverse Angled Steel next',
    chosen: 'Dylan works on the frame, not more timbers',
    why: 'Other timber variants are blocked by missing photos/textures. A second leg style is useful immediately.',
    next: 'Export clean GLB + source file + screenshots + dimensions.',
  },
];

const assetFacts = [
  ['Original GLB', '4.93 MB'],
  ['Validation', 'Clean — no errors/warnings'],
  ['Browser render', 'Renders in model-viewer'],
  ['Optimised test', '54 KB GLB'],
  ['Geometry', 'Very lightweight'],
  ['Main issue', 'Texture/export pipeline'],
];

const laneStyles: Record<Lane, string> = {
  Now: 'border-[#b7791f] bg-[#fff7e6]',
  Next: 'border-[#4b3b2f] bg-[#f8f2e8]',
  Later: 'border-stone-300 bg-[#f6f1e8]',
  'Blocked / Decisions': 'border-[#9f4438] bg-[#fbebe5]',
};

function percent(done: number, total: number) {
  if (total === 0) return 0;
  return Math.round((done / total) * 100);
}

function keyFor(id: string) {
  return `configurator-dashboard:${id}`;
}

function Pill({ children, tone = 'stone' }: { children: ReactNode; tone?: Tone }) {
  const tones: Record<Tone, string> = {
    stone: 'bg-stone-200 text-stone-800',
    amber: 'bg-[#f2c36b] text-[#332113]',
    green: 'bg-emerald-200 text-emerald-950',
    red: 'bg-red-200 text-red-950',
    charcoal: 'bg-[#231c18] text-[#f7ead2]',
  };

  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${tones[tone]}`}>{children}</span>;
}

function ProgressBar({ value, large = false }: { value: number; large?: boolean }) {
  return (
    <div className={`overflow-hidden rounded-full bg-[#d9c8ad] ${large ? 'h-4' : 'h-2.5'}`}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-[#8b5a2b] via-[#c48a3a] to-[#e7bd6d] transition-all duration-500 ease-out"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function CheckboxCard({
  id,
  title,
  why,
  how,
  checked,
  priority,
  onToggle,
}: {
  id: string;
  title: string;
  why: string;
  how?: string;
  checked: boolean;
  priority?: Priority;
  onToggle: (id: string) => void;
}) {
  return (
    <label
      className={`group block cursor-pointer rounded-3xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl ${
        checked ? 'border-[#d9c8ad] bg-[#f5ead7]' : 'border-[#e6d8c2] bg-white/90'
      }`}
    >
      <div className="flex items-start gap-4">
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onToggle(id)}
          className="mt-1 h-5 w-5 rounded border-[#8b5a2b] text-[#8b5a2b] focus:ring-[#c48a3a]"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className={`text-base font-black ${checked ? 'text-stone-500 line-through' : 'text-[#241b16]'}`}>{title}</h4>
            {priority ? <Pill tone={priority === 'High' ? 'red' : priority === 'Medium' ? 'amber' : 'stone'}>{priority}</Pill> : null}
          </div>
          <p className="mt-3 text-sm leading-6 text-stone-700">
            <span className="font-black text-[#6f4320]">Why: </span>
            {why}
          </p>
          {how ? (
            <p className="mt-2 text-sm leading-6 text-stone-700">
              <span className="font-black text-[#6f4320]">How: </span>
              {how}
            </p>
          ) : null}
        </div>
      </div>
    </label>
  );
}

export default function ConfiguratorDashboard() {
  const [checkedOverrides, setCheckedOverrides] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {};

    const saved = window.localStorage.getItem('innate-configurator-dashboard-checks');
    if (!saved) return {};

    try {
      return JSON.parse(saved) as Record<string, boolean>;
    } catch {
      window.localStorage.removeItem('innate-configurator-dashboard-checks');
      return {};
    }
  });
  const lanes = useMemo<Lane[]>(() => ['Now', 'Next', 'Later', 'Blocked / Decisions'], []);

  useEffect(() => {
    window.localStorage.setItem('innate-configurator-dashboard-checks', JSON.stringify(checkedOverrides));
  }, [checkedOverrides]);

  function isChecked(id: string, defaultValue: boolean) {
    return checkedOverrides[keyFor(id)] ?? defaultValue;
  }

  function toggle(id: string) {
    setCheckedOverrides((current) => {
      const fullKey = keyFor(id);
      const defaultValue = [...milestones.flatMap((milestone) => milestone.checklist), ...personTasks].find((item) => item.id === id)?.done ?? false;
      return { ...current, [fullKey]: !(current[fullKey] ?? defaultValue) };
    });
  }

  const milestoneProgress = milestones.map((milestone) => {
    const completed = milestone.checklist.filter((item) => isChecked(item.id, item.done)).length;
    return { ...milestone, completed, total: milestone.checklist.length, progress: percent(completed, milestone.checklist.length) };
  });

  const people = (['Guido', 'Dylan'] as Owner[]).map((owner) => {
    const tasks = personTasks.filter((task) => task.owner === owner);
    const completed = tasks.filter((task) => isChecked(task.id, task.done)).length;
    return { owner, tasks, completed, total: tasks.length, progress: percent(completed, tasks.length) };
  });

  const allProgressItems = [
    ...milestones.flatMap((milestone) => milestone.checklist),
    ...personTasks,
  ];
  const completedOverall = allProgressItems.filter((item) => isChecked(item.id, item.done)).length;
  const overallProgress = percent(completedOverall, allProgressItems.length);
  const nextUp = personTasks.filter((task) => !isChecked(task.id, task.done) && task.priority === 'High').slice(0, 3);

  return (
    <main className="min-h-screen bg-[#f3eadc] text-[#241b16]">
      <section className="relative overflow-hidden border-b border-[#d1b98f] bg-[#1f1712] text-[#f8ead5]">
        <div className="absolute inset-0 opacity-25 [background:radial-gradient(circle_at_20%_15%,#a66a2d,transparent_32%),radial-gradient(circle_at_78%_0%,#e0af58,transparent_28%),linear-gradient(135deg,#1f1712,#3a281d_55%,#17100d)]" />
        <div className="relative mx-auto flex max-w-7xl flex-col gap-10 px-6 py-12 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-4xl">
            <div className="mb-5 flex flex-wrap gap-2">
              <Pill tone="amber">Innate Mission Control</Pill>
              <Pill tone="green">Live dashboard</Pill>
              <Pill tone="charcoal">Dining table configurator</Pill>
            </div>
            <p className="mb-3 text-sm font-bold uppercase tracking-[0.35em] text-[#e0b15b]">Clear next actions · real assets · lead-gen first</p>
            <h1 className="text-4xl font-black tracking-tight md:text-7xl">Build the configurator without losing the plot.</h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-[#e7d2b7]">
              A warm little command centre for the table configurator: what matters next, why it matters, who owns it, and how close we are.
            </p>
          </div>
          <div className="w-full rounded-[2rem] border border-[#7c5734] bg-[#2b2018]/90 p-6 shadow-2xl lg:max-w-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.25em] text-[#d1a65a]">Overall progress</p>
                <p className="mt-2 text-6xl font-black text-[#f3c66f]">{overallProgress}%</p>
              </div>
              <Pill tone="amber">{completedOverall}/{allProgressItems.length}</Pill>
            </div>
            <div className="mt-5">
              <ProgressBar value={overallProgress} large />
            </div>
            <p className="mt-4 text-sm leading-6 text-[#e7d2b7]">Ticks update this number instantly and save on this browser. Shared Guido/Dylan syncing is the next upgrade if useful.</p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-10 px-6 py-10">
        <section className="grid gap-4 md:grid-cols-4">
          {[
            ['Core strategy', 'Lead-gen first'],
            ['Hero asset', 'Totara Crossroads'],
            ['Dylan focus', 'Reverse Angled Steel'],
            ['Tech bet', 'Procedural top + GLB frame'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-3xl border border-[#e0cfb4] bg-white/80 p-5 shadow-sm backdrop-blur">
              <p className="text-sm font-bold uppercase tracking-wide text-[#876334]">{label}</p>
              <p className="mt-2 text-xl font-black text-[#241b16]">{value}</p>
            </div>
          ))}
        </section>

        <section className="rounded-[2rem] border border-[#d8c3a0] bg-[#fffaf1] p-6 shadow-sm">
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.25em] text-[#9a6a2e]">This afternoon</p>
              <h2 className="mt-2 text-3xl font-black md:text-4xl">Two clear lanes: Guido and Dylan</h2>
              <p className="mt-3 max-w-3xl text-stone-700">Tick these as you go. Each column has its own progress, and every tick contributes to the overall project progress.</p>
            </div>
            <Pill tone="amber">Next best work, not busywork</Pill>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {people.map((person) => (
              <article key={person.owner} className="rounded-[2rem] border border-[#e0cfb4] bg-[#f7efe2] p-5 shadow-inner">
                <div className="mb-5 flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-2xl font-black">{person.owner}</h3>
                    <p className="mt-1 text-sm font-semibold text-stone-600">
                      {person.owner === 'Guido' ? 'Decisions, pricing, proof, sales truth.' : '3D asset pipeline and clean Reverse Angled Steel export.'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-black text-[#8b5a2b]">{person.progress}%</p>
                    <p className="text-xs font-bold uppercase text-stone-500">{person.completed}/{person.total} done</p>
                  </div>
                </div>
                <ProgressBar value={person.progress} />
                <div className="mt-5 space-y-4">
                  {person.tasks.map((task) => (
                    <CheckboxCard
                      key={task.id}
                      id={task.id}
                      title={task.title}
                      why={task.why}
                      how={task.how}
                      priority={task.priority}
                      checked={isChecked(task.id, task.done)}
                      onToggle={toggle}
                    />
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <article className="self-start rounded-[2rem] border border-[#d8c3a0] bg-[#241b16] p-6 text-[#f8ead5] shadow-xl">
            <p className="text-sm font-black uppercase tracking-[0.25em] text-[#e0b15b]">Do next</p>
            <h2 className="mt-2 text-3xl font-black">The current choke points</h2>
            <div className="mt-6 space-y-4">
              {nextUp.map((task) => (
                <div key={task.id} className="rounded-3xl border border-[#6b4a2f] bg-[#34261c] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-black">{task.title}</h3>
                    <Pill tone="amber">{task.owner}</Pill>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[#e7d2b7]">{task.how}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-[2rem] border border-[#d8c3a0] bg-white/85 p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.25em] text-[#9a6a2e]">Milestones</p>
                <h2 className="mt-2 text-3xl font-black">Plan progress</h2>
              </div>
              <Pill tone="charcoal">Calculated live</Pill>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              {milestoneProgress.map((milestone) => (
                <article key={milestone.id} className="rounded-3xl border border-[#e0cfb4] bg-[#fffaf1] p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-[#9a6a2e]">{milestone.eyebrow}</p>
                      <h3 className="mt-2 text-xl font-black">{milestone.title}</h3>
                    </div>
                    <p className="text-2xl font-black text-[#8b5a2b]">{milestone.progress}%</p>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-stone-700">{milestone.description}</p>
                  <div className="mt-4">
                    <ProgressBar value={milestone.progress} />
                  </div>
                  <p className="mt-2 text-xs font-bold uppercase text-stone-500">{milestone.completed}/{milestone.total} complete</p>
                  <div className="mt-5 space-y-3">
                    {milestone.checklist.map((item) => (
                      <CheckboxCard
                        key={item.id}
                        id={item.id}
                        title={item.label}
                        why={item.why}
                        checked={isChecked(item.id, item.done)}
                        onToggle={toggle}
                      />
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </article>
        </section>

        <section>
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-3xl font-black">Kanban board</h2>
            <Pill tone="stone">Planning view</Pill>
          </div>
          <div className="grid gap-5 xl:grid-cols-4">
            {lanes.map((lane) => (
              <div key={lane} className={`rounded-[2rem] border-t-4 p-4 shadow-sm ${laneStyles[lane]}`}>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-black">{lane}</h3>
                  <Pill>{boardTasks.filter((task) => task.lane === lane).length}</Pill>
                </div>
                <div className="space-y-4">
                  {boardTasks
                    .filter((task) => task.lane === lane)
                    .map((task) => (
                      <article key={task.title} className="rounded-3xl border border-[#e0cfb4] bg-white/90 p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <h4 className="font-black">{task.title}</h4>
                          <Pill tone={task.priority === 'High' ? 'red' : task.priority === 'Medium' ? 'amber' : 'stone'}>{task.priority}</Pill>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-stone-700">{task.description}</p>
                        <p className="mt-4 text-xs font-bold uppercase tracking-wide text-stone-500">Owner: {task.owner}</p>
                      </article>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_1.25fr]">
          <article className="rounded-[2rem] border border-[#d8c3a0] bg-white/85 p-6 shadow-sm">
            <p className="text-sm font-black uppercase tracking-[0.25em] text-[#9a6a2e]">Asset health</p>
            <h2 className="mt-2 text-3xl font-black">Totara Crossroads GLB</h2>
            <p className="mt-3 text-sm leading-6 text-stone-700">
              The first model is healthy enough to prototype with. Production risk is the repeatable texture/export pipeline, not polygon count.
            </p>
            <dl className="mt-6 grid gap-3 sm:grid-cols-2">
              {assetFacts.map(([label, value]) => (
                <div key={label} className="rounded-3xl bg-[#f3eadc] p-4">
                  <dt className="text-xs font-bold uppercase tracking-wide text-[#876334]">{label}</dt>
                  <dd className="mt-1 font-black text-[#241b16]">{value}</dd>
                </div>
              ))}
            </dl>
          </article>

          <article className="rounded-[2rem] border border-[#d8c3a0] bg-white/85 p-6 shadow-sm">
            <p className="text-sm font-black uppercase tracking-[0.25em] text-[#9a6a2e]">Decisions</p>
            <h2 className="mt-2 text-3xl font-black">What is decided</h2>
            <div className="mt-5 space-y-5">
              {decisions.map((decision) => (
                <div key={decision.title} className="rounded-3xl border border-[#e0cfb4] bg-[#fffaf1] p-5">
                  <h3 className="font-black">{decision.title}</h3>
                  <p className="mt-2 text-sm font-bold text-emerald-800">Chosen: {decision.chosen}</p>
                  <p className="mt-2 text-sm leading-6 text-stone-700">{decision.why}</p>
                  <p className="mt-3 text-sm leading-6 text-[#6f4320]"><span className="font-black">Next: </span>{decision.next}</p>
                </div>
              ))}
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
