"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MailPlus, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonClass } from "@/components/ui";
import { Dialog } from "@/components/dialog";
import { CopyLink } from "@/app/app/settings/team/team-client";
import { createCompany, inviteOwner } from "./actions";

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

function LinkResult({ company, email, link, expiresAt, onDone }: { company: string; email: string; link: string; expiresAt: string; onDone: () => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-2">
        Send this link to <strong className="font-medium">{email}</strong>. They&apos;ll set a password and become the owner of {company}. It works once and
        expires on {new Date(expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}. It won&apos;t be shown again.
      </p>
      <CopyLink link={link} />
      <div className="flex justify-end">
        <Button onClick={onDone}>Done</Button>
      </div>
    </div>
  );
}

export function NewCompanyButton() {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: "", slug: "", owner_email: "", min_charge: "300", auto_quote_max_m2: "150" });
  const [slugEdited, setSlugEdited] = useState(false);
  const [result, setResult] = useState<{ link: string; expiresAt: string; company: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const close = () => {
    setOpen(false);
    setResult(null);
    setV({ name: "", slug: "", owner_email: "", min_charge: "300", auto_quote_max_m2: "150" });
    setSlugEdited(false);
  };
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" /> New company
      </Button>
      {open && (
        <Dialog title={result ? "Company created" : "New company"} description={result ? undefined : "The owner sets the rest up themselves: AI key, price list, customers and team."} onClose={() => !pending && close()} wide>
          {result ? (
            <LinkResult company={result.company} email={v.owner_email} link={result.link} expiresAt={result.expiresAt} onDone={close} />
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  const res = await createCompany(v);
                  if (!res.ok) return void toast.error(res.error);
                  setResult(res);
                  router.refresh();
                });
              }}
            >
              <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
                <div>
                  <label className="label" htmlFor="co-name">Company name</label>
                  <input id="co-name" className="input" required autoFocus value={v.name} onChange={(e) => setV({ ...v, name: e.target.value, slug: slugEdited ? v.slug : slugify(e.target.value) })} />
                </div>
                <div>
                  <label className="label" htmlFor="co-slug">Short name</label>
                  <input id="co-slug" className="input font-mono text-[13px]" required value={v.slug} onChange={(e) => { setSlugEdited(true); setV({ ...v, slug: e.target.value }); }} />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="co-owner">Owner&apos;s email</label>
                <input id="co-owner" className="input" type="email" required value={v.owner_email} onChange={(e) => setV({ ...v, owner_email: e.target.value })} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="co-min">Minimum charge (ex VAT)</label>
                  <input id="co-min" className="input num" type="number" min="0" step="0.01" required value={v.min_charge} onChange={(e) => setV({ ...v, min_charge: e.target.value })} />
                </div>
                <div>
                  <label className="label" htmlFor="co-m2">Site visit for jobs over (m²)</label>
                  <input id="co-m2" className="input num" type="number" min="1" required value={v.auto_quote_max_m2} onChange={(e) => setV({ ...v, auto_quote_max_m2: e.target.value })} />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={close} disabled={pending}>Cancel</Button>
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="size-4 animate-spin" />} Create and invite owner
                </Button>
              </div>
            </form>
          )}
        </Dialog>
      )}
    </>
  );
}

export function InviteOwnerButton({ companyId, company }: { companyId: string; company: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<{ link: string; expiresAt: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const close = () => {
    setOpen(false);
    setResult(null);
    setEmail("");
  };
  return (
    <>
      <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setOpen(true)}>
        <MailPlus className="size-3.5" /> Invite owner
      </button>
      {open && (
        <Dialog title={result ? "Send this link" : `Invite an owner to ${company}`} onClose={() => !pending && close()}>
          {result ? (
            <LinkResult company={company} email={email} link={result.link} expiresAt={result.expiresAt} onDone={close} />
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  const res = await inviteOwner(companyId, email);
                  if (!res.ok) return void toast.error(res.error);
                  setResult(res);
                  router.refresh();
                });
              }}
            >
              <div>
                <label className="label" htmlFor={`owner-${companyId}`}>Email</label>
                <input id={`owner-${companyId}`} type="email" required autoFocus className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={close} disabled={pending}>Cancel</Button>
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="size-4 animate-spin" />} Create invitation link
                </Button>
              </div>
            </form>
          )}
        </Dialog>
      )}
    </>
  );
}
