import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, setIcon } from 'obsidian';


interface MyPluginSettings {
	tasksFilePath: string;
	// Remember last selected exercise (by name) if lastSet was not checked
	rememberedExercise?: string;
	// Modal UI size: 'small' | 'normal' | 'large'
	modalSize?: 'small' | 'normal' | 'large';
	// Spacing inside modal: 'compact' | 'normal' | 'spacious'
	modalSpacing?: 'compact' | 'normal' | 'spacious';
	// store collapsed groups by normalized tag name (lowercase)
	collapsedGroups?: string[];
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	tasksFilePath: 'example folder/Тренировки/Все упражнения.md',
	rememberedExercise: '',
	modalSize: 'normal',
	modalSpacing: 'normal'
	,collapsedGroups: []
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
		const exerciseIcon = this.addRibbonIcon('notepad-text', 'Log exercise set', (_evt: MouseEvent) => {
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
	tasks: {lineIndex: number, text: string, exerciseName?: string, tag?: string}[] = [];
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
			if (/^\s*[-*]\s*\[[xX]\]/.test(line) || line.includes('✅')) continue;
			const startDateRow = line.match(/🛫\s*(\d{4}-\d{1,2}-\d{1,2})/g);
			const startDate = startDateRow ? Date.parse(startDateRow[0].slice(3,)) : Date.now();
			if (startDate > Date.now()) continue;
			const m = line.match(/^\s*[-*]\s*\[ \]\s*(.*)$/);
			if (m) {
				console.log(m[1]);
				const content = m[1];
				const linkMatch = content.match(/\[\[([^\]]+)\]\]/);
				const tagMatch = content.match(/#([\p{L}\p{N}_]+)/gu);
				const name = linkMatch ? linkMatch[1] : undefined;
				const tag = tagMatch ? tagMatch[0].slice(1,) : undefined;
				this.tasks.push({lineIndex: i, text: content, exerciseName: name, tag: tag});
			}
		}
	}

