import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { browser } from '@wdio/globals'
import TestPlugin from '../src/main';
import { getTextSnippets } from './default_snippets/text_snippets';
describe('Test snippets', async function() {
    before(async function() {
        // You can create test vaults and open them with reloadObsidian
        // Alternatively if all your tests use the same vault, you can
        // set the default vault in the wdio.conf.mts.
        // await browser.reloadObsidian({vault: "./test/vaults/simple"});
    })
	getTextSnippets(browser);
	// it("mk: inline math snippet", async () => {
	// 	await browser.executeObsidian(async (obs) => {
	// 	await obs.app.workspace
	// 		.getLeavesOfType("markdown")
	// 		.forEach((leaf) => leaf.detach());
	// 		// open empty.md and make sure its empty
	// 		await obs.app.workspace.openLinkText("", "empty.md");
	// 		//@ts-ignore
	// 		const cm: EditorView = obs.app.workspace.activeEditor!.editor.cm
	// 		cm
	// 		cm.dispatch({changes: {from: 0, to: cm.state.doc.length, insert: ""}})
	// 	})
	// 	browser.$("#document").click()
	// 	await browser.keys("m")
	// 	await browser.keys("k")
	// 	const [doc,pos] = await browser.executeObsidian(async (obs) => {
	// 		const editor = obs.app.workspace.activeEditor!.editor
	// 		//@ts-ignore
	// 		const cm: EditorView = editor.cm
	// 		const docstring = cm.state.doc.toString()
	// 		const pos = cm.state.selection.main.to
	// 		cm.dispatch({changes: {from: 0, to: docstring.length, insert: ""}})
	// 		return [docstring, pos]
	// 	})
	// 	expect(doc).toEqual("$$")
	// 	expect(pos).toEqual(1)
	// })
	// it("dm: display math snippet", async () => {
	// 	await browser.keys("d")
	// 	await browser.keys("m")
	// 	const [doc,pos] = await browser.executeObsidian(async (obs) => {
	// 		const editor = obs.app.workspace.activeEditor!.editor
	// 		//@ts-ignore
	// 		const cm: EditorView = editor.cm
	// 		const docstring = cm.state.doc.toString()
	// 		const pos = cm.state.selection.main.to
	// 		cm.dispatch({changes: {from: 0, to: docstring.length, insert: ""}})
	// 		return [docstring, pos]
	// 	})
	// 	expect(doc).toEqual("$$\n\t\n$$")
	// 	expect(pos).toEqual(4)
	// })
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
