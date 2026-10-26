export type SampleCustomer = { customer: string; kind: "exact" | "underpaid" | "topup" | "group"; passengers: number; amounts: number[] };
const names = ["Brian", "Grace", "Kevin", "Wanjiku", "Mercy", "David", "Faith", "John", "Amina", "Peter", "Sharon", "Samuel", "Joy", "Dennis", "Mary", "James", "Esther", "Alice", "Joseph", "Sarah", "Victor", "Diana", "Collins", "Ann", "Eric", "Lucy", "Daniel", "Ruth", "Kelvin", "Rose", "Steve", "Agnes", "Paul", "Naomi", "George", "Irene", "Moses", "Cynthia", "Isaac", "Lilian", "Alex", "Betty", "Felix", "Jane", "Martin", "Njeri", "Otieno", "Wambui", "Juma", "Hassan", "Fatuma", "Zainab", "Caroline", "Edwin", "Susan", "Patrick", "Beatrice", "Simon", "Gladys", "Michael"];
export function generateRideSamples(fareCents: number, count: number, random = Math.random): SampleCustomer[] {
  if (!Number.isInteger(count) || count < 4 || count > 30) throw new Error("Choose 4 to 30 paying customers.");
  if (!Number.isSafeInteger(fareCents) || fareCents < 2 || fareCents > 12500000) throw new Error("For a mixed simulation, set the fare between KSh 0.02 and KSh 125,000.");
  const shuffled = [...names];
  for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  const kinds = ["exact", "underpaid", "topup", "group"] as const;
  const result = Array.from({ length: count }, (_, i): SampleCustomer => {
    const kind = i < 4 ? kinds[i] : kinds[Math.floor(random() * 4)];
    const paid = Math.max(1, Math.min(fareCents - 1, Math.floor(fareCents * (0.4 + random() * 0.5))));
    const passengers = kind === "group" ? 2 + Math.floor(random() * (Math.min(10, Math.floor(25000000 / fareCents)) - 1)) : 1;
    const amounts = kind === "underpaid" ? [paid] : kind === "topup" ? [paid, fareCents - paid] : [fareCents * passengers];
    return { customer: shuffled[i], kind, passengers, amounts };
  });
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
