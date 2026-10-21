// Import field definitions and limits. Kept apart from the engine so the
// browser can use them without bundling the CSV parser.

export const MAX_BYTES = 2 * 1024 * 1024;
export const MAX_ROWS = 5000;

export type Kind = "rates" | "customers";

export type FieldDef = { key: string; label: string; required?: boolean; synonyms: string[] };

export const FIELDS: Record<Kind, FieldDef[]> = {
  rates: [
    { key: "code", label: "Code", required: true, synonyms: ["code", "item code", "sku", "ref", "reference"] },
    { key: "item", label: "Item", required: true, synonyms: ["item", "description", "name", "product", "service"] },
    { key: "unit", label: "Unit", required: true, synonyms: ["unit", "uom", "units", "per"] },
    { key: "price", label: "Price ex VAT", synonyms: ["rate", "price", "price ex vat", "cost", "£", "amount", "unit price"] },
    { key: "category", label: "Category", synonyms: ["category", "group", "section", "type"] },
    { key: "status", label: "Status", synonyms: ["status", "active", "state"] },
    { key: "notes", label: "Notes", synonyms: ["notes", "note", "comments", "comment", "remarks"] },
    { key: "effective_from", label: "Price starts on", synonyms: ["effective from", "effective", "from", "start date", "price from", "valid from"] },
  ],
  customers: [
    { key: "name", label: "Name", required: true, synonyms: ["name", "customer", "contact", "full name", "customer name"] },
    { key: "company", label: "Company", synonyms: ["company", "business", "organisation", "organization", "firm"] },
    { key: "email", label: "Email", synonyms: ["email", "e-mail", "email address", "mail"] },
    { key: "phone", label: "Phone", synonyms: ["phone", "telephone", "tel", "mobile", "phone number"] },
    { key: "address", label: "Address", synonyms: ["address", "street", "address 1", "site address"] },
    { key: "postcode", label: "Postcode", synonyms: ["postcode", "post code", "zip", "postal code"] },
    { key: "invoice_email", label: "Invoice email", synonyms: ["invoice email", "billing email", "accounts email"] },
    { key: "payment_terms", label: "Payment terms", synonyms: ["payment terms", "terms"] },
    { key: "tags", label: "Tags", synonyms: ["tags", "tag", "labels", "type"] },
    { key: "notes", label: "Notes", synonyms: ["notes", "note", "comments", "comment"] },
  ],
};

export type Mapping = Record<string, number | null>;
