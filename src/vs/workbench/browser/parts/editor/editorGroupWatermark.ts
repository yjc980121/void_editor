/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { append, clearNode, $, h } from '../../../../base/browser/dom.js';
import { KeybindingLabel } from '../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { editorForeground, registerColor, transparent } from '../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ColorScheme } from '../../../../platform/theme/common/theme.js';
import { isRecentFolder, IWorkspacesService } from '../../../../platform/workspaces/common/workspaces.js';
// import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { OpenFileFolderAction, OpenFolderAction } from '../../actions/workspaceActions.js';
import { isMacintosh, isNative, OS } from '../../../../base/common/platform.js';
import { defaultKeybindingLabelStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IWindowOpenable } from '../../../../platform/window/common/window.js';
import { ILabelService, Verbosity } from '../../../../platform/label/common/label.js';
import { splitRecentLabel } from '../../../../base/common/labels.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { VOID_OPEN_SETTINGS_ACTION_ID } from '../../../contrib/void/browser/voidSettingsPane.js';
import { VOID_CTRL_K_ACTION_ID, VOID_CTRL_L_ACTION_ID } from '../../../contrib/void/browser/actionIDs.js';
// import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';

registerColor('editorWatermark.foreground', { dark: transparent(editorForeground, 0.6), light: transparent(editorForeground, 0.68), hcDark: editorForeground, hcLight: editorForeground }, localize('editorLineHighlight', 'Foreground color for the labels in the editor watermark.'));

// interface WatermarkEntry {
// 	readonly text: string;
// 	readonly id: string;
// 	readonly mac?: boolean;
// 	readonly when?: ContextKeyExpression;
// }

// const showCommands: WatermarkEntry = { text: localize('watermark.showCommands', "Show All Commands"), id: 'workbench.action.showCommands' };
// const quickAccess: WatermarkEntry = { text: localize('watermark.quickAccess', "Go to File"), id: 'workbench.action.quickOpen' };
// const openFileNonMacOnly: WatermarkEntry = { text: localize('watermark.openFile', "Open File"), id: 'workbench.action.files.openFile', mac: false };
// const openFolderNonMacOnly: WatermarkEntry = { text: localize('watermark.openFolder', "Open Folder"), id: 'workbench.action.files.openFolder', mac: false };
// const openFileOrFolderMacOnly: WatermarkEntry = { text: localize('watermark.openFileFolder', "Open File or Folder"), id: 'workbench.action.files.openFileFolder', mac: true };
// const openRecent: WatermarkEntry = { text: localize('watermark.openRecent', "Open Recent"), id: 'workbench.action.openRecent' };
// const newUntitledFileMacOnly: WatermarkEntry = { text: localize('watermark.newUntitledFile', "New Untitled Text File"), id: 'workbench.action.files.newUntitledFile', mac: true };
// const findInFiles: WatermarkEntry = { text: localize('watermark.findInFiles', "Find in Files"), id: 'workbench.action.findInFiles' };
// const toggleTerminal: WatermarkEntry = { text: localize({ key: 'watermark.toggleTerminal', comment: ['toggle is a verb here'] }, "Toggle Terminal"), id: 'workbench.action.terminal.toggleTerminal', when: ContextKeyExpr.equals('terminalProcessSupported', true) };
// const startDebugging: WatermarkEntry = { text: localize('watermark.startDebugging', "Start Debugging"), id: 'workbench.action.debug.start', when: ContextKeyExpr.equals('terminalProcessSupported', true) };
// const toggleFullscreen: WatermarkEntry = { text: localize({ key: 'watermark.toggleFullscreen', comment: ['toggle is a verb here'] }, "Toggle Full Screen"), id: 'workbench.action.toggleFullScreen' };
// const showSettings: WatermarkEntry = { text: localize('watermark.showSettings', "Show Settings"), id: 'workbench.action.openSettings' };

// // shown when Void is emtpty
// const noFolderEntries = [
// 	// showCommands,
// 	openFileNonMacOnly,
// 	openFolderNonMacOnly,
// 	openFileOrFolderMacOnly,
// 	openRecent,
// 	// newUntitledFileMacOnly
// ];

