import latexSuitePlugin from "../../src/main";
import { App } from "obsidian";
import { checkCallback, checkModeCommand } from "./test-mode";

export default class TestPlugin extends latexSuitePlugin {
	checkModeCommands = checkModeCommand;
	checkCallback = checkCallback;
	constructor(app: App, manifest: any) {
		super(app, manifest);
	}
	
	
	override async onload() {
		this.setTestCommands();
		await super.onload();
		console.log("Inheritance plugin loaded");

	}
	
	setTestCommands() {
		const commands = [
			checkModeCommand
		]	
		commands.forEach(command => this.addCommand(command));
	}
	
}
