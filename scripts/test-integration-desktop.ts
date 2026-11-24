/// <reference types="node" />
import { spawnSync } from "child_process";

async function main() {
	const version = "public-latest";
	const result = spawnSync(
		"npx",
		["vitest", "run"],
		{
			env: { ...process.env, OBSIDIAN_VERSION: version, OBSIDIAN_INSTALLER_VERSION: version },
			shell: true,
			stdio: "inherit",
		},
	);
	if (result.status !== 0) {
		throw new Error(`Exit code ${String(result.status)}`);
	}
}

main()
