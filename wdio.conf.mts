/// <reference types="node" />
import path from "path"
import { parseObsidianVersions, obsidianBetaAvailable } from "wdio-obsidian-service";
import { env } from "process";

// wdio-obsidian-service will download Obsidian versions into this directory
const cacheDir = path.resolve(".obsidian-cache");

// choose Obsidian versions to test
let defaultVersions = "earliest/earliest latest/latest";
if (await obsidianBetaAvailable({cacheDir})) {
    defaultVersions += " latest-beta/latest"
}
const desktopVersions = await parseObsidianVersions(
    env.OBSIDIAN_VERSIONS ?? defaultVersions,
    {cacheDir},
);
const mobileVersions = await parseObsidianVersions(
    env.OBSIDIAN_MOBILE_VERSIONS ?? env.OBSIDIAN_VERSIONS ?? defaultVersions,
    {cacheDir},
);
if (env.CI) {
    // Print the resolved Obsidian versions to use as the workflow cache key
    // (see .github/workflows/test.yaml)
    console.log("obsidian-cache-key:", JSON.stringify([desktopVersions, mobileVersions]));
}
