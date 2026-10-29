/** Invented sample rows for the demo, three organizations' worth. Reset puts them back. */
export interface Client {
  [key: string]: unknown;
  id: string;
  org_id: string;
  name: string;
  email: string;
  status: "lead" | "active" | "paused" | "ended";
  plan: string;
  joined_on: string;
  notes: string | null;
}

export interface Booking {
  [key: string]: unknown;
  id: string;
  org_id: string;
  client_id: string;
  title: string;
  starts_on: string;
  status: "booked" | "done" | "cancelled";
}

const NAMES: Record<string, string[]> = {
  harbor: ["Juniper Coffee Co.", "Brightline Bikes", "Oakfield Library", "Nova Dental", "Tidewater Books", "Lumen Labs"],
  summit: ["Ari Patel", "Dana Brooks", "Elif Kaya", "Marco Silva", "Noor Haddad", "Sam Whitley", "Tomás Reyes"],
  maple: ["Unit 2A · Grace Liu", "Unit 3B · Owen Price", "Unit 4C · Priya Nair", "Unit 5A · Leo Martin", "Unit 6D · Ines Duarte"],
};
const PLANS: Record<string, string[]> = { harbor: ["Retainer", "Project"], summit: ["Unlimited", "10-class pack"], maple: ["12-month lease", "Month to month"] };
const BOOKINGS: Record<string, string[]> = {
  harbor: ["Brand workshop", "Website review", "Logo presentation"],
  summit: ["Strength class", "Personal training", "Mobility session"],
  maple: ["Viewing", "Maintenance visit", "Lease renewal"],
};
const STATUSES: Client["status"][] = ["active", "active", "lead", "active", "paused", "ended", "active"];

function day(offset: number): string {
  const d = new Date(Date.UTC(2026, 9, 1) + offset * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export function seedClients(): Client[] {
  return Object.entries(NAMES).flatMap(([org, names]) =>
    names.map((name, i) => ({
      id: `${org}-c${i + 1}`,
      org_id: org,
      name,
      email: `${name.toLowerCase().replace(/^unit \w+ · /, "").replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "")}@example.com`,
      status: STATUSES[i % STATUSES.length]!,
      plan: PLANS[org]![i % 2]!,
      joined_on: day(-30 * (i + 1)),
      notes: i === 0 ? "Prefers email. Renewal due next quarter." : null,
    })),
  );
}

export function seedBookings(): Booking[] {
  return Object.entries(NAMES).flatMap(([org, names]) =>
    names.flatMap((_, i) =>
      [0, 1].map((k) => ({
        id: `${org}-b${i + 1}-${k}`,
        org_id: org,
        client_id: `${org}-c${i + 1}`,
        title: BOOKINGS[org]![(i + k) % 3]!,
        starts_on: day(i * 2 + k * 5 - 4),
        status: (k === 0 && i % 3 === 0 ? "done" : i % 5 === 4 ? "cancelled" : "booked") as Booking["status"],
      })),
    ),
  );
}
