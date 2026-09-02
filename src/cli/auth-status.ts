import { probeCredentials, type GoogleService } from "../google/oauth.js";
import { loadEnvConfig } from "../config.js";

export async function runAuthStatusCommand(): Promise<number> {
  const env = loadEnvConfig();
  const services: GoogleService[] = ["gmail", "calendar"];

  console.log("Family Assistant Auth Status");
  console.log("============================");

  for (const service of services) {
    const probe = await probeCredentials(env, service);
    const status = probe.ok ? "OK" : probe.tokenPresent ? "FAIL" : "MISSING";
    console.log(`\n${service.toUpperCase()}: ${status}`);
    if (probe.expiresAt) {
      console.log(`  Token expires: ${probe.expiresAt}`);
    }
    if (probe.error) {
      console.log(`  ${probe.error}`);
    }
    if (!probe.tokenPresent) {
      console.log(`  Run: family-assistant auth ${service}`);
    }
  }

  const allOk = (
    await Promise.all(services.map((s) => probeCredentials(env, s)))
  ).every((p) => p.ok);

  return allOk ? 0 : 1;
}
