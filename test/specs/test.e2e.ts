import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { browser } from '@wdio/globals'
import TestPlugin from '../src/main';
describe('Test my plugin', function() {
    before(async function() {
        // You can create test vaults and open them with reloadObsidian
        // Alternatively if all your tests use the same vault, you can
        // set the default vault in the wdio.conf.mts.
        // await browser.reloadObsidian({vault: "./test/vaults/simple"});
    })
    it('test command open-sample-modal-simple', async () => {
		const obs_page = await browser.getObsidianPage()
		
		await obs_page.enablePlugin("obsidian-latex-suite")
		await getConsoleLogs(browser);
		const res: string | null = await browser.executeObsidian(async (obs) => {
			// close all tabs
			await obs.app.workspace.getLeavesOfType("markdown").forEach(leaf => leaf.detach());
			// open empty.md and make sure its empty
			await obs.app.workspace.openLinkText("", "empty.md");
			//@ts-ignore
			const plugin: TestPlugin = obs.app.plugins.getPlugin("obsidian-latex-suite")
			const editor = obs.app.workspace.activeEditor!.editor

			//@ts-expect-error
			const cm: EditorView = editor.cm
			await plugin.checkCallback(cm)

			return cm.state.doc.toString();
		})
		await expect(res).toEqual("")
    })
})

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getConsoleLogs(browser: WebdriverIO.Browser) {
	const pptrBrowser = await browser.getPuppeteer();
    const pages = await pptrBrowser.pages();
    const page = pages[0];

    pages.forEach(page => {page.on("console", async (msg) => {
        const vals = await Promise.all(msg.args().map((a) => a.jsonValue().catch(() => "[unserializable]")));
        const text = vals.length ? vals.map(v => (typeof v === "string" ? v : JSON.stringify(v))).join(" ") : msg.text();
        console.log(`[renderer:${msg.type()}] ${text}`);
    });

    page.on("pageerror", (err) => {
        console.error(`[renderer:error] ${err.message}`);
    });
})
}
