import { defineConfig } from "vitest/config";
import type {} from "obsidian-integration-testing/vitest/typings";

console.log("CI_DISABLE_SANDBOX ", process.env.CI_DISABLE_SANDBOX, " end");
export default defineConfig({
	test: {
		fileParallelism: false,
		globalSetup: [
			"obsidian-integration-testing/vitest-global-setup-plugin",
		],
		environmentOptions: {
			obsidianTransport: {
				type: "obsidian-cdp",
				obsidianVersion: process.env.OBSIDIAN_VERSION,
				obsidianInstallerVersion: process.env.OBSIDIAN_INSTALLER_VERSION,
				shouldDisableSandbox: process.env.CI_DISABLE_SANDBOX === "1",
			}
		}
	},
});
