/// <reference types="wdio-obsidian-service" />
/// <reference types="@wdio/globals/types" />
/// <reference types="@wdio/mocha-framework" />
import * as path from "path"

// Clear NODE_OPTIONS to prevent "NODE_OPTIONS have been disabled in this app" error
// when launching Obsidian (which runs on Chromium with NODE_OPTIONS disabled)
delete process.env.NODE_OPTIONS

export const config: WebdriverIO.Config = {
    runner: 'local',
    framework: 'mocha',
    specs: ['./test/specs/**/*.e2e.ts'],
    // How many instances of Obsidian should be launched in parallel
    maxInstances: 1,

    capabilities: [{
        browserName: 'obsidian',
        // obsidian app version to download
        browserVersion: "latest",
        'wdio:obsidianOptions': {
            // obsidian installer version
            // (see "Obsidian App vs Installer Versions" below)
            installerVersion: "earliest",
            plugins: ["."],
            // If you need to switch between multiple vaults, you can omit
            // this and use reloadObsidian to open vaults during the tests
            vault: "test/vaults/simple",
        },
    }],

    services: ["obsidian"],
    // You can use any wdio reporter, but they show the Chromium version
    // instead of the Obsidian version. obsidian reporter just wraps
    // spec reporter to show the Obsidian version.
    reporters: ['obsidian'],

    // wdio-obsidian-service will download Obsidian versions into this directory
    cacheDir: path.resolve(".obsidian-cache"),
    mochaOpts: {
        ui: 'bdd',
        timeout: 60000,
		fullTrace: true,
		
        // You can set mocha settings like "retries" and "bail"
    },
    logLevel: "warn",
}
