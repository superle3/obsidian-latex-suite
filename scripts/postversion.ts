import { execSync } from "child_process";



const tagOutput = execSync("git tag --sort=-version:refname ").toString().trim();
const tags = tagOutput.split("\n").filter(tag => /^\d+\.\d+\.\d+$/.test(tag));
const latestTag = tags[0];
function exec(command: string) {
	console.log(`> ${command}`);
	execSync(command, { stdio: "inherit" });
}
exec("npm ci");
// exec("git push ");
// const upstream = process.env.GITHUB_UPSTREAM_REPO ?? "upstream"
// exec(`git push ${upstream} ${latestTag}`);

