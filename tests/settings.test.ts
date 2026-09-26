import { beforeAll, describe, expect, it } from "vitest";
import { ContextId, evalInObsidian, PressKeyParams, registerLibResolver } from "obsidian-integration-testing";
// import "obsidian-integration-testing/vitest/typings";
import { getTemporaryVault } from "obsidian-integration-testing/vitest-global-setup-plugin";

interface PatchedLib {
	pressKey: (params: PressKeyParams, window?: Window) => void;
}

describe("snippet editor ui", async () => {
	registerLibResolver(() => window.__latex_suite_test_library)
	getTemporaryVault();
	const contextId = new ContextId<PatchedLib>()
	beforeAll(async () => {
		await evalInObsidian({
			contextId,
			callback: async ({ app, context, lib, obsidianModule }) => {
				context.pressKey = (
					pressParams: PressKeyParams,
					window?: Window,
				) => {
					const electron = window?.electron ?? globalThis.electron;
					const { key, modifiers = [] } = pressParams;
					const isMacOS = obsidianModule.Platform.isMacOS;
					const electronModifiers = modifiers.map((modifier) => {
						switch (modifier) {
							case "Alt": {
								return "alt";
							}
							case "Ctrl": {
								return "control";
							}
							case "Meta": {
								return "meta";
							}
							case "Mod": {
								return isMacOS ? "meta" : "control";
							}
							case "Shift": {
								return "shift";
							}
							default: {
								const unknownModifier = modifier;
								throw new Error(
									`Unknown modifier: ${String(unknownModifier)}`,
								);
							}
						}
					});
					const webContents = electron.remote.getCurrentWebContents();
					webContents.sendInputEvent({
						keyCode: key,
						modifiers: electronModifiers,
						type: "keyDown",
					});
					webContents.sendInputEvent({
						keyCode: key,
						modifiers: electronModifiers,
						type: "char",
					});
					webContents.sendInputEvent({
						keyCode: key,
						modifiers: electronModifiers,
						type: "keyUp",
					});
				};
			},
		});
	});
	
	it("should render settings page and be able to edit snippets", async () => {
		const result = await evalInObsidian({
			contextId,
			callback: async ({ app, context, obsidianModule, lib }) => {
				app.setting.open();
				const settingEl = app.setting.contentEl.querySelector(`[data-setting-id="obsidian-latex-suite"]`);
				if (!settingEl) {
					throw new Error("Setting element not found")
				}
				settingEl.dispatchEvent(new MouseEvent("click", { bubbles: true }))
				const snippetsEl = Array.from(
					app.setting.contentEl.querySelectorAll(
						"div.setting-item-name",
					),
				).filter(
					(el) =>
						el.textContent.trim() ===
						lib.plugin.test
							.settings_translation("snippets.heading")
							.trim(),
				);
				const firstSnippetEl = snippetsEl[0];
				if (!firstSnippetEl) {
					throw new Error("First snippet element not found")
				}
				firstSnippetEl.dispatchEvent(new MouseEvent("click", { bubbles: true }))
				const snippetEditor = app.setting.contentEl.querySelector("div.snippets-text-area")
				if (!snippetEditor) {
					throw new Error("Snippet editor not found")
				}
				const view = lib.plugin.test.EditorView.findFromDOM(snippetEditor as HTMLElement)
				if (!view) {
					throw new Error("EditorView not found")
				}
				view.focus();	
				view.setDoc("export default [\n// \n]", "export default [//  ".length);
				await new Promise((resolve) => setTimeout(resolve, 0));
				for (let i = 0; i < 4; i++) {
					context.pressKey({ key: "a"}, activeWindow)
					await new Promise((resolve) => setTimeout(resolve, 0));
				}
				const snippetText = view.state.doc.toString();
				return snippetText;
			}
		})
		expect(result).toBe("export default [\n// aaaa\n]");
	})
})
