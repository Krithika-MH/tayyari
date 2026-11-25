import { getRepository } from "@/lib/db/repository";
import { seedDemoEvent } from "@/lib/seed-data";

async function main() {
  const repo = getRepository();
  const { event, members, expenses } = await seedDemoEvent(repo);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  console.log(`Seeded event: ${event.name} (${event.id})`);
  console.log(`Repo kind: ${repo.kind}`);
  console.log(`Expenses: ${expenses.length}`);
  console.log("Member links:");
  for (const m of members) {
    console.log(
      `  - ${m.display_name} (${m.role}, can_see_amounts=${m.can_see_amounts}): ${baseUrl}/e/${event.id}?t=${m.access_token}`
    );
  }
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
