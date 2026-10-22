"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Check, Download, FileUp, HelpCircle, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { FIELDS, MAX_BYTES, type Kind, type Mapping } from "@/lib/import/fields";
import { Badge, Button, buttonClass, cn } from "@/components/ui";
import type { ImportAnswers, ImportQuestion } from "@/lib/import/house-rules";
import { applyImport, previewImport, type PreviewResult } from "./actions";

type Preview = Extract<PreviewResult, { ok: true }>;

const STEPS = ["Upload", "Match columns", "Preview", "Done"];
const ACTION_STYLE = {
  create: { label: "New", tone: "success" as const },
  update: { label: "Update", tone: "info" as const },
  unchanged: { label: "No change", tone: "neutral" as const },
  error: { label: "Error", tone: "danger" as const },
};
const NOUN: Record<Kind, [string, string]> = { rates: ["item", "items"], customers: ["customer", "customers"] };

export function ImportWizard({ kind }: { kind: Kind }) {
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [answers, setAnswers] = useState<ImportAnswers>({});
  const [filter, setFilter] = useState<"all" | "create" | "update" | "unchanged" | "error">("all");
  const [skipErrors, setSkipErrors] = useState(false);
  const [loading, startLoading] = useTransition();
  const [applying, startApply] = useTransition();
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [one, many] = NOUN[kind];

  const run = (f: { name: string; text: string }, m: Mapping | null, a: ImportAnswers = answers) =>
    startLoading(async () => {
      const res = await previewImport({ kind, filename: f.name, text: f.text, mapping: m, answers: a });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setPreview(res);
      setMapping(res.mapping);
      setSkipErrors(false);
    });

  const pick = async (f: File | undefined) => {
    if (!f) return;
    if (!/\.csv$/i.test(f.name) && f.type !== "text/csv") return void toast.error("Choose a .csv file. In Excel: File → Save As → CSV.");
    if (f.size > MAX_BYTES) return void toast.error("That file is over 2 MB. Split it into smaller files.");
    const loaded = { name: f.name, text: await f.text() };
    setFile(loaded);
    setPreview(null);
    setAnswers({});
    run(loaded, null, {});
  };

  // Re-check the preview whenever the column matching changes.
  const firstMapping = useRef(true);
  useEffect(() => {
    if (!file || !mapping) return;
    if (firstMapping.current) {
      firstMapping.current = false;
      return;
    }
    run(file, mapping);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(mapping)]);

  // Answers change the plan, so the preview is recalculated on the server.
  const firstAnswers = useRef(true);
  useEffect(() => {
    if (firstAnswers.current) {
      firstAnswers.current = false;
      return;
    }
    if (!file || !mapping) return;
    const id = setTimeout(() => run(file, mapping), 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(answers)]);

  const step = !file ? 0 : !preview || preview.missing.length ? 1 : 2;
  const s = preview?.summary;
  const importable = (s?.create ?? 0) + (s?.update ?? 0);
  const rows = useMemo(() => (preview?.rows ?? []).filter((r) => filter === "all" || r.action === filter), [preview, filter]);

  const apply = () =>
    startApply(async () => {
      const res = await applyImport({ kind, filename: file!.name, text: file!.text, mapping, answers });
      if (!res.ok) return void toast.error(res.error);
      toast.success(`Imported ${importable} ${importable === 1 ? one : many}`);
      router.push(`/app/imports/${res.batchId}`);
    });

  return (
    <div className="space-y-5">
      <ol className="flex flex-wrap items-center gap-2 text-[13px]" aria-label="Import steps">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                "grid size-6 place-items-center rounded-full text-xs font-medium ring-1",
                i < step ? "bg-brand text-white ring-brand" : i === step ? "bg-surface text-brand ring-brand" : "bg-sunken text-muted ring-line",
              )}
            >
              {i < step ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className={cn(i === step ? "font-medium text-ink" : "text-muted")}>{label}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-line-strong" aria-hidden />}
          </li>
        ))}
      </ol>

      {/* Step 1: upload */}
      {!file && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pick(e.dataTransfer.files[0]);
          }}
          className={cn(
            "card flex flex-col items-center px-6 py-14 text-center transition",
            dragging && "border-brand bg-brand-soft/40 ring-4 ring-brand/10",
          )}
        >
          <div className="mb-4 grid size-12 place-items-center rounded-xl bg-brand-soft">
            <FileUp className="size-5 text-brand" />
          </div>
          <h2 className="font-semibold">Drop a CSV file here</h2>
          <p className="mt-1 max-w-md text-sm text-muted">
            Up to 2 MB and 5,000 rows. Nothing is saved until you&apos;ve checked the preview. Columns are matched by their headings,
            and you can fix the matching on the next step.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button onClick={() => inputRef.current?.click()}>
              <Upload className="size-4" /> Choose file
            </Button>
            {/* A file download, not a page. */}
            <a href={`/app/imports/template/${kind}`} className={buttonClass("secondary")}>
              <Download className="size-4" /> Download template
            </a>
          </div>
          <input ref={inputRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} aria-label="CSV file" />
        </div>
      )}

      {file && (
        <div className="card flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
          <FileUp className="size-4 text-muted" />
          <span className="font-medium">{file.name}</span>
          {preview && <span className="text-muted num">{preview.summary.total} rows</span>}
          {loading && <Loader2 className="size-4 animate-spin text-muted" />}
          <button
            type="button"
            className={buttonClass("ghost", "sm", "ml-auto")}
            onClick={() => {
              setFile(null);
              setPreview(null);
              setMapping(null);
              firstMapping.current = true;
            }}
          >
            <ArrowLeft className="size-3.5" /> Choose a different file
          </button>
        </div>
      )}

      {/* Step 2: match columns */}
      {preview && mapping && (
        <section className="card">
          <header className="border-b border-line/70 px-5 py-3.5">
            <h2 className="text-sm font-semibold">Match columns</h2>
            <p className="text-[13px] text-muted">Which column in your file holds each field? Columns you don&apos;t match are ignored.</p>
          </header>
          <div className="grid gap-x-6 gap-y-3 p-5 sm:grid-cols-2">
            {FIELDS[kind].map((f) => {
              const idx = mapping[f.key];
              const sample = idx == null ? null : preview.sample.map((r) => r[idx]).filter(Boolean).slice(0, 2).join(" · ");
              return (
                <div key={f.key}>
                  <label className="label" htmlFor={`map-${f.key}`}>
                    {f.label} {f.required && <span className="text-red-600">*</span>}
                  </label>
                  <select
                    id={`map-${f.key}`}
                    className={cn("input", f.required && idx == null && "border-red-300")}
                    value={idx ?? ""}
                    onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value === "" ? null : Number(e.target.value) })}
                    disabled={loading}
                  >
                    <option value="">Not in this file</option>
                    {preview.headers.map((h, i) => (
                      <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                    ))}
                  </select>
                  {sample && <p className="mt-1 truncate text-xs text-muted">e.g. {sample}</p>}
                </div>
              );
            })}
          </div>
          {preview.missing.length > 0 && (
            <p className="border-t border-line/70 px-5 py-3 text-sm text-red-700">Match {preview.missing.join(", ")} to continue.</p>
          )}
        </section>
      )}

      {/* Questions the file can't answer by itself */}
      {preview && preview.missing.length === 0 && preview.questions.length > 0 && (
        <Questions
          questions={preview.questions}
          answers={answers}
          onAnswer={(id, a) =>
            setAnswers((cur) => {
              const next = { ...cur };
              if (a === undefined) delete next[id];
              else next[id] = a;
              return next;
            })
          }
        />
      )}

      {/* Step 3: preview */}
      {preview && preview.missing.length === 0 && s && (
        <section className="card overflow-hidden">
          <header className="flex flex-wrap items-center gap-2 border-b border-line/70 px-4 py-3">
            {(["all", "create", "update", "unchanged", "error"] as const).map((a) => {
              const n = a === "all" ? s.total : s[a];
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => setFilter(a)}
                  className={cn(
                    "rounded-full px-3 py-1 text-[13px] ring-1 transition",
                    filter === a ? "bg-ink text-white ring-ink" : "bg-surface text-ink-2 ring-line hover:bg-sunken",
                  )}
                >
                  {a === "all" ? "All" : ACTION_STYLE[a].label} <span className="num opacity-70">{n}</span>
                </button>
              );
            })}
          </header>
          <div className="max-h-[32rem] overflow-auto">
            <table className="w-full min-w-[680px]">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="th w-16">Line</th>
                  <th className="th w-28">Result</th>
                  <th className="th">{kind === "rates" ? "Item" : "Customer"}</th>
                  <th className="th">What will happen</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.line}-${r.key}`} className={cn(r.action === "error" && "bg-red-50/40")}>
                    <td className="td text-xs text-muted num">{r.line}</td>
                    <td className="td"><Badge tone={ACTION_STYLE[r.action].tone}>{ACTION_STYLE[r.action].label}</Badge></td>
                    <td className="td">
                      <div className={cn("font-medium", kind === "rates" && "font-mono text-xs")}>{r.key}</div>
                      {r.label && <div className="text-[13px] text-muted">{r.label}</div>}
                    </td>
                    <td className="td text-[13px]">
                      {r.errors.map((e) => <div key={e} className="text-red-700">{e}</div>)}
                      {r.changes.map((c) => <div key={c} className="text-ink-2">{c}</div>)}
                      {r.warnings.map((w) => <div key={w} className="text-amber-800">{w}</div>)}
                      {r.action === "create" && !r.warnings.length && <span className="text-muted">Will be added</span>}
                      {r.action === "unchanged" && !r.warnings.length && <span className="text-muted">Already up to date</span>}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="td py-8 text-center text-muted">No rows in this group.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <footer className="flex flex-wrap items-center gap-4 border-t border-line/70 bg-sunken/40 px-4 py-3">
            {s.error > 0 && (
              <label className="flex items-center gap-2 text-sm text-ink-2">
                <input type="checkbox" checked={skipErrors} onChange={(e) => setSkipErrors(e.target.checked)} className="accent-(--color-brand)" />
                <AlertTriangle className="size-4 text-amber-600" />
                Skip the {s.error} row{s.error === 1 ? "" : "s"} with errors and import the rest
              </label>
            )}
            {preview.truncated && <span className="text-sm text-amber-800">Only the first 5,000 rows are read.</span>}
            <Button className="ml-auto" onClick={apply} disabled={applying || loading || importable === 0 || (s.error > 0 && !skipErrors)}>
              {applying ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              {importable === 0 ? "Nothing to import" : `Import ${importable} ${importable === 1 ? one : many}`}
            </Button>
          </footer>
        </section>
      )}
    </div>
  );
}

function Questions({
  questions,
  answers,
  onAnswer,
}: {
  questions: ImportQuestion[];
  answers: ImportAnswers;
  onAnswer: (id: string, a: ImportAnswers[string] | undefined) => void;
}) {
  const open = questions.filter((q) => answers[q.id] === undefined).length;
  return (
    <section className="card">
      <header className="flex flex-wrap items-center gap-2 border-b border-line/70 px-5 py-3.5">
        <HelpCircle className="size-4 text-brand" />
        <h2 className="text-sm font-semibold">Questions about this file</h2>
        <Badge tone={open ? "warning" : "success"}>{open ? `${open} to answer` : "All answered"}</Badge>
        <p className="basis-full text-[13px] text-muted">
          The file doesn&apos;t say, so we won&apos;t guess. Your answers are applied in this import. Anything left unanswered is
          imported the safe way and can be set on the item later.
        </p>
      </header>
      <ul className="divide-y divide-line/70">
        {questions.map((q) => (
          <li key={q.id} className="px-5 py-4 text-sm">
            {q.kind === "load_size" ? (
              <LoadQuestion q={q} answer={answers[q.id]} onAnswer={(a) => onAnswer(q.id, a)} />
            ) : (
              <IncludedQuestion q={q} answer={answers[q.id]} onAnswer={(a) => onAnswer(q.id, a)} />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function LoadQuestion({
  q,
  answer,
  onAnswer,
}: {
  q: Extract<ImportQuestion, { kind: "load_size" }>;
  answer: ImportAnswers[string] | undefined;
  onAnswer: (a: number | "listed" | undefined) => void;
}) {
  const [choice, setChoice] = useState<"load" | "listed" | "later">(typeof answer === "number" ? "load" : answer === "listed" ? "listed" : "later");
  const [size, setSize] = useState(typeof answer === "number" ? String(answer) : "");
  const pick = (c: typeof choice, s = size) => {
    setChoice(c);
    const n = Number(s);
    onAnswer(c === "listed" ? "listed" : c === "load" && n > 0 && n <= 1000 ? n : undefined);
  };
  return (
    <fieldset>
      <legend className="mb-2">
        <span className="font-mono text-xs font-medium">{q.code}</span> {q.item}: the note says &ldquo;{q.note}&rdquo;. How is it priced?
      </legend>
      <div className="space-y-1.5">
        <label className="flex flex-wrap items-center gap-2">
          <input type="radio" name={q.id} checked={choice === "load"} onChange={() => pick("load")} className="accent-(--color-brand)" />
          Per load. One load holds
          <input
            className="input h-8 w-20 num"
            type="number"
            min="0"
            step="0.5"
            inputMode="decimal"
            aria-label="Cubic metres in one load"
            value={size}
            onChange={(e) => {
              setSize(e.target.value);
              pick("load", e.target.value);
            }}
            placeholder="6"
          />
          m³, and a part load is charged as a full load.
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name={q.id} checked={choice === "listed"} onChange={() => pick("listed")} className="accent-(--color-brand)" />
          As listed in the file
        </label>
        <label className="flex items-center gap-2 text-muted">
          <input type="radio" name={q.id} checked={choice === "later"} onChange={() => pick("later")} className="accent-(--color-brand)" />
          Decide later (not used on quotes until someone sets it)
        </label>
      </div>
    </fieldset>
  );
}

function IncludedQuestion({
  q,
  answer,
  onAnswer,
}: {
  q: Extract<ImportQuestion, { kind: "also_included_in" }>;
  answer: ImportAnswers[string] | undefined;
  onAnswer: (a: string[]) => void;
}) {
  const picked = Array.isArray(answer) ? answer : [];
  return (
    <fieldset>
      <legend className="mb-2">
        <span className="font-mono text-xs font-medium">{q.code}</span> {q.item} is included in {q.parent}. Is it also included in these
        similar items? Ticked items never have it charged alongside them.
      </legend>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        {q.options.map((o) => (
          <label key={o.code} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={picked.includes(o.code)}
              onChange={(e) => onAnswer(e.target.checked ? [...picked, o.code] : picked.filter((c) => c !== o.code))}
              className="accent-(--color-brand)"
            />
            <span className="font-mono text-xs">{o.code}</span> {o.item}
          </label>
        ))}
        {answer === undefined && (
          <button type="button" className={buttonClass("ghost", "sm")} onClick={() => onAnswer([])}>
            None of these
          </button>
        )}
      </div>
    </fieldset>
  );
}
