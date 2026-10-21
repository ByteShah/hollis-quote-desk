import { addressKey, normEmail, normPhone, surname } from "@/lib/import/customers";

// Deterministic customer lookup. No AI: matching a person to their history
// and payment terms is a database question, and a wrong guess is costly.

export type CustomerRecord = {
  id: string;
  name: string;
  company_name: string | null;
  emails: string[];
  phones: string[];
  address: string | null;
  notes: string | null;
  invoice_email: string | null;
  payment_terms: string | null;
};

export type CustomerMatch = {
  customer_id: string;
  name: string;
  confidence: "high" | "medium";
  reasons: string[];
};

export function senderEmail(enquiry: string): string | null {
  const from = enquiry.match(/^from:.*$/im)?.[0] ?? "";
  const m = (from || enquiry).match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/);
  return m ? normEmail(m[0]) : null;
}

export function matchCustomer(enquiry: string, customers: CustomerRecord[]): CustomerMatch[] {
  const email = senderEmail(enquiry);
  const text = enquiry.toLowerCase();
  const phones = new Set((enquiry.match(/(\+?44|0)[\d\s]{9,13}\d/g) ?? []).map(normPhone));
  const fromLine = enquiry.match(/^from:\s*([^<\n]+)/im)?.[1]?.trim().toLowerCase() ?? "";

  const results: CustomerMatch[] = [];
  for (const c of customers) {
    const reasons: string[] = [];
    let high = false;
    if (email && c.emails.includes(email)) {
      reasons.push(`sender email ${email} is on file`);
      high = true;
    }
    if (c.phones.some((p) => phones.has(normPhone(p)))) {
      reasons.push("phone number on file");
      high = true;
    }
    // Surname alone in the body is too weak ("Linda Price" vs "price needed"),
    // so a name hit needs the From line or the full name.
    const sn = surname(c.name);
    const nameHit = (sn.length > 2 && fromLine.includes(sn)) || text.includes(c.name.toLowerCase());
    const ak = c.address ? addressKey(c.address) : null;
    const addrHit = !!ak && text.includes(ak.split(" ").slice(0, 2).join(" "));
    if (nameHit) reasons.push(`name "${c.name}" mentioned`);
    if (addrHit) reasons.push(`address "${c.address}" mentioned`);
    const companyHit = c.company_name && text.includes(c.company_name.toLowerCase());
    if (companyHit) reasons.push(`company "${c.company_name}" mentioned`);

    if (high || (nameHit && (addrHit || companyHit))) {
      results.push({ customer_id: c.id, name: c.name, confidence: high ? "high" : "medium", reasons });
    } else if (companyHit) {
      results.push({ customer_id: c.id, name: c.name, confidence: "medium", reasons });
    }
  }
  return results.sort((a, b) => (a.confidence === b.confidence ? b.reasons.length - a.reasons.length : a.confidence === "high" ? -1 : 1));
}
