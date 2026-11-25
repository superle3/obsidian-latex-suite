import { execSync } from "child_process";

function exec(command: string) {
	console.log(`> ${command}`);
	execSync(command, { stdio: "inherit" });
}

exec(
	"npm install obsidian-integration-testing@latest eslint-plugin-obsidianmd@latest obsidian-typings@latest obsidian@latest",
);