	async render() {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.addClass('exercise-modal');

		contentEl.createEl('h3', {text: 'Запись подхода'});

		await this.loadTasks();

		if (this.tasks.length === 0) {
			contentEl.createEl('div', {text: 'Нет незавершённых задач в файле задач.'});
			return;
		}

		const layout = contentEl.createDiv('exercise-modal-layout');
		this.layoutEl = layout;
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

		// placeholder for Collapse/Expand all groups button
		const toggleAllBtn = headerBar.createEl('button', {text: 'Свернуть все'});
		toggleAllBtn.addClass('exercise-collapse-all');

		// Collapse/Expand all groups
        

		const listWrap = left.createDiv('exercise-scroll');
		listWrap.style.maxHeight = '300px';
		listWrap.style.overflow = 'auto';

		// Group tasks by tag so we can render them grouped in the UI
		const groups = new Map<string, {index:number, task:{lineIndex:number, text:string, exerciseName?:string, tag?:string}}[]>();
		this.tasks.forEach((t, i) => {
			const tag = t.tag || 'Без тега';
			if (!groups.has(tag)) groups.set(tag, []);
			groups.get(tag)!.push({index: i, task: t});
		});

		// Render each group (sorted by tag, but place 'Без тега' at the end)
		const tagNames = Array.from(groups.keys()).sort((a,b) => {
			if (a === 'Без тега') return 1;
			if (b === 'Без тега') return -1;
			return a.localeCompare(b, 'ru');
		});

		const collapsedSet = new Set((this.plugin.settings.collapsedGroups || []).map(s => s.toLowerCase()));



		const updateToggleAllLabel = () => {
			const collapsed = new Set((this.plugin.settings.collapsedGroups || []).map(s => s.toLowerCase()));
			const allCollapsed = tagNames.every(t => collapsed.has(t.toLowerCase()));
			// toggleAllBtn.setText(allCollapsed ? 'Развернуть все' : 'Свернуть все');
			setIcon(toggleAllBtn, allCollapsed ? "chevrons-left-right" : "chevrons-right-left");
		};

		toggleAllBtn.onclick = async () => {
			const collapsed = new Set((this.plugin.settings.collapsedGroups || []).map(s => s.toLowerCase()));
			const allCollapsed = tagNames.every(t => collapsed.has(t.toLowerCase()));
			const groups = listWrap.querySelectorAll('.exercise-tag-group');
			if (allCollapsed) {
				// expand all
				this.plugin.settings.collapsedGroups = [];
				groups.forEach((g: any) => {
					g.classList.remove('is-collapsed');
					const header = g.previousElementSibling as HTMLElement | null;
					if (header) {
						header.classList.remove('is-collapsed');
						const ic = header.querySelector('.exercise-tag-icon') as HTMLElement | null;
						if (ic) ic.setText('▾');
					}
				});
			} else {
				// collapse all
				this.plugin.settings.collapsedGroups = tagNames.map(t => t.toLowerCase());
				groups.forEach((g: any) => {
					g.classList.add('is-collapsed');
					const header = g.previousElementSibling as HTMLElement | null;
					if (header) {
						header.classList.add('is-collapsed');
						const ic = header.querySelector('.exercise-tag-icon') as HTMLElement | null;
						if (ic) ic.setText('▸');
					}
				});
			}
			await this.plugin.saveSettings();
			updateToggleAllLabel();
		};

		updateToggleAllLabel();

		tagNames.forEach(tag => {
			const group = groups.get(tag)!;
			const tagHeader = listWrap.createDiv('exercise-tag-header');
			const displayTag = tag === 'Без тега' ? tag : (tag.charAt(0).toUpperCase() + tag.slice(1).toLowerCase());
			tagHeader.createEl('strong', {text: `${displayTag} (${group.length})`});
			const groupWrap = listWrap.createDiv('exercise-tag-group');
			const tagKey = tag.toLowerCase();
			groupWrap.setAttr('data-tag', tagKey);
			if (collapsedSet.has(tagKey)) groupWrap.classList.add('is-collapsed');
			tagHeader.style.cursor = 'pointer';
			const icon = tagHeader.createDiv('exercise-tag-icon');
			icon.setText(groupWrap.classList.contains('is-collapsed') ? '▸' : '▾');
			tagHeader.classList.toggle('is-collapsed', groupWrap.classList.contains('is-collapsed'));
			icon.classList.toggle('is-collapsed', groupWrap.classList.contains('is-collapsed'));
			tagHeader.onclick = async () => {
				const nowCollapsed = groupWrap.classList.toggle('is-collapsed');
				tagHeader.classList.toggle('is-collapsed', nowCollapsed);
				icon.classList.toggle('is-collapsed', nowCollapsed);
				icon.setText(nowCollapsed ? '▸' : '▾');
				const set = new Set(this.plugin.settings.collapsedGroups || []);
				if (nowCollapsed) set.add(tagKey); else set.delete(tagKey);
				this.plugin.settings.collapsedGroups = Array.from(set);
				await this.plugin.saveSettings();
				updateToggleAllLabel();
			};

			group.forEach(g => {
				const t = g.task;
				const i = g.index;
				const item = groupWrap.createDiv('exercise-list-item');
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
					right.addClass('is-expanded');
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
			this.rightEl?.removeClass('is-expanded');
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

		const form = details.createDiv('exercise-form');
		const lineRow = form.createDiv('exercise-form-row');
		const leftField = lineRow.createDiv('exercise-field');
		const rightField = lineRow.createDiv('exercise-field');

		leftField.createEl('div', {text: 'Вес (кг):'});
		const weightInput = leftField.createEl('input') as HTMLInputElement;
		weightInput.type = 'number';
		weightInput.value = lastWeight;

		rightField.createEl('div', {text: 'Количество повторов:'});
		const countInput = rightField.createEl('input') as HTMLInputElement;
		countInput.type = 'number';
		countInput.value = lastCount;

		const preview = details.createDiv('exercise-preview');
		const updatePreview = () => {
			const w = weightInput.value;
			const c = countInput.value;
			const date = new Date().toISOString().slice(0,10);
			preview.setText(`Добавится: | ${date} | ${w} | ${c} |`);
		};

		// track last interaction type to ignore rebound for wheel/scroll
		let lastInteraction: 'wheel' | 'pointer' | 'keyboard' | '' = '';

		// allow scrolling on the number input to change value using current step
		weightInput.onwheel = (ev: WheelEvent) => {
			ev.preventDefault();
			const step = Number(stepSelector.value);
			const delta = ev.deltaY > 0 ? -step : step;
			weightInput.value = String(Number(weightInput.value || 0) + delta);
			// mark a wheel interaction so the slider doesn't trigger rebound animation
			lastInteraction = 'wheel';
			setTimeout(() => { if (lastInteraction === 'wheel') lastInteraction = ''; }, 250);
			slider.value = weightInput.value;
			lastSliderValueNumber = Number(slider.value || 0);
			updatePreview();
		};
		countInput.onwheel = (ev: WheelEvent) => {
			ev.preventDefault();
			const delta = ev.deltaY > 0 ? -1 : 1;
			countInput.value = String(Number(countInput.value || 0) + delta);
			lastInteraction = 'wheel';
			setTimeout(() => { if (lastInteraction === 'wheel') lastInteraction = ''; }, 250);
			repSlider.value = countInput.value;
			updatePreview();
		};

		// checkbox aligned with the inputs on one line
		// put last set checkbox to the right of the form row
		const lastBoxDiv = lineRow.createDiv('exercise-lastset');
		const checkBoxDiv = lastBoxDiv.createDiv();
		const lastSetLabel = lastBoxDiv.createEl('label');
		const lastSetCheck = checkBoxDiv.createEl('input') as HTMLInputElement;
		lastSetCheck.type = 'checkbox';
		lastSetLabel.appendText('Последний подход');

		const actions = details.createDiv('exercise-actions');
		const saveBtn = actions.createEl('button', {text: 'Сохранить подход'});
		saveBtn.addClass('mod-cta');
		const cancelBtn = actions.createEl('button', {text: 'Отмена'});
		cancelBtn.onclick = () => this.close();

		// ensure preview shows initial values
		updatePreview();

		weightInput.oninput = () => { updatePreview(); setSliderMax(computeDynamicMax(Number(weightInput.value || '0'), Number(slider.step)) ); };
		


		countInput.oninput = updatePreview;

		const sliderRow = leftField.createDiv('exercise-slider-row');
		const slider = sliderRow.createEl('input') as HTMLInputElement;
		slider.type = 'range';
		slider.min = '0';
		// dynamic max - computed from last weight/get default
		slider.max = '300';
		slider.step = '1';
		slider.value = weightInput.value || '0';

		/**
		 * Compute a sensible slider max based on a reference weight.
		 * If weight is small we keep a small max (e.g., weight 20 -> max 40). Otherwise
		 * increase to fit a comfortable range. This keeps UI compact for small loads.
		 */
		const computeDynamicMax = (ref: number, step: number) => {
			if (!Number.isFinite(ref) || ref <= 0) return Math.max(40, Math.round(300 / step) * step);
			// small weights: prefer small ceilings
			if (ref <= 10) return Math.max(20, Math.ceil(ref * 2 / step) * step);
			if (ref <= 20) return Math.max(40, Math.ceil(ref * 2 / step) * step);
			if (ref <= 30) return Math.max(60, Math.ceil(ref * 2 / step) * step);
			// medium weights: allow 1.5x
			if (ref <= 80) return Math.max(100, Math.ceil(ref * 1.5 / step) * step);
			// large weights: keep a wide range
			return Math.max(300, Math.ceil(ref * 1.25 / step) * step);
		};

		// helper to set slider max and update CSS tick count
		const setSliderMax = (maxVal: number) => {
			slider.max = String(maxVal);
			// set ticks used in CSS background on the slider row (the pseudo-element uses this)
			const ticks = Math.max(2, Math.round(Number(slider.max) / Number(slider.step)));
			sliderRow.style.setProperty('--ticks', String(ticks));
			slider.style.setProperty('--ticks', String(ticks));
		};

		// initialize slider max based on remembered or last value
		setSliderMax(computeDynamicMax(Number(weightInput.value || '0'), Number(slider.step)));

		// keep last successful slider value so we can return to it on rebound
		let lastSliderValueNumber = Number(slider.value || 0);
		let isBlocked = false; // prevent double-trigger
		// mark pointer and keyboard interaction to allow rebound; wheel sets lastInteraction
		slider.addEventListener('pointerdown', () => { lastInteraction = 'pointer'; });
		slider.addEventListener('keydown', () => { lastInteraction = 'keyboard'; });

		slider.oninput = () => {
			weightInput.value = slider.value;
			updatePreview();
			// if slider reaches near the max, expand the maximum range
			const cur = Number(slider.value);
			const st = Number(slider.step) || 1;
			const max = Number(slider.max);
			if (cur >= max - st && !isBlocked && lastInteraction !== 'wheel') {
				// Add a visual division and temporarily block user interaction
				isBlocked = true;
				const prev = lastSliderValueNumber;
				// set CSS variables to place the ghost thumb and show the extra tick
				const perc = max > 0 ? String((prev / max) * 100) + '%' : '0%';
				sliderRow.style.setProperty('--prevPercent', perc);
				// add an extra tick visually (we don't yet increase the actual max) so user sees a new division
				sliderRow.style.setProperty('--ticks', String(Math.max(2, Math.round(max / st)) + 1));
				// disable the slider while animation runs so user cannot instantly set the new max
				slider.disabled = true; sliderRow.setAttribute('data-blocked', 'true');
				// animate rebound (CSS does the actual motion) then restore
				sliderRow.classList.add('rebound');
				// reset the thumb position instantly to previous value, the rebound animation will visually move a ghost thumb
				slider.value = String(prev);
				updatePreview();
				const done = () => {
					// remove visual block and apply new actual max
					sliderRow.classList.remove('rebound');
					// compute and set actual new max now that user saw the extra tick
					// Increase max gradually instead of jumping: add a fixed increment (20kg by default)
					const increment = 20;
					const incCount = Math.max(1, Math.ceil(increment / st));
					const newMaxNumeric = Number(max) + incCount * st;
					setSliderMax(Math.ceil(newMaxNumeric / st) * st);
					slider.disabled = false; sliderRow.removeAttribute('data-blocked');
					isBlocked = false;
				};
				// allow animation to finish and then expand
				// shorter delay for a snappier user experience; animation in CSS runs ~300ms
				setTimeout(done, 300);
			}
			lastSliderValueNumber = Number(slider.value || 0);
		};

		const stepSelector = leftField.createEl('select') as HTMLSelectElement;
		stepSelector.add(new Option('0.25 кг', '0.25'));
		stepSelector.add(new Option('0.5 кг', '0.5'));
		stepSelector.add(new Option('1 кг', '1'));
		stepSelector.add(new Option('2.5 кг', '2.5'));
		stepSelector.value = '1';
		stepSelector.onchange = () => { slider.step = stepSelector.value; setSliderMax(computeDynamicMax(Number(weightInput.value || '0'), Number(slider.step))); };

		const incRow = leftField.createDiv('exercise-inc-row');
		const decBtn = incRow.createEl('button'); decBtn.setText('-');
		const incBtn = incRow.createEl('button'); incBtn.setText('+');
		decBtn.onclick = () => { weightInput.value = String(Number(weightInput.value) - Number(stepSelector.value)); slider.value = weightInput.value; lastSliderValueNumber = Number(slider.value || 0); updatePreview(); };
		incBtn.onclick = () => { weightInput.value = String(Number(weightInput.value) + Number(stepSelector.value)); slider.value = weightInput.value; lastSliderValueNumber = Number(slider.value || 0); updatePreview(); };

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
