import { remote } from "./micro";
async function seed() {
  for (const [i, name] of ["Alice", "Bruno", "Carla"].entries())
    await remote(
      "ledger",
      "/internal/accounts",
      "POST",
      { name },
      "00000000-0000-4000-8000-00000000000" + (i + 1),
    );
  console.log("Demo accounts funded exactly once.");
}
seed().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
