import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';


interface MyPluginSettings {
	tasksFilePath: string;
	// Remember last selected exercise (by name) if lastSet was not checked
	rememberedExercise?: string;
	// Modal UI size: 'small' | 'normal' | 'large'
	modalSize?: 'small' | 'normal' | 'large';
	// Spacing inside modal: 'compact' | 'normal' | 'spacious'
	modalSpacing?: 'compact' | 'normal' | 'spacious';
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	tasksFilePath: 'example folder/Тренировки/Все упражнения.md',
	rememberedExercise: '',
	modalSize: 'normal',
	modalSpacing: 'normal'
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();


		this.addCommand({
			id: 'sample-editor-command',
			name: 'Sample editor command',
			editorCallback: (editor: Editor, _view: MarkdownView) => {
				console.log(editor.getSelection());
				editor.replaceSelection('Sample Editor Command');
			}
		});
		this.addSettingTab(new SampleSettingTab(this.app, this));

		this.addCommand({
			id: 'open-exercise-modal',
			name: 'Open exercise modal (log set)',
			callback: () => {
				new ExerciseModal(this.app, this).open();
			}
		});

		// Add a ribbon icon for quick exercise logging
		const exerciseIcon = this.addRibbonIcon('dice', 'Log exercise set', (_evt: MouseEvent) => {
			new ExerciseModal(this.app, this).open();
		});


		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			console.log('click', evt);
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class ExerciseModal extends Modal {
	plugin: MyPlugin;
	tasks: {lineIndex: number, text: string, exerciseName?: string}[] = [];
	selectedIndex: number = -1;
	layoutEl: HTMLElement | null = null;
	leftEl: HTMLElement | null = null;
	rightEl: HTMLElement | null = null;

	constructor(app: App, plugin: MyPlugin) {
		super(app);
		this.plugin = plugin;
	}

	async onOpen() {
		await this.render();
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}

	async loadTasks() {
		this.tasks = [];
		const path = this.plugin.settings.tasksFilePath || 'Тренировки/Все упражнения.md';
		const file = this.app.vault.getAbstractFileByPath(path) as TFile;
		if (!file) {
			new Notice('Tasks file not found: ' + path);
			return;
		}
		const txt = await this.app.vault.read(file);
		const lines = txt.split('\n');
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			// skip already done tasks ([-] with x/X) and only include unchecked tasks
			// skip already done tasks ([-] with x/X or check symbol) and only include unchecked tasks
			if (/^\s*[-*]\s*\[[xX]\]/.test(line) || line.includes('✅')) continue;
			const m = line.match(/^\s*[-*]\s*\[ \]\s*(.*)$/);
			if (m) {
				const content = m[1];
				const linkMatch = content.match(/\[\[([^\]]+)\]\]/);
				const name = linkMatch ? linkMatch[1] : undefined;
				this.tasks.push({lineIndex: i, text: content, exerciseName: name});
			}
		}
	}

	async render() {
		const {contentEl} = this;
		contentEl.empty();
		// for CSS scoping
		contentEl.addClass('exercise-modal');

		contentEl.createEl('h3', {text: 'Запись подхода'});

		await this.loadTasks();

		if (this.tasks.length === 0) {
			contentEl.createEl('div', {text: 'Нет незавершённых задач в файле задач.'});
			return;
		}

		// layout left/right
		const layout = contentEl.createDiv('exercise-modal-layout');
		this.layoutEl = layout;
		// Apply saved modal size and spacing
		this.applyModalSettings(contentEl, layout);
		const left = layout.createDiv('exercise-task-list');
		const right = layout.createDiv('exercise-details');
		this.leftEl = left;
		this.rightEl = right;

		const headerBar = left.createDiv('exercise-header');
		headerBar.createEl('strong', {text: 'Незавершённые задачи'});
		const refreshBtn = headerBar.createEl('button', {text: '⟳'});
		refreshBtn.addClass('exercise-refresh');
		refreshBtn.onclick = async () => { await this.render(); };

		const listWrap = left.createDiv('exercise-scroll');
		listWrap.style.maxHeight = '300px';
		listWrap.style.overflow = 'auto';

		this.tasks.forEach((t, i) => {
			const item = listWrap.createDiv('exercise-list-item');
			item.setAttr('data-index', String(i));
			item.classList.toggle('is-active', i === this.selectedIndex);
			const name = t.exerciseName ?? t.text;
			item.createEl('div', {text: name});
			item.tabIndex = 0;
			item.style.cursor = 'pointer';
			item.onclick = async () => {
				this.selectedIndex = i;
				listWrap.querySelectorAll('.exercise-list-item').forEach((n: any) => n.classList.remove('is-active'));
				item.classList.add('is-active');
				await this.prefillForSelected();
				left.addClass('is-collapsed');
				this.layoutEl?.addClass('is-expanded');
				// hide the tasks list to focus on form
					left.addClass('is-collapsed');
					this.layoutEl?.addClass('is-expanded');
			};
			item.onkeydown = async (ev: KeyboardEvent) => {
				if (ev.key === 'Enter') {
					this.selectedIndex = i;
					listWrap.querySelectorAll('.exercise-list-item').forEach((n: any) => n.classList.remove('is-active'));
					item.classList.add('is-active');
					await this.prefillForSelected();
					left.addClass('is-collapsed');
				}

			};
		});

		// placeholder for details (right column)
		const details = right;
		(this as any).details = details;

		// auto-select first
		if (this.tasks.length > 0) {
			this.selectedIndex = 0;
			// if we have a remembered exercise, try to pre-select it
			if (this.plugin.settings.rememberedExercise) {
				const remembered = this.plugin.settings.rememberedExercise || '';
				const idx = this.tasks.findIndex(t => (t.exerciseName === remembered) || (t.text && t.text.includes(remembered)));
				if (idx >= 0) this.selectedIndex = idx;
			}
			const itemToActivate = listWrap.querySelector(`.exercise-list-item[data-index="${this.selectedIndex}"]`) as HTMLElement;
			if (itemToActivate) itemToActivate.classList.add('is-active');
			await this.prefillForSelected();
		}

		// add a quick toggle to bring tasks back
		const toggleShow = left.createEl('button', {text: '↩'});
		toggleShow.addClass('exercise-toggle-show');
		toggleShow.onclick = () => { left.removeClass('is-collapsed'); };

		// add a right hand reveal to show tasks too
		const reveal = right.createDiv('exercise-reveal');
		const revealBtn = reveal.createEl('button', {text: 'Показать задачи'});
		revealBtn.onclick = () => { left.removeClass('is-collapsed'); };
	}

	async prefillForSelected() {
		const {contentEl} = this;
		const details = (this as any).details as HTMLDivElement;
		details.empty();
		if (this.selectedIndex < 0 || this.selectedIndex >= this.tasks.length) return;
		const task = this.tasks[this.selectedIndex];
		const exerciseName = task.exerciseName ?? task.text;
		const headerRow = details.createDiv('exercise-prefill-header');
		headerRow.createEl('div', {text: `Упражнение: ${exerciseName}`});
		const changeBtn = headerRow.createEl('button', {text: 'Сменить упражнение'});
		changeBtn.addClass('exercise-change-btn');
		changeBtn.onclick = () => {
			// reveal left side to change exercise
			this.leftEl?.removeClass('is-collapsed');
			this.layoutEl?.removeClass('is-expanded');
		};

		// find exercise file by name
		const files = this.app.vault.getMarkdownFiles();
		const f = files.find(ff => ff.name.replace(/\.md$/, '') === exerciseName);
		let lastWeight = '';
		let lastCount = '';
		if (!f) {
			details.createEl('div', {text: 'Exercise file not found: ' + exerciseName});
		} else {
			const content = await this.app.vault.read(f);
			const rows = content.split('\n')
				.filter(x => x.startsWith('|') && x.includes('|') && !x.match(/\|[-: ]+\|/))
				.map(x => x.trim());
			if (rows.length > 0) {
				const lastRow = rows[rows.length - 1];
				const cols = lastRow.split('|').map(y => y.trim()).filter(Boolean);
				lastWeight = cols[1] || '';
				lastCount = cols[2] || '';
			}
		}

		// create form
		const form = details.createDiv('exercise-form');
		const lineRow = form.createDiv('exercise-form-row');
		const leftField = lineRow.createDiv('exercise-field');
		const rightField = lineRow.createDiv('exercise-field');

		// weight with slider and increment controls
		leftField.createEl('div', {text: 'Вес (кг):'});
		const weightInput = leftField.createEl('input') as HTMLInputElement;
		weightInput.type = 'number';
		weightInput.value = lastWeight;

		// reps with a compact slider too
		rightField.createEl('div', {text: 'Количество повторов:'});
		const countInput = rightField.createEl('input') as HTMLInputElement;
		countInput.type = 'number';
		countInput.value = lastCount;

		// preview area
		const preview = details.createDiv('exercise-preview');
		const updatePreview = () => {
			const w = weightInput.value;
			const c = countInput.value;
			const date = new Date().toISOString().slice(0,10);
			preview.setText(`Добавится: | ${date} | ${w} | ${c} |`);
		};

		// allow scrolling on the number input to change value using current step
		weightInput.onwheel = (ev: WheelEvent) => {
			ev.preventDefault();
			const step = Number(stepSelector.value);
			const delta = ev.deltaY > 0 ? -step : step;
			weightInput.value = String(Number(weightInput.value || 0) + delta);
			slider.value = weightInput.value;
			updatePreview();
		};
		countInput.onwheel = (ev: WheelEvent) => {
			ev.preventDefault();
			const delta = ev.deltaY > 0 ? -1 : 1;
			countInput.value = String(Number(countInput.value || 0) + delta);
			repSlider.value = countInput.value;
			updatePreview();
		};

		// checkbox aligned with the inputs on one line
		// put last set checkbox to the right of the form row
		const lastBoxDiv = lineRow.createDiv('exercise-lastset');
		const lastSetLabel = lastBoxDiv.createEl('label');
		const lastSetCheck = lastSetLabel.createEl('input') as HTMLInputElement;
		lastSetCheck.type = 'checkbox';
		lastSetLabel.appendText(' Последний подход');

		const actions = details.createDiv('exercise-actions');
		const saveBtn = actions.createEl('button', {text: 'Сохранить подход'});
		saveBtn.addClass('mod-cta');
		const cancelBtn = actions.createEl('button', {text: 'Отмена'});
		cancelBtn.onclick = () => this.close();

		// ensure preview shows initial values
		updatePreview();

		weightInput.oninput = updatePreview;
		countInput.oninput = updatePreview;

		const sliderRow = leftField.createDiv('exercise-slider-row');
		const slider = sliderRow.createEl('input') as HTMLInputElement;
		slider.type = 'range';
		slider.min = '0';
		slider.max = '300';
		slider.step = '1';
		slider.value = weightInput.value || '0';
		slider.oninput = () => { weightInput.value = slider.value; updatePreview(); };

		const stepSelector = leftField.createEl('select') as HTMLSelectElement;
		stepSelector.add(new Option('0.25 кг', '0.25'));
		stepSelector.add(new Option('0.5 кг', '0.5'));
		stepSelector.add(new Option('1 кг', '1'));
		stepSelector.add(new Option('2.5 кг', '2.5'));
		stepSelector.value = '1';
		stepSelector.onchange = () => { slider.step = stepSelector.value; };

		const incRow = leftField.createDiv('exercise-inc-row');
		const decBtn = incRow.createEl('button'); decBtn.setText('-');
		const incBtn = incRow.createEl('button'); incBtn.setText('+');
		decBtn.onclick = () => { weightInput.value = String(Number(weightInput.value) - Number(stepSelector.value)); slider.value = weightInput.value; updatePreview(); };
		incBtn.onclick = () => { weightInput.value = String(Number(weightInput.value) + Number(stepSelector.value)); slider.value = weightInput.value; updatePreview(); };

		const repSliderRow = rightField.createDiv('exercise-slider-row');
		const repSlider = repSliderRow.createEl('input') as HTMLInputElement; repSlider.type = 'range';
		repSlider.min = '0'; repSlider.max = '50'; repSlider.step = '1'; repSlider.value = countInput.value || '0';
		repSlider.oninput = () => { countInput.value = repSlider.value; updatePreview(); };

		saveBtn.onclick = async () => {
			const w = weightInput.value;
			const c = countInput.value;
			if (!w || !c) {
				new Notice('Введите вес и количество повторов');
				return;
			}
			const lastSet = lastSetCheck.checked;
			await this.writeResult(exerciseName, w, c, lastSet);
			if (!lastSet) {
				this.plugin.settings.rememberedExercise = exerciseName;
				await this.plugin.saveSettings();
			} else {
				this.plugin.settings.rememberedExercise = '';
				await this.plugin.saveSettings();
			}
		};
	}

	applyModalSettings(contentEl: HTMLElement, layoutEl: HTMLElement) {
		const size = this.plugin.settings.modalSize || 'normal';
		const spacing = this.plugin.settings.modalSpacing || 'normal';
		let width = '900px';
		if (size === 'small') width = '700px';
		if (size === 'large') width = '1100px';
		(contentEl as HTMLElement).style.maxWidth = width;

		let gap = '16px';
		if (spacing === 'compact') gap = '8px';
		if (spacing === 'spacious') gap = '28px';
		(layoutEl as HTMLElement).style.setProperty('gap', gap);
		(contentEl as HTMLElement).style.setProperty('--exercise-modal-gap', gap);
	}

	async writeResult(exerciseName: string, weight: string, count: string, markDone: boolean) {
		const files = this.app.vault.getMarkdownFiles();
		const f = files.find(ff => ff.name.replace(/\.md$/, '') === exerciseName);
		const dateStr = new Date().toISOString().slice(0,10);
		if (!f) { new Notice('Exercise file not found for writing: ' + exerciseName); return; }
		// insert new row in table
		const content = await this.app.vault.read(f);
		const lines = content.split('\n');
		// Insert new row at the BOTTOM of the results table. We find the last data row
		// (non-separator table row) and insert after it so new results are appended.
		const sep = lines.findIndex(line => line.match(/\|[-: ]+\|/) );
		let lastDataRowIndex = -1;
		for (let i = lines.length - 1; i >= 0; i--) {
			const row = lines[i];
			if (row.startsWith('|') && !row.match(/\|[-: ]+\|/)) {
				lastDataRowIndex = i;
				break;
			}
		}
		let insertIndex = lines.length;
		if (lastDataRowIndex >= 0) {
			insertIndex = lastDataRowIndex + 1;
		} else if (sep >= 0) {
			// table exists but no data rows — place after header
			insertIndex = sep + 1;
		}
		const newRow = `| ${dateStr} | ${weight} | ${count} |`;
		lines.splice(insertIndex, 0, newRow);
		try {
			await this.app.vault.modify(f, lines.join('\n'));
			new Notice('Result added to ' + exerciseName);
		} catch (e) {
			console.error(e);
			new Notice('Failed to write result');
		}

		// mark the task as done if requested
		if (markDone) {
			const tasksPath = this.plugin.settings.tasksFilePath || 'Тренировки/Все упражнения.md';
			const tasksFile = this.app.vault.getAbstractFileByPath(tasksPath) as TFile;
			if (tasksFile) {
				const txt = await this.app.vault.read(tasksFile);
				const lines2 = txt.split('\n');
				// find the line that contains selected exercise name and - [ ]
				const idx = lines2.findIndex((L,i) => i === this.tasks[this.selectedIndex].lineIndex && L.includes(`[[${exerciseName}]]`) && L.includes('- [ ]'));
				if (idx >= 0) {
					lines2[idx] = lines2[idx].replace(/- \[ \]/, '- [x]') + ' ✅ ' + dateStr;
					try {
						await this.app.vault.modify(tasksFile, lines2.join('\n'));
						new Notice('Task marked as done in tasks file');
					} catch (e) {
						console.error(e);
						new Notice('Failed to mark task as done');
					}
				} else {
					new Notice('Could not find a matching todo line to mark done');
				}
			}
		}

		this.close();
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();
		new Setting(containerEl)
			.setName('Tasks file path')
			.setDesc('Path to the tasks list (ex: Тренировки/Все упражнения.md)')
			.addText(text => text
				.setPlaceholder('Тренировки/Все упражнения.md')
				.setValue(this.plugin.settings.tasksFilePath)
				.onChange(async (value) => {
					this.plugin.settings.tasksFilePath = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Modal size')
			.setDesc('Set the size of the exercise modal')
			.addDropdown(drop => drop
				.addOption('small','Small')
				.addOption('normal','Normal')
				.addOption('large','Large')
				.setValue(this.plugin.settings.modalSize ?? 'normal')
				.onChange(async (value) => {
					this.plugin.settings.modalSize = value as any;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Modal spacing')
			.setDesc('Adjust spacing between modal elements')
			.addDropdown(drop => drop
				.addOption('compact','Compact')
				.addOption('normal','Normal')
				.addOption('spacious','Spacious')
				.setValue(this.plugin.settings.modalSpacing ?? 'normal')
				.onChange(async (value) => {
					this.plugin.settings.modalSpacing = value as any;
					await this.plugin.saveSettings();
				}));
	}
}
