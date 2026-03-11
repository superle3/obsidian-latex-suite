import { EditorView, ViewPlugin } from "@codemirror/view";
import { SnippetChangeSpec } from "./snippet_change_spec";
import { getIndentUnit, indentString } from "@codemirror/language";
import { countColumn, EditorState } from "@codemirror/state";
export const snippetQueuePlugin = ViewPlugin.fromClass(
	class {
	private snippetQueue: SnippetChangeSpec[] = [];


	clearSnippetQueue() {
		this.snippetQueue = [];
	}
	
	QueueSnippets(values: SnippetChangeSpec[]) {
		this.snippetQueue = this.snippetQueue.concat(values);
	}
	
	get snippetQueueValue(): SnippetChangeSpec[] {
		return this.snippetQueue.map(s => new SnippetChangeSpec(s.from, s.to, s.insert, s.keyPressed));
	}
})

export function getSnippetQueue(view: EditorView) {
	const plugin = view.plugin(snippetQueuePlugin);
	if (!plugin) {
		throw new Error("SnippetQueue plugin not found, something went wrong with the plugin initialization");
	}
	return plugin
}


export function queueSnippet(view: EditorView, from: number, to: number, insert: string, keyPressed: string | undefined = undefined, replaceCallout: boolean = false) {
	const snippet = new SnippetChangeSpec(from, to, keepIndentAndCallout(view.state, from, to, insert, replaceCallout), keyPressed);
	getSnippetQueue(view).QueueSnippets([snippet]);
}

const keepIndentAndCallout = (state: EditorState,from: number, to: number, replacement: string, replaceCallout: boolean): string => {
	const line = state.doc.lineAt(to);
	const lineText = line.text;
	const calloutAndIndent = lineText.match(/^(>*)(\s*)/);
	if (!calloutAndIndent) return replacement;
	const callouts = calloutAndIndent[1];
	const indentation = calloutAndIndent[2];
	const originalColIndent = countColumn(indentation, state.tabSize);
	const indentUnitSize = getIndentUnit(state);
	const misalignment = originalColIndent % indentUnitSize;
	const regex = replaceCallout ? /\n(?! {0,3}>)(\t*)/g : /\n(\t*)(?=\s*\S)/g;
	replacement = replacement.replace(regex, (_, p1) => {
		// not preserving misalignment when indent level is increased
		const newColIndent =
			p1.length * indentUnitSize +
			originalColIndent -
			(p1.length && misalignment);
		const indent = indentString(state, newColIndent);
		return "\n" + callouts + indent;
	});
	if (from === 0 || state.doc.sliceString(from-1,from) === "\n") {
		replacement = callouts + indentation + replacement;
	}

	return replacement;
}
export function clearSnippetQueue(view: EditorView) {
	getSnippetQueue(view).clearSnippetQueue();
}
