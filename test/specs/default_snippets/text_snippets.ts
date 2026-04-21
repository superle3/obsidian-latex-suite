import { EditorView } from "@codemirror/view"
import snippets from "../../../src/default_snippets"
export async function getTextSnippets(browser: WebdriverIO.Browser) {
		it("mk: inline math snippet", async () => {
		await browser.executeObsidian(async (obs) => {
		await obs.app.workspace
			.getLeavesOfType("markdown")
			.forEach((leaf) => leaf.detach());
			// open empty.md and make sure its empty
			await obs.app.workspace.openLinkText("", "empty.md");
			//@ts-ignore
			const cm: EditorView = obs.app.workspace.activeEditor!.editor.cm
			cm
			cm.dispatch({changes: {from: 0, to: cm.state.doc.length, insert: ""}})
		})
		browser.$("#document").click()
		await browser.keys("m")
		await browser.keys("k")
		const [doc,pos] = await browser.executeObsidian(async (obs) => {
			const editor = obs.app.workspace.activeEditor!.editor
			//@ts-ignore
			const cm: EditorView = editor.cm
			const docstring = cm.state.doc.toString()
			const pos = cm.state.selection.main.to
			cm.dispatch({changes: {from: 0, to: docstring.length, insert: ""}})
			return [docstring, pos]
		})
		expect(doc).toEqual("$$")
		expect(pos).toEqual(1)
	})
	it("dm: display math snippet", async () => {
		await browser.keys("d")
		await browser.keys("m")
		const [doc,pos] = await browser.executeObsidian(async (obs) => {
			const editor = obs.app.workspace.activeEditor!.editor
			//@ts-ignore
			const cm: EditorView = editor.cm
			const docstring = cm.state.doc.toString()
			const pos = cm.state.selection.main.to
			cm.dispatch({changes: {from: 0, to: docstring.length, insert: ""}})
			return [docstring, pos]
		})
		expect(doc).toEqual("$$\n\t\n$$")
		expect(pos).toEqual(4)
	})

	it("dm: display math snippet with preceding text (regex variant)", async () => {
		await browser.executeObsidian(async (obs) => {
			const editor = obs.app.workspace.activeEditor!.editor
			//@ts-ignore
			const cm: EditorView = editor.cm
			cm.dispatch({changes: {from: 0, to: cm.state.doc.length, insert: ""}})
		})
		browser.$("#document").click()
		await browser.keys("Some text here ")
		await browser.keys("d")
		await browser.keys("m")
		const [doc,pos] = await browser.executeObsidian(async (obs) => {
			const editor = obs.app.workspace.activeEditor!.editor
			//@ts-ignore
			const cm: EditorView = editor.cm
			const docstring = cm.state.doc.toString()
			const pos = cm.state.selection.main.to
			cm.dispatch({changes: {from: 0, to: docstring.length, insert: ""}})
			return [docstring, pos]
		})
		expect(doc).toEqual("Some text here \n$$\n\t\n$$")
		expect(pos).toEqual(20)
	})

	it("mk: inline math in text context", async () => {
		await browser.executeObsidian(async (obs) => {
			const editor = obs.app.workspace.activeEditor!.editor
			//@ts-ignore
			const cm: EditorView = editor.cm
			cm.dispatch({changes: {from: 0, to: cm.state.doc.length, insert: ""}})
		})
		browser.$("#document").click()
		await browser.keys("Here is some math:")
		await browser.keys("m")
		await browser.keys("k")
		const [doc,pos] = await browser.executeObsidian(async (obs) => {
			const editor = obs.app.workspace.activeEditor!.editor
			//@ts-ignore
			const cm: EditorView = editor.cm
			const docstring = cm.state.doc.toString()
			const pos = cm.state.selection.main.to
			cm.dispatch({changes: {from: 0, to: docstring.length, insert: ""}})
			return [docstring, pos]
		})
		expect(doc).toEqual("Here is some math:$$")
		expect(pos).toEqual(20)
	})
	
}