// const folderEntries = [
// 	showCommands,
// 	// quickAccess,
// 	// findInFiles,
// 	// startDebugging,
// 	// toggleTerminal,
// 	// toggleFullscreen,
// 	// showSettings
// ];

export class EditorGroupWatermark extends Disposable {
	private readonly shortcuts: HTMLElement;
	private readonly transientDisposables = this._register(new DisposableStore());
	// private enabled: boolean = false;
	private workbenchState: WorkbenchState;
	private currentDisposables = new Set<IDisposable>();

	constructor(
		container: HTMLElement,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		// @IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IThemeService private readonly themeService: IThemeService,
		@IWorkspacesService private readonly workspacesService: IWorkspacesService,
		@ICommandService private readonly commandService: ICommandService,
		@IHostService private readonly hostService: IHostService,
		@ILabelService private readonly labelService: ILabelService,
	) {
		super();

		const elements = h('.editor-group-watermark', [
			h('.letterpress@icon'),
			h('.shortcuts@shortcuts'),
		]);

		append(container, elements.root);
		this.shortcuts = elements.shortcuts; // shortcuts div is modified on render()

		// void icon style
		const updateTheme = () => {
			const theme = this.themeService.getColorTheme().type
			const isDark = theme === ColorScheme.DARK || theme === ColorScheme.HIGH_CONTRAST_DARK
			elements.icon.style.maxWidth = '220px'
			elements.icon.style.opacity = '50%'
			elements.icon.style.filter = isDark ? '' : 'invert(1)' //brightness(.5)
		}
		updateTheme()
		this._register(
			this.themeService.onDidColorThemeChange(updateTheme)
		)

		this.registerListeners();

		this.workbenchState = contextService.getWorkbenchState();
		this.render();
	}

