import { getCanvas } from "./canvas/getCanvas.js";

process.loadEnvFile(new URL("../.env", import.meta.url));

getCanvas().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
