import { getTenant } from "@/lib/tenant";
import { csvResponse, toCsv } from "@/lib/csv";

const TEMPLATES = {
  rates: {
    headers: ["Code", "Item", "Category", "Unit", "Price ex VAT", "Status", "Notes", "Price starts on"],
    rows: [
      ["BP01", "Block paving supply & lay", "Block paving", "m2", "62.00", "active", "charcoal or brindle", ""],
      ["KB01", "Edging kerb on concrete haunch", "Kerbs & edging", "m", "28.00", "active", "", "01/03/2027"],
      ["TM03", "Resin bound 18mm", "Tarmac & resin", "m2", "", "price on request", "ask Dave", ""],
    ],
  },
  customers: {
    headers: ["Name", "Company", "Email", "Phone", "Address", "Postcode", "Invoice email", "Payment terms", "Tags", "Notes"],
    rows: [
      ["Jane Smith", "", "jane@example.com", "07700 900000", "1 High Street, Walsall", "WS1 1AA", "", "", "", "Front drive 2025"],
      ["Mark Jones", "Jones Lettings", "mark@jones.example", "0121 496 0000", "Unit 2, Park Road", "", "accounts@jones.example", "30 days", "landlord", ""],
    ],
  },
};

export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const t = await getTenant();
  if (!t.can("data.import")) return new Response("Not allowed", { status: 403 });
  const tpl = TEMPLATES[kind as keyof typeof TEMPLATES];
  if (!tpl) return new Response("Not found", { status: 404 });
  return csvResponse(`${kind}-template.csv`, toCsv(tpl.headers, tpl.rows));
}