	private registerListeners(): void {
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('workbench.tips.enabled')) {
				this.render();
			}
		}));

		this._register(this.contextService.onDidChangeWorkbenchState(workbenchState => {
			if (this.workbenchState === workbenchState) {
				return;
			}

			this.workbenchState = workbenchState;
			this.render();
		}));

		// const allEntriesWhenClauses = [...noFolderEntries, ...folderEntries].filter(entry => entry.when !== undefined).map(entry => entry.when!);
		// const allKeys = new Set<string>();
		// allEntriesWhenClauses.forEach(when => when.keys().forEach(key => allKeys.add(key)));
		// this._register(this.contextKeyService.onDidChangeContext(e => {
		// 	if (e.affectsSome(allKeys)) {
		// 		this.render();
		// 	}
		// }));
	}



	private render(): void {

		this.clear();
		const voidIconBox = append(this.shortcuts, $('.watermark-box'));
		const recentsBox = append(this.shortcuts, $('div'));
		recentsBox.style.display = 'flex'
		recentsBox.style.flex = 'row'
		recentsBox.style.justifyContent = 'center'


		const update = async () => {

			// put async at top so don't need to wait (this prevents a jitter on load)
			const recentlyOpened = await this.workspacesService.getRecentlyOpened()
				.catch(() => ({ files: [], workspaces: [] })).then(w => w.workspaces);

			clearNode(voidIconBox);
			clearNode(recentsBox);

			this.currentDisposables.forEach(label => label.dispose());
			this.currentDisposables.clear();


			// Void - if the workbench is empty, show open
			if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {

				// Open a folder
				const openFolderButton = h('button')
				openFolderButton.root.classList.add('void-watermark-button')
				openFolderButton.root.style.display = 'block'
				openFolderButton.root.style.marginLeft = 'auto'
				openFolderButton.root.style.marginRight = 'auto'
				openFolderButton.root.style.marginBottom = '16px'
				openFolderButton.root.textContent = 'Open a folder'
				openFolderButton.root.onclick = () => {
					this.commandService.executeCommand(isMacintosh && isNative ? OpenFileFolderAction.ID : OpenFolderAction.ID)
					// if (this.contextKeyService.contextMatchesRules(ContextKeyExpr.and(WorkbenchStateContext.isEqualTo('workspace')))) {
					// 	this.commandService.executeCommand(OpenFolderViaWorkspaceAction.ID);
					// } else {
					// 	this.commandService.executeCommand(isMacintosh ? 'workbench.action.files.openFileFolder' : 'workbench.action.files.openFolder');
					// }
				}
				voidIconBox.appendChild(openFolderButton.root);


				// Recents
				if (recentlyOpened.length !== 0) {

					voidIconBox.append(
						...recentlyOpened.map((w, i) => {

							let fullPath: string;
							let windowOpenable: IWindowOpenable;
							if (isRecentFolder(w)) {
								windowOpenable = { folderUri: w.folderUri };
								fullPath = w.label || this.labelService.getWorkspaceLabel(w.folderUri, { verbose: Verbosity.LONG });
							}
							else {
								return null
								// fullPath = w.label || this.labelService.getWorkspaceLabel(w.workspace, { verbose: Verbosity.LONG });
								// windowOpenable = { workspaceUri: w.workspace.configPath };
							}


							const { name, parentPath } = splitRecentLabel(fullPath);

							const linkSpan = $('span');
							linkSpan.classList.add('void-link')
							linkSpan.style.display = 'flex'
							linkSpan.style.gap = '4px'
							linkSpan.style.padding = '8px'

							linkSpan.addEventListener('click', e => {
								this.hostService.openWindow([windowOpenable], {
									forceNewWindow: e.ctrlKey || e.metaKey,
									remoteAuthority: w.remoteAuthority || null // local window if remoteAuthority is not set or can not be deducted from the openable
								});
								e.preventDefault();
								e.stopPropagation();
							});

							const nameSpan = $('span');
							nameSpan.innerText = name;
							nameSpan.title = fullPath;
							linkSpan.appendChild(nameSpan);

							const dirSpan = $('span');
							dirSpan.style.paddingLeft = '4px';
							dirSpan.innerText = parentPath;
							dirSpan.title = fullPath;

							linkSpan.appendChild(dirSpan);

							return linkSpan
						}).filter(v => !!v)
					)
				}

			}
			else {

				// show them Void keybindings
				const keys = this.keybindingService.lookupKeybinding(VOID_CTRL_L_ACTION_ID);
				const dl = append(voidIconBox, $('dl'));
				const dt = append(dl, $('dt'));
				dt.textContent = 'Chat'
				const dd = append(dl, $('dd'));
				const label = new KeybindingLabel(dd, OS, { renderUnboundKeybindings: true, ...defaultKeybindingLabelStyles });
				if (keys)
					label.set(keys);
				this.currentDisposables.add(label);


				const keys2 = this.keybindingService.lookupKeybinding(VOID_CTRL_K_ACTION_ID);
				const dl2 = append(voidIconBox, $('dl'));
				const dt2 = append(dl2, $('dt'));
				dt2.textContent = 'Quick Edit'
				const dd2 = append(dl2, $('dd'));
				const label2 = new KeybindingLabel(dd2, OS, { renderUnboundKeybindings: true, ...defaultKeybindingLabelStyles });
				if (keys2)
					label2.set(keys2);
				this.currentDisposables.add(label2);

				const keys3 = this.keybindingService.lookupKeybinding('workbench.action.openGlobalKeybindings');
				const button3 = append(recentsBox, $('button'));
				button3.textContent = 'Void Settings'
				button3.style.display = 'block'
				button3.style.marginLeft = 'auto'
				button3.style.marginRight = 'auto'
				button3.classList.add('void-settings-watermark-button')

				const label3 = new KeybindingLabel(button3, OS, { renderUnboundKeybindings: true, ...defaultKeybindingLabelStyles });
				if (keys3)
					label3.set(keys3);
				button3.onclick = () => {
					this.commandService.executeCommand(VOID_OPEN_SETTINGS_ACTION_ID)
				}
				this.currentDisposables.add(label3);

			}

		};

		update();
		this.transientDisposables.add(this.keybindingService.onDidUpdateKeybindings(update));
	}

	private clear(): void {
		clearNode(this.shortcuts);
		this.transientDisposables.clear();
	}

	override dispose(): void {
		super.dispose();
		this.clear();
		this.currentDisposables.forEach(label => label.dispose());
	}
}
